const assert  = require('assert');
const net     = require('net');
const sinon   = require('sinon');

const Client = require('../lib/client.js');
const Adapter = require('../lib/gitter-adapter.js');

describe('Gitter Adapter', function() {
  let socket, client, adapter;

  beforeEach(function() {
    socket  = new net.Socket();
    client  = new Client(socket);
    adapter = new Adapter(client);
  });

  afterEach(function() {
    client._teardown();
    client.socket.end();
    socket.destroy();
  });

  it('should ignore NICK and return Gitter nick', function() {
    client.authenticated = true;
    client.nick = 'bar'; // obtained after auth
    const spy = sinon.spy();
    sinon.stub(socket, 'write').callsFake(spy);
    client.parse('NICK foo');
    assert(spy.calledWith(":bar!bar@irc.gitter.im NICK :bar\r\n"));
  });

  it('should ignore WHO when no parameter is specified', function() {
    client.authenticated = true;
    client.nick = 'bar'; // obtained after auth
    const spy = sinon.spy();
    sinon.stub(socket, 'write').callsFake(spy);
    client.parse('WHO');
    assert(spy.calledWith(":bar!bar@irc.gitter.im WHO :\r\n"));
  });

  it('should ignore WHO when a username is specified', function() {
    client.authenticated = true;
    client.nick = 'bar'; // obtained after auth
    const spy = sinon.spy();
    sinon.stub(socket, 'write').callsFake(spy);
    client.parse('WHO bar');
    assert(spy.calledWith(":bar!bar@irc.gitter.im WHO :bar\r\n"));
  });

  it('should preserve the order when sending a batch of messages', function() {
    const spy = sinon.spy();
    adapter.sendMessage = spy;
    adapter.setup("fake-token");
    adapter.queueMessage("#chan", "first");
    adapter.queueMessage("#foo", "second");
    adapter.queueMessage("#bar", "third");

    adapter.sendPromiseChain = adapter.sendPromiseChain.then(function() {
      assert(spy.calledThrice);
      assert(spy.firstCall.calledWith("#chan", "first"));
      assert(spy.secondCall.calledWith("#foo", "second"));
      assert(spy.thirdCall.calledWith("#bar", "third"));
    });
    return adapter.sendPromiseChain;
  });

});
