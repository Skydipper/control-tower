const nock = require('nock');
const chai = require('chai');
const Microservice = require('models/microservice.model');
const Endpoint = require('models/endpoint.model');
const { TOKENS } = require('./test.constants');
const { getTestAgent, closeTestAgent } = require('./test-server');

chai.should();

let requester;


describe('Headers', () => {
    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });


    it('Responses should not have restrictive CORS headers', async () => {
        const response = await requester
            .options('/auth/reset-password')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type')
            .set('Origin', 'https://staging.resourcewatch.org')
            .set('Authorization', `Bearer ${TOKENS.ADMIN}`);

        response.should.have.header('access-control-allow-origin', 'https://staging.resourcewatch.org');
        response.should.have.header('access-control-allow-credentials', 'true');
        response.should.have.header('access-control-allow-methods', 'GET,HEAD,PUT,POST,DELETE,PATCH');
        response.should.have.header('access-control-allow-headers', 'content-type');
    });

    after(() => {
        Microservice.deleteMany({}).exec();
        Endpoint.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        closeTestAgent();
    });
});
