'use strict';

const db = require('../db'),
	config = require('config'),
	RSVP = require('rsvp'),
	utils = require('../helpers/utilities'),
	sendgrid = require('sendgrid')(process.env['SENDGRID_KEY']),
	UUID = require('node-uuid'),
	fields = ['name', 'email', 'classYear', 'confirmed'],
	mandatoryFields = ['name', 'email', 'classYear'],
	numFields = fields.length,
	numMandatory = mandatoryFields.length;

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
					status: 404,
					message: 'users not found for all emails'
				})
			}
		});
	});
};

const findByEmail = function(email) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (u:User)
			WHERE u.email =~ {email}
			RETURN u LIMIT 1`, {
			email: `(?i)${email}`
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					status: 404,
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

module.exports.list = function(max, offset) {
	max = utils.isNumber(max) ? utils.toNumber(max) : config.default.max;
	offset = utils.isNumber(offset) ? utils.toNumber(offset) : config.default.offset;
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (n:User)
			WHERE n.confirmed = true
			RETURN n ORDER BY n.name SKIP {offset} LIMIT {max}`, {
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (n:User)
				WHERE n.confirmed = true
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
			RETURN n ORDER BY n.name SKIP {offset} LIMIT {max}`, {
			classYear: classYear,
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (n:User)
				WHERE n.classYear={classYear} AND n.confirmed = true
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
			WHERE (n.name =~ {search} OR n.email =~ {search}) AND n.confirmed = true
			RETURN n ORDER BY n.name SKIP {offset} LIMIT {max}`, {
			search: `(?i).*${searchString}.*`,
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (n:User)
				WHERE (n.name =~ {search} OR n.email =~ {search}) AND n.confirmed = true
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
		findByEmail(dataToBeSaved.email).then((found) => {
			//if user is unconfirmed, resend the confirmation email
			if (found.user.token && utils.isDefined(found.user.confirmed) && !found.user.confirmed) {
				sendUserConfirmation(found.user.token, found.user.email).then(() => {
					resolve(found);
				}, (failure) => {
					reject(failure);
				});
			} else {
				reject({
					status: 422,
					message: 'User with that email already exists'
				});
			}
		}, () => {
			dataToBeSaved.confirmed = utils.isDefined(data.confirmed) ? data.confirmed : false;
			dataToBeSaved.classYear = data.classYear;
			dataToBeSaved.token = UUID.v4();
			db.insertNode(dataToBeSaved, 'User', (err, result) => {
				if (err) return reject(err);
				sendUserConfirmation(result.token, result.email).then(() => {
					resolve({
						user: result
					});
				}, (failure) => {
					reject(failure);
				});
			});
		});
	});
};

function sendUserConfirmation(token, ...recipients) {
	return new RSVP.Promise((resolve, reject) => {
		if (process.env['SENDGRID_KEY']) {
			const email = new sendgrid.Email({
				to: recipients,
				from: config.email.sender,
				subject: 'Welcome! Confirm your subscription!',
				html: `Welcome to AMS Lunch Love. To complete the signup process, please <a href="${config.email.urlRoot}/confirm/user?token=${token}" target="_blank">confirm your subscription</a>.<br/><br/>

				Please save this email as you may <a href="${config.email.urlRoot}/confirm/unsubscribe?token=${token}" target="_blank">click here to unsubscribe at any time</a>.`
			});
			email.setFilters({
				'templates': {
					'settings': {
						'enable': 1,
						'template_id': config.email.templateId,
					}
				}
			});
			sendgrid.send(email, function(err, result) {
				if (err) return reject(err);
				resolve(result);
			});
		} else {
			console.log("EMAIL SENDING NOT AVAILABLE!");
			resolve();
		}
	});
}

////////////
// Update //
////////////

module.exports.statusByToken = function(token, status) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (user:User)
			WHERE user.token =~ {token}
			SET user.confirmed = {status}
			RETURN user`, {
			token: `(?i)${token}`,
			status: status
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					status: 404,
					message: `No user found with token: ${token}`
				});
			} else {
				resolve({
					user: results.data[0]
				});
			}
		});
	});
};

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
		db.cypherQuery(`MATCH (u:User)
			WHERE u.email =~ {email}
			${fieldsToBeSet.join(' ')}
			RETURN u`, {
			email: `(?i)${email}`
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					status: 404,
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
		db.cypherQuery(`MATCH (user:User)
				WHERE user.email =~ {email}
				DETACH DELETE user`, {
			email: `(?i)${email}`
		}, (err, results) => {
			if (err) return reject(err);
			//delete disconnected group nodes too
			db.cypherQuery(`MATCH (group:Group)
				WHERE NOT (group)--()
				DETACH DELETE group`, (err, results) => {
				if (err) return reject(err);
				resolve();
			});
		});
	});
};
