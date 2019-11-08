const Koa = require('koa');
const logger = require('logger');
const koaLogger = require('koa-logger');
const koaBody = require('koa-body');
const config = require('config');
const mongoose = require('mongoose');
const loader = require('loader');
const path = require('path');
const convert = require('koa-convert');
const sleep = require('sleep');
const cors = require('@koa/cors');
const koaSimpleHealthCheck = require('koa-simple-healthcheck');
const mongooseOptions = require('../../config/mongoose');

// const nock = require('nock');
// nock.recorder.rec();

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;

const koaBodyMiddleware = koaBody({
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

let retries = 10;

async function init() {
    return new Promise((resolve, reject) => {
        async function onDbReady(err) {
            if (err) {
                if (retries >= 0) {
                    // eslint-disable-next-line no-plusplus
                    retries--;
                    logger.error(`Failed to connect to MongoDB uri ${mongoUri}, retrying...`);
                    sleep.sleep(5);
                    mongoose.connect(mongoUri, mongooseOptions, onDbReady);
                } else {
                    logger.error('MongoURI', mongoUri);
                    logger.error(err);
                    reject(new Error(err));
                }

                return;
            }

            logger.info('Executing migration...');
            try {
                await require('migrations/init')(); // eslint-disable-line global-require
            } catch (Err) {
                logger.error(Err);
            }

            const app = new Koa();
            app.use(cors({
                credentials: true
            }));

            app.use(convert(koaBodyMiddleware));
            await loader.loadPlugins(app);
            app.use(koaLogger());
            app.use(koaSimpleHealthCheck());

            loader.loadRoutes(app);
            app.use(require('routes/dispatcher.js').middleware()); // eslint-disable-line global-require

            const server = app.listen(process.env.PORT);
            logger.info('Server started in ', process.env.PORT);
            resolve({ app, server });
        }

        logger.info(`Connecting to MongoDB URL ${mongoUri}`);
        mongoose.connect(mongoUri, mongooseOptions, onDbReady);
    });
}

module.exports = init;
