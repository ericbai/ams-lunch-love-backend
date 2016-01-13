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
			db.cypherQuery(`MATCH (u:User)
				WHERE u.email =~ {email}
				RETURN u LIMIT 1`, {
				email: `(?i)${email}`
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
				dataToBeSaved.clusterSize = utils.isNumber(data.clusterSize) ? utils.toNumber(data.clusterSize) : config.default.clusterSize;
				dataToBeSaved.overlapTolerance = utils.isNumber(data.overlapTolerance) ? utils.toNumber(data.overlapTolerance) : config.default.overlapTolerance;
				dataToBeSaved.password = data.password; //password already hashed
				insertOrMerge(data, resolve, reject);
			} else {
				dataToBeSaved.confirmed = utils.isDefined(data.confirmed) ? data.confirmed : false;
				dataToBeSaved.classYear = data.classYear;
				insertOrMerge(data, resolve, reject);
			}
		} else {
			reject({
				message: 'Either password or classYear must be specified'
			});
		}
	});
};

function insertOrMerge(data, resolve, reject) {
	data.deleted = false;
	findByEmail(data.email).then((found) => {
		if (found.user.deleted) {
			update(data.email, data).then(resolve, reject);
		} else {
			reject({
				message: 'User with that email already exists'
			});
		}
	}, (notFound) => {
		db.insertNode(dataToBeSaved, 'User', (err, result) => {
			if (err) return reject(err);
			resolve({
				user: result
			});
		});
	});
}

////////////
// Update //
////////////

const update = function(email, data) {
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
		db.cypherQuery(`MATCH (u:User)
			WHERE u.email =~ {email}
			${fieldsToBeSet.join(' ')}
			RETURN u`, {
			email: `(?i)${email}`
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
module.exports.update = update;

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

module.exports.listClassYears = function() {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (u:User)
			WHERE EXISTS(u.classYear)
			RETURN DISTINCT u.classYear`, (err, results) => {
			if (err) return reject(err);
			resolve(results.data);
		});
	});
};

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

const findByEmail = function(email, isDeleted) {
	const deletedOption = utils.isDefined(isDeleted) ? `AND u.deleted = ${isDeleted}` : '';
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (u:User)
			WHERE u.email =~ {email}
			${deletedOption}
			RETURN u LIMIT 1`, {
			email: `(?i)${email}`
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
module.exports.findByEmail = findByEmail;

module.exports.listAdmins = function(isPending, max, offset) {
	max = utils.isNumber(max) ? utils.toNumber(max) : config.default.max;
	offset = utils.isNumber(offset) ? utils.toNumber(offset) : config.default.offset;
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
	max = utils.isNumber(max) ? utils.toNumber(max) : config.default.max;
	offset = utils.isNumber(offset) ? utils.toNumber(offset) : config.default.offset;
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
	max = utils.isNumber(max) ? utils.toNumber(max) : config.default.max;
	offset = utils.isNumber(offset) ? utils.toNumber(offset) : config.default.offset;
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
	max = utils.isNumber(max) ? utils.toNumber(max) : config.default.max;
	offset = utils.isNumber(offset) ? utils.toNumber(offset) : config.default.offset;
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (n:User)
			WHERE (n.name =~ {search} OR n.email =~ {search})
				AND n.confirmed = true
				AND exists(n.classYear)
				AND n.deleted = false
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
