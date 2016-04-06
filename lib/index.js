var merge = require('merge')
var YAML = require('yamljs');
var fs = require('fs');
var path = require('path');
var cheerio = require('cheerio');
var minimatch = require('minimatch');
var unique = require('array-unique');
var request = require('request');
var Promise = require('bluebird')
var AdmZip = require('adm-zip');
var replaceall = require('replaceall');
var mkdir = require('mkdirp');
var randomstring = require('randomstring');
var equal = require('deep-equal');
// var debug = require('debug');


    var defaults = {
        sets : false,
        fontello: {
              name: 'icons',
              css_prefix_text: "icon-",
              css_use_suffix: false,
              hinting: true,
              units_per_em: 1000,
              ascent: 850
        },
        substitutions: loadSubstitutions(),
        cache: './.icon_cache',
        fontDir: 'font',
        CSSDir: 'styles',
        customIcons: false,
        icon_helpers: {
          fontawesome: ["fa-lg fa-2x fa-3x fa-4x fa-5x",
            "fa-fw fa-ul fa-li fa-border fa-pull-right fa-pull-left",
            "fa-spin fa-pulse fa-rotate-90 fa-rotate-180 fa-rotate-270",
            "fa-flip-horizontal fa-flip-vertical fa-stack fa-stack-1x",
            "fa-stack-2x fa-inverse"].join(" ")
        }
    };


var plugin = function (config) {

    // set up configuration options
    config = merge.recursive(defaults,config);
    var sets = config.sets;
    config.fontello.glyphs = [];

    var icons = {};
    var include = {};

    // main metalsmith plugin
    return function (files, metalsmith, done){
        if(sets){

            // load icon sets
            Object.keys(sets).forEach(function(set){
                var setName = sets[set];
                icons[setName] = loadIcons(sets[set]);
                include[setName] = [];
            });

            // scan files for references to our icon set
            Object.keys(files).forEach(function(file){
                if(minimatch(file,'**/*.html')){
                    // load html file
                    $ = cheerio.load(files[file].contents);
                    // scan through each icon set
                    Object.keys(sets).forEach(function(set){
                        //
                        var setName = sets[set];
                        var all_icon_helpers = config["icon_helpers"] || {};
                        var icon_helpers = all_icon_helpers[setName] || [];
                        $('.'+set).each(function(){
                            var self = $(this);
                            var classes = self.attr('class').split(' ').filter(function(s) { return s; });
                            var icon_classes = classes.filter(function(s) {
                              return s.startsWith(set) && icon_helpers.indexOf(s) == -1;
                            });
                            var icon_bases = icon_classes.map(function(c) {
                              return c.replace(set + '-', '').replace(set, '').trim();
                            }).filter(function(s) { return s; });
                            icon_bases.forEach(function(icon) {
                              include[setName].push(icon);
                              self.removeClass(set)
                                .removeClass(set + '-' + icon)
                                .addClass(config.fontello.css_prefix_text.replace('-', ''))
                                .addClass(config.fontello.css_prefix_text + icon);
                            });
                        });
                    });
                    files[file].contents = $.html();
                }
            });

            // loop through each of our sets and add to the config object
            Object.keys(include).forEach(function(setName){
                var glyphs = [];
                // make sure we only have one copy of each icon
                include[setName] = unique(include[setName]);
                // loop through each of our included icons
                include[setName].forEach(function(icon){
                    var substitution = config.substitutions[setName][icon];
                    for (var i = icons[setName].glyphs.length - 1; i >= 0; i--) {
                        var glyph = icons[setName].glyphs[i]
                        if(glyph.css=== icon){
                            glyphs.push(glyph);
                            break;
                        } else if(glyph.css === substitution){
                            glyph.css = icon;
                            glyphs.push(glyph);
                            break;
                        }
                    }
                })
                // error handling code just in case we can't find a certain icon
                if(include[setName].length !== glyphs.length){
                    var missing = [];
                    // load up missing array
                    include[setName].forEach(function(icon){
                        missing.push(icon);
                    })
                    glyphs.forEach(function(glyph){
                        missing.splice(missing.indexOf(glyph.css),1)
                    })
                    console.error('Error, could not find the following icons in the',setName,'set');
                    console.error(missing);
                    console.error('These icons will not be included in the final font package');
                }


                // add custom icons if we need them
                if(config.customIcons){
                    var customIcons = JSON.parse(files[config.customIcons].contents.toString().trim());
                    delete files[config.customIcons];
                    glyphs = glyphs.concat(customIcons)
                }

                // add these glyphs to the main config.fontello object
                glyphs.forEach(function(glyph){
                    delete glyph.search;
                    glyph.src = glyph.src || setName;
                    glyph.selected = true;
                    config.fontello.glyphs.push(glyph);
                })
            });


            // work out if we have a cached version of this icon set
            var cacheFile = false;
            if(config.cache){

                // get the list of cached icons
                try {
                    cacheIconSets = fs.readdirSync(config.cache);
                    cacheIconSets = cacheIconSets.filter(function(file){return minimatch(file,'**/*.json');});
                } catch (e) {
                    cacheIconSets = false;
                }



                if(cacheIconSets && cacheIconSets.length>0){
                    var iconSet, json;
                    for (var i = cacheIconSets.length - 1; i >= 0; i--) {
                        iconSet = cacheIconSets[i]
                        json = fs.readFileSync(path.join(config.cache,iconSet));
                        json = JSON.parse(json.toString());
                        if(equal(json,config.fontello)){
                            cacheFile = iconSet;
                            break;
                        }
                    };
                }
            }

            if(cacheFile){
                // load cachefile as buffer
                fs.readFile(path.join(config.cache,path.basename(cacheFile,'.json')+'.zip'),function(err,data){
                    if(err) throw new Error (err);
                    // process the ZIP file
                    zipFiles = getZipFiles(data,config);
                    Object.keys(zipFiles).forEach(function(file){
                        files[file] = {contents: zipFiles[file].contents }
                    });
                    // we're done!
                    done();
                })
            } else {
                var jsonFile = JSON.stringify(config.fontello,true);
                // download the package via the fontello API
                makeAPIRequest(jsonFile)
                .then(function(data){
                    // process the returned ZIP file
                    cacheZipFile(data,jsonFile,config);
                    zipFiles = getZipFiles(data,config);
                    Object.keys(zipFiles).forEach(function(file){
                        files[file] = {contents: zipFiles[file].contents }
                    });
                    // we're done!
                    done();
                })
                .catch(function(error){
                    console.error(error);
                });
            }

        }
    }

}

function loadIcons (setName){
    return YAML.load( path.join(__dirname,'..','icons',setName,'config.yml'))
}

function loadSubstitutions (){
    return YAML.load( path.join(__dirname,'..','substitutions.yml'))
}

// Makes the main API request to the fontello server
function makeAPIRequest (jsonFile){
    return new Promise(function(resolve,reject){

        // build options for request
        var fontelloURL = 'http://fontello.com/';
        var requestOptions = {
            uri: fontelloURL,
            method: 'POST',
            formData: {
                // config is a form-posted JSON file derived from the config.json that's downloaded in every fontello zip file
                config : {
                    value: jsonFile,
                    options: {
                        filename: 'config.json',
                        contentType: 'application/json'
                    }
                }
            }
        }


        // console.log('Making HTTP request to',fontelloURL)

        // make the initial API request with our config file
        request(requestOptions, function(error, response, body){
            if(error){
                reject(error)
            } else if(response.statusCode!==200){
                reject({response:response})
            } else {
                // the first API request returns a session ID that refers to our font build
                var sessionId = body;
                // because the ZIP file downloads in chunks, we need to concatenate each chunk into a buffer
                // based on the solution posted here to handle ZIP download:
                // http://stackoverflow.com/questions/10359485/how-to-download-and-unzip-a-zip-file-in-memory-in-nodejs
                var zipData = [], zipDataLen = 0;
                request.get({uri: fontelloURL + sessionId + '/get', encoding: null})
                .on('data',function(chunk){
                    zipData.push(chunk);
                    zipDataLen += chunk.length;
                })
                .on('end',function(){
                    // add all the ZIP file chunks to a new Buffer
                    var buf = new Buffer(zipDataLen);
                    for (var i=0, len = zipData.length, pos = 0; i < len; i++) {
                        zipData[i].copy(buf, pos);
                        pos += zipData[i].length;
                    }
                    resolve(buf);
                });
            }
        });
    });
}


function getZipFiles(zipFile,config){
    // read the ZIP file
    var zip = new AdmZip(zipFile);
    var zipEntries = zip.getEntries();
    var zipFiles = {}
    // loop through each entry
    zipEntries.forEach(function(zipEntry){
        // if we find a font file, add it to our fonts directory
        if(minimatch(zipEntry.entryName,'**/font/*.*')){
            var file = config.fontDir+'/'+path.basename(zipEntry.entryName);
            zipFiles[file] = {contents:zipEntry.getData()};
        }
        // if we find a css file, add it to our CSS directory
        if(minimatch(zipEntry.entryName,'**/css/'+config.fontello.name+'.css')){
            var file = config.CSSDir+'/'+path.basename(zipEntry.entryName);
            zipFiles[file] = {contents:zipEntry.getData()};
        }
    })
    return zipFiles;

}

function cacheZipFile (zipFile,jsonFile,config){
    if(config.cache){
        var filename = randomstring.generate(10);
        // make sure our cache directory exists
        mkdir(config.cache,function(err){
            // put the zipfile in the cache
            fs.writeFile(path.join(config.cache,filename+'.zip'),zipFile,function(err){
                if(err) throw new Error (err);
                fs.writeFile(path.join(config.cache,filename+'.json'),jsonFile,function(err){
                    if(err) throw new Error (err);
                })

            })
        })
    }

}


module.exports = plugin;
