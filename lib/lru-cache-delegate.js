

const Promise = require('bluebird');
const LRU = require('lru-cache');

function LruCacheDelegate(options) {
  this.backingCache = new LRU(options);
}

LruCacheDelegate.prototype.get = Promise.method(function(key, fetchFn) {
  const val = this.backingCache.get(key);

  if(!val) {
    return Promise.resolve(fetchFn())
    .bind(this)
    .then(function(newVal) {
      this.backingCache.set(key, newVal);
      return newVal;
    });
  }

  return Promise.resolve(val);
});

module.exports = LruCacheDelegate;
