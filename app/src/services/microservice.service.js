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

    /**
     * Creates an Endpoint model instance based on the array format data provided by a microservice
     * when confirming registration.
     *
     * @param endpoint
     * @param microservice
     * @param version
     * @returns {Promise<void>}
     */
    static async saveEndpoint(endpoint, microservice, version) {
        logger.info(`[MicroserviceService] Saving endpoint ${endpoint.path} with version ${version}`);
        logger.debug(`[MicroserviceService] Searching if path ${endpoint.path} exists in endpoints`);
        endpoint.redirect.url = microservice.url;
        // searching
        const oldEndpoint = await EndpointModel.findOne({
            path: endpoint.path,
            method: endpoint.method,
            version
        }).exec();
        if (oldEndpoint) {
            logger.debug(`[MicroserviceService] Path ${endpoint.path} exists. Checking if redirect with url ${endpoint.redirect.url} exists.`);
            const oldRedirect = await EndpointModel.findOne({
                path: endpoint.path,
                method: endpoint.method,
                'redirect.url': endpoint.redirect.url,
                version,
            }).exec();
            if (!oldRedirect) {
                logger.debug(`[MicroserviceService] Redirect doesn't exist`);
                endpoint.redirect.filters = Microservice.getFilters(endpoint);
                endpoint.redirect.microservice = microservice.name;
                oldEndpoint.redirect.push(endpoint.redirect);
                oldEndpoint.uncache = microservice.uncache;
                oldEndpoint.cache = microservice.cache;
                oldEndpoint.updatedAt = new Date();
                await oldEndpoint.save();
            } else {
                logger.debug('[MicroserviceService] Redirect exists. Updating', oldRedirect);
                for (let i = 0, { length } = oldRedirect.redirect; i < length; i++) {
                    if (oldRedirect.redirect[i].url === endpoint.redirect.url) {
                        oldRedirect.microservice = microservice.name;
                        oldRedirect.uncache = microservice.uncache;
                        oldRedirect.cache = microservice.cache;
                        oldRedirect.redirect[i].method = endpoint.redirect.method;
                        oldRedirect.redirect[i].path = endpoint.redirect.path;
                        oldRedirect.redirect[i].filters = Microservice.getFilters(endpoint);
                    }
                }
                oldEndpoint.updatedAt = new Date();
                await oldRedirect.save();
            }

        } else {
            logger.debug(`[MicroserviceService] Path ${endpoint.path} doesn't exist. Registering new`);
            let pathKeys = [];
            const pathRegex = pathToRegexp(endpoint.path, pathKeys);
            if (pathKeys && pathKeys.length > 0) {
                pathKeys = pathKeys.map((key) => key.name);
            }
            logger.debug('[MicroserviceService] Saving new endpoint');
            endpoint.redirect.filters = Microservice.getFilters(endpoint);
            logger.debug('[MicroserviceService] filters', endpoint.redirect.filters);
            logger.debug('[MicroserviceService] regesx', pathRegex);
            endpoint.redirect.microservice = microservice.name;
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
                uncache: microservice.uncache,
                cache: microservice.cache
            }).save();
        }
    }

    /**
     * Given a microservice object, creates the individual Endpoint model instances corresponding to each endpoint.
     * Used once CT has successfully contacted the MS requesting to register.
     *
     * @param microservice
     * @param info
     * @param version
     * @returns {Promise<void>}
     */
    static async saveEndpointsForMicroservice(microservice, info, version) {
        logger.info(`[MicroserviceService - saveEndpointsForMicroservice] Saving endpoints for microservice ${microservice.name}`);
        if (info.endpoints && info.endpoints.length > 0) {
            for (let i = 0, { length } = info.endpoints; i < length; i++) {
                await Microservice.saveEndpoint(info.endpoints[i], microservice, version);
            }
        }
    }

    static formatFilters(endpoint) {
        if (!endpoint || !endpoint.filters) {
            return null;
        }

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

    /**
     * Transform URLs from microservice info to the new format
     * This is a thin compatibility layer, I'm assuming, to support some sort of old MS spec format.
     *
     * @param info
     * @returns {{urls}|*}
     */
    static transformUrlsToNewVersion(info) {
        logger.info('[MicroserviceService] Checking if URLs are in old format, and transforming to the new format');
        if (info.urls) {
            logger.info('[MicroserviceService] Found URLs in old format, transforming...');
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

    /**
     * Loads details for a microservice.
     *
     * During the microservice registration process, the MS provides CT with an URL where it can reach the MS.
     * This is used both to confirm that the MS is reachable and available, as well to allow the MS to announce to CT its endpoints.
     *
     * This method contacts the MS at its announced URL and path, and saves the announced endpoints to the database
     *
     * Returns a boolean describing whether or not it was able to successfully contact the microservice at the announces URL.
     *
     * @param microservice
     * @param version
     * @returns {Promise<boolean>}
     */
    static async getMicroserviceInfo(microservice, version) {
        logger.info(`[MicroserviceService - getMicroserviceInfo] Obtaining info of the microservice with name ${microservice.name} and version ${version}`);
        const urlInfo = url.resolve(microservice.url, microservice.pathInfo);
        logger.debug('[MicroserviceService - getMicroserviceInfo] Generating token');
        const token = await Microservice.generateToken(microservice);
        logger.debug(`[MicroserviceService - getMicroserviceInfo] Doing request to ${urlInfo}`);
        let result;

        try {
            result = await request({
                url: urlInfo,
                json: true,
                method: 'GET',
                timeout: 10000
            });
        } catch (err) {
            logger.warn(`[MicroserviceService - getMicroserviceInfo] Microservice ${microservice.name} could not be reached on announced URL ${urlInfo}`);
            logger.warn(err);
            return false;
        }

        logger.info(`[MicroserviceService - getMicroserviceInfo] Microservice information loaded successfully for microservice ${microservice.name}, applying transformations`);
        result = Microservice.transformUrlsToNewVersion(result);
        microservice.endpoints = result.endpoints;
        microservice.cache = result.cache;
        microservice.uncache = result.uncache;
        microservice.swagger = JSON.stringify(result.swagger);
        microservice.updatedAt = Date.now();
        microservice.token = token;
        if (result.tags) {
            if (!microservice.tags) {
                microservice.tags = [];
            }
            microservice.tags = uniq(microservice.tags.concat(result.tags));
        }

        logger.info(`[MicroserviceService - getMicroserviceInfo] Microservice info ready for microservice ${microservice.name}, saving...`);
        await microservice.save();
        await Microservice.saveEndpointsForMicroservice(microservice, result, version);
        return true;
    }

    /**
     * Registers a microservice
     * Can be used for either a new microservice, or to re-register an already known one
     * Triggered by a call to CT made by the MS itself, on bootup
     *
     * If a MS has never registered before, this adds a new Microservice instance to the DB.
     * If it's known, its endpoints are flagged for delete, so we can have a clean slate
     *
     * It then tries to contact the MS on the URL it provided, and if successful, registers the announced endpoints.
     *
     * @param info
     * @param ver
     * @returns {Promise<null>}
     */
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
            logger.info(`[MicroserviceRouter] Registering new microservice with name ${info.name} and url ${info.url}`);
            logger.debug('[MicroserviceRouter] Search if microservice already exist');
            const existingMicroservice = await MicroserviceModel.findOne({
                url: info.url,
                version,
            });
            let micro = null;
            if (existingMicroservice) {
                micro = await MicroserviceModel.findByIdAndUpdate(
                    existingMicroservice._id,
                    { status: MICRO_STATUS_PENDING },
                    { new: true }
                );
            }

            if (existingMicroservice && existingMicroservice.status === MICRO_STATUS_PENDING) {
                logger.error('[MicroserviceRouter] Mutex active in microservice ', info.url);
                return null;
            }

            try {
                if (existingMicroservice) {
                    logger.debug(`[MicroserviceRouter] Removing existing microservice endpoints prior to re-import.`);
                    // If the microservice already exists, we delete the existing data first, so we can have a clean slate to re-import.
                    await Microservice.removeEndpointsOfMicroservice(existingMicroservice);
                } else {
                    logger.debug(`[MicroserviceRouter] Creating new microservice`);

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
                logger.debug(`[MicroserviceRouter] Creating microservice with status ${MICRO_STATUS_PENDING}`);

                const correct = await Microservice.getMicroserviceInfo(micro, version);
                if (correct) {
                    logger.info(`[MicroserviceRouter] Microservice ${micro.name} was reached successfully, setting status to 'active'`);
                    micro.status = MICRO_STATUS_ACTIVE;
                    await micro.save();
                    if (existingVersion) {
                        existingVersion.lastUpdated = new Date();
                        await existingVersion.save();
                    }
                    logger.info(`[MicroserviceRouter] Microservice ${micro.name} activated successfully.`);
                } else {
                    logger.warn(`[MicroserviceRouter] Microservice ${micro.name} could not be reached on announced URL.`);
                }
            } catch (err) {
                logger.error(err);
            }
            return micro;
        } catch (err) {
            logger.error(err);
            return null;
        }
    }

    /**
     * Flags endpoints of a microservice for removal
     * - If an endpoint has another redirect, simply removes this MS's url from the redirects list, and updates the endpoint
     * - If an endpoint doesn't have any other redirect, removes the redirect or endpoint.
     *
     * @param microservice
     * @returns {Promise<void>}
     */
    static async removeEndpointsOfMicroservice(microservice) {
        logger.info(`[MicroserviceService - removeEndpointsOfMicroservice] Removing endpoints of microservice with url ${microservice.url}`);
        if (!microservice || !microservice.endpoints) {
            return;
        }

        for (let i = 0, { length } = microservice.endpoints; i < length; i++) {
            const endpoint = await EndpointModel.findOne({
                method: microservice.endpoints[i].method,
                path: microservice.endpoints[i].path
            }).exec();

            if (endpoint) {
                const redirects = endpoint.redirect.filter((redirect) => redirect.url !== microservice.url);
                if (redirects && redirects.length > 0) {
                    logger.info(`[MicroserviceService - removeEndpointsOfMicroservice] Updating endpoint: Path ${endpoint.path} | Method ${endpoint.method}`);
                    endpoint.redirect = redirects;
                    endpoint.updatedAt = new Date();
                    await endpoint.save();
                } else {
                    logger.info(`[MicroserviceService - removeEndpointsOfMicroservice] Endpoint empty. Removing endpoint: Path ${endpoint.path} | Method ${endpoint.method}`);
                    await EndpointModel.deleteOne({ _id: endpoint._id });
                }
            }
        }
    }

    /**
     * Deletes a microservice and its endpoints
     *
     * It works in 2 steps
     * - Iterates over its endpoints. If they only have 1 redirect, deletes them.
     * - Deletes the actual Microservice object from the database.
     *
     * @param id
     * @returns {Promise<any>}
     */
    static async deleteMicroservice(id) {
        const microservice = await MicroserviceModel.findById(id, {
            __v: 0,
        });
        if (!microservice) {
            throw new MicroserviceNotExist(`Microservice with id ${id} does not exist`);
        }
        logger.info(`[MicroserviceService] Removing microservice and associated endpoints for MS ${microservice.name}`);

        logger.info(`[MicroserviceService] Removing endpoints for MS ${microservice.name}`);
        await Microservice.removeEndpointsOfMicroservice(microservice);

        logger.info(`[MicroserviceService] Removing microservice ${microservice.name}`);
        await microservice.remove();

        return microservice;
    }

    /**
     *
     *
     * @param micro
     * @returns {Promise<boolean>}
     */
    static async checkLiveMicro(micro) {
        logger.debug(`[MicroserviceService] Checking liveliness of microservice: ${micro.name} `);
        const urlLive = url.resolve(micro.url, micro.pathLive);
        logger.debug(`[MicroserviceService] Doing request to ${urlLive}`);
        if (!micro.infoStatus) {
            micro.infoStatus = {};
        }
        try {
            await request({
                uri: urlLive,
                timeout: 5000
            });
            micro.infoStatus.lastCheck = new Date();
            micro.infoStatus.error = null;
            micro.infoStatus.numRetries = 0;
            await micro.save();
            logger.debug(`[MicroserviceService] Microservice ${micro.name} is live`);
        } catch (err) {
            logger.error(`[MicroserviceService] Microservice ${micro.name} is DOWN`, err);
            micro.infoStatus.lastCheck = new Date();
            micro.infoStatus.numRetries++;
            micro.status = MICRO_STATUS_ERROR;
            micro.infoStatus.error = err.message;
            // TODO: if a live MS stopped replying, we should probably block its endpoints.
            await micro.save();

            if (micro.infoStatus.numRetries === 3) {
                await NotificationService.sendAlertMicroserviceDown(micro.name, micro.url, err);
            }
            return false;
        }
        return true;
    }

    /**
     *
     *
     * @returns {Promise<void>}
     */
    static async checkActiveMicroservices() {
        logger.info('[MicroserviceService] Checking live microservices');

        const versionFound = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        logger.debug('[MicroserviceService] Found', versionFound);

        logger.info('[MicroserviceService] Obtaining microservices with version ', versionFound);
        const microservices = await MicroserviceModel.find({
            status: MICRO_STATUS_ACTIVE,
            version: versionFound.version
        });
        if (!microservices || microservices.length === 0) {
            logger.info('[MicroserviceService] No registered microservices found.');
            return;
        }
        for (let i = 0, { length } = microservices; i < length; i++) {
            await Microservice.checkLiveMicro(microservices[i]);
        }
        logger.info('[MicroserviceService] Finished checking live microservices');
    }

    /**
     * Tries to contact "error" microservices, and activates them if they have recovered
     * If a microservice has spent too many iterations on "error" state, it will be deleted.
     *
     * @returns {Promise<void>}
     */
    static async checkErrorMicroservices() {
        logger.info('[MicroserviceService] Trying register microservices with status error');
        const versionFound = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        const { version } = versionFound;

        const errorMicroservices = await MicroserviceModel.find({
            status: MICRO_STATUS_ERROR,
            version
        });

        if (!errorMicroservices || errorMicroservices.length === 0) {
            logger.info('[MicroserviceService] No microservices in error state found.');
            return;
        }

        for (let i = 0, { length } = errorMicroservices; i < length; i++) {
            const micro = errorMicroservices[i];
            const correct = await Microservice.getMicroserviceInfo(micro, version);
            if (correct) {
                logger.info(`[MicroserviceService] Microservice "${micro.name}" with previous "error" state is now active.`);
                micro.status = MICRO_STATUS_ACTIVE;
                await micro.save();
                logger.info('[MicroserviceService] Updated successfully');
            } else {
                if (!micro.infoStatus) {
                    micro.infoStatus = {};
                }
                micro.infoStatus.numRetries++;
                logger.info(`[MicroserviceService] Microservice "${micro.name}" in error state for the ${micro.infoStatus.numRetries}th attempt.`);
                if (micro.infoStatus.numRetries >= config.get('microservice.errorToDeleteThreshold')) {
                    logger.info(`[MicroserviceService] Microservice "${micro.name}" exceeded its retries budget, deleting.`);
                    await Microservice.deleteMicroservice(micro.id);
                } else {
                    await micro.save();
                }
            }
        }
    }

    /**
     * Tries to contact "pending" microservices, and activates them if they have recovered.
     * If a microservice has spent too many iterations on "pending" state, it will be set to "error".
     *
     * @returns {Promise<void>}
     */
    static async checkPendingMicroservices() {
        logger.info('[MicroserviceService] Trying register microservices with status pending');
        const versionFound = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        const { version } = versionFound;

        const pendingMicroservices = await MicroserviceModel.find({
            status: MICRO_STATUS_PENDING,
            version
        });

        if (!pendingMicroservices || pendingMicroservices.length === 0) {
            logger.info('[MicroserviceService] No microservices in pending state found.');
            return;
        }

        for (let i = 0, { length } = pendingMicroservices; i < length; i++) {
            const micro = pendingMicroservices[i];
            const correct = await Microservice.getMicroserviceInfo(micro, version);
            if (!micro.infoStatus) {
                micro.infoStatus = {};
            }
            if (correct) {
                logger.info(`[MicroserviceService] Microservice "${micro.name}" with previous "pending" state is now active.`);
                micro.status = MICRO_STATUS_ACTIVE;
                micro.infoStatus.numRetries = 0;
                await micro.save();

                const existingVersion = await VersionModel.findOne({
                    name: appConstants.ENDPOINT_VERSION,
                });

                if (existingVersion) {
                    existingVersion.lastUpdated = new Date();
                    await existingVersion.save();
                }

                logger.info('[MicroserviceService] Updated successfully');
            } else {
                micro.infoStatus.numRetries++;
                logger.info(`[MicroserviceService] Microservice "${micro.name}" in pending state for the ${micro.infoStatus.numRetries}th attempt.`);
                if (micro.infoStatus.numRetries >= config.get('microservice.pendingToErrorThreshold')) {
                    micro.status = MICRO_STATUS_ERROR;
                    micro.infoStatus.numRetries = 0;
                    logger.info(`[MicroserviceService] Microservice "${micro.name}" has surpassed the pending state threshold. Setting state to "error".`);
                }
                await micro.save();
            }
        }
    }

}

module.exports = Microservice;
