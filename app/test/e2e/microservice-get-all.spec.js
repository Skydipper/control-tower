const nock = require('nock');
const chai = require('chai');

const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUserAndToken, createMicroservice } = require('./utils/helpers');
const { getTestAgent, closeTestAgent } = require('./test-server');

chai.should();

let requester;


describe('Microservices endpoints - Get all', () => {

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

    it('Getting a list of microservices without being authenticated should fail', async () => {
        const response = await requester.get(`/api/v1/microservice`);
        response.status.should.equal(401);
    });

    it('Getting a list of microservices should return empty if no services are registered', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/api/v1/microservice`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('array').and.have.lengthOf(0);
    });

    it('Getting a list of microservices should return a microservice list (happy case)', async () => {
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

        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/api/v1/microservice`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('array').and.have.lengthOf(2);
    });

    it('Getting a list of microservices filtered by status should return the microservices that match that status', async () => {
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

        const microserviceOne = await createMicroservice(testMicroserviceOne);
        await createMicroservice(testMicroserviceTwo);

        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/api/v1/microservice`)
            .query({ status: 'pending' })
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('array').and.have.lengthOf(1);
        response.body[0].should.have.property('_id').and.equal(microserviceOne.id);
    });

    it('Getting a list of microservices filtered by url should return the microservices that match that url', async () => {
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

        const microserviceOne = await createMicroservice(testMicroserviceOne);
        await createMicroservice(testMicroserviceTwo);

        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/api/v1/microservice`)
            .query({ url: 'http://test-microservice-one:8000' })
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('array').and.have.lengthOf(1);
        response.body[0].should.have.property('_id').and.equal(microserviceOne.id);
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(() => {
        closeTestAgent();
    });
});
