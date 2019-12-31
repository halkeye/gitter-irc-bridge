const express = require('express');

const path = require('path');
const debug = require('debug')('irc-dashboard');


function hook(ircServer, port) {
  const app = express();
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  app.get('/', (req, res) => {
    const clients = Object.keys(app.irc.clients).map((uuid) => app.irc.clients[uuid]);
    res.render('clients', {clients: clients});
  });

  app.get('/users/:uuid', (req, res) => {
    const client = app.irc.clients[req.params.uuid];
    if (!client) return res.status(404).send('Not Found');
    res.render('client', {client: client});
  });
  app.irc = ircServer;
  return app.listen(port, (err) => {
    debug('Dashboard listening on ' + port);
  });
}

module.exports = hook;
