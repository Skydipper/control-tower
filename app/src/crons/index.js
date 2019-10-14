const logger = require('logger');
const config = require('config');
const mongoose = require('mongoose');
const bluebird = require('bluebird');

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;

const loader = require('loader');

async function onDbReady(err) {
    if (err) {
        logger.error(err);
        throw new Error(err);
    }
    // set promises in mongoose with bluebird
    mongoose.Promise = bluebird;
    require('crons/live.cron'); // eslint-disable-line global-require
    require('crons/error.cron'); // eslint-disable-line global-require

    logger.info('Loading crons of the plugins');
    await loader.loadCronsPlugins();
    logger.info('Cron started');

}

mongoose.connect(mongoUri, { useNewUrlParser: true }, onDbReady);
