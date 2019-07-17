const nock = require('nock');
const { TOKENS, endpointTest } = require('./test.constants');
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

describe('GET Endpoints', () => {
    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
        helpers.setRequester(requester);
        nock.cleanAll();
    });

    it('Getting a list of endpoints without being authenticated should fail with a 401 error', helpers.isTokenRequired('get', 'plugin'));

    it('Getting a list of endpoints authenticated without ADMIN role should fail with a 403 error', helpers.isAdminOnly('get', 'plugin'));

    it('Getting a list of endpoints without creating microservice should return empty array', async () => {
        const response = await getListEndpoints();

        response.status.should.equal(200);
        response.body.should.be.an('array').and.lengthOf(0);
    });

    it('Getting a list of endpoints should return those endpoints (happy case)', async () => {
        await new Endpoint(endpointTest).save();

        const resEndpoints = await getListEndpoints();
        resEndpoints.status.should.equal(200);
        resEndpoints.body.should.be.an('array').and.length.above(0);

        delete resEndpoints.body[0]._id;
        delete resEndpoints.body[0].redirect[0]._id;

        resEndpoints.body[0].should.deep.equal(
            {
                pathKeys: [],
                authenticated: true,
                applicationRequired: false,
                binary: false,
                cache: [],
                uncache: [],
                toDelete: false,
                path: '/v1/dataset',
                method: 'POST',
                pathRegex: {},
                redirect: [
                    {
                        filters: null,
                        method: 'POST',
                        path: '/api/v1/dataset',
                        url: 'http://mymachine:6001'
                    }
                ],
                version: 1
            }
        );
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
