const nock = require('nock');
const chai = require('chai');
const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const VersionModel = require('models/version.model');
const appConstants = require('app.constants');
const MicroserviceService = require('services/microservice.service');

const { createMicroserviceWithEndpoints } = require('./utils/helpers');

chai.use(require('chai-datetime'));

describe('Microservice cron - Active checking', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    it('Running the "live" cron will check that a live microservice is reachable (happy case)', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'active',
            endpoints: [
                {
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }
            ],
        };

        await createMicroserviceWithEndpoints(testMicroserviceOne);

        nock('http://test-microservice-one:8000')
            .get('/ping')
            .reply(200);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        await MicroserviceService.checkActiveMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.equalTime(preVersion.lastUpdated);
    });

    it('Running the "live" cron will set to "error" a live microservice that has gone unreachable', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'active',
            endpoints: [
                {
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }
            ],
        };

        await createMicroserviceWithEndpoints(testMicroserviceOne);

        nock('http://test-microservice-one:8000')
            .get('/ping')
            .reply(404);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        await MicroserviceService.checkActiveMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.equalTime(preVersion.lastUpdated);
    });

    it('Running the "live" cron will not check pending nor errored microservice.', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'error',
            endpoints: [
                {
                    path: '/v1/testOne',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/testOne'
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
                    path: '/v1/testTwo',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/testTwo'
                    }
                }
            ],
        };

        await createMicroserviceWithEndpoints(testMicroserviceOne);
        await createMicroserviceWithEndpoints(testMicroserviceTwo);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);
        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceTwo.name })).should.have.lengthOf(1);

        await MicroserviceService.checkActiveMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);
        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceTwo.name })).should.have.lengthOf(1);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.equalTime(preVersion.lastUpdated);
    });

    afterEach(async () => {
        await MicroserviceModel.deleteMany({}).exec();
        await EndpointModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
