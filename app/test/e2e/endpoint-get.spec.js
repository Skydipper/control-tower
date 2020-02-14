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

        const response = await requester.get(`/api/v1/endpoint`)
            .send()
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('array').and.have.lengthOf(3);
    });

    it('Getting endpoints with filter should return a list of endpoints that match the filter - authenticated', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const endpointOne = await createEndpoint(
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
        const endpointTwo = await createEndpoint(
            {
                pathKeys: [],
                authenticated: true,
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
        const endpointThree = await createEndpoint(
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

        const responseOne = await requester
            .get(`/api/v1/endpoint`)
            .query({ authenticated: true })
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.be.an('array').and.have.lengthOf(1);
        responseOne.body.map((element) => element._id).should.have.members([endpointTwo._id.toString()]);

        const responseTwo = await requester
            .get(`/api/v1/endpoint`)
            .query({ authenticated: false })
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.be.an('array').and.have.lengthOf(2);
        responseTwo.body.map((element) => element._id).should.have.members([endpointOne._id.toString(), endpointThree._id.toString()]);
    });

    it('Getting endpoints with filter should return a list of endpoints that match the filter - applicationRequired', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const endpointOne = await createEndpoint(
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
        const endpointTwo = await createEndpoint(
            {
                pathKeys: [],
                authenticated: true,
                applicationRequired: true,
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
        const endpointThree = await createEndpoint(
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

        const responseOne = await requester
            .get(`/api/v1/endpoint`)
            .query({ applicationRequired: true })
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.be.an('array').and.have.lengthOf(1);
        responseOne.body.map((element) => element._id).should.have.members([endpointTwo._id.toString()]);

        const responseTwo = await requester
            .get(`/api/v1/endpoint`)
            .query({ applicationRequired: false })
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.be.an('array').and.have.lengthOf(2);
        responseTwo.body.map((element) => element._id).should.have.members([endpointOne._id.toString(), endpointThree._id.toString()]);
    });

    it('Getting endpoints with filter should return a list of endpoints that match the filter - binary', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const endpointOne = await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: true,
                cache: [],
                uncache: [],
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
        const endpointTwo = await createEndpoint(
            {
                pathKeys: [],
                authenticated: true,
                applicationRequired: true,
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
        const endpointThree = await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: true,
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

        const responseOne = await requester
            .get(`/api/v1/endpoint`)
            .query({ binary: false })
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.be.an('array').and.have.lengthOf(1);
        responseOne.body.map((element) => element._id).should.have.members([endpointTwo._id.toString()]);

        const responseTwo = await requester
            .get(`/api/v1/endpoint`)
            .query({ binary: true })
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.be.an('array').and.have.lengthOf(2);
        responseTwo.body.map((element) => element._id).should.have.members([endpointOne._id.toString(), endpointThree._id.toString()]);
    });

    it('Getting endpoints with filter should return a list of endpoints that match the filter - path', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const endpointOne = await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: true,
                cache: [],
                uncache: [],
                path: '/v1/testOne',
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
                authenticated: true,
                applicationRequired: true,
                binary: false,
                cache: [],
                uncache: [],
                path: '/v1/testTwo',
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
        const endpointThree = await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: true,
                cache: [],
                uncache: [],
                path: '/v1/testThree',
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

        const responseOne = await requester
            .get(`/api/v1/endpoint`)
            .query({ path: '/v1/testOne' })
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.be.an('array').and.have.lengthOf(1);
        responseOne.body.map((element) => element._id).should.have.members([endpointOne._id.toString()]);

        const responseTwo = await requester
            .get(`/api/v1/endpoint`)
            .query({ path: '/v1/testThree' })
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.be.an('array').and.have.lengthOf(1);
        responseTwo.body.map((element) => element._id).should.have.members([endpointThree._id.toString()]);
    });

    it('Getting endpoints with filter should return a list of endpoints that match the filter - method', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const endpointOne = await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: true,
                cache: [],
                uncache: [],
                path: '/v1/testOne',
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
        const endpointTwo = await createEndpoint(
            {
                pathKeys: [],
                authenticated: true,
                applicationRequired: true,
                binary: false,
                cache: [],
                uncache: [],
                path: '/v1/testTwo',
                method: 'POST',
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
        const endpointThree = await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: true,
                cache: [],
                uncache: [],
                path: '/v1/testThree',
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

        const responseOne = await requester
            .get(`/api/v1/endpoint`)
            .query({ method: 'POST' })
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.be.an('array').and.have.lengthOf(1);
        responseOne.body.map((element) => element._id).should.have.members([endpointTwo._id.toString()]);

        const responseTwo = await requester
            .get(`/api/v1/endpoint`)
            .query({ method: 'GET' })
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.be.an('array').and.have.lengthOf(2);
        responseTwo.body.map((element) => element._id).should.have.members([endpointOne._id.toString(), endpointThree._id.toString()]);
    });

    it('Getting endpoints with filter should return a list of endpoints that match the filter - multiple filters use AND logic', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: true,
                cache: [],
                uncache: [],
                path: '/v1/testOne',
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
        const endpointTwo = await createEndpoint(
            {
                pathKeys: [],
                authenticated: true,
                applicationRequired: true,
                binary: false,
                cache: [],
                uncache: [],
                path: '/v1/testTwo',
                method: 'POST',
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
        const endpointThree = await createEndpoint(
            {
                pathKeys: [],
                authenticated: false,
                applicationRequired: false,
                binary: true,
                cache: [],
                uncache: [],
                path: '/v1/testThree',
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

        const responseOne = await requester
            .get(`/api/v1/endpoint`)
            .query({ method: 'POST', path: '/v1/testTwo' })
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.be.an('array').and.have.lengthOf(1);
        responseOne.body.map((element) => element._id).should.have.members([endpointTwo._id.toString()]);

        const responseTwo = await requester
            .get(`/api/v1/endpoint`)
            .query({ method: 'GET', path: '/v1/testThree' })
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.be.an('array').and.have.lengthOf(1);
        responseTwo.body.map((element) => element._id).should.have.members([endpointThree._id.toString()]);
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
