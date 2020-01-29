const nock = require('nock');
const chai = require('chai');
const JWT = require('jsonwebtoken');
const config = require('config');
const mongoose = require('mongoose');

const PluginModel = require('models/plugin.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const authServiceFunc = require('plugins/sd-ct-oauth-plugin/services/auth.service');

const { getTestAgent, closeTestAgent } = require('./../test-server');
const { setPluginSetting } = require('../utils/helpers');
const mongooseOptions = require('../../../../config/mongoose');

const should = chai.should();
chai.use(require('chai-string'));

let requester;
let AuthService;

// https://github.com/mochajs/mocha/issues/2683
let skipTests = false;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Google auth endpoint tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        // We need to force-start the server, to ensure mongo has plugin info we can manipulate in the next instruction
        await getTestAgent(true);

        await setPluginSetting('oauth', 'defaultApp', 'rw');
        await setPluginSetting('oauth', 'thirdParty.rw.google.active', true);
        await setPluginSetting('oauth', 'thirdParty.rw.google.clientSecret', 'TEST_GOOGLE_OAUTH2_CLIENT_SECRET');

        if (!process.env.TEST_GOOGLE_OAUTH2_CLIENT_ID) {
            skipTests = true;
            await setPluginSetting('oauth', 'thirdParty.rw.google.clientID', 'TEST_GOOGLE_OAUTH2_CLIENT_ID');
        } else {
            nock.enableNetConnect(new RegExp(`(${process.env.HOST_IP}|accounts.google.com)`));
            await setPluginSetting('oauth', 'thirdParty.rw.google.clientID', process.env.TEST_GOOGLE_OAUTH2_CLIENT_ID);
        }

        requester = await getTestAgent(true);

        UserModel.deleteMany({}).exec();

        nock.cleanAll();

        const plugin = await PluginModel.findOne({
            name: 'oauth',
        });
        const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;
        const connection = mongoose.createConnection(mongoUri, mongooseOptions);
        AuthService = authServiceFunc(plugin, connection);
    });

    beforeEach(async () => {
        requester = await getTestAgent(true);
    });

    it('Visiting /auth/google while not being logged in should redirect to the login page', async () => {
        if (skipTests) {
            return;
        }

        const response = await requester
            .get(`/auth/google`)
            .redirects(0);

        response.status.should.equal(200);
        response.header['content-type'].should.equalIgnoreCase('text/html; charset=UTF-8');
        // eslint-disable-next-line no-unused-expressions
        response.redirects.should.be.an('array').and.not.be.empty;
        response.redirects.forEach((redirect) => {
            redirect.should.match(/^https:\/\/accounts\.google\.com\//);
        });
    });

    it('Visiting /auth/google/callback while being logged in should redirect to the login successful page', async () => {
        if (skipTests) {
            return;
        }

        const missingUser = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.not.exist(missingUser);

        nock('https://www.googleapis.com')
            .post('/oauth2/v4/token', {
                grant_type: 'authorization_code',
                redirect_uri: `${process.env.PUBLIC_URL}/auth/google/callback`,
                client_id: process.env.TEST_GOOGLE_OAUTH2_CLIENT_ID,
                client_secret: 'TEST_GOOGLE_OAUTH2_CLIENT_SECRET',
                code: 'TEST_GOOGLE_OAUTH2_CALLBACK_CODE'
            })
            .reply(200, {
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN',
                expires_in: 3599,
                scope: 'openid https://www.googleapis.com/auth/userinfo.email',
                token_type: 'Bearer',
                id_token: 'some_id_token'
            });

        nock('https://www.googleapis.com')
            .get('/oauth2/v3/userinfo')
            .query({
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                sub: '113994825016233013735',
                name: 'John Doe',
                given_name: 'John',
                family_name: 'Doe',
                picture: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                email: 'john.doe@vizzuality.com',
                email_verified: true,
                hd: 'vizzuality.com'
            });

        await requester
            .get(`/auth`);

        const responseOne = await requester
            .get(`/auth/google/callback?code=TEST_GOOGLE_OAUTH2_CALLBACK_CODE&scope=openid%20email%20https://www.googleapis.com/auth/userinfo.email`)
            .redirects(0);

        responseOne.should.redirect;
        responseOne.should.redirectTo(new RegExp(`/auth/success$`));

        const responseTwo = await requester
            .get('/auth/success');

        responseTwo.should.be.html;
        responseTwo.text.should.include('Welcome to the RW API');


        const confirmedUser = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('john.doe@vizzuality.com');
        confirmedUser.should.have.property('name').and.equal('John Doe');
        confirmedUser.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('provider').and.equal('google');
        confirmedUser.should.have.property('providerId').and.equal('113994825016233013735');
    });

    it('Visiting /auth/google/callback while being logged in with a callbackUrl param should redirect to the callback URL page', async () => {
        if (skipTests) {
            return;
        }

        const missingUser = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.not.exist(missingUser);

        nock('https://www.googleapis.com')
            .post('/oauth2/v4/token', {
                grant_type: 'authorization_code',
                redirect_uri: `${process.env.PUBLIC_URL}/auth/google/callback`,
                client_id: process.env.TEST_GOOGLE_OAUTH2_CLIENT_ID,
                client_secret: 'TEST_GOOGLE_OAUTH2_CLIENT_SECRET',
                code: 'TEST_GOOGLE_OAUTH2_CALLBACK_CODE'
            })
            .reply(200, {
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN',
                expires_in: 3599,
                scope: 'openid https://www.googleapis.com/auth/userinfo.email',
                token_type: 'Bearer',
                id_token: 'some_id_token'
            });

        nock('https://www.googleapis.com')
            .get('/oauth2/v3/userinfo')
            .query({
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                sub: '113994825016233013735',
                name: 'John Doe',
                given_name: 'John',
                family_name: 'Doe',
                picture: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                email: 'john.doe@vizzuality.com',
                email_verified: true,
                hd: 'vizzuality.com'
            });

        nock('https://www.wikipedia.org')
            .get('/')
            .reply(200, 'ok');


        await requester
            .get(`/auth?callbackUrl=https://www.wikipedia.org`);

        const responseOne = await requester
            .get(`/auth/google/callback?code=TEST_GOOGLE_OAUTH2_CALLBACK_CODE&scope=openid%20email%20https://www.googleapis.com/auth/userinfo.email`)
            .redirects(0);

        responseOne.should.redirect;
        responseOne.should.redirectTo(new RegExp(`/auth/success$`));

        const responseTwo = await requester
            .get('/auth/success');

        responseTwo.should.redirect;
        responseTwo.should.redirectTo('https://www.wikipedia.org/');


        const confirmedUser = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('john.doe@vizzuality.com');
        confirmedUser.should.have.property('name').and.equal('John Doe');
        confirmedUser.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('provider').and.equal('google');
        confirmedUser.should.have.property('providerId').and.equal('113994825016233013735');
    });

    it('Visiting /auth/google/callback while being logged in with an updated callbackUrl param should redirect to the new callback URL page', async () => {
        if (skipTests) {
            return;
        }

        const missingUser = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.not.exist(missingUser);

        nock('https://www.googleapis.com')
            .post('/oauth2/v4/token', {
                grant_type: 'authorization_code',
                redirect_uri: `${process.env.PUBLIC_URL}/auth/google/callback`,
                client_id: process.env.TEST_GOOGLE_OAUTH2_CLIENT_ID,
                client_secret: 'TEST_GOOGLE_OAUTH2_CLIENT_SECRET',
                code: 'TEST_GOOGLE_OAUTH2_CALLBACK_CODE'
            })
            .reply(200, {
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN',
                expires_in: 3599,
                scope: 'openid https://www.googleapis.com/auth/userinfo.email',
                token_type: 'Bearer',
                id_token: 'some_id_token'
            });

        nock('https://www.googleapis.com')
            .get('/oauth2/v3/userinfo')
            .query({
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                sub: '113994825016233013735',
                name: 'John Doe',
                given_name: 'John',
                family_name: 'Doe',
                picture: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                email: 'john.doe@vizzuality.com',
                email_verified: true,
                hd: 'vizzuality.com'
            });

        nock('https://www.wikipedia.org')
            .get('/')
            .reply(200, 'ok');


        await requester
            .get(`/auth?callbackUrl=https://www.google.com`);

        await requester
            .get(`/auth?callbackUrl=https://www.wikipedia.org`);

        const responseOne = await requester
            .get(`/auth/google/callback?code=TEST_GOOGLE_OAUTH2_CALLBACK_CODE&scope=openid%20email%20https://www.googleapis.com/auth/userinfo.email`)
            .redirects(0);

        responseOne.should.redirect;
        responseOne.should.redirectTo(new RegExp(`/auth/success$`));

        const responseTwo = await requester
            .get('/auth/success');

        responseTwo.should.redirect;
        responseTwo.should.redirectTo('https://www.wikipedia.org/');

        const confirmedUser = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('john.doe@vizzuality.com');
        confirmedUser.should.have.property('name').and.equal('John Doe');
        confirmedUser.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('provider').and.equal('google');
        confirmedUser.should.have.property('providerId').and.equal('113994825016233013735');
    });

    it('Visiting /auth/google/token with a valid Google OAuth token should generate a new token', async () => {
        await new UserModel({
            name: 'John Doe',
            email: 'john.doe@vizzuality.com',
            role: 'USER',
            provider: 'google',
            providerId: '113994825016233013735',
            photo: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260'
        }).save();

        const existingUser = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.exist(existingUser);
        existingUser.should.have.property('email').and.equal('john.doe@vizzuality.com');
        existingUser.should.have.property('name').and.equal('John Doe');
        existingUser.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        existingUser.should.have.property('role').and.equal('USER');
        existingUser.should.have.property('provider').and.equal('google');
        existingUser.should.have.property('providerId').and.equal('113994825016233013735');
        existingUser.should.have.property('userToken').and.equal(undefined);

        nock('https://www.googleapis.com')
            .get('/oauth2/v1/userinfo')
            .query({
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                id: '113994825016233013735',
                email: 'john.doe@vizzuality.com',
                verified_email: true,
                name: 'John Doe',
                given_name: 'John',
                family_name: 'Doe',
                picture: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                hd: 'vizzuality.com'
            });

        const response = await requester
            .get(`/auth/google/token?access_token=TEST_GOOGLE_OAUTH2_ACCESS_TOKEN`);

        response.status.should.equal(200);
        response.header['content-type'].should.equalIgnoreCase('application/json; charset=utf-8');
        response.body.should.be.an('object');
        response.body.should.have.property('token').and.be.a('string');

        JWT.verify(response.body.token, process.env.JWT_SECRET);

        const decodedTokenData = JWT.decode(response.body.token, process.env.JWT_SECRET);
        const isTokenRevoked = await AuthService.checkRevokedToken(null, decodedTokenData, response.body.token);
        isTokenRevoked.should.equal(false);

        const userWithToken = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.exist(userWithToken);
        userWithToken.should.have.property('email').and.equal('john.doe@vizzuality.com').and.equal(decodedTokenData.email);
        userWithToken.should.have.property('name').and.equal('John Doe').and.equal(decodedTokenData.name);
        userWithToken.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260').and.equal(decodedTokenData.photo);
        userWithToken.should.have.property('role').and.equal('USER').and.equal(decodedTokenData.role);
        userWithToken.should.have.property('provider').and.equal('google').and.equal(decodedTokenData.provider);
        userWithToken.should.have.property('providerId').and.equal('113994825016233013735');
        userWithToken.should.have.property('userToken').and.equal(response.body.token);
    });

    it('Visiting /auth/google/token with a valid Google OAuth token should generate a new token - account with no email address', async () => {
        const savedUser = await new UserModel({
            name: 'John Doe',
            role: 'USER',
            provider: 'google',
            providerId: '113994825016233013735',
            photo: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260'
        }).save();

        const existingUser = await UserModel.findOne({ _id: savedUser.id }).exec();
        should.exist(existingUser);
        existingUser.should.have.property('name').and.equal('John Doe');
        existingUser.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        existingUser.should.have.property('role').and.equal('USER');
        existingUser.should.have.property('provider').and.equal('google');
        existingUser.should.have.property('providerId').and.equal('113994825016233013735');
        existingUser.should.have.property('userToken').and.equal(undefined);

        nock('https://www.googleapis.com')
            .get('/oauth2/v1/userinfo')
            .query({
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                id: '113994825016233013735',
                verified_email: true,
                name: 'John Doe',
                given_name: 'John',
                family_name: 'Doe',
                picture: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                hd: 'vizzuality.com'
            });

        const response = await requester
            .get(`/auth/google/token?access_token=TEST_GOOGLE_OAUTH2_ACCESS_TOKEN`);

        response.status.should.equal(200);
        response.header['content-type'].should.equalIgnoreCase('application/json; charset=utf-8');
        response.body.should.be.an('object');
        response.body.should.have.property('token').and.be.a('string');

        JWT.verify(response.body.token, process.env.JWT_SECRET);

        const decodedTokenData = JWT.decode(response.body.token, process.env.JWT_SECRET);
        const isTokenRevoked = await AuthService.checkRevokedToken(null, decodedTokenData, response.body.token);
        isTokenRevoked.should.equal(false);

        const userWithToken = await UserModel.findOne({ _id: savedUser.id }).exec();
        should.exist(userWithToken);
        userWithToken.should.have.property('name').and.equal('John Doe').and.equal(decodedTokenData.name);
        userWithToken.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260').and.equal(decodedTokenData.photo);
        userWithToken.should.have.property('role').and.equal('USER').and.equal(decodedTokenData.role);
        userWithToken.should.have.property('provider').and.equal('google').and.equal(decodedTokenData.provider);
        userWithToken.should.have.property('providerId').and.equal('113994825016233013735');
        userWithToken.should.have.property('userToken').and.equal(response.body.token);
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        UserModel.deleteMany({}).exec();

        closeTestAgent();
    });
});
