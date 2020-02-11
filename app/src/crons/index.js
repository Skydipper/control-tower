const logger = require('logger');
const config = require('config');
const mongoose = require('mongoose');
const loader = require('loader');

const mongooseOptions = require('../../../config/mongoose');

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;

async function onDbReady(err) {
    if (err) {
        logger.error(err);
        throw new Error(err);
    }
    require('crons/active.cron'); // eslint-disable-line global-require
    require('crons/error.cron'); // eslint-disable-line global-require
    require('crons/pending.cron'); // eslint-disable-line global-require

    logger.info('Loading crons of the plugins');
    await loader.loadCronsPlugins();
    logger.info('Cron started');

}

mongoose.connect(mongoUri, mongooseOptions, onDbReady);
