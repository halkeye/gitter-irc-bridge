

const assert = require('assert');
const Promise = require('bluebird');
const Cache = require('../lib/cache');



describe('Cache', function() {

  describe('static map', function() {
    let cache;
    let backingStore;
    beforeEach(function() {
      backingStore = {
        foo: 'bar',
        ping: 'pong'
      };
      const staticMapCacheDelegate = {
        get: function(key, fetchFn) {
          return Promise.resolve(backingStore[key]);
        }
      };

      cache = new Cache(staticMapCacheDelegate);
    });

    it('should retrieve value from `.get`', async function() {
      const retrieveValuePromise = cache.get('foo', function() { });

      const val = await retrieveValuePromise;
      assert.equal(val, 'bar');
    });
  });

  describe('local map', function() {
    let cache;
    let backingStore;
    beforeEach(function() {
      backingStore = {};
      const localMapCacheDelegate = {
        get: function(key, fetchFn) {
          return Promise.resolve(backingStore[key] || fetchFn().then(function(newVal) {
            backingStore[key] = newVal;
            return newVal;
          }));
        }
      };

      cache = new Cache(localMapCacheDelegate);
    });

    it('should fill in cache from fetchFn when empty', async function() {
      const expectedValue = 'bar';
      const retrieveValuePromise = cache.get('foo', function() {
        return Promise.resolve(expectedValue);
      });

      assert.deepEqual(backingStore, { });
      const val = await retrieveValuePromise;
      assert.equal(val, expectedValue);
      assert.deepEqual(backingStore, { foo: 'bar' });
    });

    it('should retrieve same value from cache', async function() {
      const expectedValue = 'bar';
      const retrieveValuePromise = cache.get('foo', function() {
        return Promise.resolve(expectedValue);
      });

      const val2 = await retrieveValuePromise;
      assert.equal(val2, expectedValue);
      assert.deepEqual(backingStore, { foo: 'bar' });

      const val = await cache.get('foo', function() {
        return Promise.resolve('oops');
      });

      assert.equal(val, expectedValue);
      assert.deepEqual(backingStore, { foo: 'bar' });
    });
  });
});
