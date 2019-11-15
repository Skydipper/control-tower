require('app-module-path').addPath(__dirname);
const { CronJob } = require('cron');
const mongoose = require('mongoose');
const logger = require('logger');
const StatisticService = require('plugins/sd-ct-statistics-plugin/services/statistic.service');
const mongooseOptions = require('../../../../../config/mongoose');

module.exports = function cron(plugin, generalConfig) {
    logger.info('Loading statistics cron');
    const connection = mongoose.createConnection(`${generalConfig.mongoUri}`, mongooseOptions);
    const statisticService = new StatisticService(connection);
    async function tick() {
        try {
            logger.info('Executing tick in statistics microservice');
            await statisticService.completeGeoInfo();
        } catch (error) {
            logger.info('Error: ', error);
        }
    }

    new CronJob('00 * * * * *', tick, null, true, 'America/Los_Angeles'); // eslint-disable-line no-new
};
