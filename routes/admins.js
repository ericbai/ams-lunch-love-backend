'use strict';

const express = require('express'),
	Admin = require('../models/admin'),
	auth = require('../middlewares/auth'),
	hashPassword = require('../middlewares/hash-password'),
	app = module.exports = express();

app.get('/', auth, (req, res) => {
	let max = parseInt(req.query.max),
		offset = parseInt(req.query.offset),
		promise;
	if (req.query.show) {
		switch (req.query.show) {
			case 'all':
				promise = Admin.listByPending(false, max, offset);
				break;
			case 'pending':
				promise = Admin.listByPending(true, max, offset);
				break;
			default:
				return res.status(400).json({
					message: '"show" query param must be either "all" or "pending"'
				});
		}
	} else {
		promise = Admin.listByPending(false, max, offset);
	}
	promise.then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(failure.status || 500).json(failure);
	});
});

app.get('/:email', auth, (req, res) => {
	Admin.findByEmail(req.params.email).then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(failure.status || 404).json(failure);
	});
});

app.post('/', auth, hashPassword, (req, res) => {
	Admin.create(req.body && req.body.admin).then((success) => {
		res.status(201).json(success);
	}, (failure) => {
		res.status(failure.status || 422).json(failure);
	});
});

app.post('/:token', hashPassword, (req, res) => {
	const newPassword = req.body && req.body.admin && req.body.admin.password;
	if (newPassword) {
		Admin.approveByToken(req.params.token, newPassword).then((success) => {
			res.status(200).json(success);
		}, (failure) => {
			res.status(failure.status || 422).json(failure);
		});
	} else {
		res.status(422).json({
			message: 'Must specify new password when approving admin'
		});
	}
});

app.put('/:email', auth, hashPassword, (req, res) => {
	Admin.update(req.params.email, req.body && req.body.admin).then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(failure.status || 422).json(failure);
	});
});

app.delete('/:email', auth, (req, res) => { //cannot delete yourself
	if (req.params.email && req.params.email.toLowerCase() !== req.decoded.email.toLowerCase()) {
		Admin.delete(req.params.email).then(() => {
			res.status(204).json('No Content');
		}, (failure) => {
			res.status(failure.status || 404).json(failure);
		});
	} else {
		res.status(403).json('Forbidden');
	}
});
