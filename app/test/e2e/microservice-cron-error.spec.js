const nock = require('nock');
const config = require('config');
const chai = require('chai');
const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const VersionModel = require('models/version.model');
const MicroserviceService = require('services/microservice.service');
const appConstants = require('app.constants');
const { createMicroserviceWithEndpoints } = require('./utils/helpers');

chai.use(require('chai-datetime'));

describe('Microservice cron - Error checking', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    it('Running the "error" cron will reactivate an errored microservice that is again reachable (happy case)', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

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

        await createMicroserviceWithEndpoints(testMicroserviceOne);

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(200, {
                swagger: {},
                name: 'test-microservice-one',
                tags: ['test'],
                endpoints: [{
                    path: '/v1/test',
                    method: 'GET',
                    redirect: {
                        method: 'GET',
                        path: '/api/v1/test'
                    }
                }]
            });

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        await MicroserviceService.checkErrorMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.equalTime(preVersion.lastUpdated);
    });

    it('Running the "error" cron will not reactivate an errored microservice that is not yet reachable, and it will increase its retries counter', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

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

        await createMicroserviceWithEndpoints(testMicroserviceOne);

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(404);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        await MicroserviceService.checkErrorMicroservices();

        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        const postCronMicroservices = await MicroserviceModel.find({ status: 'error' });
        postCronMicroservices.should.have.lengthOf(1);
        postCronMicroservices[0].infoStatus.numRetries.should.equal(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.equalTime(preVersion.lastUpdated);
    });

    it('Running the "error" cron on an unreachable errored microservice that has been retried multiple times will cause the microservice and its endpoints to be deleted.', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

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
            infoStatus: {
                numRetries: config.get('microservice.errorToDeleteThreshold')
            }
        };

        await createMicroserviceWithEndpoints(testMicroserviceOne);

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(404);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        await MicroserviceService.checkErrorMicroservices();

        (await MicroserviceModel.find()).should.have.lengthOf(0);
        (await EndpointModel.find()).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(0);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.equalTime(preVersion.lastUpdated);

    });

    it('Running the "error" cron will not act on a "pending" microservice', async () => {
        const preVersion = await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION });

        const testMicroserviceOne = {
            name: `test-microservice-one`,
            url: 'http://test-microservice-one:8000',
            status: 'pending',
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
            updatedAt: Date.parse('2019-01-01')
        };

        await createMicroserviceWithEndpoints(testMicroserviceOne);

        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        await MicroserviceService.checkErrorMicroservices();

        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

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
