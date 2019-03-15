const Router = require('koa-router');
const logger = require('logger');
const Utils = require('utils');

const router = new Router({
    prefix: '/error',
});

class ErrorRouter {

    static async get() {
        logger.info('Throwing an error endpoints');
        throw new Error(`Random error #${new Date().toISOString()}`);
    }

}

router.get('/', Utils.isLogged, Utils.isAdmin, ErrorRouter.get);

module.exports = router;
