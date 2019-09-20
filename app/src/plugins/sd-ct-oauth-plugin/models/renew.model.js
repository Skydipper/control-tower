const mongoose = require('mongoose');

const { Schema } = mongoose;

const Renew = new Schema({
    userId: { type: String, required: true, trim: true },
    token: { type: String, required: true, trim: true },
    createdAt: {
        type: Date, required: true, default: Date.now, expires: 60 * 60 * 24
    },
});

module.exports = mongoose.model('Renew', Renew);
