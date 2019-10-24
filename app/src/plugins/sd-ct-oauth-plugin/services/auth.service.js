const debug = require('debug')('oauth-plugin');
const JWT = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { isEqual } = require('lodash');
const { promisify } = require('util');

const { ObjectId } = mongoose.Types;

const whiteListModelFunc = require('plugins/sd-ct-oauth-plugin/models/white-list.model');
const mailServiceFunc = require('plugins/sd-ct-oauth-plugin/services/mail.service');
const UnprocessableEntityError = require('plugins/sd-ct-oauth-plugin/errors/unprocessableEntity.error');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const RenewModel = require('plugins/sd-ct-oauth-plugin/models/renew.model');
const UserTempModel = require('plugins/sd-ct-oauth-plugin/models/user-temp.model');
const BlackListModel = require('plugins/sd-ct-oauth-plugin/models/black-list.model');


function authService(plugin, connection) {

    const MailService = mailServiceFunc(plugin);
    const WhiteListModel = whiteListModelFunc(connection, plugin);

    class AuthService {

        static getFilteredQuery(query) {
            const allowedSearchFields = ['name', 'provider', 'email', 'role'];
            debug('Object.keys(query)', Object.keys(query));
            const filteredSearchFields = Object.keys(query).filter((param) => allowedSearchFields.includes(param));
            const filteredQuery = {};

            filteredSearchFields.forEach((param) => {
                switch (UserModel.schema.paths[param].instance) {

                    case 'String':
                        filteredQuery[param] = {
                            $regex: query[param],
                            $options: 'i'
                        };
                        break;
                    case 'Array':
                        if (query[param].indexOf('@') >= 0) {
                            filteredQuery[param] = {
                                $all: query[param].split('@').map((elem) => elem.trim())
                            };
                        } else {
                            filteredQuery[param] = {
                                $in: query[param].split(',').map((elem) => elem.trim())
                            };
                        }
                        break;
                    case 'Mixed':
                        filteredQuery[param] = { $ne: null };
                        break;
                    default:
                        filteredQuery[param] = query[param];

                }
            });
            debug(filteredQuery);
            return filteredQuery;
        }

        static async createToken(user, saveInUser) {
            try {
                const options = {};
                if (plugin.config.jwt.expiresInMinutes && plugin.config.jwt.expiresInMinutes > 0) {
                    options.expiresIn = plugin.config.jwt.expiresInMinutes * 60;
                }

                const userData = await UserModel.findById(user.id);
                let token = null;

                if (userData) {
                    const dataToken = {
                        id: userData._id, // eslint-disable-line no-underscore-dangle
                        role: userData.role,
                        provider: userData.provider,
                        email: userData.email,
                        extraUserData: userData.extraUserData,
                        createdAt: Date.now(),
                        photo: userData.photo,
                        name: userData.name
                    };
                    token = await promisify(JWT.sign)(dataToken, plugin.config.jwt.secret, options);
                    if (saveInUser) {
                        await WhiteListModel.deleteOne({ token: userData.userToken });
                        userData.userToken = token;
                        await userData.save();
                    }
                } else {
                    const dataToken = { ...user };
                    delete dataToken.exp;
                    dataToken.createdAt = Date.now();
                    token = await promisify(JWT.sign)(dataToken, plugin.config.jwt.secret, options);
                }
                await new WhiteListModel({ token }).save();

                return token;
            } catch (e) {
                debug('Error to generate token', e);
                return null;
            }
        }

        static async getUsers(app, query) {
            debug('Get users with app', app);

            const filteredQuery = AuthService.getFilteredQuery({ ...query });

            if (app) {
                filteredQuery['extraUserData.apps'] = {
                    $in: app
                };
            }
            return UserModel.find(filteredQuery, {
                __v: 0,
            }).select('-password -salt -userToken').exec();
        }

        static async getUserById(id) {
            const isValidId = mongoose.Types.ObjectId.isValid(id);

            if (!isValidId) {
                debug(`[Auth Service - getUserById] - Invalid id ${id} provided`);
                throw new UnprocessableEntityError(`Invalid id ${id} provided`);
            }
            return UserModel.findById(id).select('-password -salt -userToken -__v').exec();
        }

        static async getUsersByIds(ids = []) {
            const newIds = ids.map((id) => new ObjectId(id));
            return UserModel.find({
                _id: {
                    $in: newIds
                }
            }).select('-password -salt -userToken -__v').exec();
        }

        static async getIdsByRole(role) {
            if (!['SUPERADMIN', 'ADMIN', 'MANAGER', 'USER'].includes(role)) {
                throw new UnprocessableEntityError(`Invalid role ${role} provided`);
            }

            const data = await UserModel.find({
                role
            }).exec();
            // eslint-disable-next-line no-underscore-dangle
            return data.map((el) => el._id);
        }

        static async updateUser(id, data, requestUser) {
            const isValidId = mongoose.Types.ObjectId.isValid(id);

            if (!isValidId) {
                debug(`[Auth Service - updateUserMe] Invalid id ${id} provided`);
                throw new UnprocessableEntityError(`Invalid id ${id} provided`);
            }

            const user = await UserModel.findById(id).exec();
            if (!user) {
                return null;
            }

            if (data.name) {
                user.name = data.name;
            }
            if (data.photo !== undefined) {
                user.photo = data.photo;
            }

            if (requestUser.role === 'ADMIN') {
                if (data.role) {
                    user.role = data.role;
                }
                if (data.extraUserData && data.extraUserData.apps) {
                    user.extraUserData = { ...user.extraUserData, apps: data.extraUserData.apps };
                }
            }

            user.updatedAt = new Date();

            return user.save();
        }

        static async deleteUser(id) {
            const isValidId = mongoose.Types.ObjectId.isValid(id);

            if (!isValidId) {
                debug(`[Auth Service - deleteUser] Invalid id ${id} provided`);
                throw new UnprocessableEntityError(`Invalid id ${id} provided`);
            }

            let user;
            try {
                user = await UserModel.findById(id).exec();
            } catch (e) {
                debug(`[Auth Service - deleteUser] Failed to load user by id '${id}'`);
                return null;
            }

            if (!user) {
                debug(`[Auth Service - deleteUser] No user found with id '${id}'`);
                return null;
            }

            if (user && user.userToken) {
                await WhiteListModel.deleteOne({ token: user.userToken });
            }

            return user.deleteOne();
        }

        static async existEmail(email) {
            const exist = await UserModel.findOne({
                email,
            });

            const existTemp = await UserTempModel.findOne({
                email,
            });

            return exist || existTemp;
        }

        static async createUser(data, generalConfig) {
            const salt = bcrypt.genSaltSync();

            const apps = data.apps || [];

            const user = await new UserTempModel({
                provider: 'local',
                email: data.email,
                role: data.role || 'USER',
                password: bcrypt.hashSync(data.password, salt),
                confirmationToken: crypto.randomBytes(20).toString('hex'),
                salt,
                extraUserData: { apps }
            }).save();

            debug('Sending mail');
            try {
                await MailService.sendConfirmationMail(
                    {
                        email: user.email,
                        confirmationToken: user.confirmationToken,
                    },
                    [{ address: user.email }],
                    generalConfig
                );
            } catch (err) {
                debug('Error', err);
                throw err;
            }

            return user;
        }

        static async createUserWithoutPassword(data, generalConfig) {
            const salt = bcrypt.genSaltSync();
            const pass = crypto.randomBytes(8).toString('hex');
            const user = await new UserTempModel({
                provider: 'local',
                email: data.email,
                role: data.role,
                password: bcrypt.hashSync(pass, salt),
                confirmationToken: crypto.randomBytes(20).toString('hex'),
                salt,
                extraUserData: data.extraUserData,
            }).save();

            debug('Sending mail');
            try {
                await MailService.sendConfirmationMailWithPassword(
                    {
                        email: user.email,
                        confirmationToken: user.confirmationToken,
                        password: pass,
                        callbackUrl: data.callbackUrl || ''
                    },
                    [{ address: user.email }],
                    generalConfig
                );
            } catch (err) {
                debug('Error', err);
                throw err;
            }

        }

        static async confirmUser(confirmationToken) {
            const exist = await UserTempModel.findOne({ confirmationToken });
            if (!exist) {
                return null;
            }
            const user = await new UserModel({
                email: exist.email,
                password: exist.password,
                salt: exist.salt,
                role: exist.role,
                extraUserData: exist.extraUserData,
                provider: 'local',
            }).save();
            await exist.remove();
            delete user.password;
            delete user.salt;

            return user;
        }

        static async getRenewModel(token) {
            debug('obtaining renew model of token', token);
            const renew = await RenewModel.findOne({ token });
            return renew;
        }

        static async sendResetMail(email, generalConfig, originApp) {
            debug('Generating token to email', email);

            const user = await UserModel.findOne({ email });
            if (!user) {
                debug('User not found');
                return null;
            }

            const renew = await new RenewModel({
                // eslint-disable-next-line no-underscore-dangle
                userId: user._id,
                token: crypto.randomBytes(20).toString('hex'),
            }).save();

            await MailService.sendRecoverPasswordMail(
                {
                    token: renew.token,
                },
                [{ address: user.email }],
                generalConfig,
                originApp
            );

            return renew;
        }

        static async updatePassword(token, newPassword) {
            debug('Updating password');
            const renew = await RenewModel.findOne({ token });
            if (!renew) {
                debug('Token not found');
                return null;
            }
            const user = await UserModel.findById(renew.userId);
            if (!user) {
                debug('User not found');
                return null;
            }
            const salt = bcrypt.genSaltSync();
            user.password = bcrypt.hashSync(newPassword, salt);
            user.salt = salt;
            await user.save();
            return user;
        }

        static async checkRevokedToken(ctx, payload, token) {
            debug('Checking if token is revoked');
            const blacklistedToken = await BlackListModel.findOne({ token });

            if (blacklistedToken) {
                debug('Token blacklisted!');
                return true;
            }

            let isRevoked = false;
            if (payload.id !== 'microservice') {
                const checkList = ['id', 'role', 'extraUserData', 'email'];

                const user = await UserModel.findById(payload.id);

                if (!user) {
                    return true;
                }

                // eslint-disable-next-line consistent-return
                checkList.forEach((property) => {
                    if (!user[property] || !isEqual(user[property], payload[property])) {
                        isRevoked = true;
                    }
                });
            }

            return isRevoked;
        }

        static async updateApplicationsUser(id, applications) {
            debug('Searching user with id ', id, applications);
            const user = await UserModel.findById(id);
            if (!user) {
                debug('User not found');
                return null;
            }
            if (!user.extraUserData) {
                user.extraUserData = {
                    apps: []
                };
            } else {
                user.extraUserData = { ...user.extraUserData };
            }
            for (let i = 0, { length } = applications; i < length; i += 1) {
                if (user.extraUserData.apps.indexOf(applications[i]) === -1) {
                    user.extraUserData.apps.push(applications[i].toLowerCase());
                }
            }
            user.markModified('extraUserData');
            await user.save();
            return user;
        }

    }

    return AuthService;

}

module.exports = authService;
