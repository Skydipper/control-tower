const logger = require('logger');
const nock = require('nock');
const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const { microserviceTest } = require('./test.constants');
const { isTokenRequired, isAdminOnly, createUserAndToken } = require('./utils/helpers');
const { getTestAgent, closeTestAgent } = require('./test-server');

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

describe('Microservice status calls', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Getting a list of statuses without being authenticated should fail with a 401 error', async () => isTokenRequired(requester, 'get', 'plugin'));

    it('Getting a list of statuses authenticated without ADMIN role should fail with a 403 error', async () => isAdminOnly(requester, 'get', 'plugin'));

    it('Getting a list of statuses with created microservice should return empty array', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const list = await requester
            .get('/api/v1/microservice/status')
            .set('Authorization', `Bearer ${token}`);
        list.status.should.equal(200);
        list.body.should.be.an('array').and.lengthOf(0);
    });

    it('Getting a list of statuses with created microservice should return the result', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        await createMicroservice();

        const list = await requester
            .get('/api/v1/microservice/status')
            .set('Authorization', `Bearer ${token}`);

        list.status.should.equal(200);
        list.body.should.be.an('array').and.length.above(0);

        list.body[0].should.deep.equal({
            status: 'active',
            name: 'test-microservice-one'
        });
    });

    afterEach(async () => {
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();
        await UserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(closeTestAgent);
});
