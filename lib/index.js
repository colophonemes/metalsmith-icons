var Promise = require('bluebird')
var merge = require('merge')
var YAML = require('js-yaml');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var cheerio = require('cheerio');
var chalk = require('chalk');
var minimatch = require('minimatch');
var unique = require('array-unique');
var needle = Promise.promisifyAll(require('needle'));
var AdmZip = require('adm-zip');
var replaceall = require('replaceall');
var mkdir = Promise.promisify(require('mkdirp'));
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
            fs.readFileAsync(path.join(config.cache,path.basename(cacheFile,'.json')+'.zip'))
            .then(function read_cache_file (data){
                return addZipFilesToBuild(data,config,files);
            })
            .then(function(){
                // we're done!
                done();
            })
            .catch(function read_cache_file_error (error){
                throw error;
            })
        } else {
            debug('No cache file found, requesting icons from Fontello server');
            var jsonFile = JSON.stringify(config.fontello,true);
            // download the package via the fontello API
            makeAPIRequest(jsonFile)
            .then(function process_api_request (data){
                debug('Request successful');
                // process the returned ZIP file
                return Promise.all([
                    cacheZipFile(data,jsonFile,config),
                    addZipFilesToBuild(data,config,files)
                ])
            })
            .then(function(){
                // we're done!
                done();
            })
            .catch(function api_request_error (error){
                throw error;
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
    // build options for request
    var fontelloURL = 'https://fontello.com/';
    var requestData = {
        config : {
            buffer: new Buffer(jsonFile),
            filename: 'config.json',
            content_type: 'application/json'
        }
    }
    var requestOptions = {
        multipart: true
    }

    // make the initial API request with our config file
    return needle.postAsync(fontelloURL,requestData,requestOptions)
    .then(function(response){
        if(response.statusCode !== 200) throw new Error ('Request to Fontello server returned status code of ' + response.statusCode)
        return needle.getAsync(fontelloURL + response.body + '/get')
        .then(function(response){
            if(response.statusCode !== 200) throw new Error ('Request to Fontello server returned status code of ' + response.statusCode)
            return response.body;
        })
    })
}


function getZipFiles(zipFile,config){
    return new Promise(function(resolve){
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
        return resolve(zipFiles);
    })

}

function addZipFilesToBuild(zipFile, config, files) {
    return getZipFiles(zipFile,config)
    .then(function(zipFiles){
        Object.keys(zipFiles).forEach(function(file){
            files[file] = {contents: zipFiles[file].contents }
        });
        debug('Added icons to directory "%s"',config.fontDir);
        return files;
    })
}

function cacheZipFile (zipFile,jsonFile,config){
    if(config.cache){
        var filename = randomstring.generate(10);
        // make sure our cache directory exists
        return mkdir(config.cache)
        .then(function(){
            // put the zipfile in the cache
            return Promise.all([
                fs.writeFileAsync(path.join(config.cache,filename+'.zip'),zipFile),
                fs.writeFileAsync(path.join(config.cache,filename+'.json'),jsonFile)
            ])
        })
    }
    return new Promise(function(r){r()})
}


module.exports = plugin;
