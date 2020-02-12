const nock = require('nock');
const chai = require('chai');
const mongoose = require('mongoose');

const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUserAndToken, createMicroservice } = require('./utils/helpers');
const { getTestAgent, closeTestAgent } = require('./test-server');

chai.should();

let requester;


describe('Microservices endpoints - Get by id', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await UserModel.deleteMany({}).exec();
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();
    });

    it('Getting a microservice by id without being authenticated should fail', async () => {
        const response = await requester.get(`/api/v1/microservice/abcd`);
        response.status.should.equal(401);
    });

    it('Getting a microservice by an invalid id should return a 404', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/api/v1/microservice/abcd`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('detail').and.equal('Could not find a microservice with id abcd');
    });

    it('Getting a microservice by id should return 404 if the microservice doesn\'t exist', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const id = mongoose.Types.ObjectId();
        const response = await requester
            .get(`/api/v1/microservice/${id}`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('detail').and.equal(`Could not find a microservice with id ${id}`);
    });

    it('Getting a microservice by id should return a microservice list (happy case)', async () => {
        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'active',
            endpoints: [
                {
                    microservice: 'test-microservice-one',
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }
            ],
        };

        const microservice = await createMicroservice(testMicroserviceOne);

        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/api/v1/microservice/${microservice.id}`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data');
        response.body.data.should.be.an('object').and.have.property('id').and.equal(microservice.id);
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });

    after(() => {
        closeTestAgent();
    });
});
