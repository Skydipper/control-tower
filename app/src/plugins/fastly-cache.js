const logger = require('logger');
const FastlyPurge = require('fastly-purge');

function init() {

}

function middleware(app, plugin) {

    const fastlyPurge = new FastlyPurge(plugin.config.key);
    const SERVICE_ID = plugin.config.serviceId;

    app.use(async (ctx, next) => {
        await next();
        if (ctx.status >= 200 && ctx.status < 400) {
            if (ctx.request.method !== 'GET') {
                if (ctx.response.headers && ctx.response.headers.uncache) {
                    const tags = ctx.response.headers.uncache.split(' ').filter((part) => part !== '');
                    logger.info('Uncache ', tags);
                    for (let i = 0, { length } = tags; i < length; i++) {
                        fastlyPurge.key(SERVICE_ID, tags[i], (err) => {
                            if (err) {
                                logger.error('Error purging', err);
                            }
                        });
                    }
                }
                ctx.set('Cache-Control', 'private');
            } else if (!ctx.state.redirect || ctx.state.redirect.endpoint.authenticated) {
                ctx.set('Cache-Control', 'private');
            } else if (ctx.response.headers && ctx.response.headers.cache) {
                const key = ctx.response.headers.cache.split(' ').filter((part) => part !== '').join(' ');
                logger.info('Caching with key: ', key);
                ctx.set('Surrogate-Key', key);
            } else {
                ctx.set('Cache-Control', 'private');
            }
        }
    });
}


module.exports = {
    middleware,
    init,
};
