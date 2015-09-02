var merge = require('merge')
var YAML = require('yamljs');
var fs = require('fs');
var path = require('path');
var cheerio = require('cheerio');
var minimatch = require('minimatch');
var unique = require('array-unique');
var AdmZip = require('adm-zip');
var request = require('request');
var url = require('url');
var querystring = require('querystring');


    var defaults = {
        sets : false,
        fontello: {
              name: 'icons',
              css_prefix_text: "icon-",
              css_use_suffix: false,
              hinting: true,
              units_per_em: 1000,
              ascent: 850
        }
    };


var plugin = function (config) {

    // set up configuration options
    config = merge.recursive(defaults,config);
    var sets = config.sets;
    config.fontello.glyphs = []

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
                        $('.'+set).each(function(){
                            var icon = $(this).attr('class').replace(set,'').replace(set+'-','').trim()
                            include[setName].push( icon );
                            // update our html to match
                            $(this).removeClass(set)
                                   .removeClass(set+'-'+icon)
                                   .addClass(config.fontello.css_prefix_text.replace('-',''))
                                   .addClass(config.fontello.css_prefix_text+icon)
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
                    for (var i = icons[setName].glyphs.length - 1; i >= 0; i--) {
                        var glyph = icons[setName].glyphs[i]
                        if(glyph.css=== icon){
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
                // add these glyphs to the main config.fontello object
                glyphs.forEach(function(glyph){
                    delete glyph.search;
                    glyph.src = setName;
                    config.fontello.glyphs.push(glyph);
                })
            });
         
            var fontelloURL = 'http://fontello.com/'
            var requestOptions = {
                uri: fontelloURL,
                method: 'POST',
                formData: {
                    config : {
                        value: JSON.stringify(config.fontello),
                        options: {
                            filename: 'config.json',
                            contentType: 'application/json'
                        }
                    }
                }
            }

            console.log('Making HTTP request to',fontelloURL)
            request(requestOptions, function(error, response, body){
                if(error){
                    console.error('Could not build icons')
                    console.error('Request error:',error)
                } else if(response.statusCode!==200){
                    console.error('Could not build icons')
                    console.error('Request error...')
                    console.error('Status Code:',response.statusCode)
                    console.error(body)
                } else {
                    var sessionId = body;
                    var zipData = [], zipDataLen = 0;
                    // using similar solution to that posted here to handle ZIP download:
                    // http://stackoverflow.com/questions/10359485/how-to-download-and-unzip-a-zip-file-in-memory-in-nodejs
                    request.get({uri: fontelloURL + sessionId + '/get', encoding: null})
                    .on('data',function(chunk){
                        zipData.push(chunk);
                        zipDataLen += chunk.length;
                    })
                    .on('end',function(){
                        var buf = new Buffer(zipDataLen);
                        for (var i=0, len = zipData.length, pos = 0; i < len; i++) { 
                            zipData[i].copy(buf, pos); 
                            pos += zipData[i].length; 
                        }
                        var zip = new AdmZip(buf);
                        var zipEntries = zip.getEntries();
                        zipEntries.forEach(function(zipEntry){
                            if(minimatch(zipEntry.entryName,'**/font/*.*')){
                                var file = 'font/'+path.basename(zipEntry.entryName);
                                files[file] = {contents:zipEntry.getData()};
                            }
                            if(minimatch(zipEntry.entryName,'**/css/'+config.fontello.name+'.css')){
                                var file = 'styles/'+path.basename(zipEntry.entryName);
                                console.log('File',file)
                                files[file] = {contents:zipEntry.getData()};
                            }
                        })
                        done();
                    });
                }
            });

            
        }
    }

}

function loadIcons (setName){
    return YAML.load( path.join(__dirname,'..','icons',setName,'config.yml'))
}




module.exports = plugin;