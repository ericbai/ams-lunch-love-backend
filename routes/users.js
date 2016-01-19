'use strict';

const express = require('express'),
	User = require('../models/user'),
	auth = require('../middlewares/auth'),
	utils = require('../helpers/utilities'),
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
	} else {
		promise = User.list(max, offset);
	}
	promise.then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(failure.status || 500).json(failure);
	});
});

app.get('/:email', auth, (req, res) => {
	User.findByEmail(req.params.email).then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(failure.status || 404).json(failure);
	});
});

app.post('/', (req, res) => {
	User.create(req.body && req.body.user).then((success) => {
		res.status(201).json(success);
	}, (failure) => {
		res.status(failure.status || 422).json(failure);
	});
});

app.post('/:token', (req, res) => {
	const status = req.body && req.body.user && req.body.user.confirmed;
	if (utils.isDefined(status)) {
		User.statusByToken(req.params.token, status).then((success) => {
			res.status(200).json(success);
		}, (failure) => {
			res.status(failure.status || 422).json(failure);
		});
	} else {
		res.status(422).json({
			message: 'Must specify user status.'
		});
	}
});

app.put('/:email', auth, (req, res) => {
	User.update(req.params.email, req.body && req.body.user).then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(failure.status || 422).json(failure);
	});
});

app.delete('/:email', auth, (req, res) => {
	User.delete(req.params.email).then(() => {
		res.status(204).json('No Content');
	}, (failure) => {
		res.status(failure.status || 404).json(failure);
	});
});
