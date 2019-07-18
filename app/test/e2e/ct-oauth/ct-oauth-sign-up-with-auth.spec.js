const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const UserTempModel = require('plugins/sd-ct-oauth-plugin/models/user-temp.model');

const { setPluginSetting } = require('./../utils');
const { getTestAgent, closeTestAgent } = require('./../test-server');
const { TOKENS } = require('./../test.constants');
const { isEqual } = require('lodash');

const should = chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('OAuth endpoints tests - Sign up without auth', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        // We need to force-start the server, to ensure mongo has plugin info we can manipulate in the next instruction
        await getTestAgent(true);

        await setPluginSetting('oauth', 'allowPublicRegistration', false);

        requester = await getTestAgent(true);

        UserModel.deleteMany({}).exec();
        UserTempModel.deleteMany({}).exec();

        nock.cleanAll();
    });

    it('Registering a user without being logged in returns an 401 error (JSON format)', async () => {
        const response = await requester
            .post(`/auth/sign-up`)
            .send();

        response.status.should.equal(401);
        response.header['content-type'].should.equal('application/json; charset=utf-8');
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authenticated`);
    });

    it('Registering a user without the actual data returns a 200 error (TODO: this should return a 422)', async () => {
        const response = await requester
            .post(`/auth/sign-up`)
            .type('form')
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .send();

        response.status.should.equal(200);
        response.text.should.include('Email, Password and Repeat password are required');
    });

    it('Registering a user with partial data returns a 200 error (TODO: this should return a 422)', async () => {
        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com'
            });

        response.status.should.equal(200);
        response.text.should.include('Email, Password and Repeat password are required');
    });

    it('Registering a user with different passwords returns a 200 error (TODO: this should return a 422)', async () => {
        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'anotherpassword'
            });

        response.status.should.equal(200);
        response.text.should.include('Password and Repeat password not equal');
    });

    it('Registering a user with different passwords returns a 200 error (TODO: this should return a 422)', async () => {
        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'anotherpassword'
            });

        response.status.should.equal(200);
        response.text.should.include('Password and Repeat password not equal');
    });

    // User registration - no app
    it('Registering a user with correct data and no app returns a 200', async () => {
        process.on('unhandledRejection', (error) => {
            should.fail(error.actual, error.expected, error.message);
        });

        nock('https://api.sparkpost.com')
            .post('/api/v1/transmissions', async (body) => {
                const expectedRequestBody = {
                    content: {
                        template_id: 'confirm-user'
                    },
                    recipients: [
                        {
                            address: {
                                email: 'someemail@gmail.com'
                            }
                        }
                    ],
                    substitution_data: {
                        fromName: 'RW API'
                    }
                };

                const userTemp = await UserTempModel.findOne({
                    email: 'someemail@gmail.com'
                });

                expectedRequestBody.substitution_data.urlConfirm = `${process.env.PUBLIC_URL}/auth/confirm/${userTemp.confirmationToken}`;

                body.should.deep.equal(expectedRequestBody);

                return isEqual(body, expectedRequestBody);
            })
            .reply(200);

        const missingUser = await UserTempModel.findOne({ email: 'someemail@gmail.com' }).exec();
        should.not.exist(missingUser);

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'somepassword'
            });

        response.status.should.equal(200);
        response.text.should.include('Register correct');
        response.text.should.include('Check your email and confirm your account');

        const user = await UserTempModel.findOne({ email: 'someemail@gmail.com' }).exec();
        should.exist(user);
        user.should.have.property('email').and.equal('someemail@gmail.com');
        user.should.have.property('role').and.equal('USER');
        // eslint-disable-next-line
        user.should.have.property('confirmationToken').and.not.be.empty;
        user.should.have.property('extraUserData').and.be.an('object');
        // eslint-disable-next-line
        user.extraUserData.should.have.property('apps').and.be.an('array').and.be.empty;
    });

    it('Registering a user with an existing email address (temp user) returns a 200 error (TODO: this should return a 422)', async () => {
        const tempUser = await UserTempModel.findOne({ email: 'someemail@gmail.com' }).exec();
        should.exist(tempUser);

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'somepassword'
            });

        response.status.should.equal(200);
        response.text.should.include('Email exist');
    });

    it('Confirming a user\'s account using the email token should be successful', async () => {
        const tempUser = await UserTempModel.findOne({ email: 'someemail@gmail.com' }).exec();

        const response = await requester
            .get(`/auth/confirm/${tempUser.confirmationToken}`)
            .send();

        response.status.should.equal(200);

        const missingTempUser = await UserTempModel.findOne({ email: 'someemail@gmail.com' }).exec();
        should.not.exist(missingTempUser);

        const confirmedUser = await UserModel.findOne({ email: 'someemail@gmail.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('someemail@gmail.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('extraUserData').and.be.an('object');
        // eslint-disable-next-line
        confirmedUser.extraUserData.should.have.property('apps').and.be.an('array').and.be.empty;
    });

    it('Registering a user with an existing email address (confirmed user) returns a 200 error (TODO: this should return a 422)', async () => {
        const user = await UserModel.findOne({ email: 'someemail@gmail.com' }).exec();
        should.exist(user);

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'somepassword'
            });

        response.status.should.equal(200);
        response.text.should.include('Email exist');
    });

    // User registration - with app
    it('Registering a user with correct data and app returns a 200', async () => {
        process.on('unhandledRejection', (error) => {
            should.fail(error.actual, error.expected, error.message);
        });

        nock('https://api.sparkpost.com')
            .post('/api/v1/transmissions', async (body) => {
                const expectedRequestBody = {
                    content: {
                        template_id: 'confirm-user'
                    },
                    recipients: [
                        {
                            address: {
                                email: 'someotheremail@gmail.com'
                            }
                        }
                    ],
                    substitution_data: {
                        fromName: 'RW API'
                    }
                };

                const userTemp = await UserTempModel.findOne({
                    email: 'someotheremail@gmail.com'
                });

                expectedRequestBody.substitution_data.urlConfirm = `${process.env.PUBLIC_URL}/auth/confirm/${userTemp.confirmationToken}`;

                body.should.deep.equal(expectedRequestBody);

                return isEqual(body, expectedRequestBody);
            })
            .reply(200);

        const missingUser = await UserTempModel.findOne({ email: 'someotheremail@gmail.com' }).exec();
        should.not.exist(missingUser);

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`)
            .type('form')
            .send({
                email: 'someotheremail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'somepassword',
                apps: ['rw']
            });

        response.status.should.equal(200);
        response.text.should.include('Register correct');
        response.text.should.include('Check your email and confirm your account');

        const user = await UserTempModel.findOne({ email: 'someotheremail@gmail.com' }).exec();
        should.exist(user);
        user.should.have.property('email').and.equal('someotheremail@gmail.com');
        user.should.have.property('role').and.equal('USER');
        // eslint-disable-next-line
        user.should.have.property('confirmationToken').and.not.be.empty;
        user.should.have.property('extraUserData').and.be.an('object');
        user.extraUserData.apps.should.be.an('array').and.contain('rw');
    });

    it('Confirming a user\'s account using the email token should be successful', async () => {
        const tempUser = await UserTempModel.findOne({ email: 'someotheremail@gmail.com' }).exec();

        const response = await requester
            .get(`/auth/confirm/${tempUser.confirmationToken}`)
            .send();

        response.status.should.equal(200);

        const missingTempUser = await UserTempModel.findOne({ email: 'someotheremail@gmail.com' }).exec();
        should.not.exist(missingTempUser);

        const confirmedUser = await UserModel.findOne({ email: 'someotheremail@gmail.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('someotheremail@gmail.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('extraUserData').and.be.an('object');
        confirmedUser.extraUserData.apps.should.be.an('array').and.contain('rw');
    });

    after(async () => {
        UserModel.deleteMany({}).exec();
        UserTempModel.deleteMany({}).exec();

        closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
