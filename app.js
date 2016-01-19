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

//initialize db
require('./helpers/initialize-db')();

//add in routes
require('./routes')(app);

const server = app.listen(process.env.PORT || 3000, () => {
	const port = server.address().port;
	console.log(`Running on port ${port}`);
});
