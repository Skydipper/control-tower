const chai = require('chai');
const nock = require('nock');
const Endpoint = require('models/endpoint.model');
const UserModel = require('models/endpoint.model');
const { getTestAgent } = require('./test-server');
const { endpointTest, testFilter } = require('./test.constants');
const {
    createEndpoint, ensureCorrectError, updateVersion, createUserAndToken, getUserFromToken
} = require('./utils/helpers');
const { createMockEndpointWithBody } = require('./mock');

chai.should();
let microservice;

describe('Endpoint dispatch tests', () => {
    before(async () => {
        await UserModel.deleteMany({}).exec();
        await Endpoint.deleteMany({}).exec();

        nock.cleanAll();

        microservice = await getTestAgent();
    });

    it('Endpoint with filters that use endpoints that don\'t exist should return a 404 HTTP code with a "Endpoint not found" message', async () => {
        const { token } = await createUserAndToken();

        await updateVersion();

        await createEndpoint({
            ...endpointTest,
            pathRegex: new RegExp('^/api/v1/dataset$'),
            redirect: [{ ...endpointTest.redirect[0], filters: testFilter({ test1: 'test2' }) }]
        });
        const result = await microservice
            .post('/api/v1/dataset')
            .set('Authorization', `Bearer ${token}`)
            .send({ test1: 'test2' });
        ensureCorrectError(result, 'Endpoint not found', 404);
    });

    it('Endpoint with filters that can be verified and don\'t match return a 404 HTTP code with a "Endpoint not found" message', async () => {
        const { token } = await createUserAndToken();

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
            body: { loggedUser: await getUserFromToken(token, false) },
            response: { data: { test: 'bar' } }
        });

        const result = await microservice
            .post('/api/v1/dataset')
            .set('Authorization', `Bearer ${token}`)
            .send({ test: 'bar' });
        ensureCorrectError(result, 'Endpoint not found', 404);
    });

    it('Endpoint with filters that return a 404 response should return a 404 HTTP code with a "Endpoint not found" message', async () => {
        const { token } = await createUserAndToken();

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
            body: { loggedUser: await getUserFromToken(token, false) },
            replyStatus: 404
        });
        const result = await microservice
            .post('/api/v1/dataset')
            .set('Authorization', `Bearer ${token}`)
            .send({ test: 'bar' });
        ensureCorrectError(result, 'Endpoint not found', 404);
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await Endpoint.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
