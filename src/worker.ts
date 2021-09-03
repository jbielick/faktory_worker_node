import makeDebug from "debug";
import { v4 as uuid } from "uuid";
import { strict as assert } from "assert";
import { ComposedMiddleware, Middleware as KoaMiddleware } from "koa-compose";
import { EventEmitter } from "events";

import { JobPayload, JobType } from "./job";
import { Client, ClientOptions } from "./client";
import { wrapNonErrors } from "./utils";
import { sleep } from "./utils";
import createExecutionChain from "./create-execution-chain";

const debug = makeDebug("faktory-worker:worker");

/**
 * A lookup table holding the jobtype constants mapped to their job functions
 *
 * @typedef Registry
 * @type  {Object.<Jobtype, JobFunction>}
 * @see external:Jobtype
 * @see external:JobFunction
 * @example
 * {
 *   SendWelcomeUser: (id) => {
 *     // job fn
 *   },
 *   GenerateThumbnail: (id, size) => {
 *     // job fn
 *   }
 * }
 */
export type Registry = {
  [jobtype: string]: JobFunction;
};

/**
 * A function that executes work
 *
 * @typedef JobFunction
 * @type {function}
 * @external
 * @param {...*} args arguments from the job payload
 * @example
 * function(...args) {
 *   // does something meaningful
 * }
 */
export type JobFunctionContextWrapper = {
  (...args: unknown[]): ContextProvider;
};
export type UnWrappedJobFunction = {
  (...args: unknown[]): unknown;
};
export type JobFunction = JobFunctionContextWrapper | UnWrappedJobFunction;

/**
 * A function returned by a job function that will be called with the job context as its
 * only argument and awaited. This exists to allow you to define simple job functions that
 * only accept their job args, but in many cases you might need the job's custom properties
 * or stateful connections (like a database connection) in your job and want to attach
 * a connection for your job function to use without having to create it itself.
 *
 * @typedef ContextProvider
 * @type {function}
 * @param {object} ctx context object containing the job and any other data attached
 *                     via userland-middleware
 * @example
 * // assumes you have middleware that attaches `db` to `ctx`
 *
 * faktory.register('UserWelcomer', (...args) => async (ctx) => {
 *   const [ id ] = args;
 *   const user = await ctx.db.users.find(id);
 *   const email = new WelcomeEmail(user);
 *   await email.deliver();
 * });
 * @see  Context
 */

export type ContextProvider = (ctx: MiddlewareContext) => unknown;

/**
 * A context object passed through middleware and to a job thunk
 *
 * @typedef Context
 * @type {object}
 * @property {object} Context.job the job payload
 * @property {function} Context.fn a reference to the job function
 */
export interface MiddlewareContext {
  job: JobPayload;
  fn?: JobFunction;
}

export type Middleware = KoaMiddleware<MiddlewareContext>;

export type WorkerOptions = {
  wid?: string;
  concurrency?: number;
  timeout?: number;
  beatInterval?: number;
  queues?: string[];
  middleware?: Middleware[];
  registry?: Registry;
  poolSize?: number;
} & ClientOptions;

/**
 * Representation of a worker process with many concurrent job processors. Works at the
 * concurrency set in options during construction. Will hold at most `concurrency` jobs
 * in-memory while processing at any one time. Listens for signals to quiet or shutdown.
 * Should not be started more than once per-process, nor should more than one worker be
 * started per-process.
 *
 * @example
 * const worker = new Worker({
 *   queues: ['critical', 'default', 'low'],
 * });
 *
 * worker.work();
 */
export class Worker extends EventEmitter {
  readonly wid: string;
  private concurrency: number;
  private shutdownTimeout: number;
  private beatInterval: number;
  readonly queues: string[];
  readonly middleware: Middleware[];
  private readonly registry: Registry;
  private quieted: boolean | undefined;
  private working: Map<string, Promise<string>>;
  private execute: ComposedMiddleware<MiddlewareContext>;
  private pulse: NodeJS.Timer;
  readonly client: Client;

  /**
   * @param {object} [options]
   * @param  {String} [options.wid=uuid().slice(0, 8)]: the wid the worker will use
   * @param  {Number} [options.concurrency=20]: how many jobs this worker can process at once
   * @param  {Number} [options.shutdownTimeout=8]: the amount of time in seconds that the worker
   *                                             may take to finish a job before exiting
   *                                             ungracefully
   * @param  {Number} [options.beatInterval=15]: the amount of time in seconds between each
   *                                             heartbeat
   * @param  {string[]} [options.queues=['default']]: the queues this worker will fetch jobs from
   * @param  {function[]} [options.middleware=[]]: a set of middleware to run before performing
   *                                               each job
   *                                       in koa.js-style middleware execution signature
   * @param  {Registry} [options.registry=Registry]: the job registry to use when working
   * @param {Number} [options.poolSize=concurrency+2] the client connection pool size for
   *                                                  this worker
   */
  constructor(options: WorkerOptions = {}) {
    super();
    this.wid = options.wid || uuid().slice(0, 8);
    this.concurrency = options.concurrency || 20;
    this.shutdownTimeout = (options.timeout || 8) * 1000;
    this.beatInterval = (options.beatInterval || 15) * 1000;
    this.queues = options.queues || [];
    if (this.queues.length === 0) {
      this.queues = ["default"];
    }
    this.middleware = options.middleware || [];
    this.registry = options.registry || {};
    this.working = new Map();
    this.client = new Client({
      wid: this.wid,
      url: options.url,
      host: options.host,
      port: options.port,
      password: options.password,
      poolSize: options.poolSize || this.concurrency + 2,
      labels: options.labels || [],
    });
    this.on("error", this.onerror);
  }

  private async tick(): Promise<void> {
    if (this.quieted) return;
    try {
      if (this.working.size >= this.concurrency) {
        await Promise.race(this.working.values());
      } else {
        const job = await this.fetch();
        if (job) {
          const { jid } = job;
          this.working.set(jid, this.handle(job));
        }
      }
    } catch (e) {
      this.emit("error", e);
      await sleep(1000);
    } finally {
      this.tick();
    }
  }

  /**
   * starts the worker fetch loop and job processing
   *
   * @return self, when working has been stopped by a signal or concurrent
   *                        call to stop or quiet
   * @see  Worker.quiet
   * @see  Worker.stop
   */
  async work(): Promise<Worker> {
    debug("work concurrency=%i", this.concurrency);
    this.execute = createExecutionChain(this.middleware, this.registry);
    await this.beat();
    this.pulse = setInterval(async () => {
      try {
        await this.beat();
      } catch (error) {
        this.emit(
          "error",
          new Error(`Worker failed heartbeat: ${error.message}\n${error.stack}`)
        );
      }
    }, this.beatInterval);
    this.trapSignals();
    this.tick();
    return this;
  }

  /**
   * Signals to the worker to discontinue fetching new jobs and allows the worker
   * to continue processing any currently-running jobs
   */
  quiet(): void {
    debug("quiet");
    this.quieted = true;
  }

  /**
   * stops the worker
   *
   * @return {promise} resolved when worker stops
   */
  async stop(): Promise<void> {
    Worker.removeSignalHandlers();
    debug("stop");
    this.quiet();
    clearInterval(this.pulse);
    let forced = false;

    return new Promise(async (resolve) => {
      const timeout = setTimeout(async () => {
        debug("shutdown timeout exceeded");
        forced = true;
        // @TODO fail in progress jobs so they retry faster

        debug("failing in progress");
        for (const jid of this.working.keys()) {
          debug(`failed job ${jid}`);
          await this.client.fail(jid, new Error("Restarting worker"));
        }

        this.client.close();
        resolve();
        process.exit(1);
      }, this.shutdownTimeout);

      process.nextTick(async () => {
        try {
          debug("awaiting in progress");
          await Promise.all(this.working.values());
          debug("all clear");
          if (forced) return;
          await this.client.close();
          clearTimeout(timeout);
          resolve();
        } catch (e) {
          console.warn("error during graceful shutdown:", e);
        }
      });
    });
  }

  /**
   * Sends a heartbeat for this server and interprets the response state (if present)
   * to quiet or terminate the worker
   */
  async beat(): Promise<void> {
    const response = await this.client.beat();
    switch (response) {
      case "quiet":
        this.quiet();
        break;
      case "terminate":
        this.stop();
        break;
      default:
        break;
    }
  }

  /**
   * Fetches a job from the defined queues.
   *
   * @private
   * @return {JobPayload|null} a job payload from the server or null when there are
   *                             no jobs
   */
  private fetch(): Promise<JobPayload | null> {
    return this.client.fetch(...this.queues);
  }

  /**
   * Handles a job from the server by executing it and either acknowledging
   * or failing the job when done
   *
   * @private
   * @param  {JobPayload} job the job payload from the server
   * @return {Promise<string>} 'ack' or 'fail' depending on job handling resu
   */
  private async handle(job: JobPayload): Promise<string> {
    const { jid } = job;
    let error;
    try {
      debug(`executing ${jid}`);
      await this.execute({ job });
    } catch (e) {
      error = wrapNonErrors(e);
    }
    try {
      if (!error) {
        await this.client.ack(jid);
        debug(`ACK ${jid}`);
        return "done";
      } else {
        await this.client.fail(jid, error);
        debug(`FAIL ${jid}`);
        this.emit("fail", { job, error });
        return "fail";
      }
    } catch (e) {
      this.emit("error", e);
      return "error";
    } finally {
      this.working.delete(jid);
    }
  }

  /**
   * Adds a middleware function to the stack
   *
   * @param  {Function} fn koa-compose-style middleware function
   * @return {FaktoryControl}      this
   * @instance
   * @see  {@link https://github.com/koajs/koa/blob/master/docs/guide.md#writing-middleware|koa middleware}
   * @example
   * faktory.use(async (ctx, next) => {
   *   // a pool you created to hold database connections
   *   pool.use(async (conn) => {
   *     ctx.db = conn;
   *     await next();
   *   });
   * });
   */
  use(fn: Middleware): Worker {
    assert(typeof fn === "function");
    debug("use %s", fn.name || "-");
    this.middleware.push(fn);
    return this;
  }

  onerror(error: Error): void {
    if (this.listenerCount("error") === 1) console.error(error);
  }

  /**
   * Adds a {@link external:JobFunction|JobFunction} to the {@link Registry}
   *
   * @param  {external:Jobtype}   name string descriptor for the jobtype
   * @param  {external:JobFunction} fn
   * @return {FaktoryControl}        this
   * @instance
   * @example
   * faktory.register('MyJob', (...args) => {
   *   // some work
   * });
   */
  register(name: JobType, fn: JobFunction): Worker {
    assert(typeof fn === "function", "a registered job must be a function");
    debug("registered %s", name);
    this.registry[name] = fn;
    return this;
  }

  /**
   * @private
   */
  private trapSignals(): void {
    // istanbul ignore next
    process
      .once("SIGTERM", () => this.stop())
      .once("SIGTSTP", () => this.quiet())
      .once("SIGINT", () => this.stop());
  }

  private static removeSignalHandlers(): void {
    process
      .removeAllListeners("SIGTERM")
      .removeAllListeners("SIGTSTP")
      .removeAllListeners("SIGINT");
  }
}
