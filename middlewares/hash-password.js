const bcrypt = require('bcrypt'),
	config = require('config');

module.exports = function(req, res, next) {
	if (req.body.user.password) {
		bcrypt.hash(req.body.user.password, config.bcrypt.rounds, (err, hash) => {
			if (err) return res.status(500).json(err);
			req.body.user.password = hash;
			next();
		});
	} else {
		next();
	}
};
