const nock = require('nock');
const chai = require('chai');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('config');

const userModelFunc = require('sd-ct-oauth-plugin/lib/models/user.model');
const { getTestAgent, closeTestAgent } = require('./../test-server');
const { setPluginSetting } = require('./../utils');

const should = chai.should();

let requester;

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;
const connection = mongoose.createConnection(mongoUri);

// https://github.com/mochajs/mocha/issues/2683
let skipTests = false;

let UserModel;

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
            await setPluginSetting('oauth', 'thirdParty.rw.google.clientID', process.env.TEST_GOOGLE_OAUTH2_CLIENT_ID);
        }

        requester = await getTestAgent(true);

        UserModel = userModelFunc(connection);

        UserModel.deleteMany({}).exec();

        nock.cleanAll();
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
            .send();

        response.status.should.equal(200);
        response.header['content-type'].should.equal('text/html; charset=UTF-8');
        response.redirects.should.be.an('array').and.length(2);
        response.redirects[0].should.match(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
        response.redirects[1].should.match(/^https:\/\/accounts\.google\.com\/ServiceLogin/);
    });

    it('Visiting /auth/google/callback ', async () => {
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

        nock('https://www.googleapis.com:443')
            .get('/plus/v1/people/me')
            .query({
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                kind: 'plus#person',
                etag: '"k-5ZH5-QJvSewqvyYHTE9ETORZg/PxCnXGvww9BVjIHZW1fUZXsbsPs"',
                emails: [{ value: 'john.doe@vizzuality.com', type: 'account' }],
                objectType: 'person',
                id: '113994825016233013735',
                displayName: 'John Doe',
                name: { familyName: 'Doe', givenName: 'John' },
                url: 'https://plus.google.com/my-url',
                image: {
                    url: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                    isDefault: false
                },
                isPlusUser: true,
                circledByCount: 0,
                verified: false,
                domain: 'vizzuality.com'
            });


        await requester
            .get(`/auth`)
            .send();

        const response = await requester
            .get(`/auth/google/callback?code=TEST_GOOGLE_OAUTH2_CALLBACK_CODE&scope=openid%20email%20https://www.googleapis.com/auth/userinfo.email`)
            .send();

        response.status.should.equal(200);
        response.header['content-type'].should.equal('text/html; charset=utf-8');
        response.redirects.should.be.an('array').and.length(1);
        response.redirects[0].should.match(new RegExp(`\/auth\/success$`));

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

        const existingUser = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.exist(existingUser);
        existingUser.should.have.property('email').and.equal('john.doe@vizzuality.com');
        existingUser.should.have.property('name').and.equal('John Doe');
        existingUser.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        existingUser.should.have.property('role').and.equal('USER');
        existingUser.should.have.property('provider').and.equal('google');
        existingUser.should.have.property('providerId').and.equal('113994825016233013735');
        existingUser.should.have.property('userToken').and.equal(undefined);

        // nock('https://www.googleapis.com')
        //     .get('/oauth2/v3/userinfo')
        //     .reply(200, {
        //         sub: '113994825016233013735',
        //         name: 'John Doe',
        //         given_name: 'John',
        //         family_name: 'Doe',
        //         picture: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
        //         email: 'john.doe@vizzuality.com',
        //         email_verified: true,
        //         hd: 'vizzuality.com'
        //     });

        nock('https://www.googleapis.com:443')
            .get('/plus/v1/people/me')
            .reply(200, {
                kind: 'plus#person',
                etag: '"k-5ZH5-QJvSewqvyYHTE9ETORZg/PxCnXGvww9BVjIHZW1fUZXsbsPs"',
                emails: [{ value: 'john.doe@vizzuality.com', type: 'account' }],
                objectType: 'person',
                id: '113994825016233013735',
                displayName: 'John Doe',
                name: { familyName: 'Doe', givenName: 'John' },
                url: 'https://plus.google.com/my-url',
                image: {
                    url: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                    isDefault: false
                },
                isPlusUser: true,
                circledByCount: 0,
                verified: false,
                domain: 'vizzuality.com'
            });


        const response = await requester
            .get(`/auth/google/token?access_token=TEST_GOOGLE_OAUTH2_ACCESS_TOKEN`)
            .send();

        response.status.should.equal(200);
        response.header['content-type'].should.equal('application/json; charset=utf-8');
        response.body.should.be.an('object');
        response.body.should.have.property('token').and.be.a('string');

        jwt.verify(response.body.token, process.env.JWT_SECRET);

        const userWithToken = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.exist(userWithToken);
        userWithToken.should.have.property('email').and.equal('john.doe@vizzuality.com');
        userWithToken.should.have.property('name').and.equal('John Doe');
        userWithToken.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        userWithToken.should.have.property('role').and.equal('USER');
        userWithToken.should.have.property('provider').and.equal('google');
        userWithToken.should.have.property('providerId').and.equal('113994825016233013735');
        userWithToken.should.have.property('userToken').and.equal(response.body.token);
    });

    after(async () => {
        const UserModel = userModelFunc(connection);

        UserModel.deleteMany({}).exec();
    });


    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        closeTestAgent();
    });
});
