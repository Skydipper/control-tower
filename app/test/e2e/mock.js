const nock = require('nock');

// eslint-disable-next-line arrow-body-style
const createMockEndpoint = (path, params = {}) => {
    const { method = 'post', host = 'http://mymachine:6001', response = 'ok' } = params;

    return nock(host)[method](path).reply(200, response);
};

// eslint-disable-next-line arrow-body-style
const createMockEndpointWithHeaders = (path, params = {}) => {
    const { method = 'post', host = 'http://mymachine:6001', headers = {} } = params;

    return nock(host, { reqheaders: headers })[method](path).reply(200, 'ok');
};

// eslint-disable-next-line arrow-body-style
const createMockEndpointWithBody = (path, params = {}) => {
    const {
        method = 'post', host = 'http://mymachine:6001', body = {}, response = 'ok', replyStatus = 200
    } = params;

    return nock(host)[method](path, body).reply(replyStatus, response);
};

module.exports = { createMockEndpoint, createMockEndpointWithBody, createMockEndpointWithHeaders };
