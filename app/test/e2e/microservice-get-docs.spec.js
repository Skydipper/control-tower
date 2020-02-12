const nock = require('nock');
const chai = require('chai');
const config = require('config');

const MicroserviceModel = require('models/microservice.model');
const EndpointModel = require('models/endpoint.model');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUserAndToken } = require('./utils/helpers');
const { getTestAgent, closeTestAgent } = require('./test-server');

chai.should();

let requester;


describe('Microservices endpoints - Get docs', () => {

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

    it('Get documentation for existing endpoints should be successful (happy case)', async () => {
        const { token } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester.get(`/api/v1/doc/swagger`)
            .send()
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.deep.equal({
            swagger: '2.0',
            info: {
                title: 'Control Tower',
                description: 'Control Tower - API',
                version: '1.0.0'
            },
            host: config.get('server.publicUrl').replace('http://', ''),
            schemes: [
                'http'
            ],
            produces: [
                'application/vnd.api+json',
                'application/json'
            ],
            paths: {
                '/api/v1/doc/swagger': {
                    get: {
                        description: 'Return swagger files of registered microservices',
                        operationId: 'getSwagger',
                        tags: [
                            'ControlTower'
                        ],
                        produces: [
                            'application/json',
                            'application/vnd.api+json'
                        ],
                        responses: {
                            200: {
                                description: 'Swagger json'
                            },
                            500: {
                                description: 'Unexpected error',
                                schema: {
                                    $ref: '#/definitions/Errors'
                                }
                            }
                        }
                    }
                }
            },
            definitions: {
                Errors: {
                    type: 'object',
                    description: 'Errors',
                    properties: {
                        errors: {
                            type: 'array',
                            items: {
                                $ref: '#/definitions/Error'
                            }
                        }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            format: 'int32',
                            description: 'A unique identifier for this particular occurrence of the problem.'
                        },
                        links: {
                            type: 'object',
                            description: 'A links object',
                            properties: {
                                about: {
                                    type: 'string',
                                    description: 'A link that leads to further details about this particular occurrence of the problem.'
                                }
                            }
                        },
                        status: {
                            type: 'string',
                            description: 'The HTTP status code applicable to this problem, expressed as a string value'
                        },
                        code: {
                            type: 'string',
                            description: 'An application-specific error code, expressed as a string value'
                        },
                        title: {
                            type: 'string',
                            description: 'A short, human-readable summary of the problem that SHOULD NOT change from occurrence to occurrence of the problem, except for purposes of localization.'
                        },
                        detail: {
                            type: 'string',
                            description: 'A human-readable explanation specific to this occurrence of the problem. Like title, this field\'s value can be localized'
                        },
                        source: {
                            type: 'object',
                            description: 'An object containing references to the source of the error, optionally including any of the following members',
                            properties: {
                                pointer: {
                                    type: 'string',
                                    description: 'A JSON Pointer [RFC6901] to the associated entity in the request document'
                                },
                                parameter: {
                                    type: 'string',
                                    description: 'A string indicating which URI query parameter caused the error.'
                                }
                            }
                        },
                        meta: {
                            type: 'object',
                            description: 'A meta object containing non-standard meta-information about the error.'
                        }
                    }
                }
            }
        });
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
