const Router = require('koa-router');
const logger = require('logger');
const DispatcherService = require('services/dispatcher.service.js');
const EndpointNotFound = require('errors/endpointNotFound');
const NotAuthenticated = require('errors/notAuthenticated');
const NotApplicationKey = require('errors/notApplicationKey');
const FilterError = require('errors/filterError');
const fs = require('fs');

const router = new Router();
const requestPromise = require('request-promise');
const request = require('request');

const passThrough = require('stream').PassThrough;

const unlink = async (file) => new Promise((resolve, reject) => {
    fs.unlink(file, (err) => {
        if (err) {
            reject(err);
            return;
        }
        resolve();
    });
});

const ALLOWED_HEADERS = [
    'access-control-allow-origin',
    'access-control-allow-headers',
    'cache-control',
    'charset',
    'location',
    'content-disposition',
    'content-type',
    'content-encoding',
    'Surrogate-Key',
    'surrogate-key',
    'APP_KEY',
    'cache',
    'uncache'
];

function getHeadersFromResponse(response) {
    const validHeaders = {};
    const keys = Object.keys(response.headers);
    for (let i = 0, { length } = keys; i < length; i++) {
        if (ALLOWED_HEADERS.indexOf(keys[i].toLowerCase()) > -1) {
            validHeaders[keys[i]] = response.headers[keys[i]];
        }
    }
    logger.debug('Valid-headers', validHeaders);
    return validHeaders;
}

class DispatcherRouter {

    static getLoggedUser(ctx) {
        if (ctx.state) {
            if (ctx.state.user) {
                return ctx.state.user;
            } if (ctx.state.microservice) {
                return ctx.state.microservice;
            }
        }
        if (ctx.req && ctx.req.user) {
            return ctx.req.user;
        }
        return null;
    }

    static getInfoRedirect(ctx, result) {
        return {
            source: {
                path: ctx.request.url,
                method: ctx.request.method,
            },
            redirect: {
                url: result.configRequest.uri,
                method: result.configRequest.method,
                endpoint: result.endpoint,
            },
            user: DispatcherRouter.getLoggedUser(ctx)
        };
    }

    static async dispatch(ctx) {
        logger.info(`Dispatch url ${ctx.request.url} and method ${ctx.request.method}`);
        try {
            logger.debug('Obtaining config request');
            const infoRequest = await DispatcherService.getRequest(ctx);
            const { configRequest } = infoRequest;

            logger.debug('Sending request');
            // save information about redirect
            ctx.state = DispatcherRouter.getInfoRedirect(ctx, infoRequest);
            configRequest.followRedirect = false;

            logger.debug('Config request', configRequest);
            if (configRequest.binary) {
                logger.debug('Is binary, doing request with stream');
                const req = request(configRequest);
                req.on('response', (response) => {
                    ctx.response.status = response.statusCode;
                    ctx.set(getHeadersFromResponse(response));
                });
                ctx.body = req.on('error', ctx.onerror.bind(ctx)).pipe(passThrough());
            } else {
                const result = await requestPromise(configRequest);
                // set headers
                ctx.set(getHeadersFromResponse(result));
                ctx.status = result.statusCode;
                if (ctx.status >= 400 && ctx.status < 500) {
                    let { body } = result;
                    if (body instanceof Buffer) {
                        body = body.toString('utf8');
                    }
                    logger.error('error body', body);
                    try {
                        body = JSON.parse(result.body);
                    } catch (e) {
                        //
                    }
                    if (body.errors && body.errors.length > 0) {
                        ctx.body = body;
                    } else {
                        if (process.env.NODE_ENV === 'prod') {
                            ctx.throw(500, 'Unexpected error');
                            return;
                        }
                        let message = '';
                        if (body.error) {
                            message += body.error;
                        }
                        if (body.exception) {
                            message += ` --- ${body.exception}`;
                        }
                        if (!body.exception && !body.error) {
                            message = body;
                        }
                        ctx.throw(result.statusCode || 500, message);
                        return;
                    }
                }
                ctx.body = result.body;
                ctx.response.type = result.headers['content-type'];
            }
        } catch (err) {
            if (err instanceof EndpointNotFound) {
                logger.info(`Endpoint not found: ${err.message}`);
                ctx.throw(404, `Endpoint not found`);
                return;
            }
            if (err instanceof FilterError) {
                logger.info('Filter error', err);
                ctx.throw(500, err.message);
                return;
            }
            if (err instanceof NotAuthenticated) {
                logger.info('Not authenticated');
                ctx.throw(401, err.message);
                return;
            }
            if (err instanceof NotApplicationKey) {
                logger.info('Not application key');
                ctx.throw(401, err.message);
                return;
            }
            logger.error(err);
            if (err.errors && err.errors.length > 0 && err.errors[0].status >= 400 && err.errors[0].status < 500) {
                ctx.status = err.errors[0].status;
                ctx.body = err;
            } else {
                let message = '';
                if (err.message) {
                    message += err.message;
                }
                if (err.exception) {
                    message += ` --- ${err.exception}`;
                }
                if (process.env.NODE_ENV === 'prod') {
                    logger.error(`Unexpected error dispatching url: ${message}`);
                    ctx.throw(500, 'Unexpected error');
                    return;
                }

                ctx.throw(err.statusCode || 500, message);
                return;
            }

        } finally {
            if (ctx.request.body.files) {
                logger.debug('Removing files');
                const files = Object.keys(ctx.request.body.files);
                for (let i = 0, { length } = files; i < length; i++) {
                    logger.debug('Removing file  %s', ctx.request.body.files[files[i]].path);
                    await unlink(ctx.request.body.files[files[i]].path);
                }
            }
        }

    }

}

router.get('/healthz', async (ctx) => {
    ctx.body = 'OK';
});

router.get('/*', DispatcherRouter.dispatch);
router.post('/*', DispatcherRouter.dispatch);
router.delete('/*', DispatcherRouter.dispatch);
router.put('/*', DispatcherRouter.dispatch);
router.patch('/*', DispatcherRouter.dispatch);

module.exports = router;
