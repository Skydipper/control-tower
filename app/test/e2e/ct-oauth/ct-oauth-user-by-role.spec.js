/* eslint-disable no-unused-expressions */
const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUser, createUserAndToken } = require('../utils/helpers');
const { getTestAgent, closeTestAgent } = require('./../test-server');
const { TOKENS } = require('./../test.constants');

chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('GET users ids by role', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        UserModel.deleteMany({}).exec();


    });

    it('Get users ids by role without being logged in returns a 401', async () => {
        const response = await requester
            .get(`/auth/user/ids/USER`);

        response.status.should.equal(401);
    });

    it('Get users ids by role while being logged in as a USER returns a 400 error', async () => {
        const { token } = await createUserAndToken({ role: 'USER' });

        const response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get users ids by role while being logged in as a MANAGER returns a 400 error', async () => {
        const { token } = await createUserAndToken({ role: 'MANAGER' });

        const response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get users ids by role while being logged in as an ADMIN returns a 400 error', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get users ids by role with an invalid role returns a 422', async () => {
        const response = await requester
            .get(`/auth/user/ids/FOO`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);

        response.status.should.equal(422);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Invalid role FOO provided`);
    });

    it('Get users ids by role with a valid role and no users on the database returns a 200 response and an empty array', async () => {
        const response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);

        response.status.should.equal(200);

        response.body.should.have.property('data').and.eql([]);
    });

    it('Get users ids by role with a valid role returns a 200 response with the users ids (happy case, single user)', async () => {
        const userOne = await new UserModel(createUser()).save();

        const response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(1);

        response.body.should.have.property('data').and.eql([userOne.id]);
    });

    it('Get users ids by role with a valid role returns a 200 response with the users ids (happy case, multiple users)', async () => {
        await new UserModel(createUser({ extraUserData: { apps: ['rw'] }, role: 'ADMIN' })).save();
        await new UserModel(createUser({ extraUserData: { apps: ['rw'] }, role: 'MANAGER' })).save();
        const userThree = await new UserModel(createUser({ extraUserData: { apps: ['rw'] }, role: 'USER' })).save();
        const userFour = await new UserModel(createUser({ extraUserData: { apps: ['rw'] }, role: 'USER' })).save();

        const response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(2);

        response.body.should.have.property('data').and.eql([userThree.id, userFour.id]);
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
