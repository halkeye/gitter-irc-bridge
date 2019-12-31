const IRCPORT = parseInt(process.env.IRCPORT || "6667", 10);
const WEBPORT = parseInt(process.env.WEBPORT || "4567", 10);

const Server   = require('./lib/server');

const server = new Server();
server.start({irc: IRCPORT, web: WEBPORT});
