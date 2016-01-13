const jwt = require('jsonwebtoken'),
	config = require('config'),
	secret = process.env['JWT_KEY'] || config.devJwtKey;

module.exports = function(req, res, next) {
	const token = req.headers['x-access-token'];
	if (token) {
		jwt.verify(token, secret, function(err, decoded) {
			if (err) {
				res.status(401).json('Unauthorized');
			} else {
				// if everything is good, save to request for use in other routes
				req.decoded = decoded;
				next();
			}
		});
	} else {
		res.status(401).json('Unauthorized');
	}
};