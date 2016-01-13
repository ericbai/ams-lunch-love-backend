'use strict';

const config = require('config'),
	neo4j = require('node-neo4j'),
	url = process.env['GRAPHENEDB_URL'] || config.dbUrl,
	db = module.exports = new neo4j(url);

console.log("Connected to neo4j at " + url);
