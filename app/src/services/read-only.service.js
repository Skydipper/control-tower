module.exports = class ReadOnlyService {

    constructor(blacklist = [], whitelist = []) {
        this.blacklist = blacklist;
        this.whitelist = whitelist;
    }

    isBlacklisted(path) {
        return this.blacklist.includes(path);
    }

    isWhitelisted(path) {
        return this.whitelist.includes(path);
    }

    shouldBlockRequest(method, path) {
        return (ReadOnlyService.isRead(method) && this.isBlacklisted(path))
        || (ReadOnlyService.isWrite(method) && !this.isWhitelisted(path));
    }

    static isRead(method) {
        return method === 'GET';
    }

    static isWrite(method) {
        return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    }

};
