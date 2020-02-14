const nock = require('nock');
const chai = require('chai');

const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUserAndToken, createMicroservice, createEndpoint } = require('./utils/helpers');
const { getTestAgent, closeTestAgent } = require('./test-server');

chai.should();

let requester;


describe('Delete a microservice', () => {

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

    it('Deleting a microservice should delete endpoints and the microservice document from the database (happy case)', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            active: true,
            endpoints: [
                {
                    path: '/v1/testOne',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/testOne'
                    }
                },
                {
                    path: '/v1/testTwo',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/testTwo'
                    }
                }
            ],
        };

        const microservice = await createMicroservice(testMicroserviceOne);
        await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: false,
                cache: [],
                uncache: [],
                path: '/v1/testOne',
                method: 'GET',
                pathRegex: /^\/v1\/testOne(?:\/(?=$))?$/i,
                redirect: [
                    {
                        microservice: 'test1',
                        method: 'GET',
                        path: '/api/v1/testOne',
                        url: 'http://test-microservice-one:8000',
                        filters: null
                    }
                ],
                version: 1,
            }
        );
        await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: false,
                cache: [],
                uncache: [],
                path: '/v1/testTwo',
                method: 'GET',
                pathRegex: /^\/v1\/testTwo(?:\/(?=$))?$/i,
                redirect: [
                    {
                        microservice: 'test1',
                        method: 'GET',
                        path: '/api/v1/testTwo',
                        url: 'http://test-microservice-one:8000',
                        filters: null
                    }
                ],
                version: 1,
            }
        );

        (await MicroserviceModel.find()).should.have.lengthOf(1);
        (await EndpointModel.find()).should.have.lengthOf(2);

        const response = await requester.delete(`/api/v1/microservice/${microservice.id.toString()}`)
            .send()
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);

        (await MicroserviceModel.find()).should.have.lengthOf(0);
        (await EndpointModel.find()).should.have.lengthOf(0);
    });

    it('Deleting a microservice should delete exclusive endpoints and the microservice document from the database, but preserve shared endpoints without redirects', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            active: true,
            endpoints: [
                {
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                },
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

        const testMicroserviceTwo = {
            name: `test-microservice-two`,
            url: 'http://test-microservice-two:8000',
            active: true,
            endpoints: [
                {
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                },
                {
                    path: '/v1/testTwo',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/testTwo'
                    }
                }
            ],
        };

        const microserviceOne = await createMicroservice(testMicroserviceOne);
        const microserviceTwo = await createMicroservice(testMicroserviceTwo);

        await createEndpoint(
            {
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
                        url: 'http://test-microservice-one:8000',
                        filters: null
                    }, {
                        microservice: 'test-microservice-two',
                        method: 'GET',
                        path: '/api/v1/test',
                        url: 'http://test-microservice-two:8000',
                        filters: null
                    }
                ],
                version: 1,
            }
        );

        await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: false,
                cache: [],
                uncache: [],
                path: '/v1/testOne',
                method: 'GET',
                pathRegex: /^\/v1\/testOne(?:\/(?=$))?$/i,
                redirect: [
                    {
                        microservice: 'test-microservice-one',
                        method: 'GET',
                        path: '/api/v1/testOne',
                        url: 'http://test-microservice-one:8000',
                        filters: null
                    }
                ],
                version: 1,
            }
        );
        await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: false,
                cache: [],
                uncache: [],
                path: '/v1/testTwo',
                method: 'GET',
                pathRegex: /^\/v1\/testTwo(?:\/(?=$))?$/i,
                redirect: [
                    {
                        microservice: 'test-microservice-two',
                        method: 'GET',
                        path: '/api/v1/testTwo',
                        url: 'http://test-microservice-one:8000',
                        filters: null
                    }
                ],
                version: 1,
            }
        );

        (await MicroserviceModel.find()).should.have.lengthOf(2);
        (await EndpointModel.find()).should.have.lengthOf(3);

        const response = await requester.delete(`/api/v1/microservice/${microserviceOne.id.toString()}`)
            .send()
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);

        (await MicroserviceModel.find()).should.have.lengthOf(1);

        const liveEndpoints = await EndpointModel.find();
        liveEndpoints.should.have.lengthOf(2);
        liveEndpoints.forEach((endpoint) => {
            endpoint.redirect.should.have.length(1);
            endpoint.redirect[0].should.have.property('microservice').and.equal(microserviceTwo.name);
        });
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
