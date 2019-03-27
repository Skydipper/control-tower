const mongoose = require('mongoose');
let connection = null;

function init(uri) {
    connection = mongoose.createConnection(uri);
}

function getConnection() {
    return connection;
}


module.exports = {
    init,
    getConnection,
};
