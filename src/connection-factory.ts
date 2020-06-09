import makeDebug from "debug";
import Connection, { Greeting } from "./connection";
import { Factory } from "generic-pool";
import sleep from "./sleep";

const debug = makeDebug("faktory-worker:connection-pool");

type handshaker = {
  (conn: Connection, greeting: Greeting): Promise<string>;
};

/**
 * pools connections to the faktory server, ensuring that they're
 * connected before lending them
 * @private
 */
export default class ConnectionFactory implements Factory<Connection> {
  host: string;
  port: string | number;
  handshake: handshaker;
  attempts: number;
  onConnectionError: (err: Error) => void;

  /**
   * @param {object} options
   * @param {string} options.host host to connect to
   * @param {string|number} port port to connect to host on
   * @param {function} handshake a function to perform the handshake for a connection
   *                             after it connects
   */
  constructor({
    host,
    port,
    handshake,
  }: {
    host: string;
    port: string | number;
    handshake: handshaker;
  }) {
    this.host = host;
    this.port = port;
    this.handshake = handshake;
    this.attempts = 0;
    this.onConnectionError = console.error.bind(console);
  }

  /**
   * Creates a connection for the pool
   * connections are not added to the pool until the handshake (server greeting)
   * is complete and successful
   */
  async create(): Promise<Connection> {
    debug("+1");
    const connection = new Connection(this.port, this.host);
    connection.on("error", this.onConnectionError);
    try {
      const greeting = await connection.open();
      await this.handshake(connection, greeting);
      this.attempts = 0;
    } catch (e) {
      this.attempts += 1;
      debug("attempts=%i", this.attempts);
      await sleep(200 * Math.min(this.attempts, 20));
      throw e;
    }
    return connection;
  }

  /**
   * Destroys a connection from the pool
   */
  destroy(connection: Connection): Promise<void> {
    debug("-1");
    connection.removeListener("error", this.onConnectionError);
    return connection.close();
  }

  /**
   * Validates that a connection from the pool is ready
   */
  async validate(connection: Connection): Promise<boolean> {
    return connection.connected;
  }
}
