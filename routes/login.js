'use strict';

const express = require('express'),
	User = require('../models/user'),
	config = require('config'),
	app = module.exports = express(),
	jwt = require('jsonwebtoken'),
	secret = process.env['JWT_KEY'] || config.devJwtKey;

app.post('/', (req, res) => {
	User.authenticate(req.body.email, req.body.password).then((success) => {
		jwt.sign(success, secret, {
			expiresIn: 86400 // seconds, expires in 24 hours
		}, (token) => {
			res.status(200).json({
				'token': token,
				'user': {
					name: success.name,
					email: success.email,
					pendingAdmin: success.pendingAdmin,
					confirmed: success.confirmed
				}
			});
		});
	}, (failure) => {
		res.status(404).json(failure);
	});
});