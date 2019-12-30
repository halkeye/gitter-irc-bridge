/* jshint unused:true, node:true */


const Promise    = require('bluebird');
const debug      = require('debug')('irc-gitter-adapter');
const Gitter     = require('node-gitter');
const Cache      = require('./cache');
const LruCacheDelegate = require('./lru-cache-delegate');
const irc        = require('./protocol');
const GitterRoom = require('node-gitter/lib/rooms');
const manifest   = require('../package.json');
const VERSION    = manifest.version;
const DATE       = Date();

const MARK_AS_READ_DELAY = 1500;
const AUTOJOIN_DELAY = 2500;
const AUTOJOIN_LIMIT = 10;

// NOTE: whytf isn't this using debug?
const log = console.log;

function repeat(c, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += c;
  return s;
}

function obfuscateToken(token) {
  token = token || '';
  return repeat('*', token.length - 8) + token.slice(token.length - 8);
}


const cacheDelegate = new LruCacheDelegate({
  max: 2048,
  // 2 minutes
  maxAge: 2 * 60 * 1000
});

const cache = new Cache(cacheDelegate);


function Adapter(client) {
  this.client = client;

  // Keep track of the active rooms
  this.rooms = {};

  this.hookEvents();

  this.sendPromiseChain = Promise.resolve();
}

// Map IRC commands to adapter functions
Adapter.prototype.hookEvents = function() {
  const commands = {
    PASS: this.setup,
    PRIVMSG: this.queueMessage,
    QUIT: this.quit,
    NICK: this.nick,
    USER: this.register,
    JOIN: this.joinChannels,
    PART: this.leaveRooms,
    WHO: this.listUsers,
    LIST: this.listRooms,
    MOTD: this.messageOfTheDay
  };

  Object.keys(commands).map(function(cmd) {
    this.client.on(cmd, commands[cmd].bind(this));
  }.bind(this));
};

Adapter.prototype.listenForOneToOnes = function() {
  const c = this.client;
  const self = this;

  const handleNotification = function(msg) {
    if (msg.notification !== 'user_notification') return;

    this.gitterClient.rooms.find(msg.troupeId)
    .then(function(room) {
      if (!room.oneToOne) return;
      const nick = room.user.username;
      const mask = ':' + nick + '!' + nick + '@irc.gitter.im';
      msg.text.split('\n').forEach(function(line) {
        c.send(mask, 'PRIVMSG', c.nick, ':' + line);
      });

      if (msg.chatId) {

        // Wait before marking the message as read
        setTimeout(function() {
          self.user.markAsRead(room.id, [msg.chatId]);
        }, MARK_AS_READ_DELAY);

      }

      c.trackEvent('1-to-1-from-faye');
    }.bind(this))
    .catch(function(err) {
      log('Error handling user_notification', this.user.username, err);
      log(err.stack);
    });
  };

  this.oneToOneSub = this.gitterClient.faye.client.subscribe('/api/v1/user/' + this.user.id, handleNotification.bind(this));
};

Adapter.prototype.setup = function(token) {
  this.loggableToken = obfuscateToken(token);
  debug('setup', { token: this.loggableToken });

  const c = this.client;

  if (token === "dbff95de400bdb378e908dc6ad7b51b029bb493d") {
      log("kickout out the naughty boy");
      this.quit();
      return;
  }

  if (this.gitterClient) {
    debug('disconnecting existing client', { token: this.loggableToken });
    this.gitterClient.faye.client.disconnect();
  }


  // TODO move this to a config file
  let opts = {};
  if (process.env.DEV) {
    opts = {
      client: {
        host: 'localhost',
        port: 5000,
        prefix: true
      },
      faye: {
        host: 'http://localhost:5000/bayeux'
      }
    };
  }

  this.gitterClient = new Gitter(token, opts);
  this.gitterClient.currentUser()
  .then(function(user) {
    debug('Logged in as ' + user.username, {
      username: user.username,
      token: this.loggableToken
    });
    this.user = user;
    this.client.authenticate(user);
    this.listenForOneToOnes();

    setTimeout(function() {
      if(Object.keys(this.rooms).length === 0) {
        this.autoJoin();
      }
      else {
        debug('Not autojoining rooms because they already joined some', { token: this.loggableToken });
      }
    }.bind(this), AUTOJOIN_DELAY);
  }.bind(this))
  .catch(function(err) {
    log('Authentication failed for token ', token);
    const mask = ':gitter!gitter@irc.gitter.im';
    c.send(mask, 'PRIVMSG', 'gitter', ': Authentication failed. Get a valid token from https://irc.gitter.im');
    this.quit();
  }.bind(this));
};

Adapter.prototype.subscribeToRoom = function(room) {
  const self = this;
  const c = this.client;

  debug('Subscribing to room ' + room.uri, { token: this.loggableToken});

  room.subscribe();

  room.on('chatMessages', function(evt) {
    if (['create', 'update'].indexOf(evt.operation) === -1) return;

    const message = evt.model;
    const nick = message.fromUser.username;
    if (nick === c.nick) return; // User's own message

    const mask = ':' + nick + '!' + nick + '@irc.gitter.im';

    let text;
    message.text.split('\n').forEach(function(line) {
      text = evt.operation === 'update' ? '[edit] ' + line : line;
      c.send(mask, 'PRIVMSG', '#' + room.uri, ':' + text);
    });

    // Wait before marking the message as read
    setTimeout(function() {
      self.user.markAsRead(room.id, [message.id]);
    }, MARK_AS_READ_DELAY);

    c.trackEvent('message-from-faye', room.id, message.id);
  }.bind(this));

  room.on('events', function(evt) {
    if (evt.operation !== 'create') return;
    const message = evt.model;
    const mask = ':gitter!gitter@irc.gitter.im';

    c.send(mask, 'PRIVMSG', '#' + room.uri, ':' + message.text);
    c.trackEvent('event-from-faye');
  }.bind(this));

  room.on('users', function(evt) {
    let nick, mask;
    if (evt.operation === 'create') {
      nick = evt.model.username;
      mask = ':' + nick + '!' + nick + '@irc.gitter.im';
      c.send(mask, 'JOIN', '#' + room.uri);
    }
    if (evt.operation === 'remove') {
      nick = evt.model.username;
      mask = ':' + nick + '!' + nick + '@irc.gitter.im';
      c.send(mask, 'PART', '#' + room.uri);
    }
  }.bind(this));

};

Adapter.prototype.queueMessage = function(target, message) {
    this.sendPromiseChain = this.sendPromiseChain.then(function() {
        return this.sendMessage(target, message);
    }.bind(this));
};

Adapter.prototype.sendMessage = async function(target, message) {
  const c = this.client;
  const uri = target.replace('#', '');
  const isStatus = /^\u0001ACTION/.test(message);

  // This are /me IRC messages.
  if (isStatus) {
    message = message
    .replace(/^\u0001ACTION /, '@' + c.nick + ' ')
    .replace(/\u0001$/, '');
  }

  try {
    const room = await this.gitterClient.rooms.join(uri);
    return isStatus ? room.sendStatus(message) : room.send(message);
  } catch (err) {
    log('Error sending message to ', uri, err);
    log(err.stack);
  }
};

Adapter.prototype.nick = function(nick) {
  const c = this.client;
  c.send(c.mask(), 'NICK', ':' + c.nick);
};

Adapter.prototype.register = function(username, hostname, servername, realname) {
  const c = this.client;
  c.send(c.host, irc.reply.welcome, c.nick, 'Gitter', c.mask());
  c.send(c.host, irc.reply.yourHost, c.nick, 'Version:', VERSION);
  c.send(c.host, irc.reply.created, c.nick, 'Created on', DATE);
  c.send(c.host, irc.reply.myInfo, c.nick, c.hostname, VERSION, 'wo', 'ntr');
  c.send(c.host, irc.reply.isupport, c.nick, 'CHANTYPES=# CHANMODES=,,, CHANNELLEN=128 NICKLEN=40 NETWORK=Gitter SAFELIST CASEMAPPING=ascii :are supported by this server');
  this.messageOfTheDay();
};

Adapter.prototype.joinChannels = function(channels, key) {
  if (channels) channels.split(',').map(this.joinRoomFromChannel.bind(this));
};

Adapter.prototype.joinRoomFromChannel = function(channel) {
  const c = this.client;
  const uri = channel.replace('#', '');

  this.gitterClient.rooms.join(uri)
    .then(function(room) {
      if (room.oneToOne) throw('Room is one-to-one');
      return room;
    })
    .then(this.joinRoom.bind(this));
};

Adapter.prototype.joinRoom = function(room) {
  const c = this.client;
  const uri = room.uri.toLowerCase();

  if (this.rooms[uri]) return;

  this.rooms[uri] = room;

  room.users()
    .then(function(users) {
      const _channel = '#' + room.uri;
      const channelType = '*'; // TODO set right type -> * private, @ secret, = public

      const usernames = users.map(function(u) { return u.username; });
      usernames.push('gitter'); // Fake gitter user for Events

      c.send(c.mask(), 'JOIN', _channel);
      c.send(c.host, irc.reply.topic,     c.nick, _channel, ':' + room.topic);
      c.send(c.host, irc.reply.nameReply, c.nick, channelType, _channel, ':' + usernames.join(' '));
      c.send(c.host, irc.reply.endNames,  c.nick, _channel, ': /NAMES');

      return room;
    })
    .then(this.subscribeToRoom.bind(this))
    .catch(function(err) {
      c.send(c.host, irc.errors.noSuchChannel, c.nick, channel, ':Invalid channel or insufficient permissions');
      log('Error joining room ', room.uri, err);
      log(err.stack);
    });
};

Adapter.prototype.leaveRooms = function(channels, key) {
  if (channels) channels.split(',').map(this.leaveRoom.bind(this));
};

Adapter.prototype.leaveRoom = function(channel) {
  const uri = channel.replace('#', '').toLowerCase();
  this.client.send(this.client.mask(), 'PART', channel);
  this._unsubscribe(uri);
};

Adapter.prototype.listUsers = function(channel, key) {
  const uri = channel && channel.replace('#', '');

  const c = this.client;

  if (channel === undefined) {
    c.send(c.mask(), 'WHO', ':');
    return;
  }
  if (channel.charAt(0) !== '#') {
    c.send(c.mask(), 'WHO', ':' + channel);
    return;
  }


  const getRoomMembers = cache.get(uri, async function() {
    const room = await this.gitterClient.rooms.join(uri);
    const members = room.users();
    return members;
  }.bind(this));

  getRoomMembers.then(function(users) {
    (users || []).forEach(function(user) {
      c.send(c.host, irc.reply.who, c.nick, channel, user.username, c.hostname, c.hostname, user.username, 'H', ':0', user.displayName);
    });
    c.send(c.host, irc.reply.who, c.nick, channel, 'gitter', c.hostname, c.hostname, 'gitter', 'H', ':0', 'Gitter Bot');
    c.send(c.host, irc.reply.endWho, c.nick, channel, ':End of /WHO list.');
  })
  .catch(function(err) {
    log('Error listing users for ', uri, err);
    log(err.stack);
    c.send(c.host, irc.errors.noSuchChannel, c.nick, ':No such channel');
  });
};

Adapter.prototype.autoJoin = function() {
  const gc = this.gitterClient;

  gc.currentUser()
  .then(function(user) {
    return user.rooms();
  })
  .then(function(rooms) {
    return rooms.map(function(room) {
      return new GitterRoom(room, gc.client, gc.faye);
    })
    .filter(function(room) {
      return !room.oneToOne && room.lastAccessTime;
    })
    .sort(function(a, b) { // sort descending (latest touched first)
      return Date.parse(a.lastAccessTime) < Date.parse(b.lastAccessTime) ? 1 : -1;
    })
    .slice(0, AUTOJOIN_LIMIT);
  })
  .then(function(rooms) {
    rooms.forEach(function(room) {
      this.joinRoom(room);
    }.bind(this));
  }.bind(this))
  .catch(function(err) {
    log('Error autojoining rooms');
    log(err.stack);
  });
};

Adapter.prototype.listRooms = function() {
  const c = this.client;

  this.gitterClient.currentUser()
  .then(function(user) {
    return user.rooms();
  })
  .then(function(rooms) {
    c.send(c.host, irc.reply.listStart, c.nick, 'Channel', ':Users Name');

    rooms.forEach(function(room) {
      if (room.oneToOne) return; // Do not show 1-to-1 chats
      c.send(c.host, irc.reply.list, c.nick, '#' + room.uri, room.userCount, ': ' + room.topic);
    });

    c.send(c.host, irc.reply.listEnd, c.nick, ':End of /LIST');
  });
};

Adapter.prototype.messageOfTheDay = function() {
  const c = this.client;

  c.send(c.host, irc.reply.motdStart, c.nick, ':- Message of the Day -');
  c.send(c.host, irc.reply.motd,      c.nick, ':- Welcome To Gitter IRC!');
  c.send(c.host, irc.reply.motd,      c.nick, ':- Info at https://irc.gitter.im');
  c.send(c.host, irc.reply.motd,      c.nick, ':- Code at https://gitlab.com/gitlab-org/gitter/irc-bridge');
  c.send(c.host, irc.reply.motdEnd,   c.nick, ':End of /MOTD command.');
};

Adapter.prototype.quit = function() {
  // NOTE: client.disconnect or client.faye.disconnect?
  this.client.disconnect();
};

Adapter.prototype._unsubscribe = function(uri) {
  if (!this.rooms[uri]) return;

  this.rooms[uri].unsubscribe();
  this.rooms[uri].removeAllListeners();
  delete this.rooms[uri];
};

Adapter.prototype._teardown = function() {
  debug('_teardown', { token: this.loggableToken });
  if (this.oneToOneSub) this.oneToOneSub.cancel();
  Object.keys(this.rooms).map(this._unsubscribe.bind(this));
  if (this.gitterClient) this.gitterClient.faye.client.disconnect();
};

module.exports = Adapter;
