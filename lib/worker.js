const debug = require('debug')('faktory-worker:worker');
const uuid = require('uuid');
const compose = require('koa-compose');
const EventEmitter = require('events');

const Client = require('./client');
const wrapNonErrors = require('./wrap-non-errors');
const sleep = require('./sleep');

const START_DELAY = process.env.NODE_ENV === 'test' ? 0 : 5;

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
class Worker extends EventEmitter {
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
  constructor(options = {}) {
    super();
    this.wid = options.wid || uuid().slice(0, 8);
    this.concurrency = options.concurrency || 20;
    this.shutdownTimeout = (options.timeout || 8) * 1000;
    this.beatInterval = (options.beatInterval || 15) * 1000;
    this.queues = options.queues || [];
    if (this.queues.length === 0) {
      this.queues = ['default'];
    }
    this.middleware = [].concat(options.middleware || []);
    this.registry = options.registry || {};
    this.processors = {};
    this.client = new Client({
      wid: this.wid,
      url: options.url,
      host: options.host,
      port: options.port,
      password: options.password,
      poolSize: options.poolSize || (this.concurrency + 2),
      labels: options.labels || [],
    });
  }

  /**
   * @private
   * @param  {string} pid
   * @return {undefined}
   */
  async tick(pid) {
    if (this.quieted) return;
    try {
      const job = await this.fetch();
      if (job) await this.handle(job);
    } catch (e) {
      this.emit('error', e);
      await sleep(1000);
    } finally {
      setImmediate(() => this.setTick(pid));
    }
  }

  /**
   * starts the worker fetch loop and job processing
   *
   * @return {Worker} self, when working has been stopped by a signal or concurrent
   *                        call to stop or quiet
   * @see  Worker.quiet
   * @see  Worker.stop
   */
  async work() {
    debug('work concurrency=%i', this.concurrency);
    if (!this.listenerCount("error")) this.on("error", this.onerror);
    this.execute = this.createExecutor();
    await this.beat();
    this.heartbeat = setInterval(() => this.beat(), this.beatInterval);
    this.trapSignals();

    for (let index = 0; index < this.concurrency; index += 1) {
      await sleep(index * START_DELAY);
      debug('starting p%i', index);
      this.setTick(`p${index + 1}`);
    }

    return this;
  }

  setTick(pid) {
    this.processors[pid] = this.tick(pid);
  }

  onerror(error) {
    console.error(error);
  }

  /**
   * Signals to the worker to discontinue fetching new jobs and allows the worker
   * to continue processing any currently-running jobs
   *
   * @return {undefined}
   */
  quiet() {
    debug('quiet');
    this.quieted = true;
  }

  /**
   * stops the worker
   *
   * @return {promise} resolved when worker stops
   */
  async stop() {
    Worker.removeSignalHandlers();
    debug('stop');
    this.quiet();
    this.stopped = true;
    clearInterval(this.heartbeat);

    return new Promise(async (resolve) => {
      const timeout = setTimeout(async () => {
        debug('shutdown timeout exceeded');
        // @TODO fail in progress jobs so they retry faster
        this.client.close();
        resolve();
        process.exit(1);
      }, this.shutdownTimeout);

      try {
        debug('awaiting in progress');
        await Promise.all(this.inProgress);
        debug('all clear');
        await this.client.close();
        clearTimeout(timeout);
        resolve();
      } catch (e) {
        console.warn('error during forced shutdown:', e);
      }
    });
  }

  /**
   * Returns an array of ids of processors with a job currently in progress
   *
   * @return {array} array of processor ids
   */
  get inProgress() {
    return Object.values(this.processors);
  }

  /**
   * Sends a heartbeat for this server and interprets the response state (if present)
   * to quiet or terminate the worker
   *
   * @private
   * @return {undefined}
   */
  async beat() {
    const response = await this.client.beat();
    switch (response) {
      case 'quiet':
        this.quiet();
        break;
      case 'terminate':
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
  fetch() {
    return this.client.fetch(...this.queues);
  }

  /**
   * Builds a koa-compose stack of the middleware functions in addition to
   * two worker-added middleware functions for pulling the job function from the
   * registry and calling the job function and/or thunk
   *
   * @private
   * @return {function} entrypoint function to the middleware stack
   */
  createExecutor() {
    const { registry } = this;
    return compose([
      ...this.middleware,
      function getJobFnFromRegistry(ctx, next) {
        const { job: { jobtype } } = ctx;
        ctx.fn = registry[jobtype];

        if (!ctx.fn) throw new Error(`No jobtype registered: ${jobtype}`);

        return next();
      },
      async function callJobFn(ctx, next) {
        const { fn, job: { args } } = ctx;
        const thunkOrPromise = await fn(...args);
        if (typeof thunkOrPromise === 'function') {
          await thunkOrPromise(ctx);
        } else {
          await thunkOrPromise;
        }
        return next();
      }
    ]);
  }

  /**
   * Handles a job from the server by executing it and either acknowledging
   * or failing the job when done
   *
   * @private
   * @param  {JobPayload} job the job payload from the server
   * @return {string} 'ack' or 'fail' depending on job handling result
   */
  async handle(job) {
    const { jid } = job;
    try {
      debug(`executing ${jid}`);
      await this.execute({ job });
      await this.client.ack(jid);
      debug(`ACK ${jid}`);
      return 'ack';
    } catch (e) {
      const error = wrapNonErrors(e);
      await this.client.fail(jid, error);
      this.emit('fail', { job, error: e });
      debug(`FAIL ${jid}`);
      return 'fail';
    }
  }

  /**
   * @private
   */
  trapSignals() {
    // istanbul ignore next
    process
      .once('SIGTERM', () => this.stop())
      .once('SIGTSTP', () => this.quiet())
      .once('SIGINT', () => this.stop());
  }

  static removeSignalHandlers() {
    process
      .removeAllListeners('SIGTERM')
      .removeAllListeners('SIGTSTP')
      .removeAllListeners('SIGINT');
  }
}

module.exports = Worker;
