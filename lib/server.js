/* jshint unused:true, node:true */


const debug     = require('debug')('irc-server');
const net       = require('net');
const Client    = require('./client');
const dashboard = require('../dashboard');
const GitterAdapter = require('./gitter-adapter');

// The server handles incoming TCP connections and
// instantiates a Client to handle each connection
function Server() {
  this.clients = {};
}

Server.prototype.start = function(ports, cb) {
  this._instance = net.createServer(this.connectionListener.bind(this));
  this._instance.listen(ports.irc, () => {
    debug('IRC server listening on ' + ports.irc);
    if (cb) cb();
  });

  if (ports.web) {
    this.dashboard = dashboard(ports.web);
  }

  process.on('SIGTERM', this.exit.bind(this));
  process.on('SIGINT',  this.exit.bind(this));
};

Server.prototype.connectionListener = function(conn) {
  const client  = new Client(conn);
  this.clients[client.uuid] = client;

  const adapter = new GitterAdapter(client);

  const _close = (...args) => {
    adapter._teardown();
    client._teardown();
    delete this.clients[client.uuid];
    if (this.dashboard) {
      this.dashboard.close();
    }
  };

  conn.on('end',      _close);
  conn.on('error',    _close);
  conn.on('timeout',  _close);
};

Server.prototype.stop = function(cb) {
  debug('Stopping server');
  cb = cb || function() {};

  const start = new Date().getTime();
  const promise = new Promise((resolve) => {
    const id = setInterval(() => {
      const elapsed = new Date().getTime() - start;
      // If all clients have disconnected, exit with status 0
      // otherwise Force shutdown after 2.5s
      if (Object.keys(this.clients).length === 0 || elapsed > 2500) {
        clearInterval(id);
        this._instance.close((...args) => {
          resolve();
        });
      }
    }, 100);
  });

  // Disconnect all clients gracefully
  Object.keys(this.clients).forEach((uuid) => {
    this.clients[uuid].disconnect({msg: 'Server stopping.'});
  });

  promise.then(() => { cb(); }, cb);
};

Server.prototype.exit = function() {
  this.stop((err) => {
    if (err) debug(err.message);
    process.exit(err ? 1 : 0);
  });
};

module.exports = Server;
