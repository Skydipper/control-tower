const logger = require('logger');
const appConstants = require('app.constants');
const EndpointModel = require('models/endpoint.model');
const VersionModel = require('models/version.model');
const url = require('url');
const EndpointNotFound = require('errors/endpointNotFound');
const NotAuthenticated = require('errors/notAuthenticated');
const NotApplicationKey = require('errors/notApplicationKey');
const FilterError = require('errors/filterError');
const pathToRegexp = require('path-to-regexp');
const requestPromise = require('request-promise');
const fs = require('fs');

const ALLOWED_HEADERS = [
    'cache-control',
    'charset',
    'location',
    'host',
];


const CACHE = {
    endpoints: [],
    version: null
};

class Dispatcher {

    static getLoggedUser(ctx) {
        if (ctx.state) {
            if (ctx.state.user) {
                return ctx.state.user;
            }
            if (ctx.state.microservice) {
                return ctx.state.microservice;
            }
        }
        if (ctx.req && ctx.req.user) {
            return ctx.req.user;
        }
        return null;
    }

    static async buildUrl(sourcePath, redirectEndpoint, endpoint) {
        logger.debug('Building url');
        const result = endpoint.pathRegex.exec(sourcePath);
        let keys = {}; // eslint-disable-line prefer-const
        // eslint-disable-next-line no-return-assign
        endpoint.pathKeys.map((key, i) => (
            keys[key] = result[i + 1]
        ));
        const toPath = pathToRegexp.compile(redirectEndpoint.path);
        const buildUrl = url.resolve(redirectEndpoint.url, toPath(keys));
        logger.debug(`Final url  ${buildUrl}`);
        return buildUrl;
    }

    static buildPathFilter(sourcePath, filterEndpoint, endpoint) {
        logger.debug('Building url');
        const result = endpoint.pathRegex.exec(sourcePath);
        let keys = {}; // eslint-disable-line prefer-const
        // eslint-disable-next-line no-return-assign
        endpoint.pathKeys.map((key, i) => (
            keys[filterEndpoint.params[key]] = result[i + 1]
        ));
        const toPath = pathToRegexp.compile(filterEndpoint.path);
        const path = toPath(keys);
        logger.debug(`Final path  ${path}`);
        return path;
    }

    static searchFilterValue(filter, filterValues) {
        logger.debug('Searching filterValue to filter', filter.name);

        if (filterValues) {
            for (let i = 0, { length } = filterValues; i < length; i++) {
                if (filterValues[i].name === filter.name && filterValues[i].path === filter.path
                    && filterValues[i].method === filter.method && filterValues[i].result.correct) {
                    return filterValues[i].result.data;
                }
            }
        }
        logger.warn('Could not find filter value to filter', filter.name);
        return null;
    }


    static checkCompare(compare, dataFilter, condition = 'AND') {
        logger.debug('Check compare filter to filter', compare, 'and dataFilter', dataFilter);
        if (compare && dataFilter) {
            if (compare instanceof Array) {
                for (let j = 0, lengthCompare = compare.length; j < lengthCompare; j++) {
                    const match = Dispatcher.checkCompare(compare[j], dataFilter, condition);
                    if (match && condition === 'OR') {
                        return true;
                    }
                    if (!match && condition === 'AND') {
                        return false;
                    }
                }
            } else {
                const compareKeys = Object.keys(compare);

                for (let i = 0, { length } = compareKeys; i < length; i++) {
                    const key = compareKeys[i];
                    if (typeof compare[key] === 'object') {
                        logger.debug('IS A OBJECT');
                        const match = Dispatcher.checkCompare(compare[key], dataFilter[key], condition);
                        if (!match) {
                            return false;
                        }
                    } else if (compare[key] !== dataFilter[key]) {
                        return false;
                    }
                }
                return true;
            }
        }
        if (condition === 'OR') {
            return false;
        }
        if (condition === 'AND') {
            return true;
        }
        return false;
    }

    static checkValidRedirects(redirects, filters) {
        logger.debug('Checking redirects with filters');
        const validRedirects = [];
        for (let i = 0, { length } = redirects; i < length; i++) {
            const redirect = redirects[i];
            let valid = true;
            if (redirect.filters) {
                for (let j = 0, lengthRF = redirect.filters.length; j < lengthRF; j++) {
                    const filterValue = Dispatcher.searchFilterValue(redirect.filters[j], filters);
                    if (!filterValue || !Dispatcher.checkCompare(redirect.filters[j].compare, filterValue, redirect.filters[j].condition)) {
                        logger.debug('Not valid filter');
                        valid = false;
                        break;
                    }
                    if (!redirect.data) {
                        redirect.data = {};
                    }
                    redirect.data[redirect.filters[j].name] = filterValue;
                }
            }
            if (valid) {
                validRedirects.push(redirect);
            }
        }
        return validRedirects;
    }

    static cloneEndpoint(endpoint) {
        const newObject = { ...endpoint };
        newObject.redirect = [];
        for (let i = 0, { length } = endpoint.redirect; i < length; i++) {
            newObject.redirect.push({ ...endpoint.redirect[i] });
        }
        return newObject;
    }

    static async checkFilters(sourcePath, endpoint) {
        logger.debug('[DispatcherService - checkFilters] Checking filters in endpoint', endpoint);
        const newEndpoint = Dispatcher.cloneEndpoint(endpoint);
        let filters = [];
        for (let i = 0, { length } = newEndpoint.redirect; i < length; i++) {
            if (newEndpoint.redirect[i].filters) {
                filters = filters.concat(newEndpoint.redirect[i].filters);
            }
        }
        if (!filters || filters.length === 0) {
            logger.debug('[DispatcherService - checkFilters] Doesn\'t contain filters. All redirect are valid');
            return newEndpoint;
        }
        logger.debug('[DispatcherService - checkFilters] Obtaining data to check filters');
        const promisesRequest = [];
        let filter = null;
        let path = null;
        for (let i = 0, { length } = filters; i < length; i++) {
            filter = filters[i];
            path = await Dispatcher.buildPathFilter(sourcePath, filter, newEndpoint);
            const request = await Dispatcher.getRequest({
                request: {
                    url: path,
                    method: filter.method,
                    body: {},
                },
            });
            logger.debug('[DispatcherService - checkFilters] Config request', request);
            request.configRequest.json = true;
            promisesRequest.push(requestPromise(request.configRequest));

        }
        if (!promisesRequest || promisesRequest.length === 0) {
            return newEndpoint;
        }
        try {
            logger.debug('[DispatcherService - checkFilters] Doing requests');
            const results = await Promise.all(promisesRequest);
            // TODO: Add support for several filter in each newEndpoint
            for (let i = 0, { length } = results; i < length; i++) {
                if (results[i].statusCode === 200) {
                    filters[i].result = {
                        data: results[i].body,
                        correct: true,
                    };
                } else {
                    filters[i].result = {
                        correct: false,
                    };
                }
            }
            logger.debug('[DispatcherService - checkFilters] Checking valid filters');
            const validRedirects = Dispatcher.checkValidRedirects(newEndpoint.redirect, filters);
            newEndpoint.redirect = validRedirects;
        } catch (err) {
            logger.error(err);
            throw new FilterError('Error resolving filters');
        }
        return newEndpoint;
    }

    static getHeadersFromRequest(headers) {
        const validHeaders = {};
        const keys = Object.keys(headers);
        for (let i = 0, { length } = keys; i < length; i++) {
            if (ALLOWED_HEADERS.indexOf(keys[i].toLowerCase()) > -1) {
                validHeaders[keys[i]] = headers[keys[i]];
            }
        }
        return validHeaders;
    }

    static async reloadEndpoints(versionObj) {
        logger.debug('Reloading endpoints');
        CACHE.endpoints = await EndpointModel.find({
            version: versionObj.version,
        });
        // logger.debug(CACHE.endpoints);
        CACHE.version = {
            version: versionObj.version,
            lastUpdated: versionObj.lastUpdated
        };
    }

    static async getEndpoint(pathname, method) {
        logger.info(`[DispatcherService - getEndpoint] Searching for endpoint with path ${pathname} and method ${method}`);
        logger.debug('[DispatcherService - getEndpoint] Obtaining version');
        const version = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        logger.debug('[DispatcherService - getEndpoint] Version found: ', version);
        logger.debug('[DispatcherService - getEndpoint] Version last', version.lastUpdated);
        if (!CACHE.version || !CACHE.version.lastUpdated || !version.lastUpdated || CACHE.version.lastUpdated.getTime() !== version.lastUpdated.getTime()) {
            logger.debug('[DispatcherService - getEndpoint] Reloading endpoints cache from database');
            await Dispatcher.reloadEndpoints(version);
        }
        if (!CACHE.endpoints || CACHE.endpoints.length === 0) {
            logger.fatal('[DispatcherService - getEndpoint] Endpoints cache is empty');
            return null;
        }
        logger.debug('[DispatcherService - getEndpoint] Searching endpoints cache');
        const endpoint = CACHE.endpoints.find((endpointData) => {
            endpointData.pathRegex.lastIndex = 0;
            return endpointData.method === method && endpointData.pathRegex && endpointData.pathRegex.test(pathname);
        });
        if (endpoint) {
            logger.info(`[DispatcherService - getEndpoint] Found endpoint with id ${endpoint._id}`);
            return endpoint.toObject();
        }

        logger.info(`[DispatcherService - getEndpoint] No endpoint found`);
        return null;
    }

    static async getRequest(ctx) {
        logger.info(`[DispatcherService - getRequest] Searching endpoint where redirect url ${ctx.request.url}
            and method ${ctx.request.method}`);
        const parsedUrl = url.parse(ctx.request.url);
        let endpoint = await Dispatcher.getEndpoint(parsedUrl.pathname, ctx.request.method);

        if (!endpoint) {
            throw new EndpointNotFound(`${parsedUrl.pathname} not found`);
        }

        logger.info(`[DispatcherService - getRequest] Endpoint found. Path: ${endpoint.path} | Method: ${endpoint.method}`);
        logger.info('[DispatcherService - getRequest] Checking if authentication is necessary');
        if (endpoint.authenticated && !Dispatcher.getLoggedUser(ctx)) {
            logger.info('[DispatcherService - getRequest] Authentication is needed but no user data was found in the request');
            throw new NotAuthenticated();
        }

        if (endpoint.applicationRequired && !ctx.state.appKey) {
            logger.info('[DispatcherService - getRequest] Application key is needed but none was found in the request');
            throw new NotApplicationKey('Required app_key');
        }
        let redirectEndpoint = null;
        endpoint = await Dispatcher.checkFilters(parsedUrl.pathname, endpoint);
        if (endpoint && endpoint.redirect.length === 0) {
            logger.error('[DispatcherService - getRequest] No redirects exist');
            throw new EndpointNotFound(`${parsedUrl.pathname} not found`);
        }

        if (endpoint.redirect && endpoint.redirect.length > 1) {
            logger.debug(`[DispatcherService - getRequest] Found several redirect endpoints (num: ${endpoint.redirect.length}).
            Obtaining final endpoint with random`);
            const pos = Math.floor(Math.random() * endpoint.redirect.length);
            logger.debug(`[DispatcherService - getRequest] Position choose ${pos}`);
            redirectEndpoint = endpoint.redirect[pos];
        } else {
            logger.debug('[DispatcherService - getRequest] Only one redirect found');
            [redirectEndpoint] = endpoint.redirect;
        }
        logger.info('[DispatcherService - getRequest] Dispatching request from %s to %s%s private endpoint.',
            parsedUrl.pathname, redirectEndpoint.url, redirectEndpoint.path);
        logger.debug('[DispatcherService - getRequest] endpoint', endpoint);
        const finalUrl = await Dispatcher.buildUrl(parsedUrl.pathname, redirectEndpoint, endpoint);
        let configRequest = { // eslint-disable-line prefer-const
            uri: finalUrl,
            method: redirectEndpoint.method,
            // https://github.com/request/request-promise#user-content-get-a-rejection-only-if-the-request-failed-for-technical-reasons
            simple: false,
            resolveWithFullResponse: true,
            binary: endpoint.binary,
            headers: {}
        };
        if (ctx.request.query) {
            logger.debug('[DispatcherService - getRequest] Adding query params');
            if (ctx.request.query.app_key) {
                delete ctx.request.query.app_key;
            }
            configRequest.qs = ctx.request.query;
        }

        logger.debug('[DispatcherService - getRequest] Create request to %s', configRequest.uri);
        if (configRequest.method === 'POST' || configRequest.method === 'PATCH'
            || configRequest.method === 'PUT') {
            logger.debug('Method is %s. Adding body', configRequest.method);
            if (ctx.request.body.fields) {
                logger.debug('[DispatcherService - getRequest] Is a form-data request');
                configRequest.body = ctx.request.body.fields;
            } else {
                configRequest.body = ctx.request.body;
            }
        }
        logger.debug('[DispatcherService - getRequest] Adding logged user if it is logged');
        redirectEndpoint.data = { ...redirectEndpoint.data, loggedUser: Dispatcher.getLoggedUser(ctx), };

        if (redirectEndpoint.data) {
            logger.debug('[DispatcherService - getRequest] Adding data');
            if (configRequest.method === 'GET' || configRequest.method === 'DELETE') {
                configRequest.qs = configRequest.qs || {};
                const keys = Object.keys(redirectEndpoint.data);
                for (let i = 0, { length } = keys; i < length; i++) {
                    configRequest.qs[keys[i]] = JSON.stringify(redirectEndpoint.data[keys[i]]);
                }
            } else {
                configRequest.body = { ...configRequest.body, ...redirectEndpoint.data };
            }
        }
        if (ctx.request.body.files) {
            logger.debug('[DispatcherService - getRequest] Adding files', ctx.request.body.files);
            const { files } = ctx.request.body;
            let formData = {}; // eslint-disable-line prefer-const
            for (const key in files) { // eslint-disable-line no-restricted-syntax
                if ({}.hasOwnProperty.call(files, key)) {

                    if (files[key].size < 1000) {
                        const contents = fs.readFileSync(files[key].path, 'utf8');
                        logger.debug('[DispatcherService - getRequest] File content: ', contents);
                    }

                    formData[key] = {
                        value: fs.createReadStream(files[key].path),
                        options: {
                            filename: files[key].name,
                            contentType: files[key].type
                        }
                    };
                }
            }
            if (configRequest.body) {
                const body = {};
                // convert values to string because form-data is required that all values are string
                for (const key in configRequest.body) { // eslint-disable-line no-restricted-syntax
                    if (key !== 'files') {
                        if (configRequest.body[key] !== null && configRequest.body[key] !== undefined) {
                            if (typeof configRequest.body[key] === 'object') {
                                body[key] = JSON.stringify(configRequest.body[key]);
                            } else {
                                body[key] = configRequest.body[key];
                            }
                        } else {
                            body[key] = 'null';
                        }
                    }
                }
                configRequest.body = Object.assign(body, formData);
            } else {
                configRequest.body = formData;
            }

            configRequest.multipart = true;


        }
        if (ctx.request.headers) {
            logger.debug('[DispatcherService - getRequest] Adding headers');
            configRequest.headers = Dispatcher.getHeadersFromRequest(ctx.request.headers);
        }
        if (ctx.state && ctx.state.appKey) {
            configRequest.headers.app_key = JSON.stringify(ctx.state.appKey);
        }
        configRequest.headers.user_key = JSON.stringify(Dispatcher.getLoggedUser(ctx));

        logger.debug('[DispatcherService - getRequest] Checking if is json or formdata request');
        if (configRequest.multipart) {
            logger.debug('[DispatcherService - getRequest] Is FormData request');
            configRequest.formData = configRequest.body;
            delete configRequest.body;
            delete configRequest.multipart;
        } else {
            logger.debug('[DispatcherService - getRequest] Is JSON request');
            configRequest.json = true;
            delete configRequest.multipart;
        }
        configRequest.encoding = null; // all request have encoding null

        logger.debug('[DispatcherService - getRequest] Returning config', configRequest);
        return {
            configRequest,
            endpoint,
        };
    }

}

module.exports = Dispatcher;
