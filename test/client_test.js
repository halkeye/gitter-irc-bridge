const assert  = require('assert');
const EventEmitter = require('eventemitter3');
const net     = require('net');
const sinon   = require('sinon');

const Client = require('../lib/client.js');


// https://tools.ietf.org/html/rfc2812#section-2.3
const MESSAGE_MAX_LENGTH = 512;
// 512 - CR - LF
const MESSAGE_PIECE_MAX_LENGTH = 510;

const stringRepeat = function(str, num) {
  return Array(num + 1).join(str);
};



describe('Client', function() {
  it('should be an event emitter', function() {
    const socket = new net.Socket();
    const client = new Client(socket);
    assert(client instanceof EventEmitter);
  });

  it('should emit PASS command even if not authenticated', function(done) {
    const socket = new net.Socket();
    const client = new Client(socket);

    client.on('PASS', function(channels) {
      done();
    });

    client.parse('PASS 123token456');
  });


  it('should emit after parsing an IRC message', function(done) {
    const socket = new net.Socket();
    const client = new Client(socket);
    client.authenticated = true;

    client.on('JOIN', function(channels) {
      done();
    });

    client.parse('JOIN #test');
  });

  it('should send valid messages', function(done) {
    const socket = new net.Socket();
    const stub = sinon.stub(socket, 'write', function(msg) {
      assert(msg === "PING hostname host\r\n");
      done();
    });

    const client = new Client(socket);
    client.send('PING', 'hostname', 'host');
  });

  it('should shutdown properly', function() {
    const socket = new net.Socket();
    const spy = sinon.spy();
    const stub = sinon.stub(socket, 'end', spy);
    const client = new Client(socket);

    client.disconnect();
    sinon.assert.called(spy);
  });

  it('should process queue after authenticated', function() {
    const socket = new net.Socket();
    const client = new Client(socket);
    const spy = sinon.spy();

    client.parse('NICK foo');
    client.parse('NICK foo');
    client.on('NICK', spy);
    client.authenticate({username: 'foo'});
    sinon.assert.calledTwice(spy);
  });

  it('should split long normal messages', function(done) {
    const socket = new net.Socket();
    const client = new Client(socket);

    const prefixes = ':source PRIVMSG target :';

    // normal-ish message with spacing and colons
    const messageFirstPiece = 'first message: ';
    const repeatedPieceLength = 600;
    const message = messageFirstPiece + stringRepeat('a', repeatedPieceLength);

    // Exclude the prefixes and the first piece
    const expectedNumberOfRepeatedPieceCharacters1 = MESSAGE_PIECE_MAX_LENGTH - prefixes.length - messageFirstPiece.length;
    const expectedIncomingMessage1 = 'first message: ' + stringRepeat('a', expectedNumberOfRepeatedPieceCharacters1);
    // The overflow from the first message
    const expectedIncomingMessage2 = stringRepeat('a', repeatedPieceLength - expectedNumberOfRepeatedPieceCharacters1);
    const expectedIncomingMessages = [
      expectedIncomingMessage1,
      expectedIncomingMessage2
    ];

    let incomingMessageIndex = 0;
    const stub = sinon.stub(socket, 'write', function(incomingMessage) {
      assert.equal(incomingMessage, prefixes + expectedIncomingMessages[incomingMessageIndex] + '\r\n');
      if (incomingMessageIndex === expectedIncomingMessages.length - 1) {
        done();
      }

      incomingMessageIndex++;
    });

    client.send(':source', 'PRIVMSG', 'target', ':' + message);
  });

  it('should split long messages without spaces', function(done) {
    const socket = new net.Socket();
    const client = new Client(socket);

    const prefixes = ':source PRIVMSG target :';

    // normal-ish message with spacing and colons
    const repeatedPieceLength = 600;
    const message = stringRepeat('a', repeatedPieceLength) + stringRepeat('b', repeatedPieceLength);

    // The first message, ~aaa
    const expectedNumberOfRepeatedPieceCharacters1 = MESSAGE_PIECE_MAX_LENGTH - prefixes.length;
    const expectedIncomingMessage1 = stringRepeat('a', expectedNumberOfRepeatedPieceCharacters1);

    // The overflow from the first message, ~aaabbb
    const expectedNumberOfRepeatedPieceCharacters2 = repeatedPieceLength - expectedNumberOfRepeatedPieceCharacters1;
    const expectedNumberOfRepeatedPieceCharacters3 = MESSAGE_PIECE_MAX_LENGTH - prefixes.length - expectedNumberOfRepeatedPieceCharacters2;
    const expectedIncomingMessage2 = stringRepeat('a', expectedNumberOfRepeatedPieceCharacters2) + stringRepeat('b', expectedNumberOfRepeatedPieceCharacters3);

    // The final message, ~bbb
    const expectedNumberOfRepeatedPieceCharacters4 = repeatedPieceLength - expectedNumberOfRepeatedPieceCharacters3;
    const expectedIncomingMessage3 = stringRepeat('b', expectedNumberOfRepeatedPieceCharacters4);

    const expectedIncomingMessages = [
      expectedIncomingMessage1,
      expectedIncomingMessage2,
      expectedIncomingMessage3
    ];

    let incomingMessageIndex = 0;
    const stub = sinon.stub(socket, 'write', function(incomingMessage) {
      assert.equal(incomingMessage, prefixes + expectedIncomingMessages[incomingMessageIndex] + '\r\n');
      if (incomingMessageIndex === expectedIncomingMessages.length - 1) {
        done();
      }

      incomingMessageIndex++;
    });

    client.send(':source', 'PRIVMSG', 'target', ':' + message);
  });


});
