const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const UserTempModel = require('plugins/sd-ct-oauth-plugin/models/user-temp.model');

const { isEqual } = require('lodash');
const { setPluginSetting, createUserAndToken, createTempUser } = require('../utils/helpers');

const { getTestAgent, closeTestAgent } = require('./../test-server');

const should = chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('OAuth endpoints tests - Sign up with HTML UI', () => {

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


    });

    it('Registering a user without being logged in returns an 401 error (JSON format)', async () => {
        const response = await requester
            .post(`/auth/sign-up`);

        response.status.should.equal(401);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authenticated`);
    });

    it('Registering a user without the actual data returns a 200 error (TODO: this should return a 422)', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .post(`/auth/sign-up`)
            .type('form')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.text.should.include('Email, Password and Repeat password are required');
    });

    it('Registering a user with partial data returns a 200 error (TODO: this should return a 422)', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${token}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com'
            });

        response.status.should.equal(200);
        response.text.should.include('Email, Password and Repeat password are required');
    });

    it('Registering a user with different passwords returns a 200 error (TODO: this should return a 422)', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${token}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'anotherpassword'
            });

        response.status.should.equal(200);
        response.text.should.include('Password and Repeat password not equal');
    });

    it('Registering a user with correct data and no app returns a 200', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        nock('https://api.sparkpost.com')
            .post('/api/v1/transmissions', (body) => {
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
                        fromEmail: 'noreply@resourcewatch.org',
                        fromName: 'RW API',
                        appName: 'RW API',
                        logo: 'https://resourcewatch.org/static/images/logo-embed.png'
                    }
                };

                body.should.have.property('substitution_data').and.be.an('object');
                body.substitution_data.should.have.property('urlConfirm').and.include(`${process.env.PUBLIC_URL}/auth/confirm/`);

                delete body.substitution_data.urlConfirm;

                body.should.deep.equal(expectedRequestBody);

                return isEqual(body, expectedRequestBody);
            })
            .reply(200);

        const missingUser = await UserTempModel.findOne({ email: 'someemail@gmail.com' }).exec();
        should.not.exist(missingUser);

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${token}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'somepassword'
            });

        response.status.should.equal(200);
        response.text.should.include('Registration successful');
        response.text.should.include('We\'ve sent you an email. Click the link in it to confirm your account.');

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
        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const tempUser = await createTempUser({ email: 'someemail@gmail.com' });

        should.exist(tempUser);

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${token}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'somepassword'
            });

        response.status.should.equal(200);
        response.text.should.include('Email exists');
    });

    it('Confirming a user\'s account using the email token should be successful', async () => {
        const tempUser = await createTempUser({ email: 'someemail@gmail.com' });

        const response = await requester
            .get(`/auth/confirm/${tempUser.confirmationToken}`)
            .redirects(0);

        response.should.redirect;

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
        const { token, user } = await createUserAndToken({ role: 'ADMIN', email: 'someemail@gmail.com' });

        should.exist(user);

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${token}`)
            .type('form')
            .send({
                email: 'someemail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'somepassword'
            });

        response.status.should.equal(200);
        response.text.should.include('Email exists');
    });

    // User registration - with app
    it('Registering a user with correct data and app returns a 200', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        nock('https://api.sparkpost.com')
            .post('/api/v1/transmissions', (body) => {
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
                        fromEmail: 'noreply@resourcewatch.org',
                        fromName: 'RW API',
                        appName: 'RW API',
                        logo: 'https://resourcewatch.org/static/images/logo-embed.png'
                    }
                };

                body.should.have.property('substitution_data').and.be.an('object');
                body.substitution_data.should.have.property('urlConfirm').and.include(`${process.env.PUBLIC_URL}/auth/confirm/`);

                delete body.substitution_data.urlConfirm;

                body.should.deep.equal(expectedRequestBody);

                return isEqual(body, expectedRequestBody);
            })
            .reply(200);

        const missingUser = await UserTempModel.findOne({ email: 'someotheremail@gmail.com' }).exec();
        should.not.exist(missingUser);

        const response = await requester
            .post(`/auth/sign-up`)
            .set('Authorization', `Bearer ${token}`)
            .type('form')
            .send({
                email: 'someotheremail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'somepassword',
                apps: ['rw']
            });

        response.status.should.equal(200);
        response.text.should.include('Registration successful');
        response.text.should.include('We\'ve sent you an email. Click the link in it to confirm your account.');

        const user = await UserTempModel.findOne({ email: 'someotheremail@gmail.com' }).exec();
        should.exist(user);
        user.should.have.property('email').and.equal('someotheremail@gmail.com');
        user.should.have.property('role').and.equal('USER');
        // eslint-disable-next-line
        user.should.have.property('confirmationToken').and.not.be.empty;
        user.should.have.property('extraUserData').and.be.an('object');
        user.extraUserData.apps.should.be.an('array').and.contain('rw');
    });

    // User registration - with app
    it('Registering a user with correct data, app and a custom origin returns a 200 and sends the email with the corresponding logo', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        nock('https://api.sparkpost.com')
            .post('/api/v1/transmissions', (body) => {
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
                        fromEmail: 'noreply@globalforestwatch.org',
                        fromName: 'GFW',
                        appName: 'GFW',
                        logo: 'https://www.globalforestwatch.org/packs/gfw-9c5fe396ee5b15cb5f5b639a7ef771bd.png'
                    }
                };

                body.should.have.property('substitution_data').and.be.an('object');
                body.substitution_data.should.have.property('urlConfirm').and.include(`${process.env.PUBLIC_URL}/auth/confirm/`);

                delete body.substitution_data.urlConfirm;

                body.should.deep.equal(expectedRequestBody);

                return isEqual(body, expectedRequestBody);
            })
            .reply(200);

        const missingUser = await UserTempModel.findOne({ email: 'someotheremail@gmail.com' }).exec();
        should.not.exist(missingUser);

        const response = await requester
            .post(`/auth/sign-up?origin=gfw`)
            .set('Authorization', `Bearer ${token}`)
            .type('form')
            .send({
                email: 'someotheremail@gmail.com',
                password: 'somepassword',
                repeatPassword: 'somepassword',
                apps: ['rw']
            });

        response.status.should.equal(200);
        response.text.should.include('Registration successful');
        response.text.should.include('We\'ve sent you an email. Click the link in it to confirm your account.');

        const user = await UserTempModel.findOne({ email: 'someotheremail@gmail.com' }).exec();
        should.exist(user);
        user.should.have.property('email').and.equal('someotheremail@gmail.com');
        user.should.have.property('role').and.equal('USER');
        // eslint-disable-next-line
        user.should.have.property('confirmationToken').and.not.be.empty;
        user.should.have.property('extraUserData').and.be.an('object');
        user.extraUserData.apps.should.be.an('array').and.contain('rw');
    });

    after(closeTestAgent);

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await UserTempModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
