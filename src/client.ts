import { default as makeDebug } from "debug";
import { URL } from "url";
import { unescape } from "querystring";
import { hostname } from "os";
import { createPool } from "generic-pool";

import { encode, hash } from "./utils";
import { Job, JobPayload, JobType } from "./job";
import { Mutation, RETRIES, DEAD, SCHEDULED } from "./mutation";
import { Connection, Greeting, Command } from "./connection";
import { ConnectionFactory } from "./connection-factory";
import { Pool } from "generic-pool";

const debug = makeDebug("faktory-worker:client");
const heartDebug = makeDebug("faktory-worker:client:heart");

const FAKTORY_PROTOCOL_VERSION = 2;
const FAKTORY_PROVIDER = process.env.FAKTORY_PROVIDER || "FAKTORY_URL";
const FAKTORY_URL = process.env[FAKTORY_PROVIDER] || "tcp://localhost:7419";

export type ClientOptions = {
  host?: string;
  port?: string | number;
  password?: string;
  url?: string;
  wid?: string;
  labels?: string[];
  poolSize?: number;
};

export type JSONable = {
  toJSON(): Record<string, unknown>;
};

export type Hello = {
  hostname: string;
  v: number;
  wid?: string;
  labels?: string[];
  pid?: number;
  pwdhash?: string;
};

export type ServerInfo = {
  server_utc_time: string;
  faktory: {
    queues: {
      [name: string]: number;
    };
    tasks: {
      Retries: {
        size: number;
      };
      Dead: {
        size: number;
      };
      Scheduled: {
        size: number;
      };
    };
  };
};

/**
 * A client connection handle for interacting with the faktory server. Holds a pool of 1 or more
 * underlying connections. Safe for concurrent use and tolerant of unexpected
 * connection terminations. Use this object for all interactions with the factory server.
 *
 * @example
 * const client = new Client();
 *
 * const job = await client.fetch('default');
 *
 */
export class Client {
  password?: string;
  labels: string[];
  wid?: string;
  connectionFactory: ConnectionFactory;
  pool: Pool<Connection>;

  /**
   * Creates a Client with a connection pool
   *
   * @param {object} [options]
   * @param {string} [options.url=tcp://localhost:7419] connection string for the faktory server
   *                                                    (checks for FAKTORY_PROVIDER and
   *                                                    FAKTORY_URL)
   * @param {string} [options.host=localhost] host string to connect to
   * @param {number|string} [options.port=7419] port to connect to faktory server on
   * @param {string} [options.password] faktory server password to use during HELLO
   * @param {string} [options.wid] optional wid that should be provided to the server
   *                               (only necessary for a worker process consuming jobs)
   * @param {string[]} [options.labels=[]] optional labels to provide the faktory server
   *                                       for this client
   * @param {number} [options.poolSize=10] the maxmimum size of the connection pool
   */
  constructor(options: ClientOptions = {}) {
    const url = new URL(options.url || FAKTORY_URL);

    this.password = options.password || unescape(url.password);
    this.labels = options.labels || [];
    this.wid = options.wid;
    this.connectionFactory = new ConnectionFactory({
      host: options.host || url.hostname,
      port: options.port || url.port,
      handshake: this.handshake.bind(this),
    });
    this.pool = createPool(this.connectionFactory, {
      testOnBorrow: true,
      acquireTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      evictionRunIntervalMillis: 11000,
      min: 1,
      max: options.poolSize || 20,
      autostart: false,
    });
  }

  static assertVersion(version: number): void {
    if (version !== FAKTORY_PROTOCOL_VERSION) {
      throw new Error(`
  Client / server version mismatch
  Client: ${FAKTORY_PROTOCOL_VERSION} Server: ${version}
`);
    }
  }

  /**
   * Explicitly opens a connection and then closes it to test connectivity.
   * Under normal circumstances you don't need to call this method as all of the
   * communication methods will check out a connection before executing. If a connection is
   * not available, one will be created. This method exists to ensure connection is possible
   * if you need to do so. You can think of this like {@link https://godoc.org/github.com/jmoiron/sqlx#MustConnect|sqlx#MustConnect}
   *
   * @return {Promise.<Client>} resolves when a connection is opened
   */
  async connect(): Promise<Client> {
    const conn = await this.connectionFactory.create();
    await this.connectionFactory.destroy(conn);
    return this;
  }

  /**
   * Closes the connection to the server
   * @return {Promise.<undefined>}
   */
  async close(): Promise<void> {
    await this.pool.drain();
    return this.pool.clear();
  }

  /**
   * Creates a new Job object to build a job payload
   * @param  {String}    jobtype name of the job function
   * @param  {...*} args    arguments to the job function
   * @return {Job}            a job builder with attached Client for PUSHing
   * @see  Job
   */
  job(jobtype: JobType, ...args: unknown[]): Job {
    const job = new Job(jobtype, this);
    job.args = args;
    return job;
  }

  handshake(conn: Connection, greeting: Greeting): Promise<string> {
    debug("handshake");

    Client.assertVersion(greeting.v);

    return conn.sendWithAssert(
      ["HELLO", encode(this.buildHello(greeting))],
      "OK"
    );
  }

  /**
   * builds a hello object for the server handshake
   * @param  {string} options.s: salt          the salt string from the server
   * @param  {number} options.i: iterations    the number of hash iterations to perform
   * @return {object}            the hello object to send back to the server
   * @private
   */
  buildHello({ s: salt, i: iterations }: Greeting): Hello {
    const hello: Hello = {
      hostname: hostname(),
      v: FAKTORY_PROTOCOL_VERSION,
    };

    if (this.wid) {
      hello.labels = this.labels;
      hello.pid = process.pid;
      hello.wid = this.wid;
    }

    if (salt && this.password) {
      hello.pwdhash = hash(this.password, salt, iterations);
    }

    return hello;
  }

  /**
   * Borrows a connection from the connection pool, forwards all arguments to
   * {@link Connection.send}, and checks the connection back into the pool when
   * the promise returned by the wrapped function is resolved or rejected.
   *
   * @param {...*} args arguments to {@link Connection.send}
   * @see Connection.send
   */
  send(command: Command): PromiseLike<string> {
    return this.pool.use((conn: Connection) => conn.send(command));
  }

  sendWithAssert(command: Command, assertion: string): PromiseLike<string> {
    return this.pool.use((conn: Connection) =>
      conn.sendWithAssert(command, assertion)
    );
  }

  /**
   * Fetches a job payload from the server from one of ...queues
   * @param  {...String} queues list of queues to pull a job from
   * @return {Promise.<object|null>}           a job payload if one is available, otherwise null
   */
  async fetch(...queues: string[]): Promise<JobPayload | null> {
    const response = await this.send(["FETCH", ...queues]);
    return JSON.parse(response);
  }

  /**
   * Sends a heartbeat for this.wid to the server
   * @return {Promise.<string>} string 'OK' when the heartbeat is accepted, otherwise
   *                           may return a state string when the server has a signal
   *                           to send this client (`quiet`, `terminate`)
   */
  async beat(): Promise<string> {
    heartDebug("BEAT");
    const response = await this.send(["BEAT", encode({ wid: this.wid })]);
    if (response[0] === "{") {
      return JSON.parse(response).state;
    }
    return response;
  }

  /**
   * Pushes a job payload to the server
   * @param  {Job|Object} job job payload to push
   * @return {Promise.<string>}         the jid for the pushed job
   */
  async push(job: JSONable | Record<string, unknown>): Promise<string> {
    const payload = "toJSON" in job ? (job as JSONable).toJSON() : job;
    const payloadWithDefaults = Object.assign(
      { jid: Job.jid() },
      Job.defaults,
      payload
    );
    await this.sendWithAssert(["PUSH", encode(payloadWithDefaults)], "OK");
    return payloadWithDefaults.jid;
  }

  /**
   * Sends a FLUSH to the server
   * @return {Promise.<string>} resolves with the server's response text
   */
  async flush(): Promise<string> {
    return this.send(["FLUSH"]);
  }

  /**
   * Sends an INFO command to the server
   * @return {Promise.<object>} the server's INFO response object
   */
  async info(): Promise<ServerInfo> {
    return JSON.parse(await this.send(["INFO"]));
  }

  /**
   * Sends an ACK to the server for a particular job ID
   * @param  {String} jid the jid of the job to acknowledge
   * @return {Promise.<string>}     the server's response text
   */
  async ack(jid: string): Promise<string> {
    return this.sendWithAssert(["ACK", encode({ jid })], "OK");
  }

  /**
   * Sends a FAIL command to the server for a particular job ID with error information
   * @param  {String} jid the jid of the job to FAIL
   * @param  {Error} e   an error object that caused the job to fail
   * @return {Promise.<string>}     the server's response text
   */
  fail(jid: string, e: Error): PromiseLike<string> {
    return this.sendWithAssert(
      [
        "FAIL",
        encode({
          message: e.message,
          errtype: (e as NodeJS.ErrnoException).code,
          backtrace: (e.stack || "").split("\n").slice(0, 100),
          jid,
        }),
      ],
      "OK"
    );
  }

  get [RETRIES](): Mutation {
    const mutation = new Mutation(this);
    mutation.target = RETRIES;
    return mutation;
  }

  get [SCHEDULED](): Mutation {
    const mutation = new Mutation(this);
    mutation.target = SCHEDULED;
    return mutation;
  }

  get [DEAD](): Mutation {
    const mutation = new Mutation(this);
    mutation.target = DEAD;
    return mutation;
  }
}
