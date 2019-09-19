const logger = require('logger');
const nock = require('nock');
const Microservice = require('models/microservice.model');
const Endpoint = require('models/endpoint.model');
const { TOKENS, microserviceTest } = require('./test.constants');
const { initHelpers } = require('./utils');
const { getTestAgent, closeTestAgent } = require('./test-server');

const helpers = initHelpers(getTestAgent);

let requester;

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

const getListStatus = async () => requester
    .get('/api/v1/microservice/status')
    .set('Authorization', `Bearer ${TOKENS.ADMIN}`);

describe('Microservice status calls', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
        helpers.setRequester(requester);
        nock.cleanAll();
    });

    it('Getting a list of statuses without being authenticated should fail with a 401 error', helpers.isTokenRequired('get', 'plugin'));

    it('Getting a list of statuses authenticated without ADMIN role should fail with a 403 error', helpers.isAdminOnly('get', 'plugin'));

    it('Getting a list of statuses with created microservice should return empty array', async () => {
        const list = await getListStatus();
        list.status.should.equal(200);
        list.body.should.be.an('array').and.lengthOf(0);
    });

    it('Getting a list of statuses with created microservice should return the result', async () => {
        await createMicroservice();

        const list = await getListStatus();
        list.status.should.equal(200);
        list.body.should.be.an('array').and.length.above(0);

        list.body[0].should.deep.equal({
            status: 'active',
            name: 'test-microservice-one'
        });
    });

    afterEach(async () => {
        Microservice.deleteMany({}).exec();
        Endpoint.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(closeTestAgent);
});
