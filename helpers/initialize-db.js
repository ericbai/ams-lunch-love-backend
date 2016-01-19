const db = require('../db'),
	User = require('../models/user'),
	Admin = require('../models/admin'),
	RSVP = require('rsvp'),
	UUID = require('node-uuid'),
	bcrypt = require('bcrypt'),
	config = require('config');

module.exports = function() {
	return new RSVP.Promise((resolve, reject) => {
		// initial data
		db.listAllLabels((err, result) => {
			console.log('Checking that db is initialized');
			if (err) {
				console.log("Could not list all labels: " + err.message);
				process.exit(1);
			}
			if (result.length === 0) {
				console.log("Creating placeholder user in db");
				ensureUser();
				console.log("Creating initial admin in db");
				ensureAdmin();
				console.log("Creating a placeholder group in db");
				ensureGroup();
			}
		});
	});
}

function ensureUser() {
	// create the initial user
	User.create({
		name: "Sample User",
		email: "amslunchlove@gmail.com",
		classYear: "2015",
		confirmed: false
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
}

function ensureAdmin() {
	// create the initial admin
	bcrypt.hash("ilovelunch", config.bcrypt.rounds, (err, hash) => {
		if (err) {
			console.log("Error hashing password for initial admin: " + (err && err.message));
			process.exit(1);
		}
		Admin.create({
			name: "Sample Admin",
			password: hash,
			email: "amslunchlove@gmail.com",
			pending: false
		}).then((success) => {
			console.log("Listing uniqueness constraints on Admin");
			db.listAllUniquenessConstraintsForLabel('Admin', (err, result) => {
				if (err) {
					console.log("List uniqueness constraints for admin failed: " + (err && err.message));
					process.exit(1);
				}
				if (result.length === 0) {
					console.log("Creating uniqueness constraint on Admin email");
					db.createUniquenessContstraint('Admin', 'email', (err, result) => {
						if (err) {
							console.log("Creating uniqueness constraint on email failed: " + (err && err.message));
							process.exit(1);
						}
					});
				}
			});
		}, (failure) => {
			console.log("Boostrapping admin failed: " + failure.message);
			process.exit(1);
		});
	});
}

function ensureGroup() {
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
