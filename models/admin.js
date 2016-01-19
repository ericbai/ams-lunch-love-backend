'use strict';

const db = require('../db'),
	config = require('config'),
	bcrypt = require('bcrypt'),
	RSVP = require('rsvp'),
	utils = require('../helpers/utilities'),
	sendgrid = require('sendgrid')(process.env['SENDGRID_KEY']),
	UUID = require('node-uuid'),
	fields = ['name', 'email', 'password', 'pending', 'clusterSize', 'overlapTolerance'],
	mandatoryFields = ['name', 'email', 'password'],
	numFields = fields.length,
	numMandatory = mandatoryFields.length;

//////////////////
// Authenticate //
//////////////////

module.exports.authenticate = function(email, password) {
	return new RSVP.Promise((resolve, reject) => {
		if (email && password) {
			db.cypherQuery(`MATCH (admin:Admin)
				WHERE admin.email =~ {email}
				RETURN admin LIMIT 1`, {
				email: `(?i)${email}`
			}, (err, result) => {
				if (err) return reject(err);
				if (result.data.length === 0) {
					reject({
						status: 401,
						message: 'Email or password incorrect.'
					});
				} else {
					let admin = result.data[0];
					bcrypt.compare(password, admin.password, (err, res) => {
						if (err) return reject(err);
						if (res) {
							resolve(admin);
						} else {
							reject({
								status: 401,
								message: 'Email or password incorrect.'
							});
						}
					});
				}
			})
		} else {
			reject({
				status: 422,
				message: 'Both email and password must be specified.'
			});
		}
	});
};

module.exports.requestReset = function(email) {
	return new RSVP.Promise((resolve, reject) => {
		const resetToken = UUID.v4(),
			resetExpires = Date.now() + (1 * 60 * 60 * 1000); //expires in 1 hour
		db.cypherQuery(`MATCH (admin:Admin)
			WHERE admin.email =~ {email}
			SET admin.resetToken = {resetToken}
			SET admin.resetExpires = {resetExpires}
			RETURN admin`, {
			email: `(?i)${email}`,
			resetToken: resetToken,
			resetExpires: resetExpires
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					status: 404,
					message: `No admin found with email: ${email}`
				});
			} else {
				sendResetEmail(email, resetToken).then(() => {
					resolve();
				}, reject);
			}
		});
	});
};

module.exports.updatePasswordViaToken = function(token, password) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (admin:Admin)
			WHERE admin.resetToken =~ {token}
			RETURN admin`, {
			token: `(?i)${token}`
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					status: 404,
					message: `No admin found with token: ${token}`
				});
			} else {
				const admin = results.data[0];
				if (Date.now() - admin.resetExpires > 0) {
					reject({
						status: 401,
						message: `Reset token has expired`
					});
				} else {
					db.cypherQuery(`MATCH (admin:Admin)
						WHERE admin.resetToken =~ {token}
						REMOVE admin.resetToken
						REMOVE admin.resetExpires
						SET admin.password = {password}
						RETURN admin`, {
						token: `(?i)${token}`,
						password: password // password hashed in middleware
					}, (err, results) => {
						if (err) return reject(err);
						resolve({
							admin: results.data[0]
						});
					});
				}
			}
		});
	});
};

function sendResetEmail(resetEmail, token) {
	return new RSVP.Promise((resolve, reject) => {
		if (process.env['SENDGRID_KEY']) {
			const email = new sendgrid.Email({
				to: resetEmail,
				from: config.email.sender,
				subject: 'Password Reset',
				html: `You (or someone pretending to be you) have requested a password reset. If you have not requested this password reset, you may disregard this message. Otherwise, please <a href="${config.email.urlRoot}/reset?token=${token}" target="_blank">click here to reset your password</a>.`
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
			console.log("EMAIL SENDING NOT AVAILABLE FOR RESET!");
			resolve();
		}
	});
}

//////////
// List //
//////////

const findByEmail = function(email) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (admin:Admin)
			WHERE admin.email =~ {email}
			RETURN admin LIMIT 1`, {
			email: `(?i)${email}`
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					status: 404,
					message: `No admin found with email: ${email}`
				});
			} else {
				resolve({
					admin: results.data[0]
				});
			}
		});
	});
};
module.exports.findByEmail = findByEmail;

module.exports.listByPending = function(isPending, max, offset) {
	max = utils.isNumber(max) ? utils.toNumber(max) : config.default.max;
	offset = utils.isNumber(offset) ? utils.toNumber(offset) : config.default.offset;
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (admin:Admin)
			WHERE admin.pending = {isPending}
			RETURN admin ORDER BY admin.name SKIP {offset} LIMIT {max}`, {
			isPending: isPending,
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (admin:Admin)
				WHERE admin.pending = {isPending}
				RETURN count(admin)`, {
				isPending: isPending
			}, (err, countRes) => {
				if (err) return reject(err);
				resolve({
					admins: results.data,
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
				return reject({
					status: 422,
					message: `${key} must be specified`
				});
			}
		}
		findByEmail(dataToBeSaved.email).then((result) => {
			//Resend confirmation email
			if (result.admin.inviteToken && result.admin.pending) {
				sendAdminInvite(result.admin.inviteToken, result.admin.email).then(() => {
					resolve(result);
				}, (failure) => {
					reject(failure);
				});
			} else {
				reject({
					status: 422,
					message: 'Admin already exists for this email'
				});
			}
		}, () => {
			dataToBeSaved.pending = utils.isDefined(data.pending) ? data.pending : true;
			dataToBeSaved.clusterSize = utils.isNumber(data.clusterSize) ? utils.toNumber(data.clusterSize) : config.default.clusterSize;
			dataToBeSaved.overlapTolerance = utils.isNumber(data.overlapTolerance) ? utils.toNumber(data.overlapTolerance) : config.default.overlapTolerance;
			dataToBeSaved.password = data.password; //password already hashed by middleware
			dataToBeSaved.inviteToken = UUID.v4();
			db.insertNode(dataToBeSaved, 'Admin', (err, result) => {
				if (err) return reject(err);
				sendAdminInvite(result.inviteToken, result.email).then(() => {
					resolve({
						admin: result
					});
				}, reject);
			});
		});
	});
};

function sendAdminInvite(inviteToken, ...recipients) {
	return new RSVP.Promise((resolve, reject) => {
		if (process.env['SENDGRID_KEY']) {
			const email = new sendgrid.Email({
				to: recipients,
				from: config.email.sender,
				subject: 'Confirm your invitation to manage AMS Lunch Love',
				html: `Welcome to AMS Lunch Love! You've been invited to be an admin. Please <a href="${config.email.urlRoot}/confirm/admin?token=${inviteToken}" target="_blank">click here to claim your account</a>.`
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
			console.log("EMAIL SENDING NOT AVAILABLE FOR ADMIN INVITE!");
			resolve();
		}
	});
}

////////////
// Update //
////////////

module.exports.approveByToken = function(token, password) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (admin:Admin)
			WHERE admin.inviteToken =~ {token}
			SET admin.password = {password}
			SET admin.pending = false
			RETURN admin`, {
			token: `(?i)${token}`,
			password: password
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					status: 404,
					message: `No admin found with token: ${token}`
				});
			} else {
				resolve({
					admin: results.data[0]
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
				fieldsToBeSet.push(`SET admin.${field} = '${data[field]}'`);
			} else if (utils.isDefined(data[field])) {
				fieldsToBeSet.push(`SET admin.${field} = ${data[field]}`);
			}
		}
		db.cypherQuery(`MATCH (admin:Admin)
			WHERE admin.email =~ {email}
			${fieldsToBeSet.join(' ')}
			RETURN admin`, {
			email: `(?i)${email}`
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					status: 404,
					message: `No admin found with email: ${email}`
				});
			} else {
				resolve({
					admin: results.data[0]
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
		db.cypherQuery(`MATCH (admin:Admin)
				WHERE admin.email =~ {email}
				DETACH DELETE admin`, {
			email: `(?i)${email}`
		}, (err, results) => {
			if (err) return reject(err);
			resolve();
		});
	});
};
