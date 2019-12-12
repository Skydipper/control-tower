const nock = require('nock');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const PluginModel = require('models/plugin.model');
const {
    isAdminOnly, isTokenRequired, createUserAndToken, createPlugin
} = require('./utils/helpers');
const { getTestAgent, closeTestAgent } = require('./test-server');

let requester;

describe('Plugins calls', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Getting a list of plugins without being authenticated should fail with a 401 error', async () => isTokenRequired(requester, 'get', 'plugin'));

    it('Getting a list of plugins authenticated without ADMIN role should fail with a 403 error', async () => isAdminOnly(requester, 'get', 'plugin'));

    it('Getting a list of plugins should return the result by default', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get('/api/v1/plugin')
            .set('Authorization', `Bearer ${token}`);

        response.body.should.be.an('array').and.length.above(0);
    });

    it('Update plugin without being authenticated should fail with a 401 error', async () => {
        const plugin = await createPlugin();

        await isTokenRequired(requester, 'patch', `plugin/${plugin.id}`);
    });

    it('Update plugin authenticated without ADMIN role should fail with a 403 error', async () => {
        const plugin = await createPlugin();

        await isAdminOnly(requester, 'patch', `plugin/${plugin.id}`);
    });

    it('Update plugin authenticated should update', async () => {
        const plugin = await createPlugin();

        const loadedPlugin = await PluginModel.findById(plugin._id.toString());
        loadedPlugin._id.toString().should.equal(plugin._id.toString());

        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const newData = {
            active: false,
            config: {
                jsonAPIErrors: false,
            }
        };

        const response = await requester
            .patch(`/api/v1/plugin/${plugin.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send(newData);

        response.status.should.equal(200);
        response.body.active.should.equal(newData.active);
        response.body.config.should.deep.equal(newData.config);

        const newList = await requester
            .get('/api/v1/plugin')
            .set('Authorization', `Bearer ${token}`);

        newList.status.should.equal(200);

        const testPlugin = newList.body.find((iterator) => iterator._id === plugin._id.toString());

        testPlugin.active.should.equal(newData.active);
        testPlugin.config.should.deep.equal(newData.config);

        await plugin.delete();
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await PluginModel.deleteMany({ name: 'test plugin name' }).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(closeTestAgent);
});
