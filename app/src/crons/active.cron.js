const { CronJob } = require('cron');
const logger = require('logger');
const MicroserviceService = require('services/microservice.service');

async function tick() {
    logger.info('Executing tick in check live microservice');
    await MicroserviceService.checkActiveMicroservices();
}

new CronJob('*/30 * * * * *', tick, null, true, 'America/Los_Angeles'); // eslint-disable-line no-new
