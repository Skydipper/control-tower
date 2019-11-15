const passport = require('koa-passport');
const logger = require('logger');
const mongoose = require('mongoose');
const jwt = require('koa-jwt');
const views = require('koa-views');
const passportService = require('./services/passport.service');
const apiRouter = require('./auth.router');
const authServiceFunc = require('./services/auth.service');
const mongooseOptions = require('../../../../config/mongoose');

function init() {

}

function middleware(app, plugin, generalConfig) {
    logger.info('Loading oauth-plugin');
    const connection = mongoose.createConnection(`${generalConfig.mongoUri}`, mongooseOptions);
    const AuthService = authServiceFunc(plugin, connection);
    app.use(views(`${__dirname}/views`, { extension: 'ejs' }));
    passportService(plugin, connection);
    app.use(passport.initialize());
    app.use(passport.session());

    const getToken = (ctx, opts) => {
        // External requests use the standard 'authorization' header, but internal requests use 'authentication' instead
        // so we need a custom function to load the token. Why don't we use authorization on both will always elude me...

        if (!ctx.header || (!ctx.header.authorization && !ctx.header.authentication)) {
            return;
        }

        if (ctx.header.authentication) {
            // eslint-disable-next-line consistent-return
            return ctx.header.authentication;
        }

        const parts = ctx.header.authorization.split(' ');

        if (parts.length === 2) {
            const scheme = parts[0];
            const credentials = parts[1];

            if (/^Bearer$/i.test(scheme)) {
                // eslint-disable-next-line consistent-return
                return credentials;
            }
        }
        if (!opts.passthrough) {
            ctx.throw(401, 'Bad Authorization header format. Format is "Authorization: Bearer <token>"');
        }
    };

    if (plugin.config.jwt.active) {
        logger.info('JWT active');
        app.use(jwt({
            secret: plugin.config.jwt.secret,
            passthrough: plugin.config.jwt.passthrough,
            isRevoked: AuthService.checkRevokedToken,
            getToken
        }));

        // eslint-disable-next-line consistent-return
        app.use(async (ctx, next) => {
            if (ctx.state.jwtOriginalError && ctx.state.jwtOriginalError.message === 'Token revoked') {
                return ctx.throw(401, 'Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.');
            }
            if (ctx.state.jwtOriginalError && ctx.state.jwtOriginalError.message === 'jwt malformed') {
                return ctx.throw(401, 'Your token is invalid. Please use /auth/login to login and /auth/generate-token to generate a new token.');
            }

            await next();
        });
    }

    app.use(apiRouter(plugin, connection, generalConfig).middleware());

}


module.exports = {
    middleware,
    init,
};
