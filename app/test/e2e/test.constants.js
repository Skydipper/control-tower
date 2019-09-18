/* eslint-disable max-len */
const TOKENS = {
    USER: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFhMTBkN2M2ZTBhMzcxMjY2MTFmZDdhNyIsInJvbGUiOiJVU0VSIiwicHJvdmlkZXIiOiJsb2NhbCIsImVtYWlsIjoidXNlckBjb250cm9sLXRvd2VyLm9yZyIsImV4dHJhVXNlckRhdGEiOnsiYXBwcyI6WyJydyIsImdmdyIsImdmdy1jbGltYXRlIiwicHJlcCIsImFxdWVkdWN0IiwiZm9yZXN0LWF0bGFzIiwiZGF0YTRzZGdzIl19fQ.eePyj9grA2akg2vKqmLz5Gg8hd2Afq64ZaeGLb-aLC0',
    MANAGER: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFhMTBkN2M2ZTBhMzcxMjY2MTFmZDdhNyIsInJvbGUiOiJNQU5BR0VSIiwicHJvdmlkZXIiOiJsb2NhbCIsImVtYWlsIjoibWFuYWdlckBjb250cm9sLXRvd2VyLm9yZyIsImV4dHJhVXNlckRhdGEiOnsiYXBwcyI6WyJydyIsImdmdyIsImdmdy1jbGltYXRlIiwicHJlcCIsImFxdWVkdWN0IiwiZm9yZXN0LWF0bGFzIiwiZGF0YTRzZGdzIl19fQ.ONb6dBz-pYxmXP3ECmRT7zmJHy8Dzn1GYyE6ndOR1Uw',
    ADMIN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFhMTBkN2M2ZTBhMzcxMjY2MTFmZDdhNyIsInJvbGUiOiJBRE1JTiIsInByb3ZpZGVyIjoibG9jYWwiLCJlbWFpbCI6ImFkbWluQGNvbnRyb2wtdG93ZXIub3JnIiwiZXh0cmFVc2VyRGF0YSI6eyJhcHBzIjpbInJ3IiwiZ2Z3IiwiZ2Z3LWNsaW1hdGUiLCJwcmVwIiwiYXF1ZWR1Y3QiLCJmb3Jlc3QtYXRsYXMiLCJkYXRhNHNkZ3MiXX19.FglwGCDjeh5c3bdmV0GA6QiMd-I1AdbdHCLQQGUPRxw',
    MICROSERVICE: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Im1pY3Jvc2VydmljZSIsInJvbGUiOiJBRE1JTiIsInByb3ZpZGVyIjoibG9jYWwiLCJlbWFpbCI6Im1pY3Jvc2VydmljZUBjb250cm9sLXRvd2VyLm9yZyIsImV4dHJhVXNlckRhdGEiOnsiYXBwcyI6WyJydyIsImdmdyIsImdmdy1jbGltYXRlIiwicHJlcCIsImFxdWVkdWN0IiwiZm9yZXN0LWF0bGFzIiwiZGF0YTRzZGdzIl19fQ.nbC1lngIFcGgGBFwRYV54fGaGmcck-Ocotr3qDXkyTs'
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
    toDelete: false,
    _id: '5d2eeae405314b1645baadaf',
    path: '/v1/dataset',
    method: 'POST',
    pathRegex: '',
    redirect: [
        {
            filters: null,
            _id: '5d2eeae405314b1645baadb0',
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
    microserviceTest,
    endpointTest,
    testAppKey,
    testFilter
};
