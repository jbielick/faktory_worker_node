const { Socket } = require('net');
const assert = require('assert');
const EventEmitter = require('events');
const debug = require('debug')('faktory-worker:connection');

const Parser = require('./parser');

const SOCKET_TIMEOUT = 10000;

/**
 * A connection to the faktory server for sending commands
 * and receiving messages. Abstracts the underlying node Socket
 * and allows easier async sending and receiving. Not "threadsafe". Use in
 * a connection pool.
 *
 * @private
 */
class Connection extends EventEmitter {
  /**
   * @param {Number} port the port to connect on
   * @param {String} host the hostname to connect to
   * @return {Connection}
   */
  constructor(port, host) {
    super();
    this.host = host;
    this.port = port;
    this.connected = false;
    this.socket = new Socket();
    this.parser = new Parser();
    this.listen();
  }

  /**
   * Sets the socket timeout
   * @param {Number} ms timeout in milliseconds
   * @private
   */
  setTimeout(ms = SOCKET_TIMEOUT) {
    this.socket.setTimeout(ms);
  }

  /**
   * Registers listeners on the underlying node socket
   * @private
   * @return {Connection} self
   */
  listen() {
    this.socket
      .on('connect', this.onConnect.bind(this))
      .on('data', buffer => this.parser.parse(buffer))
      .on('timeout', this.onTimeout.bind(this))
      .on('error', this.onError.bind(this))
      .on('close', this.onClose.bind(this));

    this.parser
      .on('message', this.onMessage.bind(this, null))
      .on('error', this.onMessage.bind(this));

    return this;
  }

  /**
   * Opens a connection to the server
   * @return {Promise} resolves with the server's greeting
   */
  open() {
    debug('connecting');

    return new Promise((resolve, reject) => {
      this.pending = [
        (err, response) => {
          if (err) return reject(err);
          const greeting = JSON.parse(response.split(' ')[1]);
          this.emit('greeting', greeting);
          return resolve(greeting);
        }
      ];
      const onceErrored = (err) => {
        reject(err);
        this.socket.removeListener('error', onceErrored);
      };
      this.socket
        .once('error', onceErrored)
        .connect(this.port, this.host, () => {
          this.socket.removeListener('error', onceErrored);
        });
    });
  }

  /**
   * @private
   */
  onConnect() {
    this.connected = true;
    this.emit('connect');
    this.socket.setKeepAlive(true);
    this.setTimeout();
  }

  /**
   * @private
   */
  clearPending(err) {
    this.pending.forEach(callback => callback(err));
  }

  /**
   * @private
   */
  onClose() {
    debug('close');

    this.closing = false;
    this.connected = false;

    this.emit('close');

    // dead letters?
    this.clearPending(this.lastError || new Error('Connection closed'));
  }

  /**
   * @private
   */
  onTimeout() {
    this.emit('timeout');
    debug('timeout');
  }

  /**
   * Sends a command to the faktory server and asserts that the response
   * matches the provided expectedResponse argument
   * @param  {Command} command          command
   * @param  {String} expectedResponse the expected string response from the server. If the
   *                                   response from the server does not match, an error is
   *                                   thrown
   * @return {String}                  the server's response string
   * @throws {AssertionError}
   */
  async sendWithAssert(command, expectedResponse) {
    const response = await this.send(command);

    assert.strictEqual(
      response,
      expectedResponse,
      `expected ${expectedResponse} response, but got ${response}`
    );

    return response;
  }

  /**
   * Sends a command to the server
   * @param  {Command} command command to send to server
   *                           is an array of strings or objects
   * @return {Promise}         resolved with the server's parsed response or
   *                           rejected with an error
   */
  send(command) {
    const commandString = command.join(' ');
    debug('SEND: %s', commandString);

    return new Promise((resolve, reject) => {
      this.socket.write(`${commandString}\r\n`);
      this.pending.push((err, response) => {
        debug('client=%o, server=%o', commandString, response);
        if (err) return reject(err);
        return resolve(response);
      });
    });
  }

  /**
   * @private
   */
  onMessage(err, message) {
    debug(err || message);

    const callback = this.pending.shift();

    /* istanbul ignore next */
    if (!callback) {
      console.warn(`Dropped response: ${message}`);
      return;
    }

    callback(err, message);
  }

  /**
   * @private
   */
  onError(err) {
    this.lastError = err;
    this.emit('error', err);
  }

  /**
   * Closes the connection to the server
   * @return {Promise} resolved when underlying socket emits "close"
   */
  close() {
    this.closing = true;
    return new Promise(resolve => (
      this.socket.once('close', () => resolve()).end('END\r\n')
    ));
  }
}

module.exports = Connection;
