/* eslint-disable new-cap */
const nock = require('nock');
const chai = require('chai');
const mongoose = require('mongoose');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const UserTempModel = require('plugins/sd-ct-oauth-plugin/models/user-temp.model');
const RenewModel = require('plugins/sd-ct-oauth-plugin/models/renew.model');

chai.should();

const { getTestAgent, closeTestAgent } = require('./../test-server');

let requester;


nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('OAuth endpoints tests - Recover password post - JSON version', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        await UserModel.deleteMany({}).exec();
        await UserTempModel.deleteMany({}).exec();
        await RenewModel.deleteMany({}).exec();

        requester = await getTestAgent(true);


    });

    it('Recover password post with fake token returns a 422 error - JSON format', async () => {
        const response = await requester
            .post(`/auth/reset-password/token`)
            .set('Content-Type', 'application/json');

        return new Promise((resolve) => {
            response.status.should.equal(422);
            response.should.be.json;
            response.body.should.have.property('errors').and.be.an('array');
            response.body.errors[0].should.have.property('detail').and.equal(`Token expired`);

            resolve();
        });

    });

    it('Recover password post with correct token and missing passwords should return an error message - JSON format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response = await requester
            .post(`/auth/reset-password/myToken`)
            .set('Content-Type', 'application/json');

        return new Promise((resolve) => {
            response.status.should.equal(422);
            response.should.be.json;
            response.body.should.have.property('errors').and.be.an('array');
            response.body.errors[0].status.should.equal(422);
            response.body.errors[0].detail.should.equal('Password and Repeat password are required');

            resolve();
        });
    });

    it('Recover password post with correct token and missing repeat password should return an error message - JSON format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response = await requester
            .post(`/auth/reset-password/myToken`)
            .set('Content-Type', 'application/json')
            .send({
                password: 'abcd'
            });

        return new Promise((resolve) => {
            response.status.should.equal(422);
            response.should.be.json;
            response.body.should.have.property('errors').and.be.an('array');
            response.body.errors[0].status.should.equal(422);
            response.body.errors[0].detail.should.equal('Password and Repeat password not equal');

            resolve();
        });

    });

    it('Recover password post with correct token and different password and repeatPassword should return an error message - JSON format', async () => {
        const renewModel = await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const loadedRenewModels = await RenewModel.find({});
        loadedRenewModels.should.have.lengthOf(1);
        loadedRenewModels[0]._id.toString().should.equal(renewModel._id.toString());

        const response = await requester
            .post(`/auth/reset-password/myToken`)
            .set('Content-Type', 'application/json')
            .send({
                password: 'abcd',
                repeatPassword: 'efgh'
            });

        response.status.should.equal(422);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(422);
        response.body.errors[0].detail.should.equal('Password and Repeat password not equal');
    });

    it('Recover password post with correct token and matching passwords should redirect to the configured URL (happy case) - JSON format', async () => {
        const user = await new UserModel({
            __v: 0,
            email: 'test@example.com',
            password: '$2b$10$1wDgP5YCStyvZndwDu2GwuC6Ie9wj7yRZ3BNaaI.p9JqV8CnetdPK',
            salt: '$2b$10$1wDgP5YCStyvZndwDu2Gwu',
            extraUserData: {
                apps: ['rw']
            },
            _id: '5becfa2b67da0d3ec07a27f6',
            createdAt: '2018-11-15T04:46:35.313Z',
            role: 'USER',
            provider: 'local',
            name: 'lorem-ipsum',
            photo: 'http://www.random.rand/abc.jpg'
        }).save();

        await new RenewModel({
            userId: user._id,
            token: 'myToken'
        }).save();

        const response = await requester
            .post(`/auth/reset-password/myToken`)
            .set('Content-Type', 'application/json')
            .send({
                password: 'abcd',
                repeatPassword: 'abcd'
            });
        return new Promise((resolve) => {
            response.status.should.equal(200);
            response.redirects.should.be.an('array').and.length(0);

            const responseUser = response.body.data;
            // eslint-disable-next-line no-unused-expressions
            responseUser.should.have.property('id').and.be.a('string').and.not.be.empty;
            responseUser.should.have.property('name').and.be.a('string').and.equal('lorem-ipsum');
            responseUser.should.have.property('photo').and.be.a('string').and.equal('http://www.random.rand/abc.jpg');
            responseUser.should.have.property('email').and.equal('test@example.com');
            responseUser.should.have.property('role').and.equal('USER');
            responseUser.should.have.property('extraUserData').and.be.an('object');
            responseUser.extraUserData.should.have.property('apps').and.be.an('array').and.contain('rw');

            resolve();
        });

    });


    after(closeTestAgent);

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await UserTempModel.deleteMany({}).exec();
        await RenewModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
