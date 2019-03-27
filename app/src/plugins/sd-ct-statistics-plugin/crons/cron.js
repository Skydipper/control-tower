require('app-module-path').addPath(__dirname);
const CronJob = require('cron').CronJob;
const mongoose = require('mongoose');
const debug = require('debug')('statistics-plugin');
const StatisticService = require('plugins/sd-ct-statistics-plugin/services/statistic.service');

module.exports = function cron(plugin, generalConfig) {
    debug('Loading statistics cron');
    const connection = mongoose.createConnection(`${generalConfig.mongoUri}`);
    const statisticService = new StatisticService(connection);
    async function tick() {
        try {
            debug('Executing tick in statistics microservice');
            await statisticService.completeGeoInfo();
        } catch (error) {
            debug('Error: ', error);
        }
    }

    new CronJob('00 * * * * *', tick, null, true, 'America/Los_Angeles'); // eslint-disable-line no-new
};
