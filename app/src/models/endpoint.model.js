const mongoose = require('mongoose');
require('mongoose-regexp')(mongoose);

const { Schema } = mongoose;

const Endpoint = new Schema({
    path: { type: String, required: true, trim: true },
    method: { type: String, required: true, trim: true },
    pathRegex: { type: RegExp, required: true },
    pathKeys: [{ type: String, trim: true }],
    authenticated: { type: Boolean, default: false },
    applicationRequired: { type: Boolean, default: false },
    binary: { type: Boolean, default: false },
    cache: [{ type: String, required: false }],
    uncache: [{ type: String, required: false }],
    redirect: [{
        path: { type: String, required: true, trim: true },
        url: { type: String, required: true, trim: true },
        method: { type: String, required: true, trim: true },
        microservice: { type: String, required: false, trim: true },
        filters: [{
            name: { type: String, required: true, trim: true },
            path: { type: String, required: true, trim: true },
            condition: {
                type: String, required: true, trim: true, default: 'AND'
            },
            method: { type: String, required: true, trim: true },
            pathRegex: { type: RegExp, required: true },
            pathKeys: [{ type: String, trim: true }],
            params: Schema.Types.Mixed,
            compare: Schema.Types.Mixed,
        }],
    }],
    version: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now, required: true },
    createdAt: { type: Date, default: Date.now, required: true }
});

module.exports = mongoose.model('Endpoint', Endpoint);
