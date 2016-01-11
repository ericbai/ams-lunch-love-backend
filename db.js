'use strict';

const config = require('config'),
	neo4j = require('node-neo4j'),
	db = module.exports = new neo4j(process.env['GRAPHENEDB_URL'] || config.dbUrl);

console.log("Connected to neo4j at " + config.dbUrl);