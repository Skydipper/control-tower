/* eslint-disable no-unused-expressions */
const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { getTestAgent, closeTestAgent } = require('./../test-server');
const { createUserAndToken, createUserInDB } = require('../utils/helpers');

chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Auth endpoints tests - JSON', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        UserModel.deleteMany({}).exec();


    });

    // Default HTML request behavior
    it('Visiting /auth while not logged in should redirect to the login page', async () => {
        const response = await requester
            .get(`/auth`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(200);
        response.should.be.html;
        response.redirects.should.be.an('array').and.length(1);
        response.should.redirectTo(/\/auth\/login$/);
    });

    // Default HTML request behavior
    it('Visiting /auth while logged in should redirect to the success page', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(2);
        response.should.redirectTo(/\/auth\/login$/);
        response.redirects[1].should.match(/\/auth\/success$/);
    });

    // Default HTML request behavior
    it('Visiting /auth with callbackUrl while being logged in should redirect to the callback page', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth?callbackUrl=https://www.wikipedia.org`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .redirects(0);

        response.should.redirect;
        response.should.redirectTo(/\/auth\/login$/);
    });

    it('Visiting /auth/login while not being logged in should show you the login page', async () => {
        const response = await requester
            .get(`/auth/login`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not logged in');
    });

    it('Logging in at /auth/login with no credentials should display the error messages', async () => {
        const response = await requester
            .post(`/auth/login`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Invalid email or password');
    });

    it('Logging in at /auth/login with email and no password should display the error messages', async () => {
        const response = await requester
            .post(`/auth/login`)
            .set('Content-Type', 'application/json')
            .send({
                email: 'test@example.com',
            });

        response.status.should.equal(401);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Invalid email or password');
    });

    it('Logging in at /auth/login with invalid credentials (account does not exist) should display the error messages', async () => {
        const response = await requester
            .post(`/auth/login`)
            .set('Content-Type', 'application/json')
            .send({
                email: 'test@example.com',
                password: 'potato'
            });

        response.status.should.equal(401);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Invalid email or password');
    });

    it('Logging in at /auth/login with valid credentials should return a 200 HTTP code and the user details', async () => {
        const user = await createUserInDB({
            email: 'test@example.com',
            password: '$2b$10$1wDgP5YCStyvZndwDu2GwuC6Ie9wj7yRZ3BNaaI.p9JqV8CnetdPK',
            salt: '$2b$10$1wDgP5YCStyvZndwDu2Gwu'
        });

        const response = await requester
            .post(`/auth/login`)
            .set('Content-Type', 'application/json')
            .send({
                email: 'test@example.com',
                password: 'potato'
            });

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(0);

        const responseUser = response.body.data;
        responseUser.should.have.property('id').and.be.a('string').and.equal(user.id.toString());
        responseUser.should.have.property('name').and.be.a('string').and.equal(user.name);
        responseUser.should.have.property('photo').and.be.a('string').and.equal(user.photo);
        responseUser.should.have.property('email').and.equal(user.email);
        responseUser.should.have.property('role').and.equal(user.role);
        responseUser.should.have.property('extraUserData').and.eql(user.extraUserData);
        responseUser.should.have.property('token').and.be.a('string').and.not.be.empty;
    });

    it('Visiting GET /auth/login with callbackUrl while being logged in should return a 200', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth/login?callbackUrl=https://www.wikipedia.org`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(0);
    });

    it('Logging in successfully with POST /auth/login with callbackUrl should not redirect to the callback page', async () => {
        const user = await createUserInDB({
            email: 'test@example.com',
            password: '$2b$10$1wDgP5YCStyvZndwDu2GwuC6Ie9wj7yRZ3BNaaI.p9JqV8CnetdPK',
            salt: '$2b$10$1wDgP5YCStyvZndwDu2Gwu'
        });

        const response = await requester
            .post(`/auth/login?callbackUrl=https://www.wikipedia.org`)
            .set('Content-Type', 'application/json')
            .send({
                email: 'test@example.com',
                password: 'potato'
            });

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(0);

        const responseUser = response.body.data;
        responseUser.should.have.property('id').and.be.a('string').and.equal(user.id.toString());
        responseUser.should.have.property('name').and.be.a('string').and.equal(user.name);
        responseUser.should.have.property('photo').and.be.a('string').and.equal(user.photo);
        responseUser.should.have.property('email').and.equal(user.email);
        responseUser.should.have.property('role').and.equal(user.role);
        responseUser.should.have.property('extraUserData').and.eql(user.extraUserData);
        responseUser.should.have.property('token').and.be.an('string').and.not.be.empty;
        // eslint-disable-next-line
        responseUser.extraUserData.should.have.property('apps').and.be.an('array').and.contain('rw');
    });

    it('Log in failure with /auth/login in should redirect to the failure page', async () => {
        const response = await requester
            .post(`/auth/login?callbackUrl=https://www.wikipedia.org`)
            .set('Content-Type', 'application/json')
            .send({
                email: 'test@example.com',
                password: 'tomato'
            });

        response.status.should.equal(401);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Invalid email or password');
    });

    after(() => {
        closeTestAgent();
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
