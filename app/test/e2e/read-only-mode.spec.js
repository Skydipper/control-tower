const nock = require('nock');

const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const Plugin = require('models/plugin.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { getTestAgent, closeTestAgent } = require('./test-server');
const { createUserAndToken, createEndpoint, setPluginSetting } = require('./utils/helpers');
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

        await UserModel.deleteMany({}).exec();
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();

        // Create plugin if not it does not exist in the database
        const existing = await Plugin.findOne({ name: 'readOnly' });
        if (!existing) {
            await new Plugin({
                name: 'readOnly',
                description: 'Turn on/off read-only mode for CT, blocking writes to the database.',
                mainFile: 'plugins/read-only',
                active: true,
                config: {
                    blacklist: [],
                    whitelist: [],
                },
            }).save();
        } else {
            existing.active = true;
            await existing.save();
        }

        requester = await getTestAgent(true);
    });

    it('When read-only mode is ON, GET requests that are NOT blacklisted should be passed through', async () => {
        await createCRUDEndpoints();
        requester = await getTestAgent(true);

        createMockEndpoint('/api/v1/dataset?loggedUser=null', { method: 'get' });
        const getResult = await requester.get('/api/v1/dataset');
        getResult.status.should.equal(200);
        getResult.text.should.equal('ok');
    });

    it('When read-only mode is ON, POST/PUT/PATCH/DELETE requests that are NOT whitelisted should return appropriate error message', async () => {
        await createCRUDEndpoints();
        requester = await getTestAgent(true);

        const postResult = await requester.post('/api/v1/dataset');
        postResult.status.should.equal(503);
        postResult.text.should.equal('API under maintenance, please try again later.');

        const putResult = await requester.put('/api/v1/dataset');
        putResult.status.should.equal(503);
        putResult.text.should.equal('API under maintenance, please try again later.');

        const patchResult = await requester.patch('/api/v1/dataset');
        patchResult.status.should.equal(503);
        patchResult.text.should.equal('API under maintenance, please try again later.');

        const deleteResult = await requester.delete('/api/v1/dataset');
        deleteResult.status.should.equal(503);
        deleteResult.text.should.equal('API under maintenance, please try again later.');
    });

    it('When read-only mode is ON, GET requests that ARE blacklisted should return appropriate error message', async () => {
        await createCRUDEndpoints();
        await setPluginSetting('readOnly', 'blacklist', ['/api/v1/dataset']);
        requester = await getTestAgent(true);

        const getResult = await requester.get('/api/v1/dataset');
        getResult.status.should.equal(503);
        getResult.text.should.equal('API under maintenance, please try again later.');
    });

    it('When read-only mode is ON, POST/PUT/PATCH/DELETE requests that ARE whitelisted should be passed through', async () => {
        await createCRUDEndpoints();
        await setPluginSetting('readOnly', 'whitelist', ['/api/v1/dataset']);
        requester = await getTestAgent(true);

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

    it('Applies the same read-only criteria for CT endpoints', async () => {
        requester = await getTestAgent(true);

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const getResult = await requester
            .get('/api/v1/microservice')
            .set('Authorization', `Bearer ${token}`);
        getResult.status.should.equal(200);
        getResult.text.should.equal('[]');

        const postResult = await requester.post('/api/v1/microservice');
        postResult.status.should.equal(503);
        postResult.text.should.equal('API under maintenance, please try again later.');

        const putResult = await requester.put('/api/v1/microservice');
        putResult.status.should.equal(503);
        putResult.text.should.equal('API under maintenance, please try again later.');

        const patchResult = await requester.patch('/api/v1/microservice');
        patchResult.status.should.equal(503);
        patchResult.text.should.equal('API under maintenance, please try again later.');

        const deleteResult = await requester.delete('/api/v1/microservice');
        deleteResult.status.should.equal(503);
        deleteResult.text.should.equal('API under maintenance, please try again later.');
    });

    it('Applies the same read-only criteria for CT authentication endpoints', async () => {
        requester = await getTestAgent(true);

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const getResult = await requester
            .get('/auth/user')
            .set('Authorization', `Bearer ${token}`);
        getResult.status.should.equal(200);
        getResult.body.should.have.property('data');

        const postResult = await requester
            .post('/auth/user')
            .set('Authorization', `Bearer ${token}`);
        postResult.status.should.equal(503);
        postResult.text.should.equal('API under maintenance, please try again later.');

        const patchResult = await requester.patch('/auth/user');
        patchResult.status.should.equal(503);
        patchResult.text.should.equal('API under maintenance, please try again later.');

        const deleteResult = await requester.delete('/auth/user');
        deleteResult.status.should.equal(503);
        deleteResult.text.should.equal('API under maintenance, please try again later.');
    });

    it('Allows usage of Regex to define paths on blacklist', async () => {
        await createCRUDEndpoints();
        await setPluginSetting('readOnly', 'blacklist', ['.*dataset.*']);
        requester = await getTestAgent(true);

        const getResult = await requester.get('/api/v1/dataset');
        getResult.status.should.equal(503);
        getResult.text.should.equal('API under maintenance, please try again later.');
    });

    it('Allows usage of Regex to define paths on whitelist', async () => {
        await createCRUDEndpoints();
        await setPluginSetting('readOnly', 'whitelist', ['.*dataset.*']);
        requester = await getTestAgent(true);

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

    after(async () => {
        await Plugin.deleteOne({ name: 'readOnly' });

        closeTestAgent();
    });
});
