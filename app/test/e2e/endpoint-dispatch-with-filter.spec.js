const chai = require('chai');
const nock = require('nock');
const Endpoint = require('models/endpoint.model');
const { getTestAgent } = require('./test-server');
const { endpointTest, testFilter } = require('./test.constants');
const { createEndpoint, ensureCorrectError, updateVersion } = require('./utils');
const { createMockEndpointWithBody } = require('./mock');

const should = chai.should();
let microservice;

describe('Endpoint dispatch tests', () => {
    before(async () => {
        nock.cleanAll();

        microservice = await getTestAgent();
    });

    it('Endpoint with filters that use endpoints that don\'t exist should return a 404 HTTP code with a "Endpoint not found" message', async () => {
        await updateVersion();
        // eslint-disable-next-line no-useless-escape
        await createEndpoint({
            ...endpointTest,
            pathRegex: new RegExp('^/api/v1/dataset$'),
            redirect: [{ ...endpointTest.redirect[0], filters: testFilter({ test1: 'test2' }) }]
        });
        const result = await microservice.post('/api/v1/dataset').send({ test1: 'test2' });
        ensureCorrectError(result, 'Endpoint not found', 404);
    });

    it('Endpoint with filters that can be verified and match return a 200 HTTP code (happy case)', async () => {
        await updateVersion();
        // eslint-disable-next-line no-useless-escape
        await createEndpoint({
            pathRegex: new RegExp('^/api/v1/dataset$'),
            redirect: [{ ...endpointTest.redirect[0], filters: testFilter({ foo: 'bar' }) }]
        });
        await createEndpoint({
            path: '/api/v1/test1/test',
            redirect: [
                {
                    filters: null,
                    method: 'POST',
                    path: '/api/v1/test1/test',
                    url: 'http://mymachine:6001'
                }
            ],
        });
        createMockEndpointWithBody('/api/v1/test1/test', {
            body: { loggedUser: null },
            response: { body: { data: { foo: 'bar' } } }
        });
        createMockEndpointWithBody('/api/v1/dataset', {
            body: {
                foo: 'bar',
                loggedUser: null,
                dataset: { body: { data: { foo: 'bar' } } },
            }
        });
        const result = await microservice.post('/api/v1/dataset').send({ foo: 'bar' });
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Endpoint with filters that can be verified and don\'t match return a 404 HTTP code with a "Endpoint not found" message', async () => {
        await updateVersion();
        // eslint-disable-next-line no-useless-escape
        await createEndpoint({
            pathRegex: new RegExp('^/api/v1/dataset$'),
            redirect: [{ ...endpointTest.redirect[0], filters: testFilter({ test: 'test1' }) }]
        });
        await createEndpoint({
            path: '/api/v1/test1/test',
            redirect: [
                {
                    filters: null,
                    method: 'POST',
                    path: '/api/v1/test1/test',
                    url: 'http://mymachine:6001'
                }
            ],
        });

        createMockEndpointWithBody('/api/v1/test1/test', {
            body: { loggedUser: null },
            response: { data: { test: 'bar' } }
        });

        const result = await microservice.post('/api/v1/dataset').send({ test: 'bar' });
        ensureCorrectError(result, 'Endpoint not found', 404);
    });

    it('Endpoint with filters that return a 404 response should return a 404 HTTP code with a "Endpoint not found" message', async () => {
        await updateVersion();
        // eslint-disable-next-line no-useless-escape
        await createEndpoint({
            pathRegex: new RegExp('^/api/v1/dataset$'),
            redirect: [{ ...endpointTest.redirect[0], filters: testFilter({ test: 'trest1' }) }]
        });
        await createEndpoint({
            path: '/api/v1/test1/test',
            redirect: [
                {
                    filters: null,
                    method: 'POST',
                    path: '/api/v1/test1/test',
                    url: 'http://mymachine:6001'
                }
            ],
        });
        createMockEndpointWithBody('/api/v1/test1/test', {
            body: { loggedUser: null },
            replyStatus: 404
        });
        const result = await microservice.post('/api/v1/dataset').send({ test: 'bar' });
        ensureCorrectError(result, 'Endpoint not found', 404);
    });

    afterEach(async () => {
        await Endpoint.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
