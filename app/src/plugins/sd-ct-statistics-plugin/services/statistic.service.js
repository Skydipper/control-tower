const logger = require('logger');
const StatisticModel = require('plugins/sd-ct-statistics-plugin/models/statistic.model');
const geoip = require('geoip-lite');

class StatisticService {

    static async completeGeoInfo() {
        logger.info('Loading statistics to complete geo info');
        const statistics = await StatisticModel.find({
            ip: {
                $exists: true,
            },
            'geo.completed': false,
        }).limit(10000).exec();
        logger.info('Ips found ', statistics.length);
        for (let i = 0, { length } = statistics; i < length; i++) {
            if (statistics[i].ip && statistics[i].ip.indexOf('127.0.0.1') === -1) {
                let { ip } = statistics[i];
                if (ip.indexOf(',') >= 0) {
                    [, ip] = ip.split(',');
                }
                const geo = geoip.lookup(ip);
                if (geo) {
                    statistics[i].geo = {
                        city: geo.city,
                        country: geo.country,
                        region: geo.region,
                        ll: geo.ll,
                        completed: true,
                    };
                } else {
                    statistics[i].geo = {
                        completed: true,
                    };
                }
            } else {
                statistics[i].geo = {
                    completed: true,
                };
            }
            await statistics[i].save();
        }
        logger.info('Finish complete geo');
    }

    static async middleware(ctx, next) {
        const first = Date.now();
        let error = false;
        let errorCode = null;
        try {
            await next();
        } catch (e) {
            error = true;
            errorCode = e.status || 500;
            throw e;
        } finally {
            if (ctx.request.url !== '/healthcheck') {
                if (ctx.state.source && ctx.state.source.path) {
                    const model = {
                        sourcePath: ctx.state.source.path,
                        sourceMethod: ctx.state.source.method,
                        error,
                        errorCode,
                        cached: false,
                        time: Date.now() - first,
                        ip: ctx.headers['x-forwarded-for'],
                        anonymous: (!ctx.state.user && !ctx.req.user && !ctx.state.microservice),
                        loggedUser: ctx.state.user || ctx.req.user || ctx.state.microservice,
                    };
                    if (ctx.state.redirect) {
                        model.endpointPath = ctx.state.redirect.endpoint.path;
                        model.redirectUrl = ctx.state.redirect.url;
                        model.redirectMethod = ctx.state.redirect.method;
                    }

                    logger.info('Saving statistic');
                    await new StatisticModel(model).save();
                } else {
                    const model = {
                        sourcePath: ctx.path,
                        sourceMethod: ctx.request.method,
                        error,
                        errorCode,
                        cached: ctx.state.isCached || false,
                        time: Date.now() - first,
                        ip: ctx.headers['x-forwarded-for'],
                        anonymous: (!ctx.state.user && !ctx.req.user && !ctx.state.microservice),
                        loggedUser: ctx.state.user || ctx.req.user || ctx.state.microservice
                    };
                    if (ctx.state.redirect) {
                        model.endpointPath = ctx.state.redirect.endpoint.path;
                        model.redirectUrl = ctx.state.redirect.url;
                        model.redirectMethod = ctx.state.redirect.method;
                    }


                    logger.info('Saving statistic');
                    await new StatisticModel(model).save();

                }
            }
        }
    }

}

module.exports = StatisticService;
