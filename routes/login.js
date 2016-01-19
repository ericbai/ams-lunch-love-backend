'use strict';

const express = require('express'),
	Admin = require('../models/admin'),
	User = require('../models/user'),
	config = require('config'),
	app = module.exports = express(),
	jwt = require('jsonwebtoken'),
	secret = process.env['JWT_KEY'] || config.devJwtKey;

app.post('/', (req, res) => {
	Admin.authenticate(req.body.email, req.body.password).then((success) => {
		jwt.sign(success, secret, {
			expiresIn: 86400 // seconds, expires in 24 hours
		}, (token) => {
			User.listClassYears().then((classYears) => {
				res.status(200).json({
					token: token,
					admin: {
						name: success.name,
						email: success.email,
						pending: success.pending,
						clusterSize: success.clusterSize,
						overlapTolerance: success.overlapTolerance
					},
					classYears: classYears
				});
			}, (failure) => {
				res.status(500).json(failure);
			});
		});
	}, (failure) => {
		res.status(404).json(failure);
	});
});
