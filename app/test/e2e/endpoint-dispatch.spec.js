const chai = require('chai');
const nock = require('nock');
const Endpoint = require('models/endpoint.model');
const { getTestAgent } = require('./test-server');
const { testAppKey, endpointTest } = require('./test.constants');
const { createEndpoint, ensureCorrectError, updateVersion } = require('./utils');
const { createMockEndpoint, createMockEndpointWithBody, createMockEndpointWithHeaders } = require('./mock');

const should = chai.should();
let microservice;

const changeMethod = method => ({ ...endpointTest, method, redirect: [{ ...endpointTest.redirect[0], method }] });

describe('Endpoint dispatch tests', () => {
    before(async () => {
        nock.cleanAll();

        microservice = await getTestAgent();
    });

    it('Created endpoint without redirects should return not found', async () => {
        await createEndpoint({ redirect: [] });
        const result = await microservice.post('/api/v1/dataset');
        ensureCorrectError(result, 'Endpoint not found', 404);
    });

    it('Create endpoint after cache is was declared and version is not updated should return not found', async () => {
        await createEndpoint();
        const result = await microservice.post('/api/v1/dataset');
        ensureCorrectError(result, 'Endpoint not found', 404);
    });

    it('Created endpoint should executes', async () => {
        await updateVersion();
        await createEndpoint();
        createMockEndpoint('/api/v1/dataset');
        const result = await microservice.post('/api/v1/dataset');
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Created endpoint with applicationRequired and not send application should fall', async () => {
        await updateVersion();
        await createEndpoint({ applicationRequired: true });
        const result = await microservice.post('/api/v1/dataset');
        ensureCorrectError(result, 'Required app_key', 401);
    });

    it('Created endpoint with applicationRequired and send app_key should succeed', async () => {
        await updateVersion();
        await createEndpoint({ applicationRequired: true });
        createMockEndpoint('/api/v1/dataset');
        const result = await microservice.post('/api/v1/dataset').query({ app_key: testAppKey });
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Send queries, queries should move on new POST request', async () => {
        await updateVersion();
        await createEndpoint();
        createMockEndpoint('/api/v1/dataset?test1=test&test2=test', { method: 'post' });
        const result = await microservice.post('/api/v1/dataset').query({ test1: 'test', test2: 'test' });
        result.text.should.equal('ok');
        result.status.should.equal(200);
    });

    it('Send queries, queries should move on new PUT request', async () => {
        await updateVersion();
        await createEndpoint(changeMethod('PUT'));
        createMockEndpoint('/api/v1/dataset?test1=test&test2=test', { method: 'put' });
        const result = await microservice.put('/api/v1/dataset').query({ test1: 'test', test2: 'test' });
        result.text.should.equal('ok');
        result.status.should.equal(200);
    });

    it('Send queries, queries should move on new GET request', async () => {
        await updateVersion();
        await createEndpoint(changeMethod('GET'));
        createMockEndpoint('/api/v1/dataset?test1=test&test2=test&loggedUser=null', { method: 'get' });
        const result = await microservice.get('/api/v1/dataset').query({ test1: 'test', test2: 'test' });
        result.text.should.equal('ok');
        result.status.should.equal(200);
    });

    it('Send queries, queries should move on new PATCH request', async () => {
        await updateVersion();
        await createEndpoint(changeMethod('PATCH'));
        createMockEndpoint('/api/v1/dataset?test1=test&test2=test', { method: 'patch' });
        const result = await microservice.patch('/api/v1/dataset').query({ test1: 'test', test2: 'test' });
        result.text.should.equal('ok');
        result.status.should.equal(200);
    });

    it('Send queries, queries should move on new DELETE request', async () => {
        await updateVersion();
        await createEndpoint(changeMethod('DELETE'));
        createMockEndpoint('/api/v1/dataset?test1=test&test2=test&loggedUser=null', { method: 'delete' });
        const result = await microservice.delete('/api/v1/dataset').query({ test1: 'test', test2: 'test' });
        result.text.should.equal('ok');
        result.status.should.equal(200);
    });

    it('Send body, body should ignored when request is neither PUT nor POST nor PATCH', async () => {
        await updateVersion();
        await createEndpoint(changeMethod('GET'));
        createMockEndpoint('/api/v1/dataset?loggedUser=null', { method: 'get' });
        const result = await microservice.get('/api/v1/dataset').send({ test1: 'test', test2: 'test' });
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Send body, body should be present in POST redirect request', async () => {
        await updateVersion();
        await createEndpoint();
        createMockEndpointWithBody('/api/v1/dataset', { body: { test1: 'test2', loggedUser: null } });
        const result = await microservice.post('/api/v1/dataset').send({ test1: 'test2' });
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Send body, body should be present in PATCH redirect request', async () => {
        await updateVersion();
        await createEndpoint(changeMethod('PATCH'));
        createMockEndpointWithBody('/api/v1/dataset', { method: 'patch', body: { test1: 'test2', loggedUser: null } });
        const result = await microservice.patch('/api/v1/dataset').send({ test1: 'test2' });
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Send body, body should be present in PUT redirect request', async () => {
        await updateVersion();
        await createEndpoint(changeMethod('PUT'));
        createMockEndpointWithBody('/api/v1/dataset', { method: 'put', body: { test1: 'test2', loggedUser: null } });
        const result = await microservice.put('/api/v1/dataset').send({ test1: 'test2' });
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Send post request should be redirected to get request', async () => {
        await updateVersion();
        await createEndpoint({ ...endpointTest, redirect: [{ ...endpointTest.redirect[0], method: 'get' }] });
        createMockEndpoint('/api/v1/dataset', { method: 'get' });
        const result = await microservice.post('/api/v1/dataset');
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Send custom headers which is allowed, headers should be present in redirected request', async () => {
        await updateVersion();
        await createEndpoint();
        createMockEndpointWithHeaders('/api/v1/dataset', { headers: { location: 'test2' } });
        const result = await microservice.post('/api/v1/dataset').set('location', 'test2');
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Send stream request', async () => {
        await updateVersion();
        await createEndpoint({ binary: true });
        createMockEndpoint('/api/v1/dataset');
        const result = await microservice.post('/api/v1/dataset');
        result.status.should.equal(200);
    });

    it('Create endpoint with wrong version should return not found', async () => {
        await createEndpoint({ version: 2 });
        const result = await microservice.post('/api/v1/dataset');
        result.status.should.equal(404);
    });

    it('Create endpoint with pathRegex should success', async () => {
        await updateVersion();
        // eslint-disable-next-line no-useless-escape
        await createEndpoint({ pathRegex: new RegExp('^/api/v1/dataset/[0-9]*$') });
        createMockEndpoint('/api/v1/dataset');
        const result = await microservice.post('/api/v1/dataset/123');
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('check path regex is working right', async () => {
        await updateVersion();
        // eslint-disable-next-line no-useless-escape
        await createEndpoint({ pathRegex: new RegExp('^/api/v1/dataset/[0-9]*$') });
        const result = await microservice.post('/api/v1/dataset/sadasd');
        result.status.should.equal(404);
    });

    afterEach(async () => {
        await Endpoint.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
