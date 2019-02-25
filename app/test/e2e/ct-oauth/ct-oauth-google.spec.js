const nock = require('nock');
const chai = require('chai');
const jwt = require('jsonwebtoken');

const { getTestAgent, closeTestAgent } = require('./../test-server');
const { setPluginSetting } = require('./../utils');

const should = chai.should();

let requester;

// https://github.com/mochajs/mocha/issues/2683
let skipTests = false;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Google auth endpoint tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        if (!process.env.TEST_GOOGLE_OAUTH2_CLIENT_ID || !process.env.TEST_GOOGLE_OAUTH2_CLIENT_SECRET) {
            skipTests = true;
            return;
        }

        // We need to force-start the server, to ensure mongo has plugin info we can manipulate in the next instruction
        await getTestAgent(true);

        await setPluginSetting('oauth', 'defaultApp', 'rw');
        await setPluginSetting('oauth', 'thirdParty.rw.google.active', true);
        await setPluginSetting('oauth', 'thirdParty.rw.google.clientID', process.env.TEST_GOOGLE_OAUTH2_CLIENT_ID);
        await setPluginSetting('oauth', 'thirdParty.rw.google.clientSecret', process.env.TEST_GOOGLE_OAUTH2_CLIENT_SECRET);

        requester = await getTestAgent(true);

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
        if (skipTests || !process.env.TEST_GOOGLE_OAUTH2_CALLBACK_CODE) {
            return;
        }

        nock('https://www.googleapis.com')
            .post('/oauth2/v4/token', {
                grant_type: 'authorization_code',
                redirect_uri: 'http://localhost:9000/auth/google/callback',
                client_id: process.env.TEST_GOOGLE_OAUTH2_CLIENT_ID,
                client_secret: process.env.TEST_GOOGLE_OAUTH2_CLIENT_SECRET,
                code: process.env.TEST_GOOGLE_OAUTH2_CALLBACK_CODE
            })
            .reply(200, {
                access_token: process.env.TEST_GOOGLE_OAUTH2_ACCESS_TOKEN,
                expires_in: 3599,
                scope: 'openid https://www.googleapis.com/auth/userinfo.email',
                token_type: 'Bearer',
                id_token: 'some_id_token'
            });

        nock('https://www.googleapis.com:443')
            .get('/plus/v1/people/me')
            .query({
                access_token: process.env.TEST_GOOGLE_OAUTH2_ACCESS_TOKEN
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
            .get(`/auth/google/callback?code=${process.env.TEST_GOOGLE_OAUTH2_CALLBACK_CODE}&scope=openid%20email%20https://www.googleapis.com/auth/userinfo.email`)
            .send();

        response.status.should.equal(200);
        response.header['content-type'].should.equal('text/html; charset=utf-8');
        response.redirects.should.be.an('array').and.length(1);
        response.redirects[0].should.match(new RegExp(`\/auth\/success$`));
    });

    it('Visiting /auth/google/token with a valid Google OAuth token should generate a new token', async () => {
        if (skipTests || !process.env.TEST_GOOGLE_OAUTH2_ACCESS_TOKEN) {
            return;
        }

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
            .get(`/auth/google/token?access_token=${process.env.TEST_GOOGLE_OAUTH2_ACCESS_TOKEN}`)
            .send();

        response.status.should.equal(200);
        response.header['content-type'].should.equal('application/json; charset=utf-8');
        response.body.should.be.an('object');
        response.body.should.have.property('token').and.be.a('string');

        jwt.verify(response.body.token, process.env.JWT_SECRET);
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        closeTestAgent();
    });
});
