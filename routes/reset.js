'use strict';

const express = require('express'),
	Admin = require('../models/admin'),
	hashPassword = require('../middlewares/hash-password'),
	app = module.exports = express();

//request reset
app.post('/:email', (req, res) => {
	if (req.params.email) {
		Admin.requestReset(req.params.email).then(() => {
			res.status(204).json('No Content');
		}, (failure) => {
			res.status(failure.status || 500).json(failure);
		});
	} else {
		res.status(422).json({
			message: 'You must specify an email to request a reset for.'
		});
	}
});

//update password with valid token
app.put('/:token', hashPassword, (req, res) => {
	if (req.params.token && req.body.admin && req.body.admin.password) {
		Admin.updatePasswordViaToken(req.params.token, req.body.admin.password).then((success) => {
			res.status(200).json(success);
		}, (failure) => {
			res.status(failure.status || 500).json(failure);
		});
	} else {
		res.status(422).json({
			message: 'You must specify token and password.'
		});
	}
});
