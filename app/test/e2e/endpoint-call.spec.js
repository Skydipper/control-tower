const nock = require('nock');

const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { getTestAgent, closeTestAgent } = require('./test-server');
const { createUserAndToken } = require('./utils/helpers');

let requester;


describe('EndpointModel calls', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        await UserModel.deleteMany({}).exec();
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();
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
        const { token } = await createUserAndToken({ role: 'USER' });

        const response = await requester
            .get(`/api/v1/microservice`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
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
