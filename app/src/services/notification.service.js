const logger = require('logger');

// TODO: One day we'll have a notification system again
class Notification {

    constructor() {
        logger.debug('Initializing notification service');
    }

    static async sendAlertMicroserviceDown(name, url, err) {
        logger.warn('Microservice down: ', name, url, err.message);
    }

    static async sendAlertMicroserviceRestore(name, url) {
        logger.warn('Microservice restore: ', name, url);
    }

}

module.exports = Notification;
