const passport = require('koa-passport');
const debug = require('debug')('oauth-plugin');
const { BasicStrategy } = require('passport-http');
const TwitterStrategy = require('passport-twitter').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const GoogleTokenStrategy = require('passport-google-token').Strategy;
const FacebookTokenStrategy = require('passport-facebook-token');
const bcrypt = require('bcrypt');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');


function passportService(plugin) {
    async function registerUser(accessToken, refreshToken, profile, done) {
        debug('Registering user', profile);

        let user = await UserModel.findOne({
            provider: profile.provider ? profile.provider.split('-')[0] : profile.provider,
            providerId: profile.id,
        }).exec();
        debug(user);
        if (!user) {
            debug('Not exist user');
            let name = null;
            let email = null;
            let photo = null;
            if (profile) {
                name = profile.displayName;
                photo = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;
                if (profile.emails && profile.emails.length > 0) {
                    email = profile.emails[0].value;
                } else if (profile.email) {
                    ({ email } = profile);
                }
            }
            user = await new UserModel({
                name,
                email,
                photo,
                provider: profile.provider ? profile.provider.split('-')[0] : profile.provider,
                providerId: profile.id
            }).save();
        } else {
            let email = null;
            if (profile) {
                if (profile.emails && profile.emails.length > 0) {
                    email = profile.emails[0].value;
                } else if (profile.email) {
                    ({ email } = profile);
                }
            }
            if (email) {
                debug('Updating email');
                user.email = email;
                await user.save();
            }
        }
        debug('Returning user');
        done(null, {
            // eslint-disable-next-line no-underscore-dangle
            id: user._id,
            provider: user.provider,
            providerId: user.providerId,
            role: user.role,
            createdAt: user.createdAt,
            extraUserData: user.extraUserData,
            name: user.name,
            photo: user.photo,
            email: user.email
        });
    }

    async function registerUserBasic(userId, password, done) {
        try {
            debug('Verifying basic auth');
            if (userId === plugin.config.basic.userId && password === plugin.config.basic.password) {
                done(null, {
                    id: '57ab3917d1d5fb2f00b20f2d',
                    provider: 'basic',
                    role: plugin.config.basic.role,
                });
            } else {
                done(null, false);
            }
        } catch (e) {
            debug(e);
        }
    }

    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((user, done) => {
        done(null, user);
    });

    if (plugin.config.local && plugin.config.local.active) {
        debug('Loading local strategy');
        const login = async function login(username, password, done) {
            const user = await UserModel.findOne({
                email: username,
                provider: 'local'
            }).exec();
            if (user && user.salt && user.password === bcrypt.hashSync(password, user.salt)) {
                done(null, {
                    // eslint-disable-next-line no-underscore-dangle
                    id: user._id,
                    name: user.name,
                    photo: user.photo,
                    provider: user.provider,
                    providerId: user.providerId,
                    email: user.email,
                    role: user.role,
                    createdAt: user.createdAt,
                    extraUserData: user.extraUserData
                });
            } else {
                done(null, false);
            }
        };
        const localStrategy = new LocalStrategy({
            usernameField: 'email',
            passwordField: 'password',
        }, login);
        passport.use(localStrategy);
    }

    if (plugin.config.basic && plugin.config.basic.active) {
        debug('Loading basic strategy');
        const basicStrategy = new BasicStrategy(registerUserBasic);
        passport.use(basicStrategy);
    }

    // third party oauth
    if (plugin.config.thirdParty) {
        debug('Loading third-party oauth');
        const apps = Object.keys(plugin.config.thirdParty);
        for (let i = 0, { length } = apps; i < length; i += 1) {
            debug(`Loading third-party oauth of app: ${apps[i]}`);
            const app = plugin.config.thirdParty[apps[i]];
            if (app.twitter && app.twitter.active) {
                debug(`Loading twitter strategy of ${apps[i]}`);
                const configTwitter = {
                    consumerKey: app.twitter.consumerKey,
                    consumerSecret: app.twitter.consumerSecret,
                    userProfileURL: 'https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true',
                    callbackURL: `${plugin.config.publicUrl}/auth/twitter/callback`
                };
                const twitterStrategy = new TwitterStrategy(configTwitter, registerUser);
                twitterStrategy.name += `:${apps[i]}`;
                passport.use(twitterStrategy);
            }

            if (app.google && app.google.active) {
                debug(`Loading google strategy ${apps[i]}`);
                const configGoogle = {
                    clientID: app.google.clientID,
                    clientSecret: app.google.clientSecret,
                    callbackURL: `${plugin.config.publicUrl}/auth/google/callback`,
                    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
                };
                const googleStrategy = new GoogleStrategy(configGoogle, registerUser);
                googleStrategy.name += `:${apps[i]}`;
                passport.use(googleStrategy);

                const configGoogleToken = {
                    clientID: app.google.clientID,
                    clientSecret: app.google.clientSecret,
                    passReqToCallback: false
                };
                const googleTokenStrategy = new GoogleTokenStrategy(configGoogleToken, registerUser);
                googleTokenStrategy.name += `:${apps[i]}`;
                passport.use(googleTokenStrategy);
            }

            if (app.facebook && app.facebook.active) {
                debug(`Loading facebook strategy ${apps[i]}`);
                const configFacebook = {
                    clientID: app.facebook.clientID,
                    clientSecret: app.facebook.clientSecret,
                    callbackURL: `${plugin.config.publicUrl}/auth/facebook/callback`,
                    profileFields: ['id', 'displayName', 'photos', 'email']
                };
                const facebookStrategy = new FacebookStrategy(configFacebook, registerUser);
                facebookStrategy.name += `:${apps[i]}`;
                passport.use(facebookStrategy);

                const configFacebookToken = {
                    clientID: app.facebook.clientID,
                    clientSecret: app.facebook.clientSecret,
                    passReqToCallback: false
                };
                const facebookTokenStrategy = new FacebookTokenStrategy(configFacebookToken, registerUser);
                facebookTokenStrategy.name += `:${apps[i]}`;
                passport.use(facebookTokenStrategy);
            }
        }
    }


}
module.exports = passportService;
