const _GitterRoom = require('node-gitter/lib/rooms');

_GitterRoom.prototype.users = function (query, cb) {
    const limit = 30;
    const promises = [];

    for (let page = 0; page < Math.ceil(this.userCount / limit); page += 1) {
        const skip = limit * page;
        promises.push(this.client.get(this.path + '/' + this.id + '/users', { query: query, skip: skip, limit: limit }));
    }
    const items = Promise.all(promises).then((allResults) => allResults.reduce((arr, part) => arr.concat(part)));

    return cb ? items.nodeify(cb) : items;
};

module.exports = _GitterRoom;
