/* eslint-disable no-unused-expressions */
const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const UserSerializer = require('plugins/sd-ct-oauth-plugin/serializers/user.serializer');

const { getTestAgent, closeTestAgent } = require('./../test-server');
const { createUserAndToken } = require('./../utils/helpers');

chai.should();
chai.use(require('chai-datetime'));

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Auth endpoints tests - Update user', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        UserModel.deleteMany({}).exec();


    });

    beforeEach(async () => {
        await UserModel.deleteMany({}).exec();
    });

    it('Updating own\'s profile while not logged in should return a 401', async () => {
        const response = await requester
            .patch(`/auth/user/me`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not authenticated');
    });

    it('Updating own\'s profile while logged in as the user should return a 200 (no actual data changes)', async () => {
        const { token, user } = await createUserAndToken({ role: 'USER' });

        const response = await requester
            .patch(`/auth/user/me`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);

        response.body.data.should.have.property('id').and.equal(user.id.toString());
        response.body.data.should.have.property('email').and.equal(user.email);
        response.body.data.should.have.property('name').and.equal(user.name);
        response.body.data.should.have.property('photo').and.equal(user.photo);
        response.body.data.should.have.property('role').and.equal(user.role);
        response.body.data.should.have.property('extraUserData').and.be.an('object').and.have.property('apps').and.eql(user.extraUserData.apps);
    });

    it('Updating own\'s profile while logged in as the user with role USER should return a 200 with updated name and photo', async () => {
        const { token, user } = await createUserAndToken({ role: 'USER' });

        const startDate = new Date();

        const response = await requester
            .patch(`/auth/user/me`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                email: 'changed-email@example.com',
                password: 'changedPassword',
                salt: 'changedSalt',
                extraUserData: {
                    apps: ['changed-apps'],
                    foo: 'bar'
                },
                _id: 'changed-id',
                userToken: 'changedToken',
                createdAt: '2000-01-01T00:00:00.000Z',
                updatedAt: '2000-01-01T00:00:00.000Z',
                role: 'ADMIN',
                provider: 'changedProvider',
                name: 'changed name',
                photo: 'http://www.changed-photo.com'
            });

        response.status.should.equal(200);

        response.body.data.should.have.property('name').and.equal('changed name');
        response.body.data.should.have.property('photo').and.equal('http://www.changed-photo.com');

        response.body.data.should.have.property('id').and.equal(user.id.toString());
        response.body.data.should.have.property('email').and.equal(user.email);
        response.body.data.should.have.property('role').and.equal(user.role);
        response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql(user.extraUserData);

        response.body.data.should.have.property('createdAt');
        response.body.data.should.have.property('updatedAt');

        (new Date(response.body.data.updatedAt)).should.be.afterTime(startDate);
        (new Date(response.body.data.createdAt)).should.be.equalDate(new Date(user.createdAt));

        const updatedUser = await UserModel.findOne({ email: user.email }).exec();

        response.body.should.deep.equal(UserSerializer.serialize(updatedUser));
    });

    it('Updating own\'s profile while logged in as the user with role ADMIN should return a 200 with updated name, photo, role and apps', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        const startDate = new Date();

        const response = await requester
            .patch(`/auth/user/me`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                email: 'changed-email@example.com',
                password: 'changedPassword',
                salt: 'changedSalt',
                extraUserData: {
                    apps: ['changed-apps'],
                    foo: 'bar'
                },
                _id: 'changed-id',
                userToken: 'changedToken',
                createdAt: '2000-01-01T00:00:00.000Z',
                updatedAt: '2000-01-01T00:00:00.000Z',
                role: 'MANAGER',
                provider: 'changedProvider',
                name: 'changed name',
                photo: 'http://www.changed-photo.com'
            });

        response.status.should.equal(200);

        response.body.data.should.have.property('name').and.equal('changed name');
        response.body.data.should.have.property('photo').and.equal('http://www.changed-photo.com');
        response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
        response.body.data.should.have.property('role').and.equal('MANAGER');

        response.body.data.should.have.property('id').and.equal(user.id.toString());
        response.body.data.should.have.property('email').and.equal(user.email);
        response.body.data.should.have.property('createdAt');
        response.body.data.should.have.property('updatedAt');

        (new Date(response.body.data.updatedAt)).should.be.afterTime(startDate);
        (new Date(response.body.data.createdAt)).should.be.equalDate(new Date(user.createdAt));

        const updatedUser = await UserModel.findOne({ email: user.email }).exec();

        response.body.should.deep.equal(UserSerializer.serialize(updatedUser));
    });

    after(closeTestAgent);

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
