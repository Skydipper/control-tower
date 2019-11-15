const logger = require('logger');
const Router = require('koa-router');
const StatisticModel = require('plugins/sd-ct-statistics-plugin/models/statistic.model');

const ApiRouter = new Router({
    prefix: '/api/v1/statistic',
});


function getMiddleware() {
    class StatisticRouter {

        static async get(ctx) {
            logger.info('Obtaining statistics');
            ctx.body = await StatisticModel.find().sort('-date').exec();
        }

        static async timeByRequest(ctx) {
            logger.info('Obtaining grouped statistics');
            let filter = null;
            logger.info('start', ctx.query.from);
            if (ctx.query.from || ctx.query.to) {
                filter = {
                    $match: {
                        date: {},
                    },
                };
                if (ctx.query.from) {
                    filter.$match.date.$gte = new Date(new Date(ctx.query.from).getTime() - (new Date(ctx.query.from).getTimezoneOffset() * 60000));
                }
                if (ctx.query.to) {
                    filter.$match.date.$lte = new Date(new Date(ctx.query.to).getTime() - (new Date(ctx.query.to).getTimezoneOffset() * 60000) + (24 * 60 * 60 * 1000) - 60000);
                }
            }
            const query = [];
            if (filter) {
                query.push(filter);
            }
            query.push({
                $group: {
                    _id: {
                        endpointPath: '$endpointPath',
                        sourceMethod: '$sourceMethod',
                    },
                    sum: {
                        $sum: '$time',
                    },

                },
            });
            ctx.body = await StatisticModel.aggregate(query).exec();
        }

        static async avgByRequest(ctx) {
            logger.info('Obtaining statistics aggrouped');
            let filter = null;
            logger.info('start', ctx.query.from);
            if (ctx.query.from || ctx.query.to) {
                filter = {
                    $match: {
                        date: {},
                    },
                };
                if (ctx.query.from) {
                    filter.$match.date.$gte = new Date(new Date(ctx.query.from).getTime() - (new Date(ctx.query.from).getTimezoneOffset() * 60000));
                }
                if (ctx.query.to) {
                    filter.$match.date.$lte = new Date(new Date(ctx.query.to).getTime() - (new Date(ctx.query.to).getTimezoneOffset() * 60000) + (24 * 60 * 60 * 1000) - 60000);
                }
            }
            const query = [];
            if (filter) {
                query.push(filter);
            }
            query.push({
                $group: {
                    _id: {
                        endpointPath: '$endpointPath',
                        sourceMethod: '$sourceMethod',
                    },
                    sum: {
                        $avg: '$time',
                    },
                    count: { $sum: 1 },
                },
            });
            ctx.body = await StatisticModel.aggregate(query).exec();
        }

        static async countRequestToday(ctx) {
            logger.info('Obtained request of today');
            const date = new Date();
            const today = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
            const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const tomorrow = new Date(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate(), 0, 0, 0);

            const count = await StatisticModel.count({
                date: {
                    $lt: tomorrow,
                    $gte: today,
                },
            }).exec();
            ctx.body = {
                count,
                begin: today.toISOString(),
                end: tomorrow.toISOString(),
            };
        }

        static async countRequestLastWeek(ctx) {
            logger.info('Obtained request of today');
            const lastWeekDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const lastWeek = new Date(lastWeekDate.getFullYear(), lastWeekDate.getMonth(), lastWeekDate.getDate(), 0, 0, 0);
            const tomorrow = new Date(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate(), 0, 0, 0);


            const count = await StatisticModel.count({
                date: {
                    $lt: tomorrow,
                    $gte: lastWeek,
                },
            }).exec();

            ctx.body = {
                count,
                begin: lastWeek.toISOString(),
                end: tomorrow.toISOString(),
            };
        }

        static async countRequestTodayByCountry(ctx) {
            logger.info('Obtaining num request today per country');
            const date = new Date();
            const today = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
            const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const tomorrow = new Date(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate(), 0, 0, 0);

            const result = await StatisticModel.aggregate([{
                $match: {
                    date: {
                        $lt: tomorrow,
                        $gte: today,
                    },
                },
            }, {
                $group: {
                    _id: '$geo.country',
                    count: {
                        $sum: 1,
                    },
                },
            }]).exec();
            ctx.body = result;
        }

        static async requestByDay(ctx) {
            logger.info('Obtaining grouped statistics');
            let filter = null;
            if (ctx.query.from || ctx.query.to) {
                filter = {
                    $match: {
                        date: {},
                    },
                };
                if (ctx.query.from) {
                    filter.$match.date.$gte = new Date(new Date(ctx.query.from).getTime() - (new Date(ctx.query.from).getTimezoneOffset() * 60000));
                }
                if (ctx.query.to) {
                    filter.$match.date.$lte = new Date(new Date(ctx.query.to).getTime() - (new Date(ctx.query.to).getTimezoneOffset() * 60000) + (24 * 60 * 60 * 1000) - 60000);
                }
            }
            const query = [];
            if (filter) {
                query.push(filter);
            }
            query.push({
                $group: {
                    _id: {
                        year: {
                            $year: '$date',
                        },
                        month: {
                            $month: '$date',
                        },
                        day: {
                            $dayOfMonth: '$date',
                        },
                    },
                    count: {
                        $sum: 1,
                    },
                },
            });
            ctx.body = await StatisticModel.aggregate(query).exec();
        }

    }

    ApiRouter.get('/requestByDay', StatisticRouter.requestByDay);
    ApiRouter.get('/countRequestTodayByCountry', StatisticRouter.countRequestTodayByCountry);
    ApiRouter.get('/countRequestToday', StatisticRouter.countRequestToday);
    ApiRouter.get('/countRequestLastWeek', StatisticRouter.countRequestLastWeek);
    ApiRouter.get('/timeByRequest', StatisticRouter.timeByRequest);
    ApiRouter.get('/avgByRequest', StatisticRouter.avgByRequest);
    ApiRouter.get('/', StatisticRouter.get);

    return ApiRouter;
}
module.exports = getMiddleware;
