const mongoose = require('mongoose');

const { Schema } = mongoose;

const Statistic = new Schema({
    sourcePath: { type: String, required: true, trim: true },
    sourceMethod: { type: String, required: true, trim: true },
    redirectUrl: { type: String, required: false, trim: true },
    redirectMethod: { type: String, required: false, trim: true },
    endpointPath: { type: String, required: false, trim: true },
    time: { type: Number, required: true },
    date: { type: Date, required: true, default: Date.now },
    cached: { type: Boolean, required: true, default: false },
    error: { type: Boolean, required: true, default: false },
    errorCode: { type: Number, required: false },
    ip: { type: String, required: false, trim: true },
    anonymous: { type: Boolean, required: true, default: true },
    loggedUser: { type: Schema.Types.Mixed },
    geo: {
        _id: false,
        city: { type: String, required: false, trim: true },
        country: { type: String, required: false, trim: true },
        region: { type: String, required: false, trim: true },
        ll: [{ type: Number, required: false, trim: true }],
        completed: { type: Boolean, required: true, default: false },
    },
});

module.exports = mongoose.model('Statistic', Statistic);
