const logger = require('logger');
const nock = require('nock');
const chai = require('chai');

const Microservice = require('models/microservice.model');
const Endpoint = require('models/endpoint.model');

const { getTestAgent, closeTestAgent } = require('./test-server');
const { TOKENS } = require('./test.constants');

const should = chai.should();

let requester;


describe('Microservices endpoints - GET endpoints', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        Microservice.deleteMany({}).exec();
        Endpoint.deleteMany({}).exec();

        nock.cleanAll();
    });

    it('Getting a list of microservices without being authenticated should fail', async () => {
        const response = await requester.get(`/api/v1/microservice`).send();
        response.status.should.equal(401);
    });

    it('Getting a list of microservices should return empty if no services are registered', async () => {
        const response = await requester
            .get(`/api/v1/microservice`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .send();

        response.status.should.equal(200);
        response.body.should.be.an.instanceOf(Array).and.have.lengthOf(0);
    });

    it('Get documentation for existing endpoints should be successful (happy case)', async () => {
        const response = await requester.get(`/api/v1/doc/swagger`)
            .send()
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`);

        response.status.should.equal(200);
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
