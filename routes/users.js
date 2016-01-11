'use strict';

const express = require('express'),
	User = require('../models/user'),
	auth = require('../middlewares/auth'),
	app = module.exports = express();

app.get('/', auth, (req, res) => {
	let promise
	if (req.query.classYear) {
		promise = User.listByClassYear(req.query.classYear, req.query.max, req.query.offset);
	} else if (req.query.q) {
		promise = User.search(req.query.q, req.query.max, req.query.offset);
	} else if (req.query.admins) {
		switch (req.query.admins) {
			case 'all':
				promise = User.listAdmins(false, req.query.max, req.query.offset);
				break;
			case 'pending':
				promise = User.listAdmins(true, req.query.max, req.query.offset);
				break;
			default:
				return res.status(400).json('admins query param must be either "all" or "pending"');
		}
	} else {
		promise = User.listUsers(req.query.max, req.query.offset);
	}
	promise.then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(500).json(failure);
	})
});

app.get('/:email', auth, (req, res) => {
	User.findByEmail(req.params.email).then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(404).json(failure);
	});
});

app.post('/', auth, (req, res) => {
	User.create(req.body && req.body.user).then((success) => {
		res.status(201).json(success);
	}, (failure) => {
		res.status(422).json(failure);
	});
});

app.put('/:email', auth, (req, res) => {
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