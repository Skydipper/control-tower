const Router = require('koa-router');
const MicroserviceModel = require('models/microservice.model');
const VersionModel = require('models/version.model');
const appConstants = require('app.constants');
const logger = require('logger');
const MicroserviceService = require('services/microservice.service');
const MicroserviceDuplicated = require('errors/microserviceDuplicated');
const MicroserviceNotExist = require('errors/microserviceNotExist');
const Utils = require('utils');
const mongoose = require('mongoose');
const MicroserviceSerializer = require('serializers/microservice.serializer');
const pick = require('lodash/pick');

const router = new Router({
    prefix: '/microservice',
});

class MicroserviceRouter {

    static async getAll(ctx) {
        const query = pick(ctx.query, ['status', 'url']);

        logger.info('[MicroserviceRouter] Obtaining registered microservices list');
        const versionFound = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        logger.debug('[MicroserviceRouter] Found', versionFound);
        ctx.body = await MicroserviceModel.find({ ...query, version: versionFound.version }, { __v: 0 });
    }

    static async get(ctx) {
        const { id } = ctx.params;
        logger.info(`[MicroserviceRouter] Obtaining microservice with id ${id}`);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            ctx.throw(404, `Could not find a microservice with id ${id}`);
            return;
        }
        const microservice = await MicroserviceModel.findById(id, { __v: 0 });

        if (!microservice) {
            ctx.throw(404, `Could not find a microservice with id ${id}`);
            return;
        }

        ctx.body = MicroserviceSerializer.serialize(microservice);
    }

    static async getStatus(ctx) {
        logger.info('[MicroserviceRouter] Obtaining microservices status');
        const versionFound = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        logger.debug('[MicroserviceRouter] Found', versionFound);
        ctx.body = await MicroserviceModel.find({ version: versionFound.version }, {
            name: 1, infoStatus: 1, status: 1, _id: 0
        });
    }

    static async register(ctx) {
        logger.info(`[MicroserviceRouter] Registering microservice`);
        try {
            const result = await MicroserviceService.register(ctx.request.body);
            ctx.body = result;
        } catch (err) {
            if (err instanceof MicroserviceDuplicated) {
                ctx.throw(400, err.message);
                return;
            }
            throw err;
        }
    }

    static async delete(ctx) {
        logger.info(`[MicroserviceRouter] Removing microservice with id ${ctx.params.id}`);
        try {
            const result = await MicroserviceService.deleteMicroservice(ctx.params.id);
            ctx.body = result;
        } catch (err) {
            if (err instanceof MicroserviceNotExist) {
                ctx.throw(404, err.message);
                return;
            }
            throw err;
        }
    }

}

router.get('/status', MicroserviceRouter.getStatus);
router.get('/', Utils.isLogged, Utils.isAdmin, MicroserviceRouter.getAll);
router.get('/:id', Utils.isLogged, Utils.isAdmin, MicroserviceRouter.get);
router.post('/', MicroserviceRouter.register);
router.delete('/:id', Utils.isLogged, Utils.isAdmin, MicroserviceRouter.delete);

module.exports = router;
