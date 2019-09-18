/* eslint-disable no-unused-expressions */
const nock = require('nock');
const chai = require('chai');

const mongoose = require('mongoose');
const config = require('config');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const whiteListModelFunc = require('plugins/sd-ct-oauth-plugin/models/white-list.model');

const { getTestAgent, closeTestAgent } = require('./../test-server');
const { TOKENS } = require('./../test.constants');

const should = chai.should();

let requester;

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;
const connection = mongoose.createConnection(mongoUri);

let WhiteListModel;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Auth endpoints tests - Delete user', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        WhiteListModel = whiteListModelFunc(connection);

        UserModel.deleteMany({}).exec();
        WhiteListModel.deleteMany({}).exec();

        nock.cleanAll();
    });

    it('Deleting a user while not logged in should return a 401', async () => {
        const response = await requester
            .delete(`/auth/user/1`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not authenticated');
    });

    it('Deleting a user while logged in as USER should return a 403', async () => {
        const response = await requester
            .delete(`/auth/user/1`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${TOKENS.USER}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Deleting a user while logged in as MANAGER should return a 403', async () => {
        const response = await requester
            .delete(`/auth/user/1`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${TOKENS.MANAGER}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Deleting a user with an id that does not match an existing user should return a 404', async () => {
        const response = await requester
            .delete(`/auth/user/41224d776a326fb40f000001`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(404);
        response.body.errors[0].detail.should.equal('User not found');
    });

    it('Delete user with an invalid id of a user that does not exist returns a 422', async () => {
        const response = await requester
            .delete(`/auth/user/1234`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);

        response.status.should.equal(422);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Invalid id 1234 provided`);
    });

    it('Deleting an existing user should return a 200 and the deleted user data', async () => {
        const user = await new UserModel({
            email: 'test@example.com',
            password: '$2b$10$1wDgP5YCStyvZndwDu2GwuC6Ie9wj7yRZ3BNaaI.p9JqV8CnetdPK',
            salt: '$2b$10$1wDgP5YCStyvZndwDu2Gwu',
            extraUserData: {
                apps: ['rw']
            },
            _id: '5becfa2b67da0d3ec07a27f6',
            userToken: 'abcdef',
            createdAt: '2018-11-15T04:46:35.313Z',
            role: 'USER',
            provider: 'local',
            name: 'lorem-ipsum',
            photo: 'http://www.random.rand/abc.jpg'
        }).save();

        const token = await new WhiteListModel({
            _id: '5c6424951cf17b0011a2aafd',
            token: 'abcdef',
            createdAt: '2019-02-13T14:07:17.126Z'
        }).save();

        const response = await requester
            .delete(`/auth/user/${user.id}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`);

        response.status.should.equal(200);

        response.body.data.should.have.property('id').and.equal(user.id);
        response.body.data.should.have.property('email').and.equal(user.email);
        response.body.data.should.have.property('name').and.equal(user.name);
        response.body.data.should.have.property('photo').and.equal(user.photo);
        response.body.data.should.have.property('role').and.equal(user.role);
        response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.equal(user.extraUserData);


        const missingUser = await UserModel.findOne({ email: 'test@example.com' }).exec();
        const missingToken = await WhiteListModel.findOne({ token: token.token }).exec();

        should.equal(missingUser, null);
        should.equal(missingToken, null);
    });


    after(async () => {
        const WhiteListModel = whiteListModelFunc(connection);

        UserModel.deleteMany({}).exec();
        WhiteListModel.deleteMany({}).exec();

        closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
