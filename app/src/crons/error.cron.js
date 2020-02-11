const { CronJob } = require('cron');
const logger = require('logger');
const MicroserviceService = require('services/microservice.service');


async function checkErrorMicroservices() {
    try {
        await MicroserviceService.checkErrorMicroservices();
    } catch (err) {
        logger.error('Error in checkErrorMicroservices', err);
    }
}

new CronJob('*/10 * * * * *', checkErrorMicroservices, null, true, 'America/Los_Angeles'); // eslint-disable-line no-new
