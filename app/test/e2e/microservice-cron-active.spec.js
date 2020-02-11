const nock = require('nock');
const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const MicroserviceService = require('services/microservice.service');
const { createMicroservice } = require('./utils/helpers');

describe('Microservice cron - Live checking', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    it('Running the "live" cron will check that a live microservice is reachable (happy case)', async () => {
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

        await createMicroservice(testMicroserviceOne);

        nock('http://test-microservice-one:8000')
            .get('/ping')
            .reply(200);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);

        await MicroserviceService.checkActiveMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);
    });

    it('Running the "live" cron will set to "error" a live microservice that has gone unreachable', async () => {
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

        await createMicroservice(testMicroserviceOne);

        nock('http://test-microservice-one:8000')
            .get('/ping')
            .reply(404);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);

        await MicroserviceService.checkActiveMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);
    });

    it('Running the "live" cron will not check pending nor errored microservice.', async () => {
        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'error',
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
        const testMicroserviceTwo = {
            name: `test-microservice-two`,
            url: 'http://test-microservice-two:8000',
            status: 'pending',
            endpoints: [
                {
                    microservice: 'test-microservice-two',
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }
            ],
        };

        await createMicroservice(testMicroserviceOne);
        await createMicroservice(testMicroserviceTwo);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        await MicroserviceService.checkActiveMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);
    });

    afterEach(async () => {
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
