/* jshint unused:true, node:true */


const debug         = require('debug')('irc-client');
const audit         = require('debug')('irc-server');
const util          = require('util');
const EventEmitter  = require('eventemitter3');
const carrier       = require('carrier');
const ircMessage    = require('irc-message');
const crypto        = require('crypto');
const chunkString   = require('./chunk-string');


// https://tools.ietf.org/html/rfc2812#section-2.3
const MESSAGE_MAX_LENGTH = 512;
// 512 - CR - LF
const MESSAGE_PIECE_MAX_LENGTH = MESSAGE_MAX_LENGTH - 2;




// The Client handles a single socket client,
// parses each line and emits an event when an
// IRC command is received.
function Client(socket) {
  EventEmitter.call(this);

  this.uuid = crypto.randomBytes(4).toString('hex');
  this.socket = socket;

  this.carry = carrier.carry(socket);
  this.carry.on('line', this.parse.bind(this));

  // TODO Get network and hostname from a config file
  this.hostname = 'irc.gitter.im';
  this.host     = ':' + this.hostname;

  this.user = null;
  this.nick = '*';

  // By default the Client is not authenticated
  // and received commands are queued
  this.authenticated = false;
  this.queue = [];

  this.keepAlive();

  this.authMessage = setTimeout(() => {
    if (!this.authenticated) {
      this.disconnect({msg: 'You must authenticate, check: https://irc.gitter.im'});
    }
  }, 5000);

  this.stats = {};
  this.trackEvent('connected');
}

util.inherits(Client, EventEmitter);

// https://tools.ietf.org/html/rfc2812#section-3.7.2
Client.prototype.keepAlive = function() {
  const pingInterval = 30 * 1000;
  const connectionTimeout = pingInterval * 2;

  const ping = function() {
    this.send('PING', this.host);
  };

  const pong = function() {
    this.send('PONG', this.host);
  };

  const refreshConnectionTimeout = function() {
    clearTimeout(this.connectionTimeout);
    this.connectionTimeout = setTimeout(this.disconnect.bind(this), connectionTimeout);
    this.stats.ping = new Date();
  };

  this.pingInterval = setInterval(ping.bind(this), pingInterval);
  this.connectionTimeout = setTimeout(this.disconnect.bind(this), connectionTimeout);

  this.on('PONG', refreshConnectionTimeout.bind(this));
  this.on('PING', pong.bind(this));
};

Client.prototype.parse = function(line) {
  debug('Rx: ' + line);
  const msg = ircMessage.parse(line);
  if (!msg.command.toUpperCase().match(/^P(I|O)NG/)) this.stats['msg-from-client'] = new Date();

  if (this.authenticated || msg.command.match(/pass/i)) {
    this.emit.apply(this, [msg.command.toUpperCase()].concat(msg.params));
  } else {
    this.queue.push(msg);
  }
};

Client.prototype.authenticate = function(user) {
  this.nick = user.username;
  this.authenticated = true;
  this.queue.forEach((msg) => {
    this.emit.apply(this, [msg.command.toUpperCase()].concat(msg.params));
  });

  this.trackEvent('authenticated');
};

Client.prototype.trackEvent = function(...args) {
  if (!args.length) return;
  this.emit(...args);

  const time = new Date();
  this.stats[args[0]] = time;
  audit.apply(this, [this.uuid, this.nick, time, ...args]);
};

// https://tools.ietf.org/html/rfc1459#section-2.3
Client.prototype.send = function() {
  const args = Array.prototype.slice.call(arguments);
  const message = args.join(' ');

  // Respect IRC line length limit of 512 chars (MESSAGE_MAX_LENGTH)
  // https://tools.ietf.org/html/rfc2812#section-2.3
  if (message.length > MESSAGE_PIECE_MAX_LENGTH) {
    const payload_marker  = message.indexOf(' :');
    const command = message.substr(0, payload_marker) + ' :';
    const payload = message.substr(payload_marker + 2);

    const payloadChunks = chunkString(payload, MESSAGE_PIECE_MAX_LENGTH - command.length);
    payloadChunks.forEach((payloadChunk) => {
      const messageChunk = command + payloadChunk;
      debug('Tx: ' + messageChunk);
      this.socket.write(messageChunk + '\r\n');
    });

  } else {
    debug('Tx: ' + message);
    this.socket.write(message + '\r\n');
  }

  if (!message.toUpperCase().match(/^P(I|O)NG/)) this.stats['msg-to-client'] = new Date();
};

Client.prototype.mask = function() {
  return ':' + this.nick + '!' + this.nick + '@' + this.hostname;
};

Client.prototype._teardown = function() {
  this.trackEvent('disconnected');

  this.removeAllListeners();
  clearTimeout(this.authMessage);
  clearInterval(this.pingInterval);
  clearTimeout(this.connectionTimeout);
};

Client.prototype.disconnect = function(opts) {
  opts = opts || {};

  if (opts.msg) {
    try {
      this.send('ERROR', ':' + opts.msg);
    }
    catch(err) {
      debug('Socket was already closed');
    }
  }

  this.socket.end();
};


module.exports = Client;
