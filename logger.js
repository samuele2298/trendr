'use strict';

const winston = require('winston');
const format = require('winston').format;
const { combine, printf, timestamp } = format;

const myFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
}); 

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL,
    format: combine(
        timestamp('YYYY-MM-DD HH:mm:ss'),
        myFormat
    ),
    exitOnError: false,
    transports: [new winston.transports.Console()]
});

module.exports = logger;