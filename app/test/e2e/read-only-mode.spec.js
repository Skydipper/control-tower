const nock = require('nock');

const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { getTestAgent, closeTestAgent } = require('./test-server');
const { createEndpoint } = require('./utils/helpers');
const { createMockEndpoint } = require('./mock');

let requester;

const createCRUDEndpoints = async () => Promise.all([
    createEndpoint({
        path: '/v1/dataset',
        method: 'GET',
        redirect: [
            {
                microservice: 'dataset',
                filters: null,
                method: 'GET',
                path: '/api/v1/dataset',
                url: 'http://mymachine:6001'
            }
        ],
    }),
    createEndpoint({
        path: '/v1/dataset',
        method: 'POST',
        redirect: [
            {
                microservice: 'dataset',
                filters: null,
                method: 'POST',
                path: '/api/v1/dataset',
                url: 'http://mymachine:6001'
            }
        ],
    }),
    createEndpoint({
        path: '/v1/dataset',
        method: 'PUT',
        redirect: [
            {
                microservice: 'dataset',
                filters: null,
                method: 'PUT',
                path: '/api/v1/dataset',
                url: 'http://mymachine:6001'
            }
        ],
    }),
    createEndpoint({
        path: '/v1/dataset',
        method: 'PATCH',
        redirect: [
            {
                microservice: 'dataset',
                filters: null,
                method: 'PATCH',
                path: '/api/v1/dataset',
                url: 'http://mymachine:6001'
            }
        ],
    }),
    createEndpoint({
        path: '/v1/dataset',
        method: 'DELETE',
        redirect: [
            {
                microservice: 'dataset',
                filters: null,
                method: 'DELETE',
                path: '/api/v1/dataset',
                url: 'http://mymachine:6001'
            }
        ],
    })
]);

describe('Read-only mode spec', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        await UserModel.deleteMany({}).exec();
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();
    });

    it('By default, read-only mode is OFF and every request should be passed through (business as usual case)', async () => {
        await createCRUDEndpoints();

        createMockEndpoint('/api/v1/dataset?loggedUser=null', { method: 'get' });
        const getResult = await requester.get('/api/v1/dataset');
        getResult.status.should.equal(200);
        getResult.text.should.equal('ok');

        createMockEndpoint('/api/v1/dataset', { method: 'post' });
        const postResult = await requester.post('/api/v1/dataset');
        postResult.status.should.equal(200);
        postResult.text.should.equal('ok');

        createMockEndpoint('/api/v1/dataset', { method: 'put' });
        const putResult = await requester.put('/api/v1/dataset');
        putResult.status.should.equal(200);
        putResult.text.should.equal('ok');

        createMockEndpoint('/api/v1/dataset', { method: 'patch' });
        const patchResult = await requester.patch('/api/v1/dataset');
        patchResult.status.should.equal(200);
        patchResult.text.should.equal('ok');

        createMockEndpoint('/api/v1/dataset?loggedUser=null', { method: 'delete' });
        const deleteResult = await requester.delete('/api/v1/dataset');
        deleteResult.status.should.equal(200);
        deleteResult.text.should.equal('ok');
    });

    it('When read-only mode is ON, GET requests that are NOT blacklisted should be passed through', async () => {
        await createCRUDEndpoints();

        // TODO: activate read only mode here

        createMockEndpoint('/api/v1/dataset?loggedUser=null', { method: 'get' });
        const getResult = await requester.get('/api/v1/dataset');
        getResult.status.should.equal(200);
        getResult.text.should.equal('ok');
    });

    it('When read-only mode is ON, POST/PUT/PATCH/DELETE requests that are NOT whitelisted should return appropriate error message', async () => {
        await createCRUDEndpoints();

        // TODO: activate read only mode here

        createMockEndpoint('/api/v1/dataset', { method: 'post' });
        const postResult = await requester.post('/api/v1/dataset');
        postResult.status.should.equal(503);
        postResult.text.should.equal('API under maintenance, please try again later.');

        createMockEndpoint('/api/v1/dataset', { method: 'put' });
        const putResult = await requester.put('/api/v1/dataset');
        putResult.status.should.equal(503);
        putResult.text.should.equal('API under maintenance, please try again later.');

        createMockEndpoint('/api/v1/dataset', { method: 'patch' });
        const patchResult = await requester.patch('/api/v1/dataset');
        patchResult.status.should.equal(503);
        patchResult.text.should.equal('API under maintenance, please try again later.');

        createMockEndpoint('/api/v1/dataset?loggedUser=null', { method: 'delete' });
        const deleteResult = await requester.delete('/api/v1/dataset');
        deleteResult.status.should.equal(503);
        deleteResult.text.should.equal('API under maintenance, please try again later.');
    });

    it('When read-only mode is ON, GET requests that ARE blacklisted should return appropriate error message', async () => {
        await createCRUDEndpoints();

        // TODO: activate read only mode here

        // TODO: add GET /api/v1/dataset to the black list

        createMockEndpoint('/api/v1/dataset?loggedUser=null', { method: 'get' });
        const getResult = await requester.get('/api/v1/dataset');
        getResult.status.should.equal(503);
        getResult.text.should.equal('API under maintenance, please try again later.');
    });

    it('When read-only mode is ON, POST/PUT/PATCH/DELETE requests that ARE whitelisted should be passed through', async () => {
        await createCRUDEndpoints();

        // TODO: activate read only mode here

        // TODO: add POST/PATCH/PUT/DELETE /api/v1/dataset to the white list

        createMockEndpoint('/api/v1/dataset', { method: 'post' });
        const postResult = await requester.post('/api/v1/dataset');
        postResult.status.should.equal(200);
        postResult.text.should.equal('ok');

        createMockEndpoint('/api/v1/dataset', { method: 'put' });
        const putResult = await requester.put('/api/v1/dataset');
        putResult.status.should.equal(200);
        putResult.text.should.equal('ok');

        createMockEndpoint('/api/v1/dataset', { method: 'patch' });
        const patchResult = await requester.patch('/api/v1/dataset');
        patchResult.status.should.equal(200);
        patchResult.text.should.equal('ok');

        createMockEndpoint('/api/v1/dataset?loggedUser=null', { method: 'delete' });
        const deleteResult = await requester.delete('/api/v1/dataset');
        deleteResult.status.should.equal(200);
        deleteResult.text.should.equal('ok');
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(closeTestAgent);
});
