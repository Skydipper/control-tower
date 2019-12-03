const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const { Schema } = mongoose;

const User = new Schema({
    name: { type: String, required: false, trim: true },
    photo: { type: String, required: false, trim: true },
    provider: {
        type: String, required: true, trim: true, default: 'local'
    },
    providerId: { type: String, required: false, trim: true },
    email: { type: String, required: false, trim: true },
    password: { type: String, required: false, trim: true },
    salt: { type: String, required: false, trim: true },
    role: {
        type: String, required: true, default: 'USER', trim: true
    },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
    extraUserData: { type: Schema.Types.Mixed },
    userToken: { type: String, required: false, trim: true }
});

User.plugin(mongoosePaginate);

module.exports = mongoose.model('User', User);
