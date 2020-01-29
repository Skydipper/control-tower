const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const Endpoint = require('models/endpoint.model');

const { getTestAgent } = require('./../test-server');
const {
    updateVersion, createEndpoint, ensureCorrectError, createUserAndToken
} = require('../utils/helpers');
const { createMockEndpoint } = require('../mock');
const { TOKENS } = require('./../test.constants');

chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Authorization tests', () => {
    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Sending request without token to not authenticated request should be successful', async () => {
        await updateVersion();
        await createEndpoint();
        createMockEndpoint('/api/v1/dataset');

        const result = await requester.post('/api/v1/dataset');
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Sending request without token to authenticated request should be unsuccessful with unauthorized error ', async () => {
        await updateVersion();
        await createEndpoint({ authenticated: true });

        const result = await requester.post('/api/v1/dataset');
        result.status.should.equal(401);
        ensureCorrectError(result, 'Unauthorized', 401);
    });

    it('Sending request with bogus token to authenticated request should be unsuccessful with unauthorized error ', async () => {
        await updateVersion();
        await createEndpoint({ authenticated: true });

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer 1234`);
        result.status.should.equal(401);
        ensureCorrectError(result, 'Your token is invalid. Please use /auth/login to login and /auth/generate-token to generate a new token.', 401);
    });

    it('Sending request with token to authenticated request but ROLE is changed should be unsuccessful with unauthorized error ', async () => {
        await updateVersion();
        await createEndpoint();

        const { user, token } = await createUserAndToken();
        await UserModel.updateOne({ _id: user.id }, { $set: { role: 'ADMIN' } });

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer ${token}`);
        ensureCorrectError(result, 'Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.', 401);
    });

    it('Sending request with token to authenticated request but EMAIL is changed should be unsuccessful with unauthorized error ', async () => {
        await updateVersion();
        await createEndpoint({ authenticated: true });

        const { user, token } = await createUserAndToken();
        await UserModel.updateOne({ _id: user.id }, { $set: { email: 'test123' } });

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer ${token}`);
        ensureCorrectError(result, 'Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.', 401);
    });

    it('Sending request with token to authenticated request but EMAIL is absent on the database should be unsuccessful with unauthorized error ', async () => {
        await updateVersion();
        await createEndpoint({ authenticated: true });

        const { user, token } = await createUserAndToken({ email: null });
        await UserModel.updateOne({ _id: user.id }, { $set: { email: 'test123' } });

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer ${token}`);
        ensureCorrectError(result, 'Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.', 401);
    });

    it('Sending request with token to authenticated request but EMAIL is absent on the token should be unsuccessful with unauthorized error ', async () => {
        await updateVersion();
        await createEndpoint({ authenticated: true });

        const { user, token } = await createUserAndToken();
        await UserModel.updateOne({ _id: user.id }, { $set: { email: null } });

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer ${token}`);
        ensureCorrectError(result, 'Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.', 401);
    });

    it('Sending request with token to authenticated request and EMAIL is absent on both the token and the database should be successful ', async () => {
        await updateVersion();
        await createEndpoint({ authenticated: true });
        createMockEndpoint('/api/v1/dataset');

        const { token } = await createUserAndToken({ email: null });

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer ${token}`);
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Sending request with token to authenticated request but extraUserData is changed should be unsuccessful with unauthorized error ', async () => {
        await updateVersion();
        await createEndpoint({ authenticated: true });

        const { user, token } = await createUserAndToken();
        await UserModel.updateOne({ _id: user.id }, { $set: { extraUserData: [] } });

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer ${token}`);
        ensureCorrectError(result, 'Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.', 401);
    });

    it('Sending request with token to authenticated request but user is removed should be unsuccessful with unauthorized error ', async () => {
        await updateVersion();
        await createEndpoint({ authenticated: true });

        const { token } = await createUserAndToken();
        await UserModel.deleteMany({}).exec();

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer ${token}`);
        ensureCorrectError(result, 'Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.', 401);
    });

    it('Sending request with a user token to authenticated request and user is actual should be successful (happy case)', async () => {
        await updateVersion();
        await createEndpoint();
        createMockEndpoint('/api/v1/dataset');

        const { token } = await createUserAndToken();

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer ${token}`);
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    it('Sending request with MICROSERVICE token to authenticated request and user is actual should be successful (happy case)', async () => {
        await updateVersion();
        await createEndpoint();
        createMockEndpoint('/api/v1/dataset');

        const result = await requester.post('/api/v1/dataset').set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);
        result.status.should.equal(200);
        result.text.should.equal('ok');
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await Endpoint.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
