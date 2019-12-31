const _GitterRoom = require('node-gitter/lib/rooms');

class GitterRoom extends _GitterRoom {
    async users (query, cb) {
        const limit = 30;
        const promises = [];

        for (let page = 0; page < Math.ceil(this.userCount / limit); page += 1) {
            const skip = limit * page;
            promises.push(this.client.get(this.path + '/' + this.id + '/users', { query: query, skip: skip, limit: limit }));
        }
        const items = await Promise.all(promises).then((allResults) => allResults.reduce((arr, part) => arr.concat(part)));

        return cb ? cb(items) : items;
    }

}

module.exports = GitterRoom;
