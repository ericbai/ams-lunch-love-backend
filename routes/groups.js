'use strict';

const express = require('express'),
	Group = require('../models/group'),
	Admin = require('../models/admin'),
	db = require('../db'),
	RSVP = require('rsvp'),
	config = require('config'),
	auth = require('../middlewares/auth'),
	clusterUsers = require('../helpers/cluster-nodes'),
	app = module.exports = express();

app.get('/', auth, (req, res) => {
	let max = parseInt(req.query.max),
		offset = parseInt(req.query.offset),
		promise;
	if (req.query.candidates) {
		Admin.findByEmail(req.decoded.email).then((result) => {
			const clusterSize = result.admin.clusterSize ? result.admin.clusterSize : config.default.clusterSize,
				overlapTolerance = result.admin.overlapTolerance ? result.admin.overlapTolerance : config.default.overlapTolerance;
			clusterUsers(clusterSize, overlapTolerance, ...req.query.candidates).then((success) => {
				res.status(200).json(success);
			}, (failure) => {
				res.status(404).json(failure);
			});
		}, (failure) => {
			res.status(404).json(failure);
		});
	} else if (req.query.email) {
		Group.listByUserEmail(req.query.email, max, offset).then((success) => {
			res.status(200).json(success);
		}, (failure) => {
			res.status(404).json(failure);
		});
	} else {
		Group.listAll(req.query.email, max, offset).then((success) => {
			res.status(200).json(success);
		}, (failure) => {
			res.status(500).json(failure);
		});
	}
});

app.get('/:id', auth, (req, res) => {
	Group.findByUUID(req.params.id).then((success) => {
		res.status(200).json(success);
	}, (failure) => {
		res.status(404).json(failure);
	});
});

app.post('/', auth, (req, res) => {
	if (req.body.group && req.body.group.users) {
		const users = req.body.group.users;
		Group.create(...users).then((success) => {
			res.status(201).json(success);
		}, (failure) => {
			res.status(422).json(failure);
		});
	} else if (Array.isArray(req.body.groups) && req.body.groups.every((el) => {
			return Array.isArray(el.users);
		})) {
		Group.createForAll(req.body.groups.map((el) => {
			return el.users;
		})).then((success) => {
			res.status(201).json(success);
		}, (failure) => {
			res.status(422).json(failure);
		});
	} else {
		res.status(422).json('Unprocessable Entity');
	}
});

app.put('/:id', auth, (req, res) => {
	res.status(405).json('Method Not Allowed');
});

app.delete('/:id', auth, (req, res) => {
	res.status(405).json('Method Not Allowed');
});
