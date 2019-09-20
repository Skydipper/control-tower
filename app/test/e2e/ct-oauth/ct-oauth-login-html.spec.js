const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { getTestAgent, closeTestAgent } = require('./../test-server');
const { TOKENS } = require('./../test.constants');

const should = chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Auth endpoints tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        UserModel.deleteMany({}).exec();

        nock.cleanAll();
    });

    beforeEach(async () => {
        requester = await getTestAgent(true);
    });

    it('Visiting /auth while not logged in should redirect to the login page', async () => {
        const response = await requester
            .get(`/auth`);

        response.status.should.equal(200);
        response.header['content-type'].should.equal('text/html; charset=utf-8');
        response.redirects.should.be.an('array').and.length(1);
        response.redirects[0].should.match(/\/auth\/login$/);
    });

    it('Visiting /auth while logged in should redirect to the success page', async () => {
        const response = await requester
            .get(`/auth`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`);

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(2);
        response.redirects[0].should.match(/\/auth\/login$/);
        response.redirects[1].should.match(/\/auth\/success$/);
    });

    it('Visiting /auth with callbackUrl while being logged in should redirect to the callback page', async () => {
        const response = await requester
            .get(`/auth?callbackUrl=https://www.wikipedia.org`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`);

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(3);
        response.redirects[0].should.match(/\/auth\/login$/);
        response.redirects[1].should.match(/\/auth\/success$/);
        response.redirects[2].should.equal('https://www.wikipedia.org/');
    });

    it('Visiting /auth/login while not being logged in should show you the login page', async () => {
        const response = await requester
            .get(`/auth/login`);

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(0);
        response.text.should.contain('Login');
        response.text.should.not.contain('Login correct');
    });

    it('Logging in at /auth/login with no credentials should display the error messages', async () => {
        const response = await requester
            .post(`/auth/login`)
            .type('form');

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(1);
        response.redirects[0].should.match(/\/auth\/fail\?error=true$/);
        response.text.should.contain('Email or password invalid');
    });

    it('Logging in at /auth/login with email and no password should display the error messages', async () => {
        const response = await requester
            .post(`/auth/login`)
            .type('form')
            .send({
                email: 'test@example.com',
            });

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(1);
        response.redirects[0].should.match(/\/auth\/fail\?error=true$/);
        response.text.should.contain('Email or password invalid');
    });

    it('Logging in at /auth/login with invalid credentials (account does not exist) should display the error messages', async () => {
        const response = await requester
            .post(`/auth/login`)
            .type('form')
            .send({
                email: 'test@example.com',
                password: 'potato'
            });

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(1);
        response.redirects[0].should.match(/\/auth\/fail\?error=true$/);
        response.text.should.contain('Email or password invalid');
    });

    it('Logging in at /auth/login valid credentials should redirect to the success page', async () => {
        await new UserModel({
            __v: 0,
            email: 'test@example.com',
            password: '$2b$10$1wDgP5YCStyvZndwDu2GwuC6Ie9wj7yRZ3BNaaI.p9JqV8CnetdPK',
            salt: '$2b$10$1wDgP5YCStyvZndwDu2Gwu',
            extraUserData: {
                apps: []
            },
            _id: '5becfa2b67da0d3ec07a27f6',
            createdAt: '2018-11-15T04:46:35.313Z',
            role: 'USER',
            provider: 'local'
        }).save();

        const response = await requester
            .post(`/auth/login`)
            .type('form')
            .send({
                email: 'test@example.com',
                password: 'potato'
            });

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(1);
        response.redirects[0].should.match(/\/auth\/success$/);
        response.text.should.contain('Login correct');
    });

    it('Visiting /auth/login with callbackUrl while being logged in should redirect to the callback page', async () => {
        const response = await requester
            .get(`/auth/login?callbackUrl=https://www.wikipedia.org`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`);

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(2);
        response.redirects[0].should.match(/\/auth\/success$/);
        response.redirects[1].should.equal('https://www.wikipedia.org/');
    });

    it('Logging in successfully with /auth/login with callbackUrl should redirect to the callback page', async () => {
        await requester
            .get(`/auth/login?callbackUrl=https://www.wikipedia.org`);

        const response = await requester
            .post(`/auth/login`)
            .type('form')
            .send({
                email: 'test@example.com',
                password: 'potato'
            });

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(2);
        response.redirects[0].should.match(/\/auth\/success$/);
        response.redirects[1].should.equal('https://www.wikipedia.org/');
    });

    it('Logging in successfully with /auth/login with callbackUrl and token=true should redirect to the callback page and pass the token', async () => {
        await requester
            .get(`/auth/login?callbackUrl=https://www.wikipedia.org&token=true`);

        const response = await requester
            .post(`/auth/login`)
            .type('form')
            .send({
                email: 'test@example.com',
                password: 'potato'
            });

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(2);
        response.redirects[0].should.match(/\/auth\/success$/);
        response.redirects[1].should.match(/https:\/\/www\.wikipedia\.org\/\?token=(\w.)+/);
        response.redirects[1].should.not.match(/null$/);
    });

    it('Log in failure with /auth/login in should redirect to the failure page - HTTP request', async () => {
        const response = await requester
            .post(`/auth/login?callbackUrl=https://www.wikipedia.org`)
            .type('form')
            .send({
                email: 'test@example.com',
                password: 'tomato'
            });

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(1);
        response.redirects[0].should.match(/\/auth\/fail\?error=true$/);
    });

    after(async () => {
        UserModel.deleteMany({}).exec();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        closeTestAgent();
    });
});
