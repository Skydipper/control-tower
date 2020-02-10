const logger = require('logger');
const nock = require('nock');
const chai = require('chai');

const Microservice = require('models/microservice.model');
const Endpoint = require('models/endpoint.model');

const { getTestAgent, closeTestAgent } = require('./test-server');
const { createUserAndToken } = require('./utils/helpers');

let requester;

const should = chai.should();

describe('Microservices endpoints', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        Microservice.deleteMany({}).exec();
        Endpoint.deleteMany({}).exec();

        nock.cleanAll();
    });

    /* Register a microservice */
    it('Registering a microservice should be successful', async () => {
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

        const microservice = await Microservice.find();
        microservice.should.have.lengthOf(1);

        const endpoints = await Endpoint.find({ toDelete: false });
        endpoints.should.have.lengthOf(1);

        const deletedEndpoints = await Endpoint.find({ toDelete: true });
        deletedEndpoints.should.have.lengthOf(0);
    });

    it('Updating info for an existing microservice should be successful', async () => {
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
                        path: '/api/v1/testTwo'
                    }
                }]
            });

        const response = await requester.post(`/api/v1/microservice`).send(testMicroserviceOne);

        response.status.should.equal(200);
        response.body.status.should.equal('active');

        const microservice = await Microservice.find();
        microservice.should.have.lengthOf(1);

        const endpoints = await Endpoint.find({ toDelete: false });
        endpoints.should.have.lengthOf(3);

        const deletedEndpoints = await Endpoint.find({ toDelete: true });
        deletedEndpoints.should.have.lengthOf(0);
    });

    it('Authorized status check and registered microservice (happy case)', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester.get(`/api/v1/microservice`)
            .send()
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
    });

    it('Deleting a microservice should delete endpoints and delete microservice document in the database (happy case)', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        (await Microservice.find()).should.have.lengthOf(1);
        (await Endpoint.find({ toDelete: true })).should.have.lengthOf(0);

        const existingMicroservice = await requester.get(`/api/v1/microservice`)
            .set('Authorization', `Bearer ${token}`)
            .send();

        const response = await requester.delete(`/api/v1/microservice/${existingMicroservice.body[0]._id}`)
            .send()
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);

        (await Endpoint.find({ toDelete: true })).should.have.lengthOf(2);
        (await Endpoint.find({ toDelete: false })).should.have.lengthOf(1);
    });

    it('Getting endpoints for registered microservices should return a list of available endpoints (happy case)', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester.get(`/api/v1/endpoint`)
            .send()
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('array').and.have.lengthOf(3);
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(() => {
        Microservice.deleteMany({}).exec();
        Endpoint.deleteMany({}).exec();

        closeTestAgent();
    });
});
