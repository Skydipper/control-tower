/* eslint-disable max-len */
const TOKENS = {
    MICROSERVICE: 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6Im1pY3Jvc2VydmljZSIsImNyZWF0ZWRBdCI6IjIwMTYtMDktMTQifQ.W2NBSi1UzRifheOsnvRk05_lvdcPbdXZ-Giw3Nnisoo'
};

const USERS = {
    USER: {
        id: '1a10d7c6e0a37126611fd7a7',
        role: 'USER',
        provider: 'local',
        email: 'user@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    MANAGER: {
        id: '1a10d7c6e0a37126611fd7a7',
        role: 'MANAGER',
        provider: 'local',
        email: 'manager@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    ADMIN: {
        id: '1a10d7c6e0a37126611fd7a7',
        role: 'ADMIN',
        provider: 'local',
        email: 'admin@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    MICROSERVICE: {
        id: 'microservice',
        role: 'ADMIN',
        provider: 'local',
        email: 'microservice@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    }
};

const testAppKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.sQOVoEtkQlgy8UwlPOi5YWSdGAkRn80JqT53RdktIms';

const microserviceTest = {
    swagger: {},
    name: 'test-microservice-one',
    tags: ['test'],
    endpoints: [{
        path: '/v1/testOne',
        method: 'GET',
        redirect: {
            method: 'GET',
            path: '/api/v1/testOne'
        }
    }, {
        path: '/v1/testTwo',
        method: 'GET',
        redirect: {
            method: 'GET',
            path: '/api/v1/testTwo'
        }
    }]
};

const endpointTest = {
    pathKeys: [],
    authenticated: false,
    applicationRequired: false,
    binary: false,
    cache: [],
    uncache: [],
    path: '/v1/dataset',
    method: 'POST',
    pathRegex: '',
    redirect: [
        {
            microservice: 'dataset',
            filters: null,
            method: 'POST',
            path: '/api/v1/dataset',
            url: 'http://mymachine:6001'
        }
    ],
    version: 1
};

const testFilter = (compareData, additionalData) => ({
    name: 'dataset',
    path: '/api/v1/test1/test',
    pathRegex: new RegExp('/api/v1/test1/test'),
    method: 'POST',
    compare: { data: compareData },
    ...additionalData,
});

module.exports = {
    TOKENS,
    USERS,
    microserviceTest,
    endpointTest,
    testAppKey,
    testFilter
};
