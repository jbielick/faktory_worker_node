import { JobPayload } from './job';

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
export type JobType = string;

/**
 * An RFC3339-format datetime string
 * @typedef RFC3339_DateTime
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
export type RFC3339_DateTime = string;

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
export type JobFunctionWrapper = (...arg0: any[]) => MiddlewareFunction;
export type JobFunction = (...arg0: any[]) => any;

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

export interface NextFunction {
  (): Promise<any>;
};

export interface MiddlewareFunction {
  (ctx: MiddlewareContext, next: NextFunction): any;
  _name?: string;
}


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
export type JobThunk = (...arg0: any) => JobFunction;

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
  fn: JobFunction;
  [propName: string]: any;
}

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
  [JobType: string]: JobFunctionWrapper | JobFunction;
};
