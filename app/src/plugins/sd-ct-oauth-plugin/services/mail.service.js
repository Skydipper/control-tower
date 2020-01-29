const SparkPost = require('sparkpost');
const logger = require('logger');

function mailService(plugin) {

    class MailService {

        constructor(sparkpostKey, publicUrl, disableEmailSending = false) {
            this.disableEmailSending = disableEmailSending;
            if (sparkpostKey) {
                this.client = new SparkPost(sparkpostKey);
            }
            this.publicUrl = publicUrl;
        }

        sendConfirmationMail(data, recipients, generalConfig) {
            logger.info('[MailService] Sending confirmation mail to ', recipients);
            const reqOpts = {
                substitution_data: {
                    urlConfirm: `${this.publicUrl}/auth/confirm/${data.confirmationToken}`,
                    fromEmail: generalConfig.application.emailSender,
                    fromName: generalConfig.application.emailSenderName,
                    appName: generalConfig.application.name,
                    logo: generalConfig.application.logo
                },
                content: {
                    template_id: 'confirm-user',
                },
                recipients,
            };

            if (this.disableEmailSending) {
                logger.info('[MailService] Email sending disabled, skipping user account confirmation email');
                logger.info(reqOpts);
                return new Promise((resolve) => resolve());
            }

            return new Promise((resolve, reject) => {
                logger.info(reqOpts);
                this.client.transmissions.send(reqOpts, (error, res) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(res);
                    }
                });
            });
        }

        sendConfirmationMailWithPassword(data, recipients, generalConfig) {
            logger.info('[MailService] Sending confirmation mail to ', recipients);
            const reqOpts = {
                substitution_data: {
                    urlConfirm: `${this.publicUrl}/auth/confirm/${data.confirmationToken}?${data.callbackUrl ? `callbackUrl=${data.callbackUrl}` : ''}`,
                    password: data.password,
                    fromEmail: generalConfig.application.emailSender,
                    fromName: generalConfig.application.emailSenderName,
                    appName: generalConfig.application.name,
                    logo: generalConfig.application.logo
                },
                content: {
                    template_id: 'confirm-user-with-password',
                },
                recipients,
            };

            if (this.disableEmailSending) {
                logger.info('[MailService] Email sending disabled, skipping user account confirmation with password email');
                logger.info(reqOpts);
                return new Promise((resolve) => resolve());
            }

            return new Promise((resolve, reject) => {
                logger.info(reqOpts);
                this.client.transmissions.send(reqOpts, (error, res) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(res);
                    }
                });
            });
        }

        sendRecoverPasswordMail(data, recipients, generalConfig, originApp) {
            logger.info('[MailService] Sending confirmation mail to ', recipients);
            const reqOpts = {
                substitution_data: {
                    urlRecover: `${this.publicUrl}/auth/reset-password/${data.token}?origin=${originApp}`,
                    fromEmail: generalConfig.application.emailSender,
                    fromName: generalConfig.application.emailSenderName,
                    appName: generalConfig.application.name,
                    logo: generalConfig.application.logo
                },
                content: {
                    template_id: 'recover-password',
                },
                recipients,
            };

            if (this.disableEmailSending) {
                logger.info('[MailService] Email sending disabled, skipping password recover email');
                logger.info(reqOpts);
                return new Promise((resolve) => resolve());
            }

            return new Promise((resolve, reject) => {
                this.client.transmissions.send(reqOpts, (error, res) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(res);
                    }
                });
            });
        }

    }

    return new MailService(plugin.config.local.sparkpostKey, plugin.config.publicUrl, plugin.config.disableEmailSending);

}

module.exports = mailService;
