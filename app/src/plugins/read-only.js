const ReadOnlyService = require('../services/read-only.service');

function init() {}

function middleware(app, plugin) {
    app.use(async (ctx, next) => {
        const service = new ReadOnlyService(plugin.config.blacklist, plugin.config.whitelist);
        const { method, path } = ctx.request;
        if (service.shouldBlockRequest(method, path)) {
            ctx.status = 503;
            ctx.body = 'API under maintenance, please try again later.';
            return;
        }

        await next();
    });
}


module.exports = {
    middleware,
    init,
};
