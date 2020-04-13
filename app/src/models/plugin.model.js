const mongoose = require('mongoose');

const { Schema } = mongoose;

const Plugin = new Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    mainFile: { type: String, required: true, trim: true },
    cronFile: { type: String, required: false, trim: true },
    active: { type: Boolean, default: false },
    config: { type: Schema.Types.Mixed, required: false },
    ordering: { type: Number, required: false, trim: true },
});


module.exports = mongoose.model('Plugin', Plugin);
