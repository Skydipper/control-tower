const Koa = require('koa');
const logger = require('logger');
const koaLogger = require('koa-logger');
const config = require('config');
const mongoose = require('mongoose');
const loader = require('loader');
const path = require('path');
const convert = require('koa-convert');
const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;

const koaBody = require('koa-body')({
    multipart: true,
    jsonLimit: '50mb',
    formLimit: '50mb',
    textLimit: '50mb',
    formidable: {
        uploadDir: '/tmp',
        onFileBegin(name, file) {
            const folder = path.dirname(file.path);
            file.path = path.join(folder, file.name);
        },
    },
});

async function init() {
    return new Promise((resolve, reject) => {
        async function onDbReady(err) {
            if (err) {
                logger.error(err);
                reject(new Error(err));
            }
            // set promises in mongoose with bluebird
            mongoose.Promise = Promise;

            logger.info('Executing migration...');
            try {
                await require('migrations/init')(); // eslint-disable-line global-require
            } catch (Err) {
                logger.error(Err);
            }

            const app = new Koa();

            app.use(convert(koaBody));
            await loader.loadPlugins(app);
            app.use(koaLogger());

            loader.loadRoutes(app);
            app.use(require('routes/dispatcher.js').middleware()); // eslint-disable-line global-require

            const server = app.listen(process.env.PORT);
            logger.info('Server started in ', process.env.PORT);
            resolve({ app, server });
        }

        logger.info(`Connecting to MongoDB URL ${mongoUri}`);
        mongoose.connect(mongoUri, onDbReady);
    });
}

module.exports = init;
