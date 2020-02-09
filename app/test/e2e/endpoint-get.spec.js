const nock = require('nock');
const chai = require('chai');

const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUserAndToken, createMicroservice, createEndpoint } = require('./utils/helpers');
const { getTestAgent, closeTestAgent } = require('./test-server');

chai.should();

let requester;


describe('Get endpoints', () => {

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

    it('Getting endpoints for registered microservices should return a list of available endpoints (happy case)', async () => {
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
                        microservice: 'test1',
                        method: 'GET',
                        path: '/api/v1/testOne'
                    }
                },
                {
                    path: '/v1/testTwo',
                    method: 'GET',
                    redirect: {
                        microservice: 'test1',
                        method: 'GET',
                        path: '/api/v1/testTwo'
                    }
                }
            ],
        };

        await createMicroservice(testMicroserviceOne);
        await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: false,
                cache: [],
                uncache: [],
                toDelete: true,
                path: '/v1/test',
                method: 'GET',
                pathRegex: /^\/v1\/test(?:\/(?=$))?$/i,
                redirect: [
                    {
                        microservice: 'test1',
                        method: 'GET',
                        path: '/api/v1/test',
                        url: 'http://test-microservice-one:8000',
                        filters: []
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
                toDelete: false,
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
                toDelete: false,
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

        const response = await requester.get(`/api/v1/endpoint`)
            .send()
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('array').and.have.lengthOf(3);
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
