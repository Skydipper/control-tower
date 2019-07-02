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

describe('GET users by id', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        UserModel.deleteMany({}).exec();

        nock.cleanAll();
    });

    it('Get user without being logged in returns a 401', async () => {
        const response = await requester
            .get(`/auth/user/41224d776a326fb40f000001`)
            .send();

        response.status.should.equal(401);
    });

    it('Get user while being logged in as a regular user returns a 400 error', async () => {
        const response = await requester
            .get(`/auth/user/41224d776a326fb40f000001`)
            .set('Authorization', `Bearer ${TOKENS.USER}`)
            .send();

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get user with an invalid id of a user that does not exist returns a 422', async () => {
        const response = await requester
            .get(`/auth/user/1234`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send();

        response.status.should.equal(422);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Invalid id 1234 provided`);

    });

    it('Get user with id of a user that does not exist returns a 404', async () => {
        const response = await requester
            .get(`/auth/user/41224d776a326fb40f000001`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send();

        response.status.should.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal(`User not found`);
    });

    it('Get user with id of a user that exists returns the requested user (happy case)', async () => {
        const userOne = await new UserModel(createUser()).save();

        const response = await requester
            .get(`/auth/user/${userOne.id}`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send();

        response.status.should.equal(200);

        response.body.should.have.property('_id').and.equal(userOne.id);
        response.body.should.have.property('extraUserData').and.be.an('object');
        response.body.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userOne.extraUserData.apps);
        response.body.should.have.property('email').and.equal(userOne.email);
        response.body.should.have.property('createdAt');
        response.body.should.have.property('role').and.equal(userOne.role);
        response.body.should.have.property('provider').and.equal(userOne.provider);
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
