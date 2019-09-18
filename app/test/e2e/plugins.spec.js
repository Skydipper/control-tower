const nock = require('nock');
const { TOKENS } = require('./test.constants');
const { initHelpers } = require('./utils');
const { getTestAgent, closeTestAgent } = require('./test-server');

const helpers = initHelpers(getTestAgent);

let requester;
let pluginId;

const getListPlugins = async () => requester
    .get('/api/v1/plugin')
    .set('Authorization', `Bearer ${TOKENS.ADMIN}`);

const updatePlugin = data => requester
    .patch(`/api/v1/plugin/${pluginId}`)
    .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
    .send(data);

describe('Plugins calls', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
        helpers.setRequester(requester);
        nock.cleanAll();
    });

    it('Getting a list of plugins without being authenticated should fail with a 401 error', helpers.isTokenRequired('get', 'plugin'));

    it('Getting a list of plugins authenticated without ADMIN role should fail with a 403 error', helpers.isAdminOnly('get', 'plugin'));

    it('Getting a list of plugins should return the result by default', async () => {
        const response = await getListPlugins();

        response.body.should.be.an('array').and.length.above(0);
        pluginId = response.body[0]._id; // set plugin id for future update requests
    });

    it('Update plugin without being authenticated should fail with a 401 error', () => helpers.isTokenRequired('patch', `plugin/${pluginId}`)());

    it('Update plugin authenticated without ADMIN role should fail with a 403 error', () => helpers.isAdminOnly('patch', `plugin/${pluginId}`)());

    it('Update plugin authenticated should update', async () => {
        const newData = {
            active: false,
            config: {
                jsonAPIErrors: false,
            }
        };

        const response = await updatePlugin(newData);
        response.status.should.equal(200);
        response.body.active.should.equal(newData.active);
        response.body.config.should.deep.equal(newData.config);

        const newList = await getListPlugins();

        newList.status.should.equal(200);
        newList.body[0].active.should.equal(newData.active);
        newList.body[0].config.should.deep.equal(newData.config);
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(async () => {
        const previousData = {
            active: true,
            config: {
                jsonAPIErrors: true,
            }
        };
        await updatePlugin(previousData);

        closeTestAgent();
    });
});
