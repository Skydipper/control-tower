const Plugin = require('models/plugin.model');
const mongoose = require('mongoose');
const config = require('config');
const ObjectId = require('mongoose').Types.ObjectId;

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;
const getUUID = () => Math.random().toString(36).substring(7);

const createUser = (apps = ['rw']) => ({
    _id: new ObjectId(),
    email: 'microservice@control-tower.com',
    password: '$password.hash',
    salt: '$password.salt',
    extraUserData: {
        apps
    },
    createdAt: '2019-02-12T10:27:24.001Z',
    role: 'USER',
    provider: 'local',
    userToken: 'myUserToken'
});

async function setPluginSetting(pluginName, settingKey, settingValue) {
    return new Promise((resolve, reject) => {
        async function onDbReady(err) {
            if (err) {
                reject(new Error(err));
            }

            const plugin = await Plugin.findOne({ name: pluginName }).exec();
            if (!plugin) {
                reject(`Plugin '${pluginName}' could not be found.`);
            }

            const newConfig = {};
            const pluginObjkey = `config.${settingKey}`;
            newConfig[pluginObjkey] = settingValue;

            return Plugin.update({ name: pluginName }, { $set: newConfig }).exec().then(resolve);
        }

        mongoose.connect(mongoUri, onDbReady);
    });
}

module.exports = {
    createUser,
    setPluginSetting,
    getUUID
};
