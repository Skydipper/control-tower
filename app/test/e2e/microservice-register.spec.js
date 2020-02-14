const logger = require('logger');
const nock = require('nock');
const chai = require('chai');

const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const VersionModel = require('models/version.model');
const appConstants = require('app.constants');

chai.use(require('chai-datetime'));

const { createMicroservice, createEndpoint } = require('./utils/helpers');
const { getTestAgent, closeTestAgent } = require('./test-server');

chai.should();

let requester;


describe('Microservices endpoints', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await UserModel.deleteMany({}).exec();
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();
    });

    /* Register a microservice */
    it('Registering a microservice that is available should be successful and create the microservice and endpoints, and increase the version (happy case)', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            active: true
        };

        nock('http://test-microservice-one:8000')
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
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

        const response = await requester.post(`/api/v1/microservice`).send(testMicroserviceOne);

        response.status.should.equal(200);
        response.body.status.should.equal('active');

        const microservice = await MicroserviceModel.find();
        microservice.should.have.lengthOf(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.afterTime(preVersion.lastUpdated);
    });

    it('Registering a microservice that is not yet available should be successful and set the microservice in "pending" state and not create any endpoints.', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'error',
            endpoints: [
                {
                    path: '/v1/testOne',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/testOne'
                    }
                }
            ],
        };

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(404);

        const response = await requester.post(`/api/v1/microservice`).send(testMicroserviceOne);

        response.status.should.equal(200);
        response.body.status.should.equal('pending');

        const microservice = await MicroserviceModel.find();
        microservice.should.have.lengthOf(1);

        const endpoints = await EndpointModel.find();
        endpoints.should.have.lengthOf(0);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.equalTime(preVersion.lastUpdated);
    });

    it('Re-registering a microservice that already exists should be successful', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'error',
            endpoints: [
                {
                    path: '/v1/testOne',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/testOne'
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
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
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

        const response = await requester.post(`/api/v1/microservice`).send(testMicroserviceOne);

        response.status.should.equal(200);
        response.body.status.should.equal('active');

        const microservice = await MicroserviceModel.find();
        microservice.should.have.lengthOf(1);

        const endpoints = await EndpointModel.find();
        endpoints.should.have.lengthOf(1);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.afterTime(preVersion.lastUpdated);
    });

    it('Re-registering a microservice that already exists with a new endpoint should be successful', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            active: true
        };

        await createMicroservice(testMicroserviceOne);
        await createEndpoint({
            pathKeys: [],
            authenticated: false,
            applicationRequired: false,
            binary: false,
            cache: [],
            uncache: [],
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
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
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
                }, {
                    path: '/v1/test',
                    method: 'POST',
                    redirect: {
                        method: 'POST',
                        path: '/api/v1/test'
                    }
                }]
            });

        const response = await requester.post(`/api/v1/microservice`).send(testMicroserviceOne);

        response.status.should.equal(200);
        response.body.status.should.equal('active');

        const microservice = await MicroserviceModel.find();
        microservice.should.have.lengthOf(1);

        const endpoints = await EndpointModel.find();
        endpoints.should.have.lengthOf(2);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.afterTime(preVersion.lastUpdated);
    });

    it('Registering a microservice that adds a new redirect to an existing endpoint should be successful (happy case)', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            active: true
        };
        const testMicroserviceTwo = {
            name: `test-microservice-two`,
            url: 'http://test-microservice-two:8000',
            active: true
        };

        await createMicroservice(testMicroserviceOne);
        await createEndpoint({
            pathKeys: [],
            authenticated: false,
            applicationRequired: false,
            binary: false,
            cache: [],
            uncache: [],
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

        nock('http://test-microservice-two:8000')
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
            .reply(200, {
                swagger: {},
                name: 'test-microservice-two',
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

        const response = await requester.post(`/api/v1/microservice`).send(testMicroserviceTwo);

        response.status.should.equal(200);
        response.body.status.should.equal('active');

        const microservice = await MicroserviceModel.find();
        microservice.should.have.lengthOf(2);

        const endpoints = await EndpointModel.find();
        endpoints.should.have.lengthOf(1);
        endpoints[0].redirect.should.have.lengthOf(2);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.afterTime(preVersion.lastUpdated);
    });

    it('Re-registering an existing microservice should be successful - new endpoints are added, missing ones are deleted', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'active',
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
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
            .reply(200, {
                swagger: {},
                name: 'test-microservice-one',
                tags: ['test'],
                endpoints: [{
                    path: '/v1/testOne',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/testOne'
                    }
                }, {
                    path: '/v1/testTwo',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/testTwo',
                    }
                }]
            });

        delete testMicroserviceOne.endpoints[0].microservice;

        const response = await requester.post(`/api/v1/microservice`).send(testMicroserviceOne);

        response.status.should.equal(200);
        response.body.status.should.equal('active');

        const microservice = await MicroserviceModel.find();
        microservice.should.have.lengthOf(1);

        const endpoints = await EndpointModel.find();
        endpoints.should.have.lengthOf(2);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.afterTime(preVersion.lastUpdated);
    });

    it('Adding a new redirect to an existing endpoint should update an existing endpoint and add a redirect to the new microservice.', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'active',
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

        const testMicroserviceTwo = {
            name: `test-microservice-two`,
            url: 'http://test-microservice-two:8000',
            status: 'active',
            endpoints: [
                {
                    microservice: 'test-microservice-two',
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

        nock('http://test-microservice-two:8000')
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
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

        delete testMicroserviceTwo.endpoints[0].microservice;

        const response = await requester.post(`/api/v1/microservice`).send(testMicroserviceTwo);

        response.status.should.equal(200);
        response.body.status.should.equal('active');

        const microservice = await MicroserviceModel.find();
        microservice.should.have.lengthOf(2);

        const endpoints = await EndpointModel.find();
        endpoints.should.have.lengthOf(1);
        endpoints[0].redirect.should.have.length(2);
        endpoints[0].redirect.toObject().map((redirect) => redirect.url).should.have.members([testMicroserviceTwo.url, testMicroserviceOne.url]);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.afterTime(preVersion.lastUpdated);
    });

    it('Re-registering an existing microservice with an endpoint shared with another microservice should merge the configurations of existing and the updated MS.', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'active',
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

        const testMicroserviceTwo = {
            name: `test-microservice-two`,
            url: 'http://test-microservice-two:8000',
            status: 'active',
            endpoints: [
                {
                    microservice: 'test-microservice-two',
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
        await createMicroservice(testMicroserviceTwo);
        await createEndpoint({
            pathKeys: [],
            authenticated: false,
            applicationRequired: false,
            binary: false,
            cache: [],
            uncache: [],
            path: '/v1/test',
            method: 'GET',
            pathRegex: /^\/v1\/test(?:\/(?=$))?$/i,
            redirect: [
                {
                    microservice: 'test-microservice-one',
                    method: 'GET',
                    path: '/api/v1/test',
                    url: testMicroserviceOne.url
                }, {
                    microservice: 'test-microservice-two',
                    method: 'GET',
                    path: '/api/v1/test',
                    url: testMicroserviceTwo.url
                }
            ],
            version: 1
        });

        nock('http://test-microservice-two:8000')
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
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

        delete testMicroserviceTwo.endpoints[0].microservice;

        const response = await requester.post(`/api/v1/microservice`).send(testMicroserviceTwo);

        response.status.should.equal(200);
        response.body.status.should.equal('active');

        const microservice = await MicroserviceModel.find();
        microservice.should.have.lengthOf(2);

        const endpoints = await EndpointModel.find();
        endpoints.should.have.lengthOf(1);
        endpoints[0].redirect.should.have.length(2);
        endpoints[0].redirect.toObject().map((redirect) => redirect.url).should.have.members([testMicroserviceTwo.url, testMicroserviceOne.url]);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.afterTime(preVersion.lastUpdated);
    });

    /* Testing redirects and filters */
    it('Registering multiple microservices and querying them is successful (redirects and filters)', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testDatasetMicroservice = {
            name: `dataset`,
            url: 'http://test-dataset-microservice:3000',
            active: true
        };
        const adapterOne = {
            name: `adapter-one`,
            url: 'http://adapter-one:8001',
            active: true
        };
        const adapterTwo = {
            name: `adapter-two`,
            url: 'http://adapter-two:8002',
            active: true
        };

        /* Dataset microservice */
        nock('http://test-dataset-microservice:3000')
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
            .once()
            .reply(200, {
                swagger: {},
                name: 'dataset',
                tags: ['test'],
                endpoints: [{
                    path: '/v1/dataset/:dataset',
                    method: 'GET',
                    binary: true,
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/dataset/:dataset'
                    }
                }]
            });

        nock('http://test-dataset-microservice:3000')
            .get('/api/v1/dataset/1111')
            .query(true)
            .twice()
            .reply(200, {
                status: 200,
                detail: 'OK',
                data: {
                    attributes: {
                        provider: 'cartodb'
                    }
                }
            });

        nock('http://test-dataset-microservice:3000')
            .get('/api/v1/dataset/2222')
            .query(true)
            .twice()
            .reply(200, {
                status: 200,
                detail: 'OK',
                data: {
                    attributes: {
                        provider: 'featureservice'
                    }
                }
            });

        /* Adapter 1 microservice */
        nock('http://adapter-one:8001')
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
            .once()
            .reply(200, {
                swagger: {},
                name: 'adapter-one',
                tags: ['test'],
                endpoints: [{
                    path: '/v1/query/:dataset',
                    method: 'GET',
                    binary: true,
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/carto/query/:dataset'
                    },
                    filters: [{
                        name: 'dataset',
                        path: '/v1/dataset/:dataset',
                        method: 'GET',
                        params: {
                            dataset: 'dataset'
                        },
                        compare: {
                            data: {
                                attributes: {
                                    provider: 'cartodb'
                                }
                            }
                        }
                    }]
                }]
            });

        nock('http://adapter-one:8001')
            .get('/api/v1/carto/query/1111')
            .query(true)
            .once()
            .reply(200, {
                status: 200,
                query: 1000
            });


        /* Adapter 2 microservice */
        nock('http://adapter-two:8002')
            .get((uri) => {
                logger.info('Uri', uri);
                return uri.startsWith('/info');
            })
            .once()
            .reply(200, {
                swagger: {},
                name: 'adapter-two',
                tags: ['test'],
                endpoints: [{
                    path: '/v1/query/:dataset',
                    method: 'GET',
                    binary: true,
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/arcgis/query/:dataset'
                    },
                    filters: [{
                        name: 'dataset',
                        path: '/v1/dataset/:dataset',
                        method: 'GET',
                        params: {
                            dataset: 'dataset'
                        },
                        compare: {
                            data: {
                                attributes: {
                                    provider: 'featureservice'
                                }
                            }
                        }
                    }]
                }]
            });

        nock('http://adapter-two:8002')
            .get('/api/v1/arcgis/query/2222')
            .query(true)
            .once()
            .reply(200, {
                status: 200,
                query: 2000
            });

        const responseOne = await requester.post(`/api/v1/microservice`).send(testDatasetMicroservice);
        const responseTwo = await requester.post(`/api/v1/microservice`).send(adapterOne);
        const responseThree = await requester.post(`/api/v1/microservice`).send(adapterTwo);

        responseOne.status.should.equal(200);
        responseOne.body.status.should.equal('active');

        responseTwo.status.should.equal(200);
        responseTwo.body.status.should.equal('active');

        responseThree.status.should.equal(200);
        responseThree.body.status.should.equal('active');

        const queryOne = await requester.get(`/v1/query/1111`);
        const queryTwo = await requester.get(`/v1/query/2222`);

        queryOne.status.should.equal(200);
        queryOne.body.query.should.equal(1000);
        queryTwo.status.should.equal(200);
        queryTwo.body.query.should.equal(2000);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.afterTime(preVersion.lastUpdated);
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
