const debug = require('debug')('faktory-worker:worker');
const uuid = require('uuid');
const compose = require('koa-compose');

const shuffle = require('./shuffle');
const connectionPool = require('./connection-pool');
const wrapNonErrors = require('./wrap-non-errors');

const START_DELAY = process.env.NODE_ENV === 'test' ? 0 : 50;

class Worker {
  constructor(options = {}) {
    this.wid = options.wid || uuid().slice(0, 8);
    this.concurrency = options.concurrency || 20;
    this.timeout = (options.timeout || 8) * 1000;
    this.beatInterval = (options.beatInterval || 15) * 1000;
    this.queues = [].concat(options.queues || 'default');
    this.middleware = [].concat(options.middleware || []);
    this.registry = options.registry || {};
    this.processors = {};

    this.clients = connectionPool.create(
      this.concurrency + 2,
      Object.assign({ wid: this.wid }, options)
    );
  }

  async tick(pid) {
    const job = await this.fetch();

    if (job) {
      await this.handle(job);
    }

    setImmediate(() => {
      if (this.quieted) return;
      this.processors[pid] = this.tick(pid);
    });

    return this;
  }

  async work() {
    debug('work concurrency=%i', this.concurrency);
    this.execute = this.createExecutionStack();
    this.heartbeat = setInterval(() => this.beat(), this.beatInterval);
    this.trapSignals();
    await Promise.all(
      Array(this.concurrency).fill(0).map((_, index) => {
        return new Promise(resolve => {
          setTimeout(() => {
            const pid = `p${index}`;
            this.processors[pid] = this.tick(pid);
            resolve();
          }, index * START_DELAY);
        });
      })
    );
    return this;
  }

  quiet() {
    debug('quiet');
    this.quieted = true;
  }

  async stop() {
    Worker.removeSignalHandlers();
    debug('stop');
    this.quiet();
    this.stopped = true;
    clearInterval(this.heartbeat);

    return new Promise(async (resolve) => {
      const timeout = setTimeout(async () => {
        debug('shutdown timeout exceeded');
        this.closePool();
        resolve();
        process.exit(1);
      }, this.timeout);

      try {
        debug('awaiting in progress');
        await Promise.all(this.inProgress);
        debug('all clear');
        await this.closePool();
        clearTimeout(timeout);
        resolve();
      } catch (e) {
        console.warn('error during forced shutdown:', e);
      }
    });
  }

  async closePool() {
    this.clients.closed = true;
    debug('draining');
    await this.clients.drain();
    this.clients.clear();
  }

  get inProgress() {
    return Object.values(this.processors);
  }

  async beat() {
    const response = await this.clients.use(client => client.beat());
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

  fetch() {
    return this.clients.use(client => client.fetch(...shuffle(this.queues)));
  }

  createExecutionStack() {
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

  async handle(job) {
    const { jid } = job;
    const ctx = { job };
    try {
      debug(`executing ${jid}`);
      await this.execute(ctx);
      await this.clients.use(client => client.ack(jid));
      debug(`ACK ${jid}`);
    } catch (e) {
      const error = wrapNonErrors(e);
      await this.clients.use(client => client.fail(jid, error));
      debug(`FAIL ${jid}`);
    }
  }

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
