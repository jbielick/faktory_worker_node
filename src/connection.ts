import { Socket } from "net";
import { strictEqual } from "assert";
import { EventEmitter } from "events";
import makeDebug from "debug";

import RedisParser from "redis-parser";

declare module "redis-parser" {
  type Config = {
    returnReply: (response: string) => void;
    returnError: (error: Error) => void;
  };

  class RedisParser {
    // eslint-disable-next-line  @typescript-eslint/explicit-module-boundary-types
    constructor(config: Config);
    execute(buffer: Buffer): (err: Error | null, response: string) => void;
  }
}

const debug = makeDebug("faktory-worker:connection");

const SOCKET_TIMEOUT = 10000;

/**
 * A command to send the server in array form
 *
 * @typedef {string[]} Command
 * @example
 *
 * // multiple string arguments
 * ['FETCH', 'critical', 'default']
 *
 * // json string as an argument
 * ['PUSH', '{"jid": "123"}']
 *
 * // single string argument
 * ['ACK', '123']
 */
export type Command = Array<string>;

export type Greeting = {
  v: number;
  s: string;
  i: number;
};

export type ConnectionOptions = {
  host?: string;
  port?: string | number;
  password?: string;
};

interface PendingRequest {
  resolve(message: string): void;
  reject(error: Error): void;
}

/**
 * A connection to the faktory server for sending commands
 * and receiving messages. Abstracts the underlying node Socket
 * and allows easier async sending and receiving. Not "threadsafe". Use in
 * a connection pool.
 *
 * @private
 */
export class Connection extends EventEmitter {
  connected: boolean;
  closing: boolean;
  host: string | undefined;
  port: string | number;
  pending: PendingRequest[];
  socket: Socket;
  parser: RedisParser.RedisParser;
  lastError: Error;

  /**
   * @param {Number} port the port to connect on
   * @param {String} host the hostname to connect to
   */
  constructor(port: string | number, host?: string) {
    super();
    this.host = host;
    this.port = port;
    this.connected = false;
    this.socket = new Socket();
    this.socket.setKeepAlive(true);
    this.pending = [];
    this.parser = new RedisParser({
      returnReply: (response: string) => this.pending.pop()?.resolve(response),
      returnError: (err: Error) => this.pending.pop()?.reject(err),
    });
    this.listen();
  }

  /**
   * Sets the socket timeout
   * @param {Number} ms timeout in milliseconds
   */
  setTimeout(ms: number = SOCKET_TIMEOUT): void {
    this.socket.setTimeout(ms);
  }

  /**
   * Registers listeners on the underlying node socket
   * @private
   * @return {Connection} self
   */
  private listen(): Connection {
    this.socket
      .on("connect", this.onConnect.bind(this))
      .on("data", this.parser.execute.bind(this.parser))
      .on("timeout", this.onTimeout.bind(this))
      .on("error", this.onError.bind(this))
      .on("close", this.onClose.bind(this));
    return this;
  }

  /**
   * Opens a connection to the server
   * @return {Promise} resolves with the server's greeting
   */
  async open(): Promise<Greeting> {
    if (this.connected) throw new Error("already connected!");
    debug("connecting");

    const receiveGreetingResponse = new Promise((resolve, reject) => {
      this.pending.unshift({ resolve, reject });
    });

    this.socket.connect(<number>this.port, this.host || "");
    const response = <string>await receiveGreetingResponse;
    const greeting = JSON.parse(response.split(" ")[1]);
    this.emit("greeting", greeting);
    return greeting;
  }

  /**
   * @private
   */
  private onConnect() {
    this.connected = true;
    this.emit("connect");
    this.setTimeout();
  }

  /**
   * @private
   */
  private clearPending(err: Error) {
    this.pending.forEach(({ reject }) => reject(err));
  }

  /**
   * @private
   */
  private onClose() {
    debug("close");

    this.closing = false;
    this.connected = false;

    this.emit("close");

    // dead letters?
    this.clearPending(this.lastError || new Error("Connection closed"));
  }

  /**
   * @private
   */
  private onTimeout() {
    this.emit("timeout");
    debug("timeout");
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
  async sendWithAssert(
    command: Command,
    expectedResponse: string
  ): Promise<string> {
    const response = await this.send(command);

    strictEqual(
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
  send(command: Command): Promise<string> {
    const commandString = command.join(" ");
    debug("SEND: %s", commandString);

    return new Promise((resolve, reject) => {
      this.socket.write(`${commandString}\r\n`);
      this.pending.unshift({
        resolve: (message) => {
          debug("client=%o, server=%o", commandString, message);
          resolve(message);
        },
        reject,
      });
    });
  }

  /**
   * @private
   */
  private onError(err: Error) {
    this.lastError = err;
    this.emit("error", err);
  }

  /**
   * Closes the connection to the server
   * @return {Promise} resolved when underlying socket emits "close"
   */
  close(): Promise<void> {
    this.closing = true;
    return new Promise<void>((resolve) =>
      this.socket
        .once("close", () => {
          this.socket.removeAllListeners();
          resolve();
        })
        .end("END\r\n")
    );
  }
}
