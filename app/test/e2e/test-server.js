const chai = require('chai');
const chaiHttp = require('chai-http');

let requester;

chai.use(chaiHttp);


exports.getTestAgent = async function getTestAgent(forceNew = false) {
    if (forceNew && requester) {
        await new Promise((resolve) => {
            requester.close(() => {
                requester = null;
                resolve();
            });
        });
    }

    if (requester) {
        return requester;
    }

    // eslint-disable-next-line global-require
    const serverPromise = require('../../src/app');
    const { server } = await serverPromise();
    requester = chai.request.agent(server);

    return requester;
};

exports.getTestServer = async function getTestServer() {
    if (requester) {
        return requester;
    }

    // eslint-disable-next-line global-require
    const serverPromise = require('../../src/app');
    const { server } = await serverPromise();
    requester = chai.request(server).keepOpen();

    return requester;
};

exports.closeTestAgent = function closeTestAgent() {
    if (!requester) {
        return;
    }
    requester.close();

    requester = null;
};
