const Plugin = require('models/plugin.model');
const mongoose = require('mongoose');
const config = require('config');
const { ObjectId } = require('mongoose').Types;
const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const VersionModel = require('models/version.model');
const appConstants = require('app.constants');
// eslint-disable-next-line import/order
const JWT = require('jsonwebtoken');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const TempUserModel = require('plugins/sd-ct-oauth-plugin/models/user-temp.model');
const PluginModel = require('models/plugin.model');
const { endpointTest } = require('../test.constants');
const mongooseOptions = require('../../../../config/mongoose');

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;
const getUUID = () => Math.random().toString(36).substring(7);

const createUser = (userData) => ({
    _id: new ObjectId(),
    name: `${getUUID()} name`,
    email: `${getUUID()}@control-tower.com`,
    password: '$password.hash',
    salt: '$password.salt',
    extraUserData: {
        apps: ['rw']
    },
    role: 'USER',
    provider: 'local',
    userToken: 'myUserToken',
    photo: `http://photo.com/${getUUID()}.jpg`,
    ...userData
});

const createTokenForUser = (tokenData) => JWT.sign(tokenData, process.env.JWT_SECRET);

const createUserInDB = async (userData) => {
    // eslint-disable-next-line no-undef
    const user = await new UserModel(createUser(userData)).save();

    return {
        id: user._id,
        role: user.role,
        provider: user.provider,
        email: user.email,
        extraUserData: user.extraUserData,
        createdAt: Date.now(),
        photo: user.photo,
        name: user.name
    };
};

const createUserAndToken = async (userData) => {
    const user = await createUserInDB(userData);
    const token = createTokenForUser(user);

    return { user, token };
};

const getUserFromToken = (token, isString = true) => {
    const userData = JWT.verify(token, process.env.JWT_SECRET);
    return isString ? JSON.stringify(userData) : userData;
};

const createPlugin = async (pluginData) => (PluginModel({
    name: 'test plugin name',
    description: 'test plugin description',
    mainFile: 'test plugin main file',
    cronFile: 'test plugin cron file',
    active: false,
    config: {},
    ...pluginData
}).save());


const createTempUser = async (userData) => (TempUserModel({
    _id: new ObjectId(),
    email: `${getUUID()}@control-tower.com`,
    password: '$password.hash',
    salt: '$password.salt',
    extraUserData: {
        apps: []
    },
    createdAt: '2019-02-12T10:27:24.001Z',
    role: 'USER',
    confirmationToken: getUUID(),
    ...userData
}).save());

const createMicroservice = async (microserviceData) => (MicroserviceModel({
    name: 'test microservice name',
    url: 'http://microservice.com',
    status: 'active',
    version: 1,
    endpoints: [],
    ...microserviceData
}).save());

const isAdminOnly = async (requester, method, url) => {
    const { token: managerToken } = await createUserAndToken({ role: 'MANAGER' });
    const { token: userToken } = await createUserAndToken({ role: 'USER' });


    const request = (token) => requester[method](`/api/v1/${url}`)
        .set('Authorization', `Bearer ${token}`);

    const validate = (res) => {
        res.status.should.equal(403);
        res.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    };

    const responses = await Promise.all([request(userToken), request(managerToken)]);
    responses.map(validate);
};

const isTokenRequired = async (requester, method, url) => {
    const response = await requester[method](`/api/v1/${url}`);

    response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    response.status.should.equal(401);
};


const ensureCorrectError = ({ body }, errMessage, expectedStatus) => {
    body.should.have.property('errors').and.be.an('array');
    body.errors[0].should.have.property('detail').and.equal(errMessage);
    body.errors[0].should.have.property('status').and.equal(expectedStatus);
};

const updateVersion = () => VersionModel.updateOne({
    name: appConstants.ENDPOINT_VERSION,
}, {
    $set: {
        lastUpdated: new Date(),
    }
});

const createEndpoint = (endpoint) => new EndpointModel({ ...endpointTest, ...endpoint }).save();

async function setPluginSetting(pluginName, settingKey, settingValue) {
    return new Promise((resolve, reject) => {
        async function onDbReady(err) {
            if (err) {
                reject(new Error(err));
            }

            const plugin = await Plugin.findOne({ name: pluginName }).exec();
            if (!plugin) {
                reject(new Error(`Plugin '${pluginName}' could not be found.`));
            }

            const newConfig = {};
            const pluginObjectKey = `config.${settingKey}`;
            newConfig[pluginObjectKey] = settingValue;

            return Plugin.updateOne({ name: pluginName }, { $set: newConfig }).exec().then(resolve);
        }

        mongoose.connect(mongoUri, mongooseOptions, onDbReady);
    });
}

module.exports = {
    createUser,
    setPluginSetting,
    updateVersion,
    getUUID,
    ensureCorrectError,
    createEndpoint,
    createUserAndToken,
    createUserInDB,
    createPlugin,
    createMicroservice,
    createTempUser,
    getUserFromToken,
    isTokenRequired,
    isAdminOnly
};
