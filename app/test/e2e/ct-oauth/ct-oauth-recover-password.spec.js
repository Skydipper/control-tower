const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const UserTempModel = require('plugins/sd-ct-oauth-plugin/models/user-temp.model');
const RenewModel = require('plugins/sd-ct-oauth-plugin/models/renew.model');
const { isEqual } = require('lodash');

const should = chai.should();

const { getTestAgent, closeTestAgent } = require('./../test-server');

let requester;


nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('OAuth endpoints tests - Recover password', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent(true);

        UserModel.deleteMany({}).exec();
        UserTempModel.deleteMany({}).exec();

        nock.cleanAll();
    });

    beforeEach(async () => {

        UserModel.deleteMany({}).exec();
        UserTempModel.deleteMany({}).exec();
        RenewModel.deleteMany({}).exec();

        nock.cleanAll();
    });

    it('Recover password request with no email should return an error - HTML format (TODO: this should return a 422)', async () => {
        const response = await requester
            .post(`/auth/reset-password`)
            .send();


        response.status.should.equal(200);
        response.header['content-type'].should.equal('text/html; charset=utf-8');
        response.text.should.include(`Mail required`);
    });

    it('Recover password request with no email should return an error - JSON format', async () => {
        const response = await requester
            .post(`/auth/reset-password`)
            .set('Content-Type', 'application/json')
            .send();


        response.status.should.equal(422);
        response.header['content-type'].should.equal('application/json; charset=utf-8');
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Mail required`);
    });

    it('Recover password request with non-existing email should return an error - HTML format', async () => {
        const response = await requester
            .post(`/auth/reset-password`)
            .type('form')
            .send({
                email: 'pepito@gmail.com'
            });

        response.status.should.equal(200);
        response.header['content-type'].should.equal('text/html; charset=utf-8');
        response.text.should.include(`User not found`);
    });

    it('Recover password request with non-existing email should return a 422 error - JSON format', async () => {
        const response = await requester
            .post(`/auth/reset-password`)
            .set('Content-Type', 'application/json')
            .send({
                email: 'pepito@gmail.com'
            });

        response.status.should.equal(422);
        response.header['content-type'].should.equal('application/json; charset=utf-8');
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`User not found`);
    });

    it('Recover password request with correct email should return OK - HTML format', async () => {
        process.on('unhandledRejection', (error) => {
            should.fail(error.actual, error.expected, error.message);
        });

        nock('https://api.sparkpost.com')
            .post('/api/v1/transmissions', async (body) => {
                const expectedRequestBody = {
                    content: {
                        template_id: 'recover-password'
                    },
                    recipients: [
                        {
                            address: {
                                email: 'potato@gmail.com'
                            }
                        }
                    ],
                    substitution_data: {
                        fromName: 'RW API'
                    }
                };

                const userTemp = await UserModel.findOne({
                    email: 'potato@gmail.com'
                });

                const renew = await RenewModel.findOne({ userId: userTemp.id });

                expectedRequestBody.substitution_data.urlRecover = `${process.env.PUBLIC_URL}/auth/reset-password/${renew.token}`;

                body.should.deep.equal(expectedRequestBody);

                return isEqual(body, expectedRequestBody);
            })
            .reply(200);

        await new UserModel({
            email: 'potato@gmail.com'
        }).save();

        const response = await requester
            .post(`/auth/reset-password`)
            .type('form')
            .send({
                email: 'potato@gmail.com'
            });

        response.status.should.equal(200);
        response.header['content-type'].should.equal('text/html; charset=utf-8');
        response.text.should.include(`Email sent`);
    });

    it('Recover password request with correct email should return OK - JSON format', async () => {
        process.on('unhandledRejection', (error) => {
            should.fail(error.actual, error.expected, error.message);
        });

        nock('https://api.sparkpost.com')
            .post('/api/v1/transmissions', async (body) => {
                const expectedRequestBody = {
                    content: {
                        template_id: 'recover-password'
                    },
                    recipients: [
                        {
                            address: {
                                email: 'potato@gmail.com'
                            }
                        }
                    ],
                    substitution_data: {
                        fromName: 'RW API'
                    }
                };

                const user = await UserModel.findOne({
                    email: 'potato@gmail.com'
                });

                const renew = await RenewModel.findOne({ userId: user.id });

                expectedRequestBody.substitution_data.urlRecover = `${process.env.PUBLIC_URL}/auth/reset-password/${renew.token}`;

                body.should.deep.equal(expectedRequestBody);

                return isEqual(body, expectedRequestBody);
            })
            .reply(200);

        await new UserModel({
            email: 'potato@gmail.com'
        }).save();

        const response = await requester
            .post(`/auth/reset-password`)
            .set('Content-Type', 'application/json')
            .send({
                email: 'potato@gmail.com'
            });

        response.status.should.equal(200);
        response.header['content-type'].should.equal('application/json; charset=utf-8');
        response.body.should.have.property('message').and.equal(`Email sent`);
    });

    after(async () => {
        UserModel.deleteMany({}).exec();
        UserTempModel.deleteMany({}).exec();
        RenewModel.deleteMany({}).exec();

        closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
