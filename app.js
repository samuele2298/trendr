'use strict';

const logger = require('./logger');
const express = require('express');
const helmet = require('helmet');

const cors = require('cors');

const votes = require('./routes/votes');
const genders = require('./routes/genders');
const interests = require('./routes/interests');
const tags = require('./routes/tags');
const localization = require('./routes/localization');
const questions = require('./routes/questions');
const sectors = require('./routes/sectors');
const ages = require('./routes/ages');
const explore = require('./routes/explore');

const normalizePort = (val) => {
    const port = parseInt(val, 10);
    if (isNaN(port)) {
        // named pipe
        return val;
    }
    if (port >= 0) {
        // port number
        return port;
    }
    return false;
};

const main = async () => {
    logger.info('Starting server on: ' + process.env.PORT);
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    if (process.env.NODE_ENV === 'production') {
        app.use(cors({ origin: ['https://rate-social.com'] })); // TODO CHANGE DOMINIO
        app.disable('x-powered-by');
    } else {
        app.use(cors());
    }

    app.use(helmet());

    // Trust proxy (es. per rate limiting, cors dietro reverse proxy)
    app.set('trust proxy', 1);

    // Middleware: log GET/POST requests with response time, status code and endpoint
    app.use((req, res, next) => {
        const start = process.hrtime();

        // when response finished, compute duration and log
        res.on('finish', () => {
            try {
                // only log GET and POST as requested
                if (req.method !== 'GET' && req.method !== 'POST') return;
                const diff = process.hrtime(start);
                const durationMs = Math.round(diff[0] * 1000 + diff[1] / 1e6);
                const info = {
                    method: req.method,
                    path: req.originalUrl || req.url,
                    status: res.statusCode,
                    durationMs
                };
                // Structured log
                logger.info(`${info.method} ${info.path} ${info.status} ${info.durationMs}ms`);
            } catch (err) {
                // don't break the response flow if logging fails
                logger.error('request-logger-error', err);
            }
        });

        next();
    });

    app.use('/api/votes', votes);
    app.use('/api/genders', genders);
    app.use('/api/interests', interests);
    app.use('/api/tags', tags);
    app.use('/api/questions', questions);
    app.use('/api/localization', localization);
    app.use('/api/sectors', sectors);
    app.use('/api/ages', ages);
    app.use('/api/explore', explore);

    const port = normalizePort(process.env.PORT);
    // Store server instance so we can close it on graceful shutdown
    const server = app.listen(port, '0.0.0.0'); // Accetta richieste da tutti gli IP
    //app.listen(port, 'localhost); // Accetta solo da localhost

    // Graceful shutdown
    const shutdown = async (signal) => {
        try {
            logger.info(`${signal} received. Closing server...`);
            // if server is defined, close it gracefully
            if (server && typeof server.close === 'function') {
                server.close(() => {
                    logger.info('Server closed.');
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        } catch (err) {
            logger.error('Error during shutdown:', err);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main();