const { CronJob } = require('cron');
const logger = require('logger');
const MicroserviceService = require('services/microservice.service');


async function checkPendingMicroservices() {
    try {
        await MicroserviceService.checkPendingMicroservices();
    } catch (err) {
        logger.error('Error in checkPendingMicroservices', err);
    }
}

new CronJob('*/10 * * * * *', checkPendingMicroservices, null, true, 'America/Los_Angeles'); // eslint-disable-line no-new
