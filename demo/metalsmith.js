var Metalsmith = require('../node_modules/metalsmith');
var icons = require('../lib');

var cache = process.argv.indexOf('--no-cache') > -1 ? false : true;

console.log('Building demo');
Metalsmith(__dirname)
.source('./src')
.destination('./build')
.use(icons({
	cache: cache ? './.icon_cache' : false,
}))
.build(function(err) {
	if (err) throw err;
	console.log('Demo build OK');
});