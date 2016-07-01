var Metalsmith = require('../node_modules/metalsmith');
var icons = require('../lib');


console.log('Building demo');
Metalsmith(__dirname)
.source('./src')
.destination('./build')
.use(icons())
.build(function(err) {
	if (err) throw err;
	console.log('Demo build OK');
});