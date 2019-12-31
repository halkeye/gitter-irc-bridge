const _GitterRoom = require('node-gitter/lib/rooms');
const Client      = require('node-gitter/lib/client');
const debug       = require('debug')('irc-gitter-adapter');


_GitterRoom.prototype.users = function (query, cb) {
  const limit = 30;
  const promises = [];

  for (let page = 0; page < Math.ceil(this.userCount / limit); page += 1) {
    const skip = limit * page;
    promises.push(this.client.get(this.path + '/' + this.id + '/users', { query: {skip: skip, limit: limit} }));
  }
  const items = Promise.all(promises).then((allResults) => allResults.reduce((arr, part) => arr.concat(part)));

  return cb ? items.nodeify(cb) : items;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const originalRequest = Client.prototype.request;
Client.prototype.request = function(...args) {
  return originalRequest.apply(this, args).catch((e) => {
    if (e.message.startsWith('429: ')) {
      // rate resets every minute
      debug('sleeping 15 seconds');
      return sleep(15 * 1000).then(() => Client.prototype.request.apply(this, args));
    }
    throw e;
  });
};

module.exports = _GitterRoom;
