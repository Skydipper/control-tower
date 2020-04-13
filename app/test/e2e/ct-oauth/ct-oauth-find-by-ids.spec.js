/* eslint-disable no-unused-expressions */
const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUser, createUserAndToken } = require('../utils/helpers');
const { getTestAgent, closeTestAgent } = require('./../test-server');
const { TOKENS } = require('./../test.constants');

chai.should();

let requester;

let userOne;
let userTwo;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Find users by id', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        UserModel.deleteMany({}).exec();
    });

    it('Find users without being logged in returns a 401', async () => {
        const response = await requester
            .post(`/auth/user/find-by-ids`)
            .send({});

        response.status.should.equal(401);
    });

    it('Find users while being logged in as a regular user returns a 400 error', async () => {
        const { token } = await createUserAndToken();

        const response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Find users without ids in body returns a 400 error', async () => {
        const response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({});

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Ids objects required`);
    });

    it('Find users with id list containing non-object ids returns an empty list (invalid ids are ignored)', async () => {
        const response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({ ids: ['123'] });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(0);
    });

    it('Find users with id list containing user that does not exist returns an empty list (empty db)', async () => {
        const response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({
                ids: ['58333dcfd9f39b189ca44c75']
            });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(0);
    });

    it('Find users with id list containing a user that exists returns only the listed user', async () => {
        userOne = await new UserModel(createUser()).save();
        userTwo = await new UserModel(createUser()).save();

        const response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({
                ids: [userOne.id]
            });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(1);

        const responseUserOne = response.body.data[0];

        responseUserOne.should.have.property('_id').and.equal(userOne.id);
        responseUserOne.should.have.property('extraUserData').and.be.an('object');
        responseUserOne.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userOne.extraUserData.apps);
        responseUserOne.should.have.property('email').and.equal(userOne.email);
        responseUserOne.should.have.property('createdAt');
        responseUserOne.should.have.property('role').and.equal(userOne.role);
        responseUserOne.should.have.property('provider').and.equal(userOne.provider);
    });

    it('Find users with id list containing users that exist returns the listed users', async () => {
        const response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({
                ids: [userOne.id, userTwo.id]
            });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(2);

        const responseUserOne = response.body.data[0];
        const responseUserTwo = response.body.data[1];

        responseUserOne.should.have.property('_id').and.equal(userOne.id);
        responseUserOne.should.have.property('extraUserData').and.be.an('object');
        responseUserOne.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userOne.extraUserData.apps);
        responseUserOne.should.have.property('email').and.equal(userOne.email);
        responseUserOne.should.have.property('createdAt');
        responseUserOne.should.have.property('role').and.equal(userOne.role);
        responseUserOne.should.have.property('provider').and.equal(userOne.provider);

        responseUserTwo.should.have.property('_id').and.equal(userTwo.id);
        responseUserTwo.should.have.property('extraUserData').and.be.an('object');
        responseUserTwo.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userTwo.extraUserData.apps);
        responseUserTwo.should.have.property('email').and.equal(userTwo.email);
        responseUserTwo.should.have.property('createdAt');
        responseUserTwo.should.have.property('role').and.equal(userTwo.role);
        responseUserTwo.should.have.property('provider').and.equal(userTwo.provider);
    });

    it('Find users with id list containing users that exist returns the listed users (id query param is useless)', async () => {
        const response = await requester
            .post(`/auth/user/find-by-ids?ids=${userTwo.id}`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({
                ids: [userOne.id]
            });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(1);

        const responseUserOne = response.body.data[0];

        responseUserOne.should.have.property('_id').and.equal(userOne.id);
        responseUserOne.should.have.property('extraUserData').and.be.an('object');
        responseUserOne.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userOne.extraUserData.apps);
        responseUserOne.should.have.property('email').and.equal(userOne.email);
        responseUserOne.should.have.property('createdAt');
        responseUserOne.should.have.property('role').and.equal(userOne.role);
        responseUserOne.should.have.property('provider').and.equal(userOne.provider);
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
