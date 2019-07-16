const nock = require('nock');
const { TOKENS, microserviceTest } = require('./test.constants');
const { initHelpers } = require('./utils');
const { getTestAgent, closeTestAgent } = require('./test-server');
const Microservice = require('models/microservice.model');
const Endpoint = require('models/endpoint.model');

const helpers = initHelpers(getTestAgent);

let requester;

const getListEndpoints = () => requester
    .get('/api/v1/endpoint')
    .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
    .send();

const createMicroservice = () => requester
    .post('/api/v1/microservice')
    .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
    .send(microserviceTest);

const openEnpoint = endpoint => requester
    .get(endpoint)
    .send();

describe('Endpoints calls', () => {
    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
        helpers.setRequester(requester);
        nock.cleanAll();
    });

    it('Getting a list of endpoints without being authenticated should fail', helpers.isTokenRequired('get', 'plugin'));
    it('Getting a list of endpoints authenticated not as admin fail', helpers.isAdminOnly('get', 'plugin'));
    it('Getting a list of endpoints without creating microservice should return empty array', async () => {
        const response = await getListEndpoints();

        response.status.should.equal(200);
        response.body.should.instanceof(Array).and.lengthOf(0);
    });
    it('Getting a list of endpoints with created microservice should return the result', async () => {
        await createMicroservice();

        const resEndpoints = await getListEndpoints();
        resEndpoints.status.should.equal(200);
        resEndpoints.body.should.instanceof(Array).and.length.above(0);
    });
    it('Created endpoint should open', async () => {
        const resEndpoints = await getListEndpoints();
        const result = await openEnpoint(resEndpoints.body[0].path);
        result.status.should.equal(200);
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(async () => {
        Microservice.deleteMany({}).exec();
        Endpoint.deleteMany({}).exec();

        closeTestAgent();
    });
});
