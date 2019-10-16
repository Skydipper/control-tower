/* eslint-disable no-unused-expressions */
const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUser, createUserAndToken } = require('../utils/helpers');
const { getTestAgent, closeTestAgent } = require('./../test-server');

const should = chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('GET users by id', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        await UserModel.deleteMany({}).exec();

        nock.cleanAll();
    });

    it('Get user without being logged in returns a 401', async () => {
        const response = await requester
            .get(`/auth/user/41224d776a326fb40f000001`);

        response.status.should.equal(401);
    });

    it('Get user while being logged in as a regular user returns a 400 error', async () => {
        const { token } = await createUserAndToken({ role: 'USER' });

        const response = await requester
            .get(`/auth/user/41224d776a326fb40f000001`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get user with an invalid id of a user that does not exist returns a 422', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth/user/1234`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(422);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Invalid id 1234 provided`);

    });

    it('Get user with id of a user that does not exist returns a 404', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth/user/41224d776a326fb40f000001`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal(`User not found`);
    });

    it('Get user with id of a user that exists returns the requested user (happy case)', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth/user/${user.id}`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);

        response.body.should.have.property('_id').and.equal(user.id.toString());
        response.body.should.have.property('extraUserData').and.be.an('object');
        response.body.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(user.extraUserData.apps);
        response.body.should.have.property('email').and.equal(user.email);
        response.body.should.have.property('createdAt');
        response.body.should.have.property('role').and.equal(user.role);
        response.body.should.have.property('provider').and.equal(user.provider);
    });

    after(closeTestAgent);

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
