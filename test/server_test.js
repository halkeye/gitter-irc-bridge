const assert  = require('assert');
const net     = require('net');

const Server = require('../lib/server.js');

const rnd = function() { return Math.floor(Math.random() * 900); };

const IRCPORT = 15000 + rnd();
const WEBPORT = 15000 + rnd();

describe('Server', function() {
  let server;

  before(function(done) {
    server = new Server();
    server.start({irc: IRCPORT, web: WEBPORT}, done);
  });

  after(function(done) {
    server.stop(done);
  });

  it('should allow keep an index of connected clients', function(done) {
    const client = net.connect({port: IRCPORT});

    client.on('connect', function() {
      setTimeout(function() {
        assert.equal(1, Object.keys(server.clients).length);
        client.end();
      }, 100);
    });

    client.on('data', function() {});

    client.on('close', function() {
      done();
    });
  });

  it('should cleanup after a client disconnects', function(done) {
    const client = net.connect({port: IRCPORT});

    client.on('connect', client.end);

    client.on('data', function() {});

    client.on('close', function() {
      assert.equal(0, Object.keys(server.clients).length);
      done();
    });
  });
});
