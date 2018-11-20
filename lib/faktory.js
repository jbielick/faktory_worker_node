/**
 * Discriminator used by a worker to decide how to execute a job. This will be the name you
 * used during register.
 *
 * @typedef Jobtype
 * @type {string}
 * @external
 * @example
 * // where `MyFunction` is the jobtype
 *
 * faktory.register('MyFunction', () => {})
 * @see  {@link https://github.com/contribsys/faktory/wiki/The-Job-Payload}
 */

/**
 * An RFC3339-format datetime string
 * @typedef timestamp
 * @type {string}
 * @external
 * @example
 * "2002-10-02T10:00:00-05:00"
 * "2002-10-02T15:00:00Z"
 * "2002-10-02T15:00:00.05Z"
 *
 * new Date().toISOString();
 * // => '2019-02-11T15:59:15.593Z'
 */

/**
 * A work unit that can be scheduled by the faktory work server and executed by clients
 *
 * @typedef {object} JobPayload
 * @see  {@link https://github.com/contribsys/faktory/wiki/The-Job-Payload}
 * @external
 * @property {string} [jid=uuid()] globally unique ID for the job.
 * @property {external:Jobtype} jobtype
 * @property {string} [queue=default] which job queue to push this job onto.
 * @property {array} [args=[]] parameters the worker should use when executing the job.
 * @property {number} [priority=5] higher priority jobs are dequeued before lower priority jobs.
 * @property {number} [retry=25] number of times to retry this job if it fails. 0 discards the
 *                               failed job, -1 saves the failed job to the dead set.
 * @property {external:timestamp} [at] run the job at approximately this time; immediately if blank
 * @property {number} [reserve_for=1800] number of seconds a job may be held by a worker before it
 *                                       is considered failed.
 * @property {?object} custom provides additional context to the worker executing the job.
 * @see  {@link https://github.com/contribsys/faktory/blob/master/docs/protocol-specification.md#work-units|Faktory Protocol Specification - Work Units}
 */

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

/**
 * An after-connect initial message from the server to handshake the connection
 *
 * @typedef HI
 * @type {object}
 * @external
 * @property {number} v faktory server protocol version number
 * @property {number} i only present when password is required. number of password hash iterations.
 *                      see {@link HELLO}.
 * @property {string} s only present when password is required. salt for password hashing.
 *                      see {@link HELLO}.
 * @see  external:HELLO
 */

/**
 * The client's response to the server's {@link HI} to initiate a connection
 *
 * @typedef {object} HELLO
 * @external
 * @property {string} v the faktory client protocol version
 * @property {string} hostname name of the host that is running this worker
 * @property {string} wid globally unique identifier for this worker
 * @property {number} pid local process identifier for this worker on its host
 * @property {string[]} labels labels that apply to this worker, to allow producers to target work
 *                             units to worker types.
 * @property {string} pwdhash This field should be the hexadecimal representation of the ith
 *                            SHA256 hash of the client password concatenated with the value in s.
 * @see  external:HI
 * @see  {@link https://github.com/contribsys/faktory/blob/master/docs/protocol-specification.md|Faktory Protocol Specification}
 */

/**
 * @global
 */

/**
 * A function returned by a job function that will be called with the job context as its
 * only argument and awaited. This exists to allow you to define simple job functions that
 * only accept their job args, but in many cases you might need the job's custom properties
 * or stateful connections (like a database connection) in your job and want to attach
 * a connection for your job function to use without having to create it itself.
 *
 * @typedef JobThunk
 * @type {function}
 * @param {object} ctx context object containing the job and any other data attached
 *                     via userland-middleware
 * @example
 * // assumes you have middleware that attaches `db` to `ctx`
 *
 * faktory.register('UserWelcomer', (...args) => (ctx) => {
 *   const [ id ] = args;
 *   const user = await ctx.db.users.find(id);
 *   const email = new WelcomeEmail(user);
 *   await email.deliver();
 * });
 * @see  Context
 */

/**
 * A context object passed through middleware and to a job thunk
 *
 * @typedef Context
 * @type {object}
 * @property {object} Context.job the job payload
 * @property {function} Context.fn a reference to the job function
 */

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

const debug = require('debug')('faktory-worker');
const assert = require('assert');

const Client = require('./client');
const Worker = require('./worker');

/**
 * creates faktory singletons
 *
 * @module faktory
 * @private
 * @return {FaktorySingleton}
 */
const faktory = () => {
  const middleware = [];
  const registry = {};
  let worker;

  /**
   *
   * A singleton holds most of the methods you'll need to get started registering jobs,
   * connecting to the server, pushing jobs, or starting a worker. Only use this is you'd like to
   * create multiple faktory instances in one process (testing).
   *
   * @private
   */
  return {

    /**
     * Returns the registry for the faktory singleton
     *
     * @private
     * @instance
     * @return {Registry}
     */
    get registry() {
      return registry;
    },

    /**
     * Returns the middleware stack for the faktory singleton
     *
     * @private
     * @instance
     * @return {function[]} array of middleware functions with koa-compose-style signatures
     */
    get middleware() {
      return middleware;
    },

    /**
     * Adds a middleware function to the stack
     *
     * @param  {Function} fn koa-compose-style middleware function
     * @return {faktorysingleton}      this
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
    use(fn) {
      assert(typeof fn === 'function');
      debug('use %s', fn._name || fn.name || '-');
      middleware.push(fn);
      return this;
    },

    /**
     * Adds a {@link external:JobFunction|JobFunction} to the {@link Registry}
     *
     * @param  {external:Jobtype}   name string descriptor for the jobtype
     * @param  {external:JobFunction} fn
     * @return {faktorysingleton}        this
     * @instance
     * @example
     * faktory.register('MyJob', (...args) => {
     *   // some work
     * });
     */
    register(name, fn) {
      assert(typeof fn === 'function', 'a registered job must be a function');
      debug('registered %s', name);
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
    connect(...args) {
      return new Client(...args).connect();
    },

    /**
     * Starts a worker. Doesn't resolve until the worker is shut down. Only call this
     * once per-process.
     *
     * @param  {object} options options to {@link Worker}
     * @return {Promise}         the {@link Worker.work} promise
     * @instance
     * @example
     * // this keeps the process open and can be `await`ed
     * faktory.work();
     */
    work(options = {}) {
      if (worker) throw new Error('can only call .work once per singleton');
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
    stop() {
      const temp = worker;
      worker = undefined;
      return temp.stop();
    }
  };
};

module.exports = Object.assign(faktory, faktory(), { Client, Worker });
