/* jshint unused:true, node:true */


const IRCPORT = process.env.IRCPORT || 6667;
const WEBPORT = process.env.WEBPORT || 4567;

const Server   = require('./lib/server');

const server = new Server();
server.start({irc: IRCPORT, web: WEBPORT});
