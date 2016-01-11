'use strict';

const routes = require('node-require-directory')(__dirname);

module.exports = function(app) {
	Object.keys(routes).forEach((routeName) => {
		if (routeName !== 'index') {
			app.use(`/api/${routeName}`, routes[routeName]);
		}
	});
}