module.exports = class ReadOnlyService {

    constructor(blacklist = [], whitelist = []) {
        this.blacklist = blacklist;
        this.whitelist = whitelist;
    }

    isBlacklisted(path) {
        return this.blacklist.some((element) => new RegExp(element).test(path));
    }

    isWhitelisted(path) {
        return this.whitelist.some((element) => new RegExp(element).test(path));
    }

    shouldBlockRequest(method, path) {
        return (ReadOnlyService.isRead(method) && this.isBlacklisted(path))
        || (ReadOnlyService.isWrite(method) && !this.isWhitelisted(path));
    }

    static isRead(method) {
        return ['GET', 'OPTIONS', 'HEAD'].includes(method);
    }

    static isWrite(method) {
        return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    }

};
