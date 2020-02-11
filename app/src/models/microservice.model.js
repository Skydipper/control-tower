const mongoose = require('mongoose');

const { Schema } = mongoose;

const Microservice = new Schema({
    name: { type: String, required: true, trim: true },
    swagger: { type: String, required: false, trim: true },
    url: { type: String, required: true, trim: true },
    pathInfo: { type: String, required: true, default: '/info' },
    pathLive: { type: String, required: true, default: '/ping' },
    status: { type: String, default: 'pending' },
    cache: [{ type: String, required: false }],
    uncache: [{ type: String, required: false }],
    infoStatus:
        new Schema(
            {
                lastCheck: { type: Date, required: false },
                numRetries: { type: Number, required: true, default: 0 },
                error: { type: String, required: false, trim: true },
            }, {
                _id: false
            }
        ),
    updatedAt: { type: Date, default: Date.now, required: true },
    createdAt: { type: Date, default: Date.now, required: true },
    endpoints: [
        new Schema(
            {
                path: { type: String, required: true, trim: true },
                method: { type: String, required: true, trim: true },
                redirect: {
                    path: { type: String, required: true, trim: true },
                    method: { type: String, required: true, trim: true },
                },
            }, {
                _id: false
            }
        )
    ],
    tags: [{ type: String, required: false, trim: true }],
    version: { type: Number, required: true },
});


module.exports = mongoose.model('Microservice', Microservice);
