const nock = require('nock');

const Microservice = require('models/microservice.model');
const Endpoint = require('models/endpoint.model');
const { TOKENS } = require('./test.constants');

const { getTestAgent, closeTestAgent } = require('./test-server');

let requester;


describe('Endpoint calls', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        Microservice.deleteMany({}).exec();
        Endpoint.deleteMany({}).exec();

        nock.cleanAll();
    });

    it('Getting an endpoint that doesn\'t exist should return a 404', async () => {
        const response = await requester.get(`/api/v1/foo`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(404);
        response.body.errors[0].detail.should.equal('Endpoint not found');
    });

    it('Getting an authenticated endpoint without an auth token should return a 401', async () => {
        const response = await requester.get(`/api/v1/microservice`);

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not authenticated');
    });

    it('Getting an ADMIN endpoint with a USER token should return a 401', async () => {
        const response = await requester
            .get(`/api/v1/microservice`)
            .set('Authorization', `Bearer ${TOKENS.USER}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
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
