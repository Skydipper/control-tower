const Plugin = require('models/plugin.model');
const Microservice = require('models/microservice.model');
const Endpoint = require('models/endpoint.model');
const Version = require('models/version.model');
const appConstants = require('app.constants');
const logger = require('logger');

module.exports = async function init() {
    const version = await Version.find();
    if (version && version.length > 0) {
        logger.info('Database ready!!');
        return;
    }

    logger.info('Initializing migration');
    await Plugin.deleteMany({});
    logger.info('Creating new plugins');
    await new Plugin({
        name: 'timeRequest',
        description: 'Show time of the request',
        mainFile: 'plugins/timeRequest',
        active: true,
    }).save();
    await new Plugin({
        name: 'manageErrors',
        description: 'Manage Errors',
        mainFile: 'plugins/manageErrors',
        active: true,
        config: {
            jsonAPIErrors: true,
        },
    }).save();
    await new Plugin({
        name: 'cors',
        description: 'Add CORS Headers',
        mainFile: 'plugins/cors',
        active: true,
    }).save();
    await new Plugin({
        name: 'invalidateCacheEndpoint',
        description: 'Invalidate cache endpoints in varnish',
        mainFile: 'plugins/invalidate-cache',
        active: false,
    }).save();
    await new Plugin({
        name: 'formatter',
        description: 'Formatter response',
        mainFile: 'plugins/formatter',
        active: true,
    }).save();

    await new Plugin({
        name: 'statistics',
        description: 'Add statistics info',
        mainFile: 'plugins/sd-ct-statistics-plugin',
        active: true,
        cronFile: 'plugins/sd-ct-statistics-plugin/crons/cron',
    }).save();
    await new Plugin({
        name: 'sessionMongo',
        description: 'Add session support with mongodb',
        mainFile: 'plugins/sessionMongo',
        active: true,
        config: {
            cookieDomain: process.env.COOKIE_DOMAIN,
            sessionKey: process.env.SESSION_KEY || 'control-tower',
        },
    }).save();

    await new Plugin({
        name: 'oauth',
        description: 'Plugin oauth with passport',
        mainFile: 'plugins/sd-ct-oauth-plugin',
        active: true,
        config: {
            applications: {
                rw: {
                    name: 'RW API',
                    logo: 'https://resourcewatch.org/static/images/logo-embed.png',
                    principalColor: '#c32d7b',
                    sendNotifications: true,
                    emailSender: 'noreply@resourcewatch.org',
                    emailSenderName: 'RW API',
                    confirmUrlRedirect: 'http://resourcewatch.org'
                },
                gfw: {
                    name: 'GFW',
                    logo: 'https://www.globalforestwatch.org/packs/gfw-9c5fe396ee5b15cb5f5b639a7ef771bd.png',
                    principalColor: '#97be32',
                    sendNotifications: true,
                    emailSender: 'noreply@globalforestwatch.org',
                    emailSenderName: 'GFW',
                    confirmUrlRedirect: 'https://www.globalforestwatch.org'
                }
            },
            defaultApp: 'gfw',
            thirdParty: {
                rw: {
                    twitter: {
                        active: false,
                        consumerKey: process.env.RW_TWITTER_CONSUMER_KEY,
                        consumerSecret: process.env.RW_TWITTER_CONSUMER_SECRET,
                    },
                    google: {
                        active: false,
                        clientID: process.env.RW_GOOGLE_CLIENT_ID,
                        clientSecret: process.env.RW_GOOGLE_CLIENT_SECRET,
                        scope: ['https://www.googleapis.com/auth/plus.me', 'https://www.googleapis.com/auth/userinfo.email'],
                    },
                    facebook: {
                        active: false,
                        clientID: process.env.RW_FACEBOOK_CLIENT_ID,
                        clientSecret: process.env.RW_FACEBOOK_CLIENT_SECRET,
                        scope: ['email'],
                    },
                },
                prep: {
                    twitter: {
                        active: false,
                        consumerKey: process.env.PREP_TWITTER_CONSUMER_KEY,
                        consumerSecret: process.env.PREP_TWITTER_CONSUMER_SECRET,
                    },
                    google: {
                        active: false,
                        clientID: process.env.PREP_GOOGLE_CLIENT_ID,
                        clientSecret: process.env.PREP_GOOGLE_CLIENT_SECRET,
                        scope: ['https://www.googleapis.com/auth/plus.me', 'https://www.googleapis.com/auth/userinfo.email'],
                    },
                    facebook: {
                        active: false,
                        clientID: process.env.PREP_FACEBOOK_CLIENT_ID,
                        clientSecret: process.env.PREP_FACEBOOK_CLIENT_SECRET,
                        scope: ['email'],
                    },
                },
                gfw: {
                    twitter: {
                        active: false,
                        consumerKey: process.env.GFW_TWITTER_CONSUMER_KEY,
                        consumerSecret: process.env.GFW_TWITTER_CONSUMER_SECRET,
                    },
                    google: {
                        active: false,
                        clientID: process.env.GFW_GOOGLE_CLIENT_ID,
                        clientSecret: process.env.GFW_GOOGLE_CLIENT_SECRET,
                        scope: ['https://www.googleapis.com/auth/plus.me', 'https://www.googleapis.com/auth/userinfo.email'],
                    },
                    facebook: {
                        active: false,
                        clientID: process.env.GFW_FACEBOOK_CLIENT_ID,
                        clientSecret: process.env.GFW_FACEBOOK_CLIENT_SECRET,
                        scope: ['email'],
                    },
                }
            },
            local: {
                active: true,
                sparkpostKey: process.env.SPARKPOST_KEY,
                confirmUrlRedirect: process.env.CONFIRM_URL_REDIRECT,
                gfw: {
                    confirmUrlRedirect: process.env.CONFIRM_URL_REDIRECT,
                },
                rw: {
                    confirmUrlRedirect: process.env.CONFIRM_URL_REDIRECT,
                },
                prep: {
                    confirmUrlRedirect: process.env.CONFIRM_URL_REDIRECT,
                }
            },
            basic: {
                active: false,
                userId: process.env.BASICAUTH_USERNAME,
                password: process.env.BASICAUTH_PASSWORD,
                role: 'ADMIN',
            },
            jwt: {
                active: true,
                secret: process.env.JWT_SECRET,
                passthrough: true,
                expiresInMinutes: 0,
            },
            publicUrl: process.env.PUBLIC_URL,
            allowPublicRegistration: true
        },
        ordering: 2,
    }).save();

    await new Plugin({
        name: 'appKey',
        description: 'Application key authorization',
        mainFile: 'plugins/app-key',
        active: true,
        config: {
            headerName: 'app_key',
            secret: process.env.JWT_SECRET
        },
    }).save();
    await new Plugin({
        name: 'fastlyCache',
        description: 'Fastly Cache request',
        mainFile: 'plugins/fastly-cache',
        active: false,
        config: {
            key: process.env.FASTLY_APIKEY,
            serviceId: process.env.FASTLY_SERVICEID,
        },
    }).save();

    await new Plugin({
        name: 'readOnly',
        description: 'Turn on/off read-only mode for CT, blocking writes to the database.',
        mainFile: 'plugins/read-only',
        active: false,
        config: {
            blacklist: [],
            whitelist: [],
        },
        ordering: 1
    }).save();

    await Microservice.deleteMany({});
    await Endpoint.deleteMany({});
    await Version.deleteMany({});
    await new Version({ name: appConstants.ENDPOINT_VERSION, version: 1 }).save();
};
