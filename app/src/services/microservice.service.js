const logger = require('logger');
const config = require('config');
const appConstants = require('app.constants');
const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const VersionModel = require('models/version.model');
const MicroserviceNotExist = require('errors/microserviceNotExist');
const request = require('request-promise');
const url = require('url');
const crypto = require('crypto');
const pathToRegexp = require('path-to-regexp');
const NotificationService = require('services/notification.service.js');
const JWT = require('jsonwebtoken');
const { promisify } = require('util');
const { uniq } = require('lodash');

const MICRO_STATUS_PENDING = 'pending';
const MICRO_STATUS_ACTIVE = 'active';
const MICRO_STATUS_ERROR = 'error';

class Microservice {

    static getFilters(endpoint) {
        logger.debug('Checking filters in endpoint', endpoint);
        let filters = null;
        if (endpoint.filters) {
            for (let i = 0, { length } = endpoint.filters; i < length; i++) {
                logger.debug(endpoint.filters[i]);
                let pathKeys = [];
                const pathRegex = pathToRegexp(endpoint.filters[i].path, pathKeys);
                if (pathKeys && pathKeys.length > 0) {
                    pathKeys = pathKeys.map((key) => key.name);
                }
                if (!filters) {
                    filters = [];
                }
                filters.push({
                    name: endpoint.filters[i].name,
                    path: endpoint.filters[i].path,
                    method: endpoint.filters[i].method,
                    condition: endpoint.filters[i].condition,
                    pathRegex,
                    pathKeys,
                    params: endpoint.filters[i].params,
                    compare: endpoint.filters[i].compare,
                });
            }
        }
        return filters;
    }

    static async saveEndpoint(endpoint, micro, version) {
        logger.info(`Saving endpoint ${endpoint.path} with version ${version}`);
        logger.debug(`Searching if path ${endpoint.path} exists in endpoints`);
        endpoint.redirect.url = micro.url;
        // searching
        const oldEndpoint = await EndpointModel.findOne({
            path: endpoint.path,
            method: endpoint.method,
            version,
            toDelete: false
        }).exec();
        if (oldEndpoint) {
            logger.debug(`Path ${endpoint.path} exists. Checking if redirect with url ${endpoint.redirect.url} exists.`);
            const oldRedirect = await EndpointModel.findOne({
                path: endpoint.path,
                method: endpoint.method,
                'redirect.url': endpoint.redirect.url,
                version,
            }).exec();
            if (!oldRedirect) {
                logger.debug(`Redirect doesn't exist`);
                endpoint.redirect.filters = Microservice.getFilters(endpoint);
                endpoint.redirect.microservice = micro.name;
                oldEndpoint.redirect.push(endpoint.redirect);
                oldEndpoint.uncache = micro.uncache;
                oldEndpoint.cache = micro.cache;
                await oldEndpoint.save();
            } else {
                logger.debug('Redirect exists. Updating', oldRedirect);
                for (let i = 0, { length } = oldRedirect.redirect; i < length; i++) {
                    if (oldRedirect.redirect[i].url === endpoint.redirect.url) {
                        oldRedirect.microservice = micro.name;
                        oldRedirect.uncache = micro.uncache;
                        oldRedirect.cache = micro.cache;
                        oldRedirect.redirect[i].method = endpoint.redirect.method;
                        oldRedirect.redirect[i].path = endpoint.redirect.path;
                        oldRedirect.redirect[i].filters = Microservice.getFilters(endpoint);
                    }
                }
                await oldRedirect.save();
            }

        } else {
            logger.debug(`Path ${endpoint.path} doesn't exist. Registering new`);
            let pathKeys = [];
            const pathRegex = pathToRegexp(endpoint.path, pathKeys);
            if (pathKeys && pathKeys.length > 0) {
                pathKeys = pathKeys.map((key) => key.name);
            }
            logger.debug('Saving new endpoint');
            endpoint.redirect.filters = Microservice.getFilters(endpoint);
            logger.debug('filters', endpoint.redirect.filters);
            logger.debug('regesx', pathRegex);
            endpoint.redirect.microservice = micro.name;
            await new EndpointModel({
                path: endpoint.path,
                method: endpoint.method,
                pathRegex,
                pathKeys,
                authenticated: endpoint.authenticated,
                applicationRequired: endpoint.applicationRequired,
                binary: endpoint.binary,
                redirect: [endpoint.redirect],
                version,
                uncache: micro.uncache,
                cache: micro.cache
            }).save();
        }
    }

    static async saveEndpoints(micro, info, version) {
        logger.info('Saving endpoints');
        if (info.endpoints && info.endpoints.length > 0) {
            for (let i = 0, { length } = info.endpoints; i < length; i++) {
                await Microservice.saveEndpoint(info.endpoints[i], micro, version);
            }
        }
    }

    static generateUrlInfo(urlInfo) {
        logger.debug('Generating url info to microservice with url', urlInfo);
        if (urlInfo.indexOf('?') >= 0) {
            return `${urlInfo}`;
        }
        return `${urlInfo}`;
    }

    static formatFilters(endpoint) {
        if (endpoint) {
            if (endpoint.filters) {
                if (endpoint.filters) {
                    const filters = [];
                    filters.push({
                        name: endpoint.paramProvider || 'dataset',
                        path: endpoint.pathProvider || '/v1/dataset/:dataset',
                        method: 'GET',
                        params: {
                            dataset: 'dataset',
                        },
                        compare: endpoint.filters,
                    });
                    return filters;
                }
            }
        }
        return null;
    }

    static transformToNewVersion(info) {
        logger.info('Checking if is necesary transform to new version');
        if (info.urls) {
            info.endpoints = info.urls.map((endpoint) => ({
                path: endpoint.url,
                method: endpoint.method,
                redirect: endpoint.endpoints[0],
                filters: Microservice.formatFilters(endpoint),
                authenticated: endpoint.authenticated || false,
                applicationRequired: endpoint.applicationRequired || false,
                binary: endpoint.binary || false,
            }));
            delete info.urls;
        }
        return info;
    }

    static async generateToken(micro) {
        return promisify(JWT.sign)(micro.toJSON(), config.get('jwt.token'), {});
    }

    static async getInfoMicroservice(micro, version) {
        try {
            logger.info(`Obtaining info of the microservice with name ${micro.name} and version ${version}`);
            let urlInfo = url.resolve(micro.url, micro.pathInfo);
            logger.debug('Generating token');
            const token = await Microservice.generateToken(micro);
            urlInfo = Microservice.generateUrlInfo(urlInfo);
            logger.debug(`Doing request to ${urlInfo}`);

            let result = await request({
                url: urlInfo,
                json: true,
                method: 'GET',
                timeout: 10000
            });
            logger.debug('Updating microservice');
            result = Microservice.transformToNewVersion(result);
            micro.endpoints = result.endpoints;
            micro.cache = result.cache;
            micro.uncache = result.uncache;

            logger.debug('Microservice info', result.endpoints[0]);
            micro.swagger = JSON.stringify(result.swagger);
            micro.updatedAt = Date.now();
            micro.token = token;
            if (result.tags) {
                if (!micro.tags) {
                    micro.tags = [];
                }
                micro.tags = uniq(micro.tags.concat(result.tags));
            }
            await micro.save();
            await Microservice.saveEndpoints(micro, result, version);
            return true;
        } catch (err) {
            logger.error(err);
            return false;
        }
    }

    static async register(info, ver) {
        try {
            let version = ver;
            let existingVersion = null;
            if (!version) {
                const versionFound = await VersionModel.findOne({
                    name: appConstants.ENDPOINT_VERSION,
                });
                version = versionFound.version;
                existingVersion = versionFound;
            }
            logger.info(`Registering new microservice with name ${info.name} and url ${info.url}`);
            logger.debug('Search if microservice already exist');
            let existingMicroservice = await MicroserviceModel.findOne({
                url: info.url,
                version,
            });
            let micro = null;
            if (existingMicroservice) {
                existingMicroservice = await MicroserviceModel.findByIdAndUpdate(existingMicroservice._id, {
                    $set: {
                        status: MICRO_STATUS_PENDING
                    }
                });
                micro = await MicroserviceModel.findById(existingMicroservice._id);
            }

            if (existingMicroservice && existingMicroservice.status === MICRO_STATUS_PENDING) {
                logger.error('Mutex active in microservice ', info.url);
                return null;
            }

            try {
                if (existingMicroservice) {
                    await Microservice.remove(existingMicroservice._id);
                } else {
                    logger.debug(`Creating microservice with status ${MICRO_STATUS_PENDING}`);

                    micro = await new MicroserviceModel({
                        name: info.name,
                        status: MICRO_STATUS_PENDING,
                        url: info.url,
                        pathInfo: info.pathInfo,
                        swagger: info.swagger,
                        token: crypto.randomBytes(20).toString('hex'),
                        tags: uniq(info.tags),
                        version,
                    }).save();

                }
                logger.debug(`Creating microservice with status ${MICRO_STATUS_PENDING}`);

                const correct = await Microservice.getInfoMicroservice(micro, version);
                if (correct) {
                    logger.info(`Updating state of microservice with name ${micro.name}`);
                    micro.status = MICRO_STATUS_ACTIVE;
                    await micro.save();
                    if (existingMicroservice) {
                        logger.info('Removing endpoints with toDelete to true');
                        await Microservice.removeEndpointToDeleteOfMicroservice(existingMicroservice._id);
                    }
                    if (existingVersion) {
                        existingVersion.lastUpdated = new Date();
                        await existingVersion.save();
                    }
                    logger.info('Updated successfully');
                } else {
                    logger.info(`Updated to error state microservice with name ${micro.name}`);
                    micro.status = MICRO_STATUS_ERROR;
                    await micro.save();
                }
            } catch (err) {
                logger.error(err);
                micro.status = MICRO_STATUS_ERROR;
                await micro.save();
            }
            return micro;
        } catch (err) {
            logger.error(err);
            return null;
        }
    }

    static async tryRegisterErrorMicroservices() {
        logger.info('Trying register microservices with status error');
        const versionFound = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        const { version } = versionFound;

        const errorMicroservices = await MicroserviceModel.find({
            status: {
                $in: [MICRO_STATUS_ERROR, MICRO_STATUS_PENDING]
            },
            version
        });
        if (errorMicroservices && errorMicroservices.length > 0) {
            for (let i = 0, { length } = errorMicroservices; i < length; i++) {
                const micro = errorMicroservices[i];
                if (micro.status === MICRO_STATUS_ERROR
                    || (micro.status === MICRO_STATUS_PENDING && (Date.now() - micro.updatedAt.getTime()) > 10000)) {
                    const correct = await Microservice.getInfoMicroservice(micro, version);
                    if (correct) {
                        logger.info(`Updating state of microservice with name ${micro.name}`);
                        micro.status = MICRO_STATUS_ACTIVE;
                        await micro.save();
                        logger.info('Updated successfully');
                    } else {
                        logger.info(`Updated to error state microservice with name ${micro.name}`);
                        micro.status = MICRO_STATUS_ERROR;
                        await micro.save();
                    }
                }
            }
        } else {
            logger.info('Not exist microservices in error state');
        }
    }

    static async removeEndpointOfMicroservice(micro) {
        logger.info(`Removing endpoints of microservice with url ${micro.url}`);
        if (!micro || !micro.endpoints) {
            return;
        }

        for (let i = 0, { length } = micro.endpoints; i < length; i++) {
            const endpoint = await EndpointModel.findOne({
                method: micro.endpoints[i].method,
                path: micro.endpoints[i].path,
                toDelete: false
            }).exec();

            if (endpoint) {
                let redirects = endpoint.redirect.filter((red) => red.url !== micro.url);
                if (redirects && redirects.length > 0) {
                    redirects = redirects.toObject().map((redirect) => ({ ...redirect, microservice: micro.name }));
                    logger.debug('Updating endpoint');
                    endpoint.redirect = redirects;
                    await endpoint.save();
                } else {
                    logger.debug('Endpoint empty. Removing endpoint');
                    redirects = redirects.toObject().map((redirect) => ({ ...redirect, microservice: micro.name }));
                    endpoint.redirect = redirects;
                    endpoint.toDelete = true;
                    await endpoint.save();
                }
            }
        }
    }

    static async removeEndpointToDeleteOfMicroservice(id) {

        logger.info(`Removing endpoints with toDelete to true of microservice with id ${id}`);
        const micro = await MicroserviceModel.findById(id, {
            __v: 0,
        });
        if (!micro) {
            throw new MicroserviceNotExist(`Microservice with id ${id} does not exist`);
        }
        if (!micro.endpoints) {
            return;
        }
        for (let i = 0, { length } = micro.endpoints; i < length; i++) {
            await EndpointModel.deleteMany({
                method: micro.endpoints[i].method,
                path: micro.endpoints[i].path,
                toDelete: true
            }).exec();
        }
    }

    static async remove(id) {
        logger.info(`Removing microservice with id ${id}`);
        const micro = await MicroserviceModel.findById(id, {
            __v: 0,
        });
        if (!micro) {
            throw new MicroserviceNotExist(`Microservice with id ${id} does not exist`);
        }
        logger.debug('Removing endpoints');
        await Microservice.removeEndpointOfMicroservice(micro);
        // await micro.remove();
        return micro;
    }

    static async checkLiveMicro(micro) {
        logger.debug(`Checking live of microservice: ${micro.name} `);
        const urlLive = url.resolve(micro.url, micro.pathLive);
        logger.debug(`Doing request to ${urlLive}`);
        if (!micro.infoStatus) {
            micro.infoStatus = {};
        }
        try {
            await request({
                uri: urlLive,
                timeout: 5000
            });
            if (micro.status === MICRO_STATUS_ERROR) {
                logger.info('Sending event of restore microservice');
                await NotificationService.sendAlertMicroserviceRestore(micro.name, micro.url);
            }
            micro.infoStatus.lastCheck = new Date();
            micro.infoStatus.error = null;
            micro.infoStatus.numRetries = 0;
            micro.status = MICRO_STATUS_ACTIVE;
            await micro.save();
            logger.debug(`Microservice ${micro.name} is live`);
        } catch (err) {
            logger.error(`Microservice ${micro.name} is DOWN`, err);
            micro.infoStatus.lastCheck = new Date();
            micro.infoStatus.numRetries++;
            micro.status = MICRO_STATUS_ERROR;
            micro.infoStatus.error = err.message;
            await micro.save();

            if (micro.infoStatus.numRetries === 3) {
                await NotificationService.sendAlertMicroserviceDown(micro.name, micro.url, err);
            }
            return false;
        }
        return true;
    }

    static async checkLiveMicroservice() {
        logger.info('Check live microservices');

        const versionFound = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        logger.debug('Found', versionFound);

        logger.info('Obtaining microservices with version ', versionFound);
        const microservices = await MicroserviceModel.find({
            version: versionFound.version
        });
        if (!microservices || microservices.length === 0) {
            logger.info('Not exist registered microservices');
            return;
        }
        for (let i = 0, { length } = microservices; i < length; i++) {
            await Microservice.checkLiveMicro(microservices[i]);
        }
        logger.info('Finished checking');
    }

    static async registerPackMicroservices(microservices) {
        logger.info('Refreshing all microservices');
        logger.debug('Obtaining new version');
        const versionFound = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        logger.debug('Found', versionFound);
        const newVersion = versionFound.version + 1;
        logger.debug('New version is ', newVersion);

        if (microservices) {
            for (let i = 0, { length } = microservices; i < length; i++) {
                try {
                    if (microservices[i].name !== null && microservices[i].url !== null) {
                        logger.debug(`Registering microservice with name ${microservices[i].name}`);
                        await Microservice.register(microservices[i], newVersion);
                    }
                } catch (err) {
                    logger.error('Error registering microservice', err);
                }
            }
        }
        logger.info('Updating version of ENDPOINT_VERSION');
        await VersionModel.updateOne({
            name: appConstants.ENDPOINT_VERSION,
        }, {
            $set: {
                version: newVersion,
            },
        });
        logger.info('Registered successfully');
    }

}

module.exports = Microservice;
