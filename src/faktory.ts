import makeDebug from "debug";
import { strict as assert } from "assert";
import { Middleware as KoaMiddleware } from "koa-compose";

import { Client, ClientOptions } from "./client";
import { Worker, WorkerOptions } from "./worker";
import { Job, JobPayload, JobType } from "./job";
import { Mutation } from "./mutation";

const debug = makeDebug("faktory-worker");

/**
 * @private
 */
export type JobFunctionContextWrapper = {
  (...args: unknown[]): ContextProvider;
};

/**
 * @private
 */
export type UnWrappedJobFunction = {
  (...args: unknown[]): unknown;
};

/**
 * @private
 */
export type JobFunction = JobFunctionContextWrapper | UnWrappedJobFunction;

export type ContextProvider = (ctx: MiddlewareContext) => unknown;
export interface MiddlewareContext {
  job: JobPayload;
  fn?: JobFunction;
}
export type Middleware = KoaMiddleware<MiddlewareContext>;

export type Registry = {
  [jobtype: string]: JobFunction;
};

export interface FaktoryControl {
  registry: Registry;
  use(fn: Middleware): FaktoryControl;
  middleware: Middleware[];
  register(name: JobType, fn: JobFunction): FaktoryControl;
  connect(options?: ClientOptions): Promise<Client>;
  work(options?: WorkerOptions): Promise<Worker>;
  stop(): Promise<void>;
  Worker: typeof Worker;
  Client: typeof Client;
  Job: typeof Job;
  Mutation: typeof Mutation;
  create: FaktoryControlCreator;
}

export type FaktoryControlCreator = {
  (): FaktoryControl;
};

/**
 * creates faktory singletons
 *
 * @module faktory
 */
export function create(): FaktoryControl {
  const middleware: Middleware[] = [];
  const registry: Registry = {};
  let worker: Worker | undefined;

  /**
   *
   * A singleton holds most of the methods you'll need to get started registering jobs,
   * connecting to the server, pushing jobs, or starting a worker. Only use this is you'd like to
   * create multiple faktory instances in one process (testing).
   *
   * @private
   */
  return {
    Worker,
    Client,
    Job,
    Mutation,
    create,
    /**
     * Returns the registry for the faktory singleton
     *
     * @private
     * @instance
     * @return {Registry}
     */
    get registry(): Registry {
      return registry;
    },

    /**
     * Returns the middleware stack for the faktory singleton
     *
     * @private
     * @instance
     * @return {Middleware} array of middleware functions with koa-compose-style signatures
     */
    get middleware(): Middleware[] {
      return middleware;
    },

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
    use(fn: Middleware): FaktoryControl {
      assert(typeof fn === "function");
      debug("use %s", fn.name || "-");
      middleware.push(fn);
      return this;
    },

    /**
     * Adds a {@link JobFunction} to the {@link Registry}
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
    register(name: JobType, fn: JobFunction): FaktoryControl {
      assert(typeof fn === "function", "a registered job must be a function");
      debug("registered %s", name);
      registry[name] = fn;
      return this;
    },

    /**
     * Creates a new {@link Client}
     *
     * @param  {...*} args args forwarded to {@link Client}
     * @return {Client}
     * @instance
     * @example
     * const client = await faktory.connect();
     *
     * await client.push(job);
     */
    connect(options?: ClientOptions): Promise<Client> {
      return new Client(options).connect();
    },

    /**
     * Starts a worker. Resolves after the worker is started. Only call this
     * once per-process.
     *
     * @param  {object} options options to {@link Worker}
     * @return {Promise}         the {@link Worker.work} promise
     * @instance
     * @example
     * // this keeps the process open and can be `await`ed
     * faktory.work();
     */
    work(options: WorkerOptions = {}): Promise<Worker> {
      if (worker) throw new Error("can only call .work once per singleton");
      worker = new Worker(Object.assign({}, options, { registry, middleware }));
      return worker.work();
    },

    /**
     * Stops the worker previously started.
     *
     * @return {promise} promise returned by {@link Worker.stop}
     * @instance
     * @example
     * // previously
     * faktory.work();
     *
     * faktory.stop();
     */
    stop(): Promise<void> {
      if (worker) {
        const existing: Worker = worker;
        worker = undefined;
        if (existing) return existing.stop();
      }
      return Promise.resolve();
    },
  };
}

export { Worker, WorkerOptions, Client, ClientOptions, Job, Mutation };
const singleton = create();
// exclusively for the typedescript declaration file
export default singleton;
module.exports = singleton;
