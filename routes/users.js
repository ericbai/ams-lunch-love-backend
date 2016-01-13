'use strict';

const express = require('express'),
	User = require('../models/user'),
	auth = require('../middlewares/auth'),
	hashPassword = require('../middlewares/hash-password'),
	app = module.exports = express();

app.get('/', auth, (req, res) => {
	let max = parseInt(req.query.max),
		offset = parseInt(req.query.offset),
		promise;
	if (req.query.classYear) {
		promise = User.listByClassYear(req.query.classYear, max, offset);
	} else if (req.query.q) {
		promise = User.search(req.query.q, max, offset);
	} else if (req.query.admins) {
		switch (req.query.admins) {
			case 'all':
				promise = User.listAdmins(false, max, offset);
				break;
			case 'pending':
				promise = User.listAdmins(true, max, offset);
				break;
			default:
				return res.status(400).json('admins query param must be either "all" or "pending"');
		}
	} else {
		promise = User.listUsers(max, offset);
	}
	promise.then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(500).json(failure);
	})
});

app.get('/:email', auth, (req, res) => {
	User.findByEmail(req.params.email, false).then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(404).json(failure);
	});
});

app.post('/', hashPassword, (req, res) => {
	User.create(req.body && req.body.user).then((success) => {
		res.status(201).json(success);
	}, (failure) => {
		res.status(422).json(failure);
	});
});

app.put('/:email', auth, hashPassword, (req, res) => {
	User.update(req.params.email, req.body && req.body.user).then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(422).json(failure);
	});
});

app.delete('/:email', auth, (req, res) => { //cannot delete yourself
	if (req.params.email && req.params.email.toLowerCase() !== req.decoded.email.toLowerCase()) {
		User.delete(req.params.email).then(() => {
			res.status(204).json('No Content');
		}, (failure) => {
			res.status(404).json(failure);
		});
	} else {
		res.status(403).json('Forbidden');
	}
});
