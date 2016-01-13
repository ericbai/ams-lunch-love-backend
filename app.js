'use strict';

const express = require('express'),
	app = express(),
	bodyParser = require('body-parser'),
	cors = require('cors'),
	UUID = require('node-uuid');

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
	console.log('Listing all labels to make sure that db is initialized');
	if (err) {
		console.log("Could not list all labels: " + err.message);
		process.exit(1);
	}
	if (result.length === 0) {
		console.log("Creating initial user in db");
		// create the initial admin
		User.create({
			name: "Admin",
			username: "admin",
			password: "ilovelunch",
			email: "amslunchlove@gmail.com",
			pendingAdmin: false,
			confirmed: true
		}).then((success) => {
			console.log("Listing uniqueness constraints on Users");
			db.listAllUniquenessConstraintsForLabel('User', (err, result) => {
				if (err) {
					console.log("List uniqueness constraints for user failed: " + (err && err.message));
					process.exit(1);
				}
				if (result.length === 0) {
					console.log("Creating uniqueness constraint on User email");
					db.createUniquenessContstraint('User', 'email', (err, result) => {
						if (err) {
							console.log("Creating uniqueness constraint on email failed: " + (err && err.message));
							process.exit(1);
						}
					});
				}
			});
		}, (failure) => {
			console.log("Boostrapping user failed: " + failure.message);
			process.exit(1);
		});
		console.log("Creating a placeholder group in db");
		db.cypherQuery(`CREATE (g:Group {
			uuid: {uuid}
		}) RETURN g`, {
			uuid: UUID.v4()
		}, (err, results) => {
			if (err) {
				console.log("Bootstrapping group failed: " + (err && err.message));
				process.exit(1);
			}
			console.log("Listing uniqueness constraints on Groups");
			db.listAllUniquenessConstraintsForLabel('Group', (err, result) => {
				if (err) {
					console.log("List uniqueness constraints for group failed: " + (err && err.message));
					process.exit(1);
				}
				if (result.length === 0) {
					console.log("Creating uniqueness constraint on Group uuid");
					db.createUniquenessContstraint('Group', 'uuid', (err, result) => {
						if (err) {
							console.log("Creating uniqueness constraint on uuid failed: " + (err && err.message));
							process.exit(1);
						}
					});
				}
			});
		});
	}
});

const server = app.listen(process.env.PORT || 3000, () => {
	const port = server.address().port;
	console.log(`Running on port ${port}`);
});
