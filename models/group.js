'use strict';

const db = require('../db'),
	config = require('config'),
	bcrypt = require('bcrypt'),
	RSVP = require('rsvp'),
	utils = require('../helpers/utilities'),
	UUID = require('node-uuid'),
	sendgrid = require('sendgrid')(process.env['SENDGRID_KEY']);

////////////
// Create //
////////////

module.exports.create = function(...emails) {
	return new RSVP.Promise((resolve, reject) => {
		if (emails.length > 1) {
			db.cypherQuery(`MATCH (u:User)
				WHERE u.email IN {emails}
				RETURN count(u)`, {
				emails: emails
			}, (err, countRes) => {
				if (err) return reject(err);
				if (countRes.data[0] === emails.length) {
					db.cypherQuery(`MATCH c = (u:User)
						WHERE u.email IN {emails}
						MERGE (g:Group { uuid: {uuid}, timestamp: {timestamp} })
						FOREACH (n in nodes(c) |
							MERGE (g)-[:CONTAINS]->(n)
						)
						RETURN g`, {
						uuid: UUID.v4(),
						timestamp: new Date(),
						emails: emails
					}, (err, result) => {
						if (err) return reject(err);
						const group = result.data[0];
						group.users = emails
						resolve({
							group: group
						});
					});
				} else {
					reject({
						message: 'Some users could not be found for provided emails.'
					});
				}
			});
		} else {
			reject({
				message: 'Group must contain at least two users.'
			});
		}
	});
};

module.exports.createForAll = function(listOfListOfEmails) {
	return new RSVP.Promise((resolve, reject) => {
		if (Array.isArray(listOfListOfEmails) && listOfListOfEmails.length > 0) {
			const numLists = listOfListOfEmails.length;
			RSVP.all(listOfListOfEmails.map((listOfEmails) => {
				return new RSVP.Promise((resolve, reject) => {
					db.cypherQuery(`MATCH (u:User)
						WHERE u.email IN {emails}
						RETURN count(u)`, {
						emails: listOfEmails
					}, (err, countRes) => {
						if (err) return reject(err);
						if (countRes.data[0] === listOfEmails.length) {
							resolve();
						} else {
							reject({
								status: 404,
								message: `Some users could not be found for provided emails: ${listOfEmails}`
							});
						}
					});
				});
			})).then(() => {
				const newGroups = [],
					statements = listOfListOfEmails.map((listOfEmails) => {
						const parameters = {
							uuid: UUID.v4(),
							timestamp: new Date(),
							emails: listOfEmails
						};
						newGroups.push({
							uuid: parameters.uuid,
							timestamp: parameters.timestamp,
							users: listOfEmails
						});
						return {
							statement: `MATCH c = (u:User)
								WHERE u.email IN {emails}
								MERGE (g:Group { uuid: {uuid}, timestamp: {timestamp} })
								FOREACH (n in nodes(c) |
									MERGE (g)-[:CONTAINS]->(n)
								)
								RETURN g`,
							parameters: parameters
						}
					});
				db.beginAndCommitTransaction({
					"statements": statements
				}, (err, results) => {
					if (err) return reject(results.errors || err);
					RSVP.all(newGroups.map((group) => {
						const users = group.users;
						return sendGroupEmail(...users);
					})).then(() => {
						resolve({
							groups: newGroups
						});
					}, () => {
						reject({
							status: 500,
							message: 'Could not send emails to all new groups. Please try again later.'
						});
					});
				});
			}, reject);
		} else {
			reject({
				message: 'Must pass at least one group to create.'
			});
		}
	});
}

function sendGroupEmail(...recipients) {
	return new RSVP.Promise((resolve, reject) => {
		if (process.env['SENDGRID_KEY']) {
			const recipientsList = recipients.map((recipient) => {
					return `<li style="padding-left:1em; border-left: 15px solid #b74c4c; margin: 0 0 1em 1em;">
								${recipient}
							</li>`;
				}).join(''),
				email = new sendgrid.Email({
					to: recipients,
					from: config.email.sender,
					subject: "You've been grouped!",
					html: `The day has finally come! Here are the people you've been grouped with! Reply to this thread to find a time to grab food, hang out, and get to know each other.<br/>
						<ul style="list-style:none; padding:0;">
							${recipientsList}
						</ul>
						Take the plunge! You're worth it!`
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
			console.log("EMAIL SENDING NOT AVAILABLE TO " + recipients);
			resolve();
		}
	});
}

//////////
// List //
//////////

module.exports.findByUUID = function(uuid) {
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (g:Group { uuid: {uuid} })-[:CONTAINS]->(u:User)
			RETURN g, collect(u.email)`, {
			uuid: UUID
		}, (err, results) => {
			if (err) return reject(err);
			if (results.data.length === 0) {
				reject({
					message: `No group exists for uuid: ${uuid}`
				});
			} else {
				resolve({
					group: formatGroupResult(results.data[0])
				});
			}
		});
	});
};

module.exports.listByUserEmail = function(email, max, offset) {
	max = utils.isNumber(max) ? utils.toNumber(max) : config.default.max;
	offset = utils.isNumber(offset) ? utils.toNumber(offset) : config.default.offset;
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (m:User { email: {email} })--(g:Group)-[:CONTAINS]->(u:User)
			RETURN g, collect(u.email) + m.email
			ORDER BY g.timestamp DESC SKIP {offset} LIMIT {max}`, {
			email: email,
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (g:Group)--(:User { email: {email} }) RETURN count(g)`, {
				email: email
			}, (err, countRes) => {
				if (err) return reject(err);
				resolve({
					groups: results.data.map(formatGroupResult),
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

module.exports.listAll = function(max, offset) {
	max = utils.isNumber(max) ? utils.toNumber(max) : config.default.max;
	offset = utils.isNumber(offset) ? utils.toNumber(offset) : config.default.offset;
	return new RSVP.Promise((resolve, reject) => {
		db.cypherQuery(`MATCH (g:Group)-[:CONTAINS]->(u:User)
			RETURN g, collect(u.email) ORDER BY g.timestamp DESC SKIP {offset} LIMIT {max}`, {
			offset: offset,
			max: max
		}, (err, results) => {
			if (err) return reject(err);
			db.cypherQuery(`MATCH (g:Group) RETURN count(g)`, (err, countRes) => {
				if (err) return reject(err);
				resolve({
					groups: results.data.map(formatGroupResult),
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

////////////////////
// Helper methods //
////////////////////

function formatGroupResult(groupResult) {
	const group = groupResult[0];
	group.users = groupResult[1];
	return group;
}
