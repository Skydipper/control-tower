const nock = require('nock');
const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const MicroserviceService = require('services/microservice.service');
const { createEndpoint, createMicroservice } = require('./utils/helpers');

describe('Microservice cron - Error checking', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    it('Running the "error" cron will reactivate an errored microservice that is again reachable (happy case)', async () => {
        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'error',
            endpoints: [
                {
                    microservice: 'test-microservice-one',
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }
            ],
        };

        await createMicroservice(testMicroserviceOne);
        await createEndpoint({
            pathKeys: [],
            authenticated: false,
            applicationRequired: false,
            binary: false,
            cache: [],
            uncache: [],
            toDelete: false,
            path: '/v1/test',
            method: 'GET',
            pathRegex: /^\/v1\/test(?:\/(?=$))?$/i,
            redirect: [
                {
                    microservice: 'test-microservice-one',
                    method: 'GET',
                    path: '/api/v1/test',
                    url: testMicroserviceOne.url
                }
            ],
            version: 1
        });

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(200, {
                swagger: {},
                name: 'test-microservice-one',
                tags: ['test'],
                endpoints: [{
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }]
            });

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);

        await MicroserviceService.tryRegisterErrorMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);
    });

    it('Running the "error" cron will not reactivate an errored microservice that is not yet reachable', async () => {
        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'error',
            endpoints: [
                {
                    microservice: 'test-microservice-one',
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }
            ],
        };

        await createMicroservice(testMicroserviceOne);
        await createEndpoint({
            pathKeys: [],
            authenticated: false,
            applicationRequired: false,
            binary: false,
            cache: [],
            uncache: [],
            toDelete: false,
            path: '/v1/test',
            method: 'GET',
            pathRegex: /^\/v1\/test(?:\/(?=$))?$/i,
            redirect: [
                {
                    microservice: 'test-microservice-one',
                    method: 'GET',
                    path: '/api/v1/test',
                    url: testMicroserviceOne.url
                }
            ],
            version: 1
        });

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(404);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);

        await MicroserviceService.tryRegisterErrorMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);
    });

    it('Running the "error" cron will not activate a "pending" microservice that is reachable but was last updated less than 10 seconds ago', async () => {
        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'pending',
            endpoints: [
                {
                    microservice: 'test-microservice-one',
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }
            ],
        };

        await createMicroservice(testMicroserviceOne);
        await createEndpoint({
            pathKeys: [],
            authenticated: false,
            applicationRequired: false,
            binary: false,
            cache: [],
            uncache: [],
            toDelete: false,
            path: '/v1/test',
            method: 'GET',
            pathRegex: /^\/v1\/test(?:\/(?=$))?$/i,
            redirect: [
                {
                    microservice: 'test-microservice-one',
                    method: 'GET',
                    path: '/api/v1/test',
                    url: testMicroserviceOne.url
                }
            ],
            version: 1
        });

        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);

        await MicroserviceService.tryRegisterErrorMicroservices();

        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);
    });

    it('Running the "error" cron will activate a "pending" microservice that is reachable and was last updated more than 10 seconds ago', async () => {
        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'pending',
            endpoints: [
                {
                    microservice: 'test-microservice-one',
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }
            ],
            updatedAt: Date.parse('2019-01-01')
        };

        await createMicroservice(testMicroserviceOne);
        await createEndpoint({
            pathKeys: [],
            authenticated: false,
            applicationRequired: false,
            binary: false,
            cache: [],
            uncache: [],
            toDelete: false,
            path: '/v1/test',
            method: 'GET',
            pathRegex: /^\/v1\/test(?:\/(?=$))?$/i,
            redirect: [
                {
                    microservice: 'test-microservice-one',
                    method: 'GET',
                    path: '/api/v1/test',
                    url: testMicroserviceOne.url
                }
            ],
            version: 1
        });

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(200, {
                swagger: {},
                name: 'test-microservice-one',
                tags: ['test'],
                endpoints: [{
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }]
            });


        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);

        await MicroserviceService.tryRegisterErrorMicroservices();

        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);
    });

    it('Running the "error" cron on a "pending" microservice that is not reachable and was last updated more than 10 seconds ago will switch it to "error"', async () => {
        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'pending',
            endpoints: [
                {
                    microservice: 'test-microservice-one',
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }
            ],
            updatedAt: Date.parse('2019-01-01')
        };

        await createMicroservice(testMicroserviceOne);
        await createEndpoint({
            pathKeys: [],
            authenticated: false,
            applicationRequired: false,
            binary: false,
            cache: [],
            uncache: [],
            toDelete: false,
            path: '/v1/test',
            method: 'GET',
            pathRegex: /^\/v1\/test(?:\/(?=$))?$/i,
            redirect: [
                {
                    microservice: 'test-microservice-one',
                    method: 'GET',
                    path: '/api/v1/test',
                    url: testMicroserviceOne.url
                }
            ],
            version: 1
        });

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(404);


        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);

        await MicroserviceService.tryRegisterErrorMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ toDelete: false })).should.have.lengthOf(1);
        (await EndpointModel.find({ toDelete: true })).should.have.lengthOf(0);
    });

    afterEach(async () => {
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
