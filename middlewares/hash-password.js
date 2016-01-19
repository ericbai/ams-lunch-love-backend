const bcrypt = require('bcrypt'),
	config = require('config');

module.exports = function(req, res, next) {
	if (req.body && req.body.admin && req.body.admin.password) {
		bcrypt.hash(req.body.admin.password, config.bcrypt.rounds, (err, hash) => {
			if (err) return res.status(500).json(err);
			req.body.admin.password = hash;
			next();
		});
	} else {
		next();
	}
};
