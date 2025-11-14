'use strict';

const initOptions = {
    // global event notification;
    error: (error, e) => {
        console.log(error);
    }
};

const pgp = require('pg-promise')(initOptions);
const dbconnString = process.env.DB;
// pgp.pg.defaults.ssl = { rejectUnauthorized: false };
// pgp.pg.defaults.application_name = 'Inviatore';
// pgp.pg.defaults.max = 0;
const db = pgp({connectionString: dbconnString, application_name: process.env.APP_NAME, max: 5, ssl: {rejectUnauthorized: false}});

module.exports = db;
