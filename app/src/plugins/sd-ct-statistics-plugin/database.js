const mongoose = require('mongoose');
const mongooseOptions = require('../../../../config/mongoose');

let connection = null;

function init(uri) {
    connection = mongoose.createConnection(uri, mongooseOptions);
}

function getConnection() {
    return connection;
}


module.exports = {
    init,
    getConnection,
};
