const debug = require('debug')('faktory-worker:connection-pool');
const Connection = require('./connection');
const sleep = require('./sleep');

/**
 * pools connections to the faktory server, ensuring that they're
 * connected before lending them
 * @private
 */
class ConnectionFactory {
  /**
   * @param {object} options
   * @param {string} options.host host to connect to
   * @param {string|number} port port to connect to host on
   * @param {function} handshake a function to perform the handshake for a connection
   *                             after it connects
   */
  constructor({ host, port, handshake }) {
    this.host = host;
    this.port = port;
    this.handshake = handshake;
    this.attempts = 0;
    this.onConnectionError = console.warn.bind(console);
  }

  /**
   * Creates a connection for the pool
   * connections are not added to the pool until the handshake (server greeting)
   * is complete and successful
   */
  async create() {
    debug('+1');
    const connection = new Connection(this.port, this.host);
    connection.on('error', this.onConnectionError);
    try {
      const greeting = await connection.open();
      await this.handshake(connection, greeting);
      this.attempts = 0;
    } catch (e) {
      this.attempts += 1;
      debug('attempts=%i', this.attempts);
      await sleep(130 * this.attempts * 2);
      throw e;
    }
    return connection;
  }

  /**
   * Destroys a connection from the pool
   */
  destroy(connection) {
    debug('-1');
    connection.removeListener('error', this.onConnectionError);
    return connection.close();
  }

  /**
   * Validates that a connection from the pool is ready
   */
  validate(connection) {
    return connection.connected;
  }
}

module.exports = ConnectionFactory;
