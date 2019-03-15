const config = require('config');
const bunyan = require('bunyan');

const streams = [
    {
        stream: process.stdout,
        level: config.get('logger.level') || 'debug'
    }, {
        stream: process.stderr,
        level: 'warn'
    },
];

const logger = bunyan.createLogger({
    name: config.get('logger.name'),
    streams,
});

module.exports = logger;
