/* eslint-disable no-unused-expressions */
const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { getTestAgent, closeTestAgent } = require('./../test-server');
const { createUserAndToken, createUserInDB, ensureHasPaginationElements } = require('../utils/helpers');

chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('List users', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        UserModel.deleteMany({}).exec();


    });

    it('Visiting /auth/user while not logged in should return a 401 error', async () => {
        const response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authenticated`);

    });

    it('Visiting /auth/user while logged in as USER should return a 403 error', async () => {
        const { token } = await createUserAndToken();

        const response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Visiting /auth/user while logged in as MANAGER should return a 403 error', async () => {
        const { token } = await createUserAndToken({ role: 'MANAGER' });

        const response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - just current user', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);

        response.body.data[0].should.have.property('id').and.equal(user.id.toString());

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - just current user if no other matches the current user\'s apps', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        await createUserInDB({
            extraUserData: {
                apps: ['fake-app']
            }
        });

        const response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data[0].should.have.property('id').and.equal(user.id.toString());

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - only return users that match current user\'s app', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        await createUserInDB({
            email: 'rw-user-one@example.com',
            extraUserData: {
                apps: ['rw']
            }
        });
        await createUserInDB({
            email: 'rw-user-two@example.com',
            extraUserData: {
                apps: ['rw']
            }
        });

        const response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(3);
        response.body.data.map((e) => e.email).should.include('rw-user-two@example.com').and.to.include('rw-user-one@example.com').and.to.include(user.email);

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by email address is supported', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth/user?email=${user.email}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data.map((e) => e.email).should.include(user.email);

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by email address with plus sign in it is supported as long as it\'s escaped', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN', email: 'text+email@vizzuality.com' });

        const response = await requester
            .get(`/auth/user`)
            // eslint-disable-next-line no-useless-escape
            .query({ email: 'text\\\+email@vizzuality.com' })
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data.map((e) => e.email).should.include(user.email);

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by provider is supported', async () => {
        const { token, user: userOne } = await createUserAndToken({ role: 'ADMIN' });
        const { user: userTwo } = await createUserAndToken({ provider: 'google', role: 'ADMIN' });

        const responseOne = await requester
            .get(`/auth/user?provider=local`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseOne.body.data.map((e) => e.email).should.include(userOne.email);

        ensureHasPaginationElements(responseOne);

        const responseTwo = await requester
            .get(`/auth/user?provider=google`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseTwo.body.data.map((e) => e.email).should.include(userTwo.email);

        ensureHasPaginationElements(responseTwo);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by name is supported', async () => {
        const { token, user: userOne } = await createUserAndToken({ role: 'ADMIN' });
        const { user: userTwo } = await createUserAndToken({ role: 'ADMIN' });

        const responseOne = await requester
            .get(`/auth/user?name=${userOne.name}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseOne.body.data.map((e) => e.email).should.include(userOne.email);

        ensureHasPaginationElements(responseOne);

        const responseTwo = await requester
            .get(`/auth/user?name=${userTwo.name}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseTwo.body.data.map((e) => e.email).should.include(userTwo.email);

        ensureHasPaginationElements(responseTwo);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by role is supported', async () => {
        const { token, user: userAdmin } = await createUserAndToken({ role: 'ADMIN' });
        const { user: userManager } = await createUserAndToken({ role: 'MANAGER' });
        const { user: userUser } = await createUserAndToken({ role: 'USER' });

        const responseOne = await requester
            .get(`/auth/user?role=USER`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseOne.body.data.map((e) => e.email).should.include(userUser.email);

        ensureHasPaginationElements(responseOne);

        const responseTwo = await requester
            .get(`/auth/user?role=MANAGER`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseTwo.body.data.map((e) => e.email).should.include(userManager.email);

        ensureHasPaginationElements(responseTwo);

        const responseThree = await requester
            .get(`/auth/user?role=ADMIN`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseThree.status.should.equal(200);
        responseThree.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseThree.body.data.map((e) => e.email).should.include(userAdmin.email);

        ensureHasPaginationElements(responseThree);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by password not supported', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth/user?password=%242b%2410%241wDgP5YCStyvZndwDu2GwuC6Ie9wj7yRZ3BNaaI.p9JqV8CnetdPK`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data.map((e) => e.email).should.include(user.email);

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN and query app=all should return the list of users - even if apps of users are not match to current user\'s app', async () => {
        const { token, user: userOne } = await createUserAndToken({
            role: 'ADMIN',
            extraUserData: {
                apps: ['gfw']
            }
        });
        const { user: userTwo } = await createUserAndToken({
            extraUserData: {
                apps: ['rw']
            }
        });
        const { user: userThree } = await createUserAndToken({
            extraUserData: {
                apps: ['fake-app-2']
            }
        });

        const response = await requester
            .get(`/auth/user?app=all`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send();

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(3);
        response.body.data.map((e) => e.email).should.include(userOne.email).and.to.include(userTwo.email).and.to.include(userThree.email);

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN and filtering by app should return the list of users with apps which provided in the query app', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const { user: userTwo } = await createUserAndToken({
            extraUserData: {
                apps: ['fake-app']
            }
        });
        const { user: userThree } = await createUserAndToken({
            extraUserData: {
                apps: ['fake-app-2']
            }
        });
        const response = await requester
            .get(`/auth/user?app=fake-app,fake-app-2`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send();

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((e) => e.extraUserData.apps[0]).should.include(userThree.extraUserData.apps[0]).and.to.include(userTwo.extraUserData.apps[0]);

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN and an invalid query param should return the list of users ignoring the invalid query param', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const filteredResponse = await requester
            .get(`/auth/user?foo=bar`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send();

        const response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send();

        response.status.should.equal(200);
        response.body.data.should.deep.equal(filteredResponse.body.data);

        ensureHasPaginationElements(response);
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
