'use strict';

const db = require('../db'),
	config = require('config'),
	bcrypt = require('bcrypt'),
	RSVP = require('rsvp'),
	utils = require('../helpers/utilities'),
	fields = ['name', 'email', 'password', 'classYear', 'pendingAdmin', 'confirmed', 'deleted', 'clusterSize', 'overlapTolerance'],
	mandatoryFields = ['name', 'email'],
	numFields = fields.length,
	numMandatory = mandatoryFields.length;

//////////////////
// Authenticate //
//////////////////

module.exports.authenticate = function(email, password) {
	return new RSVP.Promise((resolve, reject) => {
		if (email && password) {
			db.cypherQuery('MATCH (u:User { email: {email} }) RETURN u', {
				email: email
			}, (err, result) => {
				if (err) return reject(err);
				if (result.data.length === 0) {
					reject({
						message: 'Email or password incorrect.'
					});
				} else {
					let user = result.data[0];
					bcrypt.compare(password, user.password, (err, res) => {
						if (err) return reject(err);
						if (res) {
							resolve(user);
						} else {
							reject({
								message: 'Email or password incorrect.'
							});
						}
					});
				}
			})
		} else {
			reject({
				message: 'Both email and password must be specified.'
			})
		}
	});
};

////////////
// Create //
////////////

module.exports.create = function(data) {
	return new RSVP.Promise((resolve, reject) => {
		const dataToBeSaved = {};
		for (let i = 0; i < numMandatory; i++) {
			const key = mandatoryFields[i];
			if (data[key]) {
				dataToBeSaved[key] = data[key];
			} else {
				reject({
					message: `${key} must be specified`
				});
				return
			}
		}
		if (data.password || data.classYear) {
			dataToBeSaved.deleted = utils.isDefined(data.deleted) ? data.deleted : false;
			if (data.password) {
				dataToBeSaved.pendingAdmin = utils.isDefined(data.pendingAdmin) ? data.pendingAdmin : true;
				dataToBeSaved.clusterSize = utils.isDefined(data.clusterSize) ? data.clusterSize : config.default.clusterSize;
				dataToBeSaved.overlapTolerance = utils.isDefined(data.overlapTolerance) ? data.overlapTolerance : config.default.overlapTolerance;
				dataToBeSaved.password = data.password;
				// hash password
				bcrypt.hash(dataToBeSaved.password, config.bcrypt.rounds, (err, hash) => {
					if (err) return reject(err);
					dataToBeSaved.password = hash;
					db.insertNode(dataToBeSaved, 'User', (err, result) => {
						if (err) return reject(err);
						resolve({
							user: result
						});
					});
				});
			} else {
				dataToBeSaved.confirmed = utils.isDefined(data.confirmed) ? data.confirmed : false;
				dataToBeSaved.classYear = data.classYear;
				db.insertNode(dataToBeSaved, 'User', (err, result) => {
					if (err) return reject(err);
					resolve({
						user: result
					});
				});
			}
		} else {
			reject({
				message: 'Either password or classYear must be specified'
			});
		}
	});
};

////////////
// Update //
////////////

module.exports.update = function(email, data) {
	return new RSVP.Promise((resolve, reject) => {
		const fieldsToBeSet = []
		for (let i = 0; i < numFields; i++) {
			const field = fields[i];
			if (utils.isDefined(data[field]) && typeof data[field] === 'string') {
				fieldsToBeSet.push(`SET u.${field} = '${data[field]}'`);
			} else if (utils.isDefined(data[field])) {
				fieldsToBeSet.push(`SET u.${field} = ${data[field]}`);
			}
		}
		db.cypherQuery(`MATCH (u:User { email: {email} }) ${fieldsToBeSet.join(' ')} RETURN u`, {
			email: email
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					message: `No user found with email: ${email}`
				});
			} else {
				resolve({
					user: results.data[0]
				});
			}
		});
	});
};

////////////
// Delete //
////////////

module.exports.delete = function(email) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (u:User { email: {email} }) SET u.deleted = true RETURN u`, {
			email: email
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					message: `No user found with email: ${email}`
				});
			} else {
				resolve();
			}
		});
	});
};

//////////
// List //
//////////

module.exports.existsForEmails = function(...emails) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (u:User)
			WHERE u.email IN {emails}
			RETURN count(u)`, {
			emails: emails
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data[0] === emails.length) {
				resolve();
			} else {
				reject({
					message: 'users not found for all emails'
				})
			}
		});
	});
};

module.exports.findByEmail = function(email) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (n:User { email: {email}, deleted: false }) RETURN n LIMIT 1`, {
			email: email
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					message: `No user found with email: ${email}`
				});
			} else {
				resolve({
					user: results.data[0]
				});
			}
		});
	});
};

module.exports.listAdmins = function(isPending, max, offset) {
	max = utils.isDefined(max) ? max : config.default.max;
	offset = utils.isDefined(offset) ? offset : config.default.offset;
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (n:User) 
			WHERE n.pendingAdmin = {isPending} AND exists(n.password)
				AND n.deleted = false
			RETURN n ORDER BY n.name SKIP {offset} LIMIT {max}`, {
			isPending: isPending,
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (n:User) 
				WHERE n.pendingAdmin = {isPending} AND exists(n.password)
					AND n.deleted = false
				RETURN count(n)`, {
				isPending: isPending
			}, (err, countRes) => {
				if (err) return reject(err);
				resolve({
					users: results.data,
					meta: {
						offset: offset,
						max: max,
						total: countRes.data[0]
					}
				});
			});
		});
	});
};

module.exports.listUsers = function(max, offset) {
	max = utils.isDefined(max) ? max : config.default.max;
	offset = utils.isDefined(offset) ? offset : config.default.offset;
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (n:User) 
			WHERE n.confirmed = true AND exists(n.classYear)
				AND n.deleted = false
			RETURN n ORDER BY n.name SKIP {offset} LIMIT {max}`, {
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (n:User) 
				WHERE n.confirmed = true AND exists(n.classYear)
					AND n.deleted = false
				RETURN count(n)`, (err, countRes) => {
				if (err) return reject(err);
				resolve({
					users: results.data,
					meta: {
						offset: offset,
						max: max,
						total: countRes.data[0]
					}
				});
			});
		});
	});
};

module.exports.listByClassYear = function(classYear, max, offset) {
	classYear = utils.isDefined(classYear) ? classYear : '';
	max = utils.isDefined(max) ? max : config.default.max;
	offset = utils.isDefined(offset) ? offset : config.default.offset;
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (n:User) 
			WHERE n.classYear={classYear} AND n.confirmed = true 
				AND exists(n.classYear) AND n.deleted = false
			RETURN n ORDER BY n.name SKIP {offset} LIMIT {max}`, {
			classYear: classYear,
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (n:User) 
				WHERE n.classYear={classYear} AND n.confirmed = true 
					AND exists(n.classYear) AND n.deleted = false
				RETURN count(n)`, {
				classYear: classYear
			}, (err, countRes) => {
				if (err) return reject(err);
				resolve({
					users: results.data,
					meta: {
						offset: offset,
						max: max,
						total: countRes.data[0]
					}
				});
			});
		});
	});
};

module.exports.search = function(searchString, max, offset) {
	searchString = utils.isDefined(searchString) ? searchString : '';
	max = utils.isDefined(max) ? max : config.default.max;
	offset = utils.isDefined(offset) ? offset : config.default.offset;
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (n:User) 
			WHERE (n.name =~ {search} OR n.email =~ {search}) AND n.confirmed = true
				AND exists(n.classYear) AND n.deleted = false
			RETURN n ORDER BY n.name SKIP {offset} LIMIT {max}`, {
			search: `(?i).*${searchString}.*`,
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (n:User) 
				WHERE (n.name =~ {search} OR n.email =~ {search}) AND n.confirmed = true 
					AND exists(n.classYear) AND n.deleted = false
				RETURN count(n)`, {
				search: `(?i).*${searchString}.*`
			}, (err, countRes) => {
				if (err) return reject(err);
				resolve({
					users: results.data,
					meta: {
						offset: offset,
						max: max,
						total: countRes.data[0]
					}
				});
			});
		});
	});
};