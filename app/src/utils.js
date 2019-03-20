const logger = require('logger');

function getUser(ctx) {
    return ctx.req.user || ctx.state.user;
}

async function isLogged(ctx, next) {
    logger.debug('Checking if user is logged');
    if (getUser(ctx)) {
        await next();
    } else {
        logger.debug('Not logged');
        ctx.throw(401, 'Not authenticated');
    }
}

async function isAdmin(ctx, next) {
    logger.debug('Checking if user is admin');
    const user = getUser(ctx);
    if (user && user.role === 'ADMIN') {
        await next();
    } else {
        logger.debug('Not admin');
        ctx.throw(403, 'Not authorized');
    }
}

module.exports = {
    isAdmin,
    isLogged,
};
