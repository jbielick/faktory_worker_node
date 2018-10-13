const net = require('net');
const { URL } = require('url');
const querystring = require('querystring');
const crypto = require('crypto');
const os = require('os');
const RedisParser = require('redis-parser');
const assert = require('assert');

const debug = require('debug')('faktory-worker:client');
const serverDebug = require('debug')('faktory-worker:client:server');
const heartDebug = require('debug')('faktory-worker:client:heart');
const socketDebug = require('debug')('faktory-worker:client:socket');

const Job = require('./job');

const SOCKET_TIMEOUT = 20000;
const RECONNECT_DELAY = process.env.NODE_ENV === 'test' ? 50 : 2000;
const FAKTORY_PROTOCOL_VERSION = 2;
const FAKTORY_PROVIDER = process.env.FAKTORY_PROVIDER || 'FAKTORY_URL';
const FAKTORY_URL = process.env[FAKTORY_PROVIDER] || 'tcp://localhost:7419';

class Client {
  constructor(options = {}) {
    const url = new URL(options.url || FAKTORY_URL);

    this.password = options.password || querystring.unescape(url.password);
    this.labels = options.labels || [];
    this.wid = options.wid;
    this.reconnectDelay = options.reconnectDelay || RECONNECT_DELAY;
    this.reconnect = typeof options.reconnect !== 'undefined' ? options.reconnect : true;
    this.replyQueue = [];
    this.createSocket();
    this.host = options.host || url.hostname;
    this.port = options.port || url.port || '7419';
  }

  static checkVersion(version) {
    if (Number(version) !== FAKTORY_PROTOCOL_VERSION) {
      throw new Error(`
  Client / server version mismatch
  Client: ${FAKTORY_PROTOCOL_VERSION} Server: ${version}
`);
    }
  }

  static parse(data) {
    if (data.startsWith('HI ')) {
      return {
        text: 'HI',
        payload: JSON.parse(data.slice(3))
      };
    }

    if (data.startsWith('{')) {
      return {
        payload: JSON.parse(data)
      };
    }

    return { text: data };
  }

  static hash(pwd, salt, iterations) {
    let hash = crypto
      .createHash('sha256')
      .update(pwd + salt);

    for (let i = 1; i < iterations; i += 1) {
      hash = crypto.createHash('sha256').update(hash.digest());
    }

    return hash.digest('hex');
  }

  job(jobtype, ...args) {
    return new Job(jobtype).args(...args).client(this);
  }

  static encode(command) {
    return command.map((item) => {
      if (typeof item !== 'string') {
        return JSON.stringify(item);
      }
      return item;
    }).join(' ');
  }

  connect() {
    debug('connecting to server');

    this.connecting = true;
    return new Promise((resolve, reject) => {
      this.onConnectResolve = resolve;
      this.onConnectReject = reject;
      this._connectSocket();
    });
  }

  _connectSocket() {
    this.socket.connect(this.port, this.host);
  }

  listenToSocket() {
    this.socket
      .on('connect', this.onConnect.bind(this))
      .on('data', buffer => this.parser.execute(buffer))
      .on('close', this.onClose.bind(this))
      .on('timeout', /* istanbul ignore next */ () => {
        socketDebug('connection timed out');
      })
      .on('error', this.onError.bind(this));

    return this;
  }

  createParser() {
    return new RedisParser({
      returnReply: this.receive.bind(this),
      returnError: this.receiveError.bind(this),
      returnFatalError: /* istanbul ignore next */ (err) => {
        console.error('Connection fatal error', err);
        this.close();
        throw err;
      }
    });
  }

  handshake() {
    debug('handshake');

    return new Promise((resolve, reject) => {
      const sayHello = async (err, response) => {
        if (err) {
          return reject(err);
        }
        try {
          const { payload: greeting } = response;

          Client.checkVersion(greeting.v);
          const hello = this.buildHello(greeting);
          return resolve(await this.send(['HELLO', hello], 'OK'));
        } catch (e) {
          return reject(e);
        }
      };

      this.replyQueue.push(sayHello);
    });
  }

  buildHello({ s: salt, i: iterations }) {
    const hello = {
      hostname: os.hostname(),
      v: FAKTORY_PROTOCOL_VERSION
    };

    if (this.wid) {
      hello.labels = this.labels;
      hello.pid = process.pid;
      hello.wid = this.wid;
    }

    if (salt) {
      hello.pwdhash = Client.hash(this.password, salt, iterations);
    }

    return hello;
  }

  async send(command, expectation) {
    if (!this.socket.writable) {
      throw new Error('Socket not writable');
    }
    const encodedCommand = Client.encode(command);
    const response = await this._send(encodedCommand);

    debug('client=%o, server=%o', encodedCommand, response);

    if (expectation && response && response.text) {
      assert.equal(
        response.text,
        expectation,
        `Expected ${expectation} from server, but got ${response.text}`
      );
    }

    return response;
  }

  _send(encodedCommand) {
    return new Promise((resolve, reject) => {
      debug('%s', encodedCommand);
      this.socket.write(`${encodedCommand}\r\n`);
      this.replyQueue.push((err, resp) => {
        if (err) {
          return reject(err);
        }
        return resolve(resp);
      });
    });
  }

  receive(data) {
    serverDebug(data);

    const callback = this.replyQueue.shift();

    if (!callback) {
      throw new Error(`replyQueue empty. Dropped response! ${data}`);
    }

    if (!data) {
      return callback(null, data);
    }

    let response;
    let error;

    if (data) {
      try {
        response = Client.parse(data);
      } catch (e) {
        error = e;
      }
    }

    return callback(error, response);
  }

  receiveError(err) {
    // @TODO only shift if present, otherwise error with message
    this.replyQueue.shift()(err);
  }

  async fetch(...queues) {
    const response = await this.send(['FETCH', ...queues]);
    return response && response.payload;
  }

  /**
   * Send a heartbeatt for this.wid to the server
   * @return {String|Object} string 'OK' when the heartbeat is accepted, otherwise
   *                                may return an object { state: '...' } when the
   *                                server has a signal to send this client
   */
  async beat() {
    heartDebug('BEAT');
    const response = await this.send(['BEAT', { wid: this.wid }]);
    return response.text || response.payload.state;
  }

  /**
   * pushes a job payload to the server
   * @param  {Job} job job payload
   * @return {String}     the jid for the pushed job
   */
  async push(job) {
    const jobWithDefaults = Object.assign(Job.defaults(), job);
    await this.send(['PUSH', jobWithDefaults], 'OK');
    return jobWithDefaults.jid;
  }

  async flush() {
    return (await this.send(['FLUSH'])).text;
  }

  async info() {
    return (await this.send(['INFO'])).payload;
  }

  async ack(jid) {
    return (await this.send(['ACK', { jid }], 'OK')).text;
  }

  async fail(jid, e) {
    const response = await this.send([
      'FAIL',
      {
        message: e.message,
        errtype: e.code,
        backtrace: e.stack.split('\n').slice(0, 100),
        jid
      }
    ], 'OK');
    return response.text;
  }

  close() {
    this.closing = true;
    if (this.socket && this.socket.writable) {
      this.socket.write('END\r\n');
    }
    this.socket.end();
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
  }

  createSocket() {
    this.socket = new net.Socket();
    this.socket.setTimeout(SOCKET_TIMEOUT);
    this.parser = this.createParser();
    this.listenToSocket();
  }

  async onConnect() {
    socketDebug('connect');

    try {
      await this.handshake();
      debug('successfully connected');
      this.connecting = false;
      this.connected = true;
      this.onConnectResolve(this);
      this.onConnectResolve = null;
    } catch (e) {
      this.onConnectReject(e);
      this.onConnectReject = null;
    }
  }

  onClose() {
    socketDebug('close');

    this.connected = false;

    this.clearReplyQueue(new Error('Connection closed'));

    if (this.closing) {
      this.closing = false;
      debug('connection closed');
      return;
    }

    debug('connection closed unexpectedly');

    if (!this.connecting && this.reconnect) {
      this.connecting = true;
      setTimeout(() => {
        if (!this.closing) {
          this._connectSocket();
        }
      }, this.reconnectDelay);
    } else {
      this.onError(new Error('Socket closed unexpectedly'));
    }
  }

  onError(err) {
    socketDebug('error: %o', err);

    if (this.onConnectReject) {
      this.onConnectReject(err);
      this.onConnectReject = null;
    }

    this.lastConnectionError = err;
    console.error(err);
    this.close();
    // @TODO fail nosily / interrupt worker manager
    // this.emit('error', err);
  }

  clearReplyQueue(err) {
    this.replyQueue.forEach(callback => callback(err));
    this.replyQueue = [];
  }
}

module.exports = Client;
