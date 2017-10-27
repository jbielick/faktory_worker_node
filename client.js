const net = require('net');
const utils = require('util');
const crypto = require('crypto');
const os = require('os');

const RedisParser = require('redis-parser');
const debug = require('debug')('faktory-worker:client');

const commandQueue = [];
const FAKTORY_VERSION_COMPAT = '1';
const FAKTORY_PROVIDER = process.env.FAKTORY_PROVIDER || 'FAKTORY_URL';
const FAKTORY_URL = process.env[FAKTORY_PROVIDER] || '';
const [ FAKTORY_HOST, FAKTORY_PORT ] = FAKTORY_URL.split(':');

module.exports = class Client {

  constructor(options = {}) {
    this.options = options;
    // more of a client-id at this time
    this.wid = crypto.createHash('md5').digest('hex').toString().slice(0, 6);
  }

  connect() {
    if (this.connected) {
      return Promise.resolve(this);
    }
    return new Promise((resolve, reject) => {
      debug(`Connecting to server`);
      const host = this.options.host || FAKTORY_HOST || 'localhost';
      const port = this.options.port || FAKTORY_PORT || 7419;

      this.socket = net.createConnection(port, host, () => {
        this.connected = true;
        this.socket.setTimeout(5000);
        debug(`Connected`);

        this
          .listen()
          .handshake()
          .then(() => {
            resolve(this);
          })
          .catch((err) => {
            console.error(err);
            this.shutdown();
          });
      });
    })
  }

  handshake() {
    debug('Shaking hands');

    return new Promise((resolve, reject) => {
      const sayHello = (err, { text, payload: greeting }) => {
        if (err) {
          return reject(err);
        }
        this.checkVersion(greeting.v);
        const hello = this.buildHello(greeting.s);

        this.send(['HELLO', hello], 'OK')
          .then(() => {
            resolve(hello);
          });
      }

      commandQueue.push({ callback: sayHello });
    });
  }

  buildHello(salt) {
    const hello = {
      hostname: os.hostname(),
      wid: this.wid,
      pid: process.pid,
      labels: []
      // pwdhash: hex(sha256(process.env.FAKTORY_PASSWORD + salt))
    };

    if (salt) {
      const hash = crypto.createHash('sha256');
      hash.update(`${this.options.password}${salt}`);
      hello['pwdhash'] = hash.digest('hex');
    }

    return hello;
  }

  createParser() {
    return new RedisParser({
      returnReply: this.receive.bind(this),
      returnError: this.receiveError.bind(this),
      returnFatalError: (err) => {
        throw err;
      }
    });
  }

  listen() {
    const parser = this.createParser();

    this.socket
      .on('data', (buffer) => parser.execute(buffer))
      .on('close', () => {
        debug('Connection closed');
        this.connected = false;
        this.shutdown();
      })
      .on('timeout', () => {
        debug('Connection timed out');
        this.shutdown();
      })
      .on('error', (e) => console.error(e));

    return this;
  }

  checkVersion(version) {
    if (version !== FAKTORY_VERSION_COMPAT) {
      throw new Error(`
  Client / server version mismatch
  Client: ${FAKTORY_VERSION_COMPAT} Server: ${version}
`);
    }
  }

  send(command, expectation) {
    let encoded = command.map((item) => {
      if ({}.toString.call(item) === '[object Object]') {
        return JSON.stringify(item);
      }
      return item;
    });

    return new Promise((resolve, reject) => {
      const commandString = encoded.join(' ');
      debug(`SEND: ${commandString}`);

      this.socket.write(commandString);
      this.socket.write('\r\n');

      commandQueue.push({
        command,
        callback: (err, resp) => {
          if (err) {
            return reject(err);
          } else if (expectation && resp !== expectation) {
            return reject(
              new Error(`Expected response: ${expectation}, got: ${resp}`)
            );
          }
          resolve(resp);
        }
      });
    });
  }

  receive(data) {
    debug(`RECEIVE: ${utils.inspect(data)}`);

    const command = commandQueue.shift();
    let response;
    let error;

    if (!command) {
      console.error(`Dropped response! ${response}`);
      return;
    }

    try {
      response = this.parse(data);
    } catch(e) {
      error = e;
    }

    command.callback(error, response);
  }

  receiveError(err) {
    commandQueue.shift().callback(err);
  }

  parse(data) {
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

    return data;
  }

  fetch(...queues) {
    return this.send(['FETCH', ...queues]);
  }

  beat() {
    return this.send(['BEAT', { wid: this.wid }]);
  }

  push(job) {
    const jobWithJid = Object.assign(
      {},
      job, {
        jid: crypto.createHash('md5').digest('hex').toString().slice(0, 12)
      }
    );
    return this.send(['PUSH', jobWithJid], 'OK');
  }

  shutdown() {
    this.connected = false;
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    this.socket.destroy();
  }

}
