'use strict';

const logger = require('./logger');
const express = require('express');
const helmet = require('helmet');

const cors = require('cors');

const votes = require('./routes/votes');
const genders = require('./routes/genders');
const interests = require('./routes/interests');
const tags = require('./routes/tags');
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

    app.use('/api/votes', votes);
    app.use('/api/genders', genders);
    app.use('/api/interests', interests);
    app.use('/api/tags', tags);
    app.use('/api/questions', questions);
    app.use('/api/sectors', sectors);
    app.use('/api/ages', ages);
    app.use('/api/explore', explore);

    const port = normalizePort(process.env.PORT);
    app.listen(port, '0.0.0.0'); // Accetta richieste da tutti gli IP
    //app.listen(port, 'localhost); // Accetta solo da localhost

    // Graceful shutdown
    const shutdown = async (signal) => {
        try {
            logger.info(`${signal} received. Closing server...`);
            server.close(() => {
                logger.info('Server closed.');
                process.exit(0);
            });
        } catch (err) {
            logger.error('Error during shutdown:', err);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main();