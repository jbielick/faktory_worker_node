const debug = require('debug')('faktory-worker:connection-pool');
const Connection = require('./connection');

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
  }

  /**
   * Creates a connection for the pool
   * connections are not added to the pool until the handshake (server greeting)
   * is complete and successful
   */
  async create() {
    debug('+connection');
    const conn = new Connection(this.port, this.host);
    const greeting = await conn.open();
    await this.handshake(conn, greeting);
    return conn;
  }

  /**
   * Destroys a connection from the pool
   */
  destroy(connection) {
    debug('-connection');
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
