/* eslint-disable no-unused-expressions */
const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUser } = require('./../utils');
const { getTestAgent, closeTestAgent } = require('./../test-server');
const { TOKENS } = require('./../test.constants');

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('DELETE users by id', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        UserModel.deleteMany({}).exec();

        nock.cleanAll();
    });

    it('Delete user without being logged in returns a 401', async () => {
        const response = await requester
            .delete(`/auth/user/41224d776a326fb40f000001`)
            .send();

        response.status.should.equal(401);
    });

    it('Delete user while being logged in as a regular user returns a 400 error', async () => {
        const response = await requester
            .delete(`/auth/user/41224d776a326fb40f000001`)
            .set('Authorization', `Bearer ${TOKENS.USER}`)
            .send();

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Delete user while being logged in as a MANAGER returns a 400 error', async () => {
        const response = await requester
            .delete(`/auth/user/41224d776a326fb40f000001`)
            .set('Authorization', `Bearer ${TOKENS.MANAGER}`)
            .send();

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Delete user with an invalid id of a user that does not exist returns a 422', async () => {
        const response = await requester
            .delete(`/auth/user/1234`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send();

        response.status.should.equal(422);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Invalid id 1234 provided`);

    });

    it('Delete user with id of a user that does not exist returns a 404', async () => {
        const response = await requester
            .delete(`/auth/user/41224d776a326fb40f000001`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send();

        response.status.should.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal(`User not found`);
    });

    it('Delete user with id of a user that exists succeeds and returns the requested user (happy case - MICROSERVICE account)', async () => {
        const userOne = await new UserModel(createUser()).save();

        const response = await requester
            .delete(`/auth/user/${userOne.id}`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send();

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');

        const responseUserOne = response.body.data;

        responseUserOne.should.have.property('id').and.equal(userOne.id);
        responseUserOne.should.have.property('extraUserData').and.be.an('object');
        responseUserOne.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userOne.extraUserData.apps);
        responseUserOne.should.have.property('email').and.equal(userOne.email);
        responseUserOne.should.have.property('createdAt');
        responseUserOne.should.have.property('role').and.equal(userOne.role);
    });

    it('Delete user with id of a user that exists succeeds and returns the requested user (happy case - ADMIN role account)', async () => {
        const userOne = await new UserModel(createUser()).save();

        const response = await requester
            .delete(`/auth/user/${userOne.id}`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .send();

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');

        const responseUserOne = response.body.data;

        responseUserOne.should.have.property('id').and.equal(userOne.id);
        responseUserOne.should.have.property('extraUserData').and.be.an('object');
        responseUserOne.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userOne.extraUserData.apps);
        responseUserOne.should.have.property('email').and.equal(userOne.email);
        responseUserOne.should.have.property('createdAt');
        responseUserOne.should.have.property('role').and.equal(userOne.role);
    });

    after(async () => {
        UserModel.deleteMany({}).exec();

        closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
