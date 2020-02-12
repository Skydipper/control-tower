/* eslint-disable no-underscore-dangle */
const logger = require('logger');
const Router = require('koa-router');
const passport = require('koa-passport');
const { cloneDeep, omit } = require('lodash');
const authServiceFunc = require('./services/auth.service');
const UnprocessableEntityError = require('./errors/unprocessableEntity.error');
const UnauthorizedError = require('./errors/unauthorized.error');
const UserTempSerializer = require('./serializers/user-temp.serializer');
const UserSerializer = require('./serializers/user.serializer');

const serializeObjToQuery = (obj) => Object.keys(obj).reduce((a, k) => {
    a.push(`${k}=${encodeURIComponent(obj[k])}`);
    return a;
}, []).join('&');


module.exports = (plugin, connection, generalConfig) => {
    const ApiRouter = new Router({
        prefix: '/auth',
    });

    logger.info('Initializing services');
    const AuthService = authServiceFunc(plugin, connection);

    const getUser = (ctx) => ctx.req.user || ctx.state.user || ctx.state.microservice;

    const getOriginApp = (ctx, pluginData) => {
        if (ctx.query.origin) {
            return ctx.query.origin;
        }

        if (ctx.session && ctx.session.originApplication) {
            return ctx.session.originApplication;
        }

        return pluginData.config.defaultApp;
    };

    const getApplicationsConfig = (ctx, pluginData) => {
        const app = getOriginApp(ctx, pluginData);
        const applicationConfig = pluginData.config.applications && pluginData.config.applications[app];

        return applicationConfig;
    };

    const API = (function api() {
        const twitter = async (ctx) => {
            const app = getOriginApp(ctx, plugin);
            await passport.authenticate(`twitter:${app}`)(ctx);
        };

        const twitterCallback = async (ctx, next) => {
            const app = getOriginApp(ctx, plugin);
            await passport.authenticate(`twitter:${app}`, {
                failureRedirect: '/auth/fail',
            })(ctx, next);
        };

        const facebook = async (ctx) => {
            const app = getOriginApp(ctx, plugin);
            await passport.authenticate(`facebook:${app}`, {
                scope: plugin.config.thirdParty[app] ? plugin.config.thirdParty[app].facebook.scope : [],
            })(ctx);
        };

        const facebookToken = async (ctx, next) => {
            const app = getOriginApp(ctx, plugin);
            await passport.authenticate(`facebook-token:${app}`)(ctx, next);
        };

        const facebookCallback = async (ctx, next) => {
            const app = getOriginApp(ctx, plugin);
            await passport.authenticate(`facebook:${app}`, {
                failureRedirect: '/auth/fail',
            })(ctx, next);
        };

        const google = async (ctx) => {
            const app = getOriginApp(ctx, plugin);
            await passport.authenticate(`google:${app}`, {
                scope: (plugin.config.thirdParty[app] && plugin.config.thirdParty[app].google.scope) ? plugin.config.thirdParty[app].google.scope : ['openid'],
            })(ctx);
        };

        const googleToken = async (ctx, next) => {
            const app = getOriginApp(ctx, plugin);
            await passport.authenticate(`google-token:${app}`)(ctx, next);
        };

        const googleCallback = async (ctx, next) => {
            const app = getOriginApp(ctx, plugin);
            await passport.authenticate(`google:${app}`, {
                failureRedirect: '/auth/fail',
            })(ctx, next);
        };

        const localCallback = async (ctx) => passport.authenticate('local', async (user) => {
            if (!user) {
                if (ctx.request.type === 'application/json') {
                    ctx.status = 401;
                    ctx.body = {
                        errors: [{
                            status: 401,
                            detail: 'Invalid email or password'
                        }]
                    };
                    return;
                }

                ctx.redirect('/auth/fail?error=true');
                return;
            }

            if (ctx.request.type === 'application/json') {
                ctx.status = 200;
                logger.info('Generating token');
                const token = await AuthService.createToken(user, false);
                ctx.body = UserTempSerializer.serialize(user);
                ctx.body.data.token = token;
            } else {
                await ctx.logIn(user)
                    .then(() => ctx.redirect('/auth/success'))
                    .catch(() => ctx.redirect('/auth/fail?error=true'));
            }
        })(ctx);

        async function createToken(ctx, saveInUser) {
            logger.info('Generating token');
            return AuthService.createToken(getUser(ctx), saveInUser);
        }

        async function generateJWT(ctx) {
            logger.info('Generating token');
            try {
                const token = await createToken(ctx, true);
                ctx.body = {
                    token,
                };
            } catch (e) {
                logger.info(e);
            }
        }

        async function checkLogged(ctx) {
            if (getUser(ctx)) {
                const userToken = getUser(ctx);
                const user = await AuthService.getUserById(userToken.id);

                ctx.body = {
                    id: user._id,
                    name: user.name,
                    photo: user.photo,
                    provider: user.provider,
                    providerId: user.providerId,
                    email: user.email,
                    role: user.role,
                    createdAt: user.createdAt,
                    extraUserData: user.extraUserData
                };

            } else {
                ctx.res.statusCode = 401;
                ctx.throw(401, 'Not authenticated');
            }
        }

        async function getUsers(ctx) {
            logger.info('Get Users');
            const user = getUser(ctx);
            if (!user.extraUserData || !user.extraUserData.apps) {
                ctx.throw(403, 'Not authorized');
                return;
            }

            const { apps } = user.extraUserData;
            const { query } = ctx;

            const clonedQuery = { ...query };
            delete clonedQuery['page[size]'];
            delete clonedQuery['page[number]'];
            delete clonedQuery.ids;
            delete clonedQuery.loggedUser;
            const serializedQuery = serializeObjToQuery(clonedQuery) ? `?${serializeObjToQuery(clonedQuery)}&` : '?';
            const link = `${ctx.request.protocol}://${ctx.request.host}${ctx.request.path}${serializedQuery}`;

            let users;

            if (query.app === 'all') {
                users = await AuthService.getUsers(null, omit(query, ['app']));
            } else if (query.app) {
                users = await AuthService.getUsers(query.app.split(','), omit(query, ['app']));
            } else {
                users = await AuthService.getUsers(apps, query);
            }

            ctx.body = UserSerializer.serialize(users, link);
        }

        async function getUserById(ctx) {
            logger.info('Get User by id: ', ctx.params.id);

            const user = await AuthService.getUserById(ctx.params.id);

            if (!user) {
                ctx.throw(404, 'User not found');
                return;
            }
            ctx.body = user;
        }

        async function findByIds(ctx) {
            logger.info('Find by ids');
            ctx.assert(ctx.request.body.ids, 400, 'Ids objects required');
            const data = await AuthService.getUsersByIds(ctx.request.body.ids);
            ctx.body = {
                data
            };
        }

        async function getIdsByRole(ctx) {
            logger.info(`[getIdsByRole] Get ids by role: ${ctx.params.role}`);
            const data = await AuthService.getIdsByRole(ctx.params.role);
            ctx.body = {
                data
            };
        }

        async function updateUser(ctx) {
            logger.info(`Update user with id ${ctx.params.id}`);
            ctx.assert(ctx.params.id, 'Id param required');

            const user = getUser(ctx);

            const userUpdate = await AuthService.updateUser(ctx.params.id, ctx.request.body, user);
            if (!userUpdate) {
                ctx.throw(404, 'User not found');
                return;
            }
            ctx.body = UserSerializer.serialize(userUpdate);
        }

        async function updateMe(ctx) {
            logger.info(`Update user me`);

            const user = getUser(ctx);

            const userUpdate = await AuthService.updateUser(user.id, ctx.request.body, user);
            if (!userUpdate) {
                ctx.throw(404, 'User not found');
                return;
            }
            ctx.body = UserSerializer.serialize(userUpdate);
        }

        async function deleteUser(ctx) {
            logger.info(`Delete user with id ${ctx.params.id}`);
            ctx.assert(ctx.params.id, 'Id param required');

            const deletedUser = await AuthService.deleteUser(ctx.params.id);
            if (!deletedUser) {
                ctx.throw(404, 'User not found');
                return;
            }
            ctx.body = UserSerializer.serialize(deletedUser);
        }

        async function createUser(ctx) {
            logger.info(`Create user with body ${ctx.request.body}`);
            const { body } = ctx.request;
            const user = getUser(ctx);
            if (!user) {
                ctx.throw(401, 'Not logged');
                return;
            }

            if (user.role === 'MANAGER' && body.role === 'ADMIN') {
                logger.info('User is manager but the new user is admin');
                ctx.throw(403, 'Forbidden');
                return;
            }

            if (!body.extraUserData || !body.extraUserData.apps) {
                logger.info('Not send apps');
                ctx.throw(400, 'Apps required');
                return;
            }
            if (!user.extraUserData || !user.extraUserData.apps) {
                logger.info('logged user does not contain apps');
                ctx.throw(403, 'Forbidden');
                return;
            }

            const exist = await AuthService.existEmail(body.email);
            if (exist) {
                ctx.throw(400, 'Email exists');
                return;
            }

            // check Apps
            for (let i = 0, { length } = body.extraUserData.apps; i < length; i += 1) {
                if (user.extraUserData.apps.indexOf(body.extraUserData.apps[i]) < 0) {
                    ctx.throw(403, 'Forbidden');
                    return;
                }
            }

            await AuthService.createUserWithoutPassword(ctx.request.body, ctx.state.generalConfig);
            ctx.body = {};

        }

        async function success(ctx) {
            if (ctx.session.callbackUrl) {
                logger.info('Url redirect', ctx.session.callbackUrl);
                if (ctx.session.generateToken) {
                    // generate token and eliminate session
                    const token = await createToken(ctx, false);
                    if (ctx.session.callbackUrl.indexOf('?') > -1) {
                        ctx.redirect(`${ctx.session.callbackUrl}&token=${token}`);
                    } else {
                        ctx.redirect(`${ctx.session.callbackUrl}?token=${token}`);
                    }
                } else {
                    ctx.redirect(ctx.session.callbackUrl);
                }
                ctx.session.callbackUrl = null;
                ctx.session.generateToken = null;
                return;
            }
            ctx.session.callbackUrl = null;
            ctx.session.generateToken = null;
            await ctx.render('login-correct', {
                error: false,
                generalConfig: ctx.state.generalConfig,
            });
        }

        async function failAuth(ctx) {
            logger.info('Not authenticated');
            const originApp = getOriginApp(ctx, plugin);
            const appConfig = plugin.config.thirdParty[originApp];

            const thirdParty = {
                twitter: false,
                google: false,
                facebook: false,
                basic: false
            };

            if (appConfig.twitter && appConfig.twitter.active) {
                thirdParty.twitter = appConfig.twitter.active;
            }

            if (appConfig.google && appConfig.google.active) {
                thirdParty.google = appConfig.google.active;
            }

            if (appConfig.facebook && appConfig.facebook.active) {
                thirdParty.facebook = appConfig.facebook.active;
            }

            if (plugin.config.basic && plugin.config.basic.active) {
                thirdParty.basic = plugin.config.basic.active;
            }

            const { allowPublicRegistration } = plugin.config;
            if (ctx.query.error) {
                await ctx.render('login', {
                    error: true,
                    thirdParty,
                    generalConfig: ctx.state.generalConfig,
                    allowPublicRegistration
                });
            } else {
                ctx.throw(401, 'Not authenticated');
            }
        }

        async function logout(ctx) {
            ctx.logout();
            ctx.redirect('/auth/login');
        }

        async function signUp(ctx) {
            logger.info('Creating user');
            let error = null;
            if (!ctx.request.body.email || !ctx.request.body.password || !ctx.request.body.repeatPassword) {
                error = 'Email, Password and Repeat password are required';
            }
            if (ctx.request.body.password !== ctx.request.body.repeatPassword) {
                error = 'Password and Repeat password not equal';
            }
            const exist = await AuthService.existEmail(ctx.request.body.email);
            if (exist) {
                error = 'Email exists';
            }
            if (error) {
                if (ctx.request.type === 'application/json') {
                    throw new UnprocessableEntityError(error);
                } else {
                    await ctx.render('sign-up', {
                        error,
                        email: ctx.request.body.email,
                        generalConfig: ctx.state.generalConfig,
                    });

                }
                return;
            }

            try {
                const data = await AuthService.createUser(ctx.request.body, ctx.state.generalConfig);
                if (ctx.request.type === 'application/json') {
                    ctx.response.type = 'application/json';
                    ctx.body = UserTempSerializer.serialize(data);
                } else {
                    await ctx.render('sign-up-correct', {
                        generalConfig: ctx.state.generalConfig,
                    });
                }
            } catch (err) {
                logger.info('Error', err);
                await ctx.render('sign-up', {
                    error: 'Error creating user.',
                    email: ctx.request.body.email,
                    generalConfig: ctx.state.generalConfig,
                });
            }
        }

        async function getSignUp(ctx) {
            await ctx.render('sign-up', {
                error: null,
                email: null,
                generalConfig: ctx.state.generalConfig,
            });
        }

        async function confirmUser(ctx) {
            logger.info('Confirming user');
            const user = await AuthService.confirmUser(ctx.params.token);
            if (!user) {
                ctx.throw(400, 'User expired or token not found');
                return;
            }
            if (ctx.query.callbackUrl) {
                ctx.redirect(ctx.query.callbackUrl);
                return;
            }

            const userFirstApp = (user && user.extraUserData && user.extraUserData.apps && user.extraUserData.apps.length > 0) ? user.extraUserData.apps[0] : null;

            if (userFirstApp && plugin.config.local[userFirstApp] && plugin.config.local[userFirstApp].confirmUrlRedirect) {
                ctx.redirect(plugin.config.local[userFirstApp].confirmUrlRedirect);
                return;
            }

            if (plugin.config.local.confirmUrlRedirect) {
                ctx.redirect(plugin.config.local.confirmUrlRedirect);
                return;
            }
            ctx.body = UserSerializer.serialize(user);
        }

        async function loginView(ctx) {
            // check if the user has session
            const user = getUser(ctx);
            if (user) {
                logger.info('User has session');

                if (ctx.request.type === 'application/json') {
                    ctx.status = 200;
                    return;
                }

                ctx.redirect('/auth/success');
                return;
            }
            if (!user && ctx.request.type === 'application/json') {
                throw new UnauthorizedError('Not logged in');
            }

            const originApp = getOriginApp(ctx, plugin);
            const thirdParty = {
                twitter: false,
                google: false,
                facebook: false,
                basic: false
            };

            if (plugin.config.thirdParty && plugin.config.thirdParty[originApp] && plugin.config.thirdParty[originApp].twitter && plugin.config.thirdParty[originApp].twitter.active) {
                thirdParty.twitter = plugin.config.thirdParty[originApp].twitter.active;
            }

            if (plugin.config.thirdParty && plugin.config.thirdParty[originApp] && plugin.config.thirdParty[originApp].google && plugin.config.thirdParty[originApp].google.active) {
                thirdParty.google = plugin.config.thirdParty[originApp].google.active;
            }

            if (plugin.config.thirdParty && plugin.config.thirdParty[originApp] && plugin.config.thirdParty[originApp].facebook && plugin.config.thirdParty[originApp].facebook.active) {
                thirdParty.facebook = plugin.config.thirdParty[originApp].facebook.active;
            }

            if (plugin.config.basic && plugin.config.basic.active) {
                thirdParty.basic = plugin.config.basic.active;
            }

            const { allowPublicRegistration } = plugin.config;
            logger.info(thirdParty);
            await ctx.render('login', {
                error: false,
                thirdParty,
                generalConfig: ctx.state.generalConfig,
                allowPublicRegistration
            });
        }

        async function requestEmailResetView(ctx) {
            await ctx.render('request-mail-reset', {
                error: null,
                info: null,
                email: null,
                app: getOriginApp(ctx, plugin),
                generalConfig: ctx.state.generalConfig,
            });
        }

        async function redirectLogin(ctx) {
            ctx.redirect('/auth/login');
        }

        async function resetPasswordView(ctx) {
            const renew = await AuthService.getRenewModel(ctx.params.token);
            let error = null;
            if (!renew) {
                error = 'Token expired';
            }
            await ctx.render('reset-password', {
                error,
                app: getOriginApp(ctx, plugin),
                token: renew ? renew.token : null,
                generalConfig: ctx.state.generalConfig,
            });
        }

        async function sendResetMail(ctx) {
            logger.info('Send reset mail');
            if (!ctx.request.body.email) {
                if (ctx.request.type === 'application/json') {
                    throw new UnprocessableEntityError('Mail required');
                } else {
                    await ctx.render('request-mail-reset', {
                        error: 'Mail required',
                        info: null,
                        email: ctx.request.body.email,
                        app: getOriginApp(ctx, plugin),
                        generalConfig: ctx.state.generalConfig,
                    });

                    return;
                }
            }

            const originApp = getOriginApp(ctx, plugin);

            const renew = await AuthService.sendResetMail(ctx.request.body.email, ctx.state.generalConfig, originApp);
            if (!renew) {
                if (ctx.request.type === 'application/json') {
                    throw new UnprocessableEntityError('User not found');
                } else {
                    await ctx.render('request-mail-reset', {
                        error: 'User not found',
                        info: null,
                        email: ctx.request.body.email,
                        app: getOriginApp(ctx, plugin),
                        generalConfig: ctx.state.generalConfig,
                    });

                    return;
                }
            }

            if (ctx.request.type === 'application/json') {
                ctx.body = { message: 'Email sent' };
            } else {
                await ctx.render('request-mail-reset', {
                    info: 'Email sent!!',
                    error: null,
                    email: ctx.request.body.email,
                    app: getOriginApp(ctx, plugin),
                    generalConfig: ctx.state.generalConfig,
                });
            }
        }

        async function updateApplications(ctx) {
            try {
                if (ctx.session && ctx.session.applications) {
                    let user = getUser(ctx);
                    if (user.role === 'USER') {
                        user = await AuthService.updateApplicationsUser(user.id, ctx.session.applications);
                    } else {
                        user = await AuthService.getUserById(user.id);
                    }
                    delete ctx.session.applications;
                    if (user) {
                        ctx.login({
                            id: user._id,
                            provider: user.provider,
                            providerId: user.providerId,
                            role: user.role,
                            createdAt: user.createdAt,
                            extraUserData: user.extraUserData,
                            email: user.email,
                            photo: user.photo,
                            name: user.name
                        });
                    }
                }
                ctx.redirect('/auth/success');
            } catch (err) {
                logger.info(err);
                ctx.redirect('/auth/fail');
            }

        }

        async function resetPassword(ctx) {
            logger.info('Resetting password');
            let error = null;
            if (!ctx.request.body.password || !ctx.request.body.repeatPassword) {
                error = 'Password and Repeat password are required';
            }
            if (ctx.request.body.password !== ctx.request.body.repeatPassword) {
                error = 'Password and Repeat password not equal';
            }
            const exist = await AuthService.getRenewModel(ctx.params.token);
            if (!exist) {
                error = 'Token expired';
            }
            if (error) {
                if (ctx.request.type === 'application/json') {
                    throw new UnprocessableEntityError(error);
                } else {
                    await ctx.render('reset-password', {
                        error,
                        app: getOriginApp(ctx, plugin),
                        token: ctx.params.token,
                        generalConfig: ctx.state.generalConfig,
                    });
                }

                return;
            }
            const user = await AuthService.updatePassword(ctx.params.token, ctx.request.body.password);
            if (user) {
                if (ctx.request.type === 'application/json') {
                    ctx.response.type = 'application/json';
                    ctx.body = UserTempSerializer.serialize(user);
                } else {
                    const app = getOriginApp(ctx, plugin);
                    const applicationConfig = plugin.config.applications && plugin.config.applications[app];

                    if (applicationConfig && applicationConfig.confirmUrlRedirect) {
                        ctx.redirect(applicationConfig.confirmUrlRedirect);
                        return;
                    }
                    if (plugin.config.local.confirmUrlRedirect) {
                        ctx.redirect(plugin.config.local.confirmUrlRedirect);
                        return;
                    }
                    ctx.body = user;
                }
            } else {
                await ctx.render('reset-password', {
                    app: getOriginApp(ctx, plugin),
                    error: 'Error updating user',
                    token: ctx.params.token,
                    generalConfig: ctx.state.generalConfig,
                });
            }

        }

        return {
            twitter,
            twitterCallback,
            google,
            googleToken,
            googleCallback,
            facebook,
            facebookToken,
            facebookCallback,
            localCallback,
            failAuth,
            checkLogged,
            success,
            logout,
            generateJWT,
            getUsers,
            getUserById,
            findByIds,
            getIdsByRole,
            createUser,
            updateUser,
            deleteUser,
            updateMe,
            signUp,
            confirmUser,
            getSignUp,
            loginView,
            redirectLogin,
            resetPasswordView,
            requestEmailResetView,
            resetPassword,
            sendResetMail,
            updateApplications
        };

    }());

    async function setCallbackUrl(ctx, next) {
        logger.info('Setting callbackUrl');
        if (!ctx.session.callbackUrl && !ctx.query.callbackUrl) {
            ctx.session.callbackUrl = ctx.headers.referer;
        }
        if (ctx.query.callbackUrl) {
            ctx.session.callbackUrl = ctx.query.callbackUrl;
        }

        if (!ctx.session.applications && ctx.query.applications) {
            ctx.session.applications = ctx.query.applications.split(',');
        }
        if (!ctx.session.generateToken) {
            ctx.session.generateToken = ctx.query.token === 'true';
        }
        if (!ctx.session.originApplication || ctx.query.origin) {
            ctx.session.originApplication = ctx.query.origin || plugin.config.defaultApp;
        }

        await next();
    }

    async function setCallbackUrlOnlyWithQueryParam(ctx, next) {
        logger.info('Setting callbackUrl');
        if (ctx.query.callbackUrl) {
            ctx.session.callbackUrl = ctx.query.callbackUrl;
        }
        if (ctx.query.generateToken) {
            ctx.session.generateToken = ctx.query.token === 'true';
        }
        if (ctx.query.origin) {
            ctx.session.originApplication = ctx.query.origin || plugin.config.defaultApp;
        }

        await next();
    }

    async function isLogged(ctx, next) {
        logger.info('Checking if user is logged');
        if (getUser(ctx)) {
            await next();
        } else {
            logger.info('Not logged');
            ctx.throw(401, 'Not authenticated');
        }
    }

    async function isAdmin(ctx, next) {
        logger.info('Checking if user is admin');
        const user = getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN') {
            logger.info('User is admin');
            await next();
        } else {
            logger.info('Not admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    async function isAdminOrManager(ctx, next) {
        logger.info('Checking if user is admin or manager');
        const user = getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN' || user.role === 'MANAGER') {
            await next();
        } else {
            logger.info('Not admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    async function isMicroservice(ctx, next) {
        logger.info('Checking if user is a microservice');
        const user = getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.id === 'microservice') {
            await next();
        } else {
            logger.info('Not admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    async function hasSignUpPermissions(ctx, next) {
        if (!plugin.config.allowPublicRegistration) {
            await isLogged(ctx, () => {
            });
            await isAdmin(ctx, () => {
            });
        }
        await next();
    }

    async function loadApplicationGeneralConfig(ctx, next) {
        const Plugin = connection.model('Plugin');
        const oauthPlugin = await Plugin.findOne({ name: 'oauth' });

        ctx.state.generalConfig = cloneDeep(generalConfig); // avoiding a bug when changes in DB are not applied
        const applicationConfig = getApplicationsConfig(ctx, oauthPlugin);

        if (applicationConfig) {
            ctx.state.generalConfig.application = { ...ctx.state.generalConfig.application, ...applicationConfig };
        }

        await next();
    }

    ApiRouter.get('/twitter', setCallbackUrl, API.twitter);
    ApiRouter.get('/twitter/callback', API.twitterCallback, API.updateApplications);

    ApiRouter.get('/google', setCallbackUrl, API.google);
    ApiRouter.get('/google/callback', API.googleCallback, API.updateApplications);
    ApiRouter.get('/google/token', API.googleToken, API.generateJWT);

    ApiRouter.get('/facebook/token', API.facebookToken, API.generateJWT);
    ApiRouter.get('/facebook', setCallbackUrl, API.facebook);
    ApiRouter.get('/facebook/callback', API.facebookCallback, API.updateApplications);

    ApiRouter.get('/', setCallbackUrl, API.redirectLogin);
    ApiRouter.get('/basic', passport.authenticate('basic'), API.success);
    ApiRouter.get('/login', setCallbackUrl, loadApplicationGeneralConfig, API.loginView);
    ApiRouter.post('/login', API.localCallback);
    ApiRouter.get('/fail', loadApplicationGeneralConfig, API.failAuth);

    ApiRouter.get('/check-logged', API.checkLogged);
    ApiRouter.get('/success', loadApplicationGeneralConfig, API.success);
    ApiRouter.get('/logout', setCallbackUrlOnlyWithQueryParam, API.logout);

    ApiRouter.get('/sign-up', hasSignUpPermissions, loadApplicationGeneralConfig, API.getSignUp);
    ApiRouter.post('/sign-up', hasSignUpPermissions, loadApplicationGeneralConfig, API.signUp);

    ApiRouter.get('/confirm/:token', API.confirmUser);
    ApiRouter.get('/reset-password', loadApplicationGeneralConfig, API.requestEmailResetView);
    ApiRouter.post('/reset-password', loadApplicationGeneralConfig, API.sendResetMail);
    ApiRouter.get('/reset-password/:token', loadApplicationGeneralConfig, API.resetPasswordView);
    ApiRouter.post('/reset-password/:token', loadApplicationGeneralConfig, API.resetPassword);

    ApiRouter.get('/generate-token', isLogged, API.generateJWT);

    ApiRouter.get('/user', isLogged, isAdmin, API.getUsers);
    ApiRouter.get('/user/:id', isLogged, isAdmin, API.getUserById);
    ApiRouter.post('/user/find-by-ids', isLogged, isMicroservice, API.findByIds);
    ApiRouter.get('/user/ids/:role', isLogged, isMicroservice, API.getIdsByRole);
    ApiRouter.post('/user', isLogged, isAdminOrManager, loadApplicationGeneralConfig, API.createUser);
    ApiRouter.patch('/user/me', isLogged, API.updateMe);
    ApiRouter.patch('/user/:id', isLogged, isAdmin, API.updateUser);
    ApiRouter.delete('/user/:id', isLogged, isAdmin, API.deleteUser);

    return ApiRouter;
};
