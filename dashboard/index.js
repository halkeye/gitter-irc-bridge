const express = require('express');

const debug = require('debug')('irc-dashboard');
const app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

app.get('/', function(req, res) {
  const clients = Object.keys(app.irc.clients).map(function(uuid) { return app.irc.clients[uuid]; });
  res.render('clients', {clients: clients});
});

app.get('/users/:uuid', function(req, res) {
  const client = app.irc.clients[req.params.uuid];
  if (!client) return res.status(404).send('Not Found');
  res.render('client', {client: client});
});


function hook(ircServer, port) {
  app.irc = ircServer;
  app.listen(port, function(err) {
    debug('Dashboard listening on ' + port);
  });
}

module.exports = hook;
