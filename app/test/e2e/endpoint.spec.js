const nock = require('nock');
const { TOKENS, microserviceTest, endpointTest } = require('./test.constants');
const { initHelpers } = require('./utils');
const { getTestAgent, closeTestAgent } = require('./test-server');
const Microservice = require('models/microservice.model');
const Endpoint = require('models/endpoint.model');
const logger = require('logger');

const helpers = initHelpers(getTestAgent);

let requester;

const getListEndpoints = () => requester
    .get('/api/v1/endpoint')
    .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
    .send();

const createMicroservice = () => {
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
        .reply(200, microserviceTest);

    return requester.post('/api/v1/microservice').send(testMicroserviceOne);
};

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

    it('Create microservice using an API call, validate that endpoints are created using Mongoose.', async () => {
        await createMicroservice();

        const resEndpoints = await getListEndpoints();
        resEndpoints.status.should.equal(200);
        resEndpoints.body.should.instanceof(Array).and.length.above(0);
    });
    it('Create endpoints using mongoose, validate that the GET endpoint returns those endpoints', async () => {
        await new Endpoint(endpointTest).save();

        const resEndpoints = await getListEndpoints();
        resEndpoints.status.should.equal(200);
        resEndpoints.body.should.instanceof(Array).and.length.above(0);
    });

    afterEach(() => {
        Microservice.deleteMany({}).exec();
        Endpoint.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(closeTestAgent);
});
