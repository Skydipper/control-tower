const mongoose = require('mongoose');

const { Schema } = mongoose;

const BlackList = new Schema({
    token: { type: String, required: true, trim: true },
    createdAt: { type: Date, required: true, default: Date.now },
});


module.exports = mongoose.model('BlackList', BlackList);
