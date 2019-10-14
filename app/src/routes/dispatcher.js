const Router = require('koa-router');
const logger = require('logger');
const config = require('config');
const Promise = require('bluebird');
const JWT = Promise.promisifyAll(require('jsonwebtoken'));
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const DispatcherService = require('services/dispatcher.service.js');
const EndpointNotFound = require('errors/endpointNotFound');
const NotAuthenticated = require('errors/notAuthenticated');
const NotApplicationKey = require('errors/notApplicationKey');
const FilterError = require('errors/filterError');
const fs = require('fs');
const { isEqual, omit } = require('lodash');

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

// eslint-disable-next-line consistent-return
async function isActualUser(ctx, next) {
    if (ctx.state && ctx.state.user) {
        const receivedUser = omit(ctx.state.user, ['createdAt', 'provider', 'iat', 'photo', 'name']);

        const user = await UserModel.findById(receivedUser.id);

        if (!user || !Object.keys(receivedUser).every((key) => user[key] && isEqual(user[key], receivedUser[key]))) {
            return ctx.throw(401, 'your token is outdated, please use /auth/login to generate a new one');
        }
    }

    await next();
}

async function authMicroservice(ctx, next) {
    if (ctx.headers && ctx.headers.authentication) {
        logger.debug('Attempting to authenticate microservice with token: ', ctx.headers.authentication);
        try {
            const service = await JWT.verify(ctx.headers.authentication, config.get('jwt.token'));
            if (service) {
                ctx.state.microservice = {
                    id: service.id,
                    name: service.name,
                    url: service.url,
                };
            }
        } catch (err) {
            const errorJson = {
                errorMessage: err.message,
                authHeader: ctx.headers.authentication,
                originalRequest: ctx.request.url,
                method: ctx.request.method,
                body: ctx.request.body
            };

            logger.error('Invalid authorization token from microservice: ', JSON.stringify(errorJson));
        }
    }

    await next();
}

router.get('/healthz', async (ctx) => {
    ctx.body = 'OK';
});

router.get('/*', authMicroservice, isActualUser, DispatcherRouter.dispatch);
router.post('/*', authMicroservice, isActualUser, DispatcherRouter.dispatch);
router.delete('/*', authMicroservice, isActualUser, DispatcherRouter.dispatch);
router.put('/*', authMicroservice, isActualUser, DispatcherRouter.dispatch);
router.patch('/*', authMicroservice, isActualUser, DispatcherRouter.dispatch);

module.exports = router;
