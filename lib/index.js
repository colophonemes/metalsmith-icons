var merge = require('merge')
var YAML = require('js-yaml');
var fs = require('fs');
var path = require('path');
var cheerio = require('cheerio');
var chalk = require('chalk');
var minimatch = require('minimatch');
var unique = require('array-unique');
var request = require('request');
var Promise = require('bluebird')
var AdmZip = require('adm-zip');
var replaceall = require('replaceall');
var mkdir = require('mkdirp');
var randomstring = require('randomstring');
var equal = require('deep-equal');
var debug = require('debug')('metalsmith-icons');


    var defaults = {
        sets : { fa:'fontawesome' },
        fontello: {
              name: 'icons',
              css_prefix_text: "icon-",
              css_use_suffix: false,
              hinting: true,
              units_per_em: 1000,
              ascent: 850
        },
        pattern: '**/*.html',
        cache: './.icon_cache',
        fontDir: 'fonts',
        CSSDir: 'styles',
        substitutions: loadSubstitutions(),
        customIcons: false
    };


var plugin = function (config) {

    // set up configuration options
    config = merge.recursive(defaults,config);
    var sets = config.sets;
    config.fontello.glyphs = [];

    var icons = {};
    var substitutions = config.substitutions;
    var include = {};


    // main metalsmith plugin
    return function (files, metalsmith, done){
        if(!sets) {
            throw new TypeError('No sets provided, not running metalsmith-icons');
            return;
        }
        debug('Running metalsmith-icons');
        
        // load icon sets
        Object.keys(sets).forEach(function(set){
            debug('Loading icon set "%s"',set);
            var setName = sets[set];
            icons[setName] = loadIcons(setName);
            include[setName] = [];
        });

        // scan files for references to our icon set
        Object.keys(files).filter(minimatch.filter(config.pattern)).forEach(function(file){
            debug('Checking file "%s"',file);
                // load html file
                $ = cheerio.load(files[file].contents);
                // scan through each icon set
                Object.keys(sets).forEach(function(set){//
                    var setName = sets[set];
                    debug('Looking for icons in "%s" set (class "%s-xxx")',setName,set);
                    $('.'+set).each(function(){
                        var icon = $(this).attr('class').replace(set,'').replace(set+'-','').trim()
                        debug('Found icon: %s',icon);
                        include[setName].push( icon );
                        // update our html to match
                        $(this).removeClass(set)
                               .removeClass(set+'-'+icon)
                               .addClass(config.fontello.css_prefix_text.replace('-',''))
                               .addClass(config.fontello.css_prefix_text+icon)
                    });
                });
                files[file].contents = $.html();
        });



        // loop through each of our sets and add to the config object
        Object.keys(include).forEach(function(setName){
            // generate a keyed map of all icons in the set
            var iconMap = {};
            icons[setName].glyphs.forEach(function(glyph){
                iconMap[glyph.css] = glyph;
            })
            // process substitutions
            if(substitutions[setName]){
                debug('Processing substitutions for set "%s"',setName);
                var subs = substitutions[setName];
                var subsMap = {};
                Object.keys(subs).forEach(function(substitution){
                    if(iconMap[subs[substitution]]){
                        // debug('Icon "%s" has substitution "%s"',substitution, subs[substitution]);
                        subsMap[substitution] = iconMap[subs[substitution]];
                        subsMap[substitution].css = substitution;
                    }
                })
                if(Object.keys(subsMap).length>0){
                    // remove substitution keys from iconMap and replace with equivalent from subsMap
                    Object.keys(subsMap).forEach(function(substitution){
                        if(iconMap[subs[substitution]]) delete iconMap[subs[substitution]];
                    });
                    Object.assign(iconMap,subsMap);
                }
            }
            debug('Processing icons in set %s',setName);
            var glyphs = [];
            var missing = [];
            // make sure we only have one copy of each icon
            include[setName] = unique(include[setName]);
            // loop through each of our included icons
            include[setName].forEach(function(icon){
                debug('Searching for icon "%s" in the "%s" icon map',icon,setName);
                if(iconMap.hasOwnProperty(icon)){
                    debug('Found "%s"',icon);
                    glyphs.push(iconMap[icon]);
                } else {
                    debug('Icon "%s" does not exist',icon);
                    missing.push(icon);
                }
            })
            // error handling code just in case we can't find a certain icon
            if(missing.length > 0){
                debug('There are some missing icons');
                console.log(chalk.yellow.inverse(' WARNING: '));
                console.log(chalk.yellow('could not find the following icons in the '+chalk.bold.underline(setName)+' set'));
                missing.forEach(function(m){
                    console.error(chalk.red.bold('×'),chalk.yellow.underline(m));
                });
                console.log('These icons will not be included in the final font package');
            }

            // add custom icons if we need them 
            if(config.customIcons){
                debug('Adding custom icons');
                var customIcons = JSON.parse(files[config.customIcons].contents.toString().trim());
                delete files[config.customIcons];
                glyphs = glyphs.concat(customIcons)
            }
            
            // add these glyphs to the main config.fontello object
            debug('Adding glyphs from "%s" to the Fontello configuration',setName);
            glyphs.forEach(function(glyph){
                delete glyph.search;
                delete glyph.from;
                glyph.src = glyph.src || setName;
                config.fontello.glyphs.push(glyph);
            })
        });

        
        // work out if we have a cached version of this icon set
        var cacheFile = false;
        if(config.cache){
            debug('Looking for cache files in %s',config.cache);
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
            debug('Found cachefile %s',cacheFile);
            // load cachefile as buffer
            fs.readFile(path.join(config.cache,path.basename(cacheFile,'.json')+'.zip'),function(err,data){
                if(err) throw new Error (err);
                // process the ZIP file
                zipFiles = getZipFiles(data,config);
                Object.keys(zipFiles).forEach(function(file){
                    files[file] = {contents: zipFiles[file].contents }
                });
                debug('Added cached icons to directory "%s"',config.fontdir);
                // we're done!
                done();
            })
        } else {
            debug('No cache file found, requesting icons from Fontello server');
            var jsonFile = JSON.stringify(config.fontello,true);
            // download the package via the fontello API
            makeAPIRequest(jsonFile)
            .then(function(data){
                debug('Request successful');
                // process the returned ZIP file
                cacheZipFile(data,jsonFile,config);
                zipFiles = getZipFiles(data,config);
                Object.keys(zipFiles).forEach(function(file){
                    files[file] = {contents: zipFiles[file].contents }
                });
                debug('Added icons to directory "%s"',config.fontdir);
                // we're done!
                done();
            })
            .catch(function(error){
                console.error(error);
            });
        }
            


    }

}

function loadIcons (setName){
    debug('loading Fontello icon definitions for "%s"',setName);
    var file = path.join(__dirname,'..','icons',setName+'.yml');
    return YAML.safeLoad( fs.readFileSync(file) );

}

function loadSubstitutions (setName,icons){
    debug('loading substitutions for "%s"',setName);
    return YAML.safeLoad( fs.readFileSync(path.join(__dirname,'..','substitutions.yml')));
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
            // if we're using the standard 'font' dir for fonts, just add the CSS files
            if(config.fontDir === 'font'){
                zipFiles[file] = {contents:zipEntry.getData()};
            } else {
                var contents = zipEntry.getData().toString();
                contents = replaceall('/font/','/'+config.fontDir+'/',contents);
                zipFiles[file] = {contents:contents}
            }
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