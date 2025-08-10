import makeDebug from "debug";
import { v4 as uuid } from "uuid";
import { strict as assert } from "assert";
import { ComposedMiddleware, Middleware as KoaMiddleware } from "koa-compose";
import { EventEmitter } from "events";
import { setTimeout } from "timers/promises";

import { JobPayload, JobType } from "./job";
import { Client, ClientOptions } from "./client";
import { wrapNonErrors } from "./utils";
import { sleep } from "./utils";
import createExecutionChain from "./create-execution-chain";
import { strictlyOrdered, weightedRandom } from "./queues";

const debug = makeDebug("faktory-worker:worker");
const fail = Symbol("fail");
export const CLEANUP_DELAY_MS = process.env.NODE_ENV === "test" ? 100 : 3000;
export const SHUTDOWN_TIMEOUT_EXCEEDED_MSG =
  "faktory worker shutdown timeout exceeded";

export type Registry = Record<string, JobFunction>;

export type JobFunctionContextWrapper = {
  (...args: unknown[]): ContextProvider;
};

export type UnWrappedJobFunction = {
  (...args: unknown[]): unknown;
};

export type JobFunction = JobFunctionContextWrapper | UnWrappedJobFunction;

export type ContextProvider = (ctx: MiddlewareContext) => unknown;

export interface MiddlewareContext {
  job: JobPayload;
  signal: AbortSignal;
  fn?: JobFunction;
}

export type Middleware = KoaMiddleware<MiddlewareContext>;

export type WorkerOptions = {
  wid?: string;
  concurrency?: number;
  timeout?: number;
  beatInterval?: number;
  queues?: string[] | { [name: string]: number } | (() => string[]);
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
  private readonly queueFn: () => string[];
  readonly middleware: Middleware[];
  private readonly registry: Registry;
  private abortCtl: AbortController;
  private quieted: boolean | undefined;
  readonly working: Map<JobPayload, Promise<string>>;
  private execute: ComposedMiddleware<MiddlewareContext>;
  private pulse: NodeJS.Timeout;
  private untrapSignals?: () => void;
  readonly client: Client;

  /**
   * @param {object} [options]
   * @param  {String} [options.wid=uuid().slice(0, 8)]: the wid the worker will use
   * @param  {Number} [options.concurrency=20]: how many jobs this worker can process at once
   * @param  {Number} [options.timeout=8]: the amount of time in seconds that the worker
   *                                       may take to finish a job before exiting ungracefully
   * @param  {Number} [options.beatInterval=15]: the amount of time in seconds between each
   *                                             heartbeat
   * @param  {string[]} [options.queues=['default']]: the queues this worker will fetch jobs from
   * @param  {function[]} [options.middleware=[]]: a set of middleware to run before performing
   *                                               each job
   *                                       in koa.js-style middleware execution signature
   * @param  {Registry} [options.registry=Registry]: the job registry to use when working
   * @param {Number} [options.poolSize=concurrency+2] the client connection pool size for
   *                                                  this worker
   * @param {object} [options.tlsOptions={}] TLS configuration options (passed to
   *                                         Node's tls.connect) used when establishing a
   *                                         secure connection to the Faktory server.
   */
  constructor(options: WorkerOptions = {}) {
    super();
    this.wid = options.wid || uuid().slice(0, 8);
    this.concurrency = options.concurrency || 20;
    this.shutdownTimeout = (options.timeout || 8) * 1000;
    this.beatInterval = (options.beatInterval || 15) * 1000;
    const queues = options.queues || [];
    if (typeof queues === "function") {
      this.queueFn = queues;
    } else if (Array.isArray(queues)) {
      this.queueFn = strictlyOrdered(queues.length ? queues : ["default"]);
    } else {
      this.queueFn = weightedRandom(queues);
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
      tlsOptions: options.tlsOptions,
    });
    this.on("error", this.onerror);
  }

  private async tick(): Promise<void> {
    if (this.quieted) return;
    if (this.abortCtl.signal.aborted) return;
    try {
      if (this.working.size >= this.concurrency) {
        await Promise.race(this.working.values());
      } else {
        const job = await this.fetch();
        if (job) {
          this.working.set(job, this.handle(job));
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
    this.quieted = false;
    this.abortCtl = new AbortController();
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
    this.untrapSignals = this.trapSignals();
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
    debug("stop");
    this.quiet();

    debug("deregistering signal handlers");
    this.untrapSignals?.();

    // @TODO if SIGINTed a second time, skip ahead to abort

    const abortTimeoutCtl = new AbortController();

    const abortAfterTimeout = async (): Promise<void> => {
      await setTimeout(this.shutdownTimeout, undefined, {
        signal: abortTimeoutCtl.signal,
      });
      debug(SHUTDOWN_TIMEOUT_EXCEEDED_MSG);
      this.abortCtl?.abort(new Error(SHUTDOWN_TIMEOUT_EXCEEDED_MSG));
      try {
        // FAIL in-progress jobs as they have been aborted
        await Promise.all(
          [...this.working.keys()].map((job) =>
            this[fail](job, this.abortCtl?.signal.reason)
          )
        );
      } catch (e) {
        // jobs aren't necessarily lost here, as they will be requeued by the server
        // after their reservation timeout
        this.emit("error", e);
      }
      // An abort signal was sent, but jobs may need a little time to do cleanup.
      await setTimeout(CLEANUP_DELAY_MS, undefined, {
        signal: abortTimeoutCtl.signal,
      });
    };

    const allJobsComplete = async (): Promise<void> => {
      debug(
        `awaiting ${this.working.size} job${
          this.working.size > 1 ? "s" : ""
        } in progress`
      );
      await Promise.all(this.working.values());
      // jobs were aborted and have a little time to cleanup
      if (this.abortCtl?.signal.aborted) return;
      // jobs finished before an abort
      debug("all clear");
      // and we can cancel the imminent abort/hard shutdown
      abortTimeoutCtl.abort();
    };

    try {
      await Promise.race([allJobsComplete(), abortAfterTimeout()]);
    } catch (e) {
      if (e.code !== "ABORT_ERR") {
        throw e;
      } else {
        this.emit("error", e);
      }
    } finally {
      clearInterval(this.pulse);
      await this.client.close();
      if (this.abortCtl?.signal.aborted) {
        process.exit(1);
      }
    }
  }

  async [fail](job: JobPayload, error: Error): Promise<void> {
    const { jid } = job;
    await this.client.fail(jid, error);
    debug(`FAIL ${jid}`);
    this.emit("fail", { job, error });
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

  get queues(): string[] {
    return this.queueFn();
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
   * @return {Promise<string>} 'ack' or 'fail' depending on job handling result
   */
  private async handle(job: JobPayload): Promise<string> {
    const { jid } = job;
    let error;
    try {
      debug(`executing ${jid}`);
      await this.execute({ job, signal: this.abortCtl.signal });
    } catch (e) {
      error = wrapNonErrors(e);
    }
    try {
      if (this.abortCtl?.signal.aborted) {
        // job will be FAILed in the shutdown task
        return "abort";
      } else if (!error) {
        await this.client.ack(jid);
        debug(`ACK ${jid}`);
        return "done";
      } else {
        await this[fail](job, error);
        return "fail";
      }
    } catch (e) {
      this.emit("error", e);
      return "error";
    } finally {
      this.working.delete(job);
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
   * Adds a {@link JobFunction|JobFunction} to the {@link Registry}
   *
   * @param  {Jobtype}   name string descriptor for the jobtype
   * @param  {JobFunction} fn
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
  private trapSignals(): () => void {
    // istanbul ignore next
    const stop = () => this.stop();
    const quiet = () => this.quiet();
    process.once("SIGTERM", stop).once("SIGTSTP", quiet).once("SIGINT", stop);

    return () => {
      process
        .removeListener("SIGTERM", stop)
        .removeListener("SIGTSTP", quiet)
        .removeListener("SIGINT", stop);
    };
  }
}
