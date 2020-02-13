const nock = require('nock');
const config = require('config');
const chai = require('chai');
const VersionModel = require('models/version.model');
const EndpointModel = require('models/endpoint.model');
const MicroserviceModel = require('models/microservice.model');
const MicroserviceService = require('services/microservice.service');
const appConstants = require('app.constants');
const { createMicroservice, createMicroserviceWithEndpoints } = require('./utils/helpers');

chai.use(require('chai-datetime'));

describe('Microservice cron - Pending checking', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    it('Running the "pending" cron will activate a pending microservice that has become reachable and has been created, create the endpoints and update the version number (happy case)', async () => {
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
            ]
        };

        await createMicroservice(testMicroserviceOne);

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

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(0);

        await MicroserviceService.checkPendingMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.afterTime(preVersion.lastUpdated);
    });

    it('Running the "pending" cron will increase the "retries" counter when a pending microservice is still not reachable', async () => {
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
            ]
        };

        await createMicroservice(testMicroserviceOne);

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(404);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(0);

        await MicroserviceService.checkPendingMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        const postCronMicroservices = await MicroserviceModel.find({ status: 'pending' });
        postCronMicroservices.should.have.lengthOf(1);
        postCronMicroservices[0].infoStatus.numRetries.should.equal(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(0);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.equalTime(preVersion.lastUpdated);
    });

    it('Running the "pending" cron on an unreachable microservice that has been retried multiple times will cause it to go to "error" state.', async () => {
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
            infoStatus: {
                numRetries: config.get('microservice.pendingToErrorThreshold')
            }
        };

        await createMicroservice(testMicroserviceOne);

        nock('http://test-microservice-one:8000')
            .get('/info')
            .reply(404);

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(1);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(0);

        await MicroserviceService.checkPendingMicroservices();

        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        const postCronMicroservices = await MicroserviceModel.find({ status: 'error' });
        postCronMicroservices.should.have.lengthOf(1);
        postCronMicroservices[0].infoStatus.numRetries.should.equal(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(0);

        (await VersionModel.findOne({ name: appConstants.ENDPOINT_VERSION })).should.have.property('lastUpdated').and.equalTime(preVersion.lastUpdated);
    });

    it('Running the "pending" cron will not reactivate an errored microservice.', async () => {
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

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
        (await MicroserviceModel.find({ status: 'active' })).should.have.lengthOf(0);

        (await EndpointModel.find({ 'redirect.microservice': testMicroserviceOne.name })).should.have.lengthOf(1);

        await MicroserviceService.checkPendingMicroservices();

        (await MicroserviceModel.find({ status: 'error' })).should.have.lengthOf(1);
        (await MicroserviceModel.find({ status: 'pending' })).should.have.lengthOf(0);
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
