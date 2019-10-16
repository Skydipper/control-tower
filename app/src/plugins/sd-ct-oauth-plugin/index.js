const passport = require('koa-passport');
const debug = require('debug')('oauth-plugin');
const mongoose = require('mongoose');
const jwt = require('koa-jwt');
const views = require('koa-views');
const passportService = require('./services/passport.service');
const apiRouter = require('./auth.router');
const authServiceFunc = require('./services/auth.service');

function init() {

}

function middleware(app, plugin, generalConfig) {
    debug('Loading oauth-plugin');
    const connection = mongoose.createConnection(`${generalConfig.mongoUri}`);
    const AuthService = authServiceFunc(plugin, connection);
    app.use(views(`${__dirname}/views`, { extension: 'ejs' }));
    passportService(plugin, connection);
    app.use(passport.initialize());
    app.use(passport.session());

    if (plugin.config.jwt.active) {
        debug('JWT active');
        app.use(jwt({
            secret: plugin.config.jwt.secret,
            passthrough: plugin.config.jwt.passthrough,
            isRevoked: AuthService.checkRevokedToken
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
