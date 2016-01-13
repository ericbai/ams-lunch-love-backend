'use strict';

const express = require('express'),
	app = express(),
	bodyParser = require('body-parser'),
	cors = require('cors');

//enable CORS and pre-flight
app.use(cors());
app.options('*', cors()); // must include before other routes

app.use(bodyParser.json());
app.use(express.static(`${__dirname}/public`));
require('./routes')(app);

const db = require('./db'),
	User = require('./models/user');

// initial data
db.listAllLabels((err, result) => {
	if (err) {
		console.log("Could not list all labels: " + err.message);
		process.exit(1);
	}
	if (result.length === 0) {
		// create the initial admin
		User.create({
			name: "Admin",
			username: "admin",
			password: "ilovelunch",
			email: "amslunchlove@gmail.com",
			pendingAdmin: false,
			confirmed: true
		}).then((success) => {
			//create uniqueness constraints
			db.listAllUniquenessConstraintsForLabel('User', (err, result) => {
				if (err) {
					console.log("List uniqueness constraints for user failed: " + (err && err.message));
					process.exit(1);
				}
				if (result.length === 0) {
					db.createUniquenessContstraint('User', 'email', (err, result) => {
						console.log("Creating uniqueness constraint on email failed: " + (err && err.message));
						process.exit(1);
					});
				}
			});
			db.listAllUniquenessConstraintsForLabel('Group', (err, result) => {
				if (err) {
					console.log("List uniqueness constraints for group failed: " + (err && err.message));
					process.exit(1);
				}
				if (result.length === 0) {
					db.createUniquenessContstraint('Group', 'uuid', (err, result) => {
						console.log("Creating uniqueness constraint on uuid failed: " + (err && err.message));
						process.exit(1);
					});
				}
			});
		}, (failure) => {
			console.log("Boostrapping data failed: " + failure.message);
			process.exit(1);
		});
	}
});

const server = app.listen(3000, () => {
	const port = server.address().port;
	console.log(`Running on port ${port}`);
});