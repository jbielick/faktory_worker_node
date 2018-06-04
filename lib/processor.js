const shuffle = require('./shuffle');
const compose = require('koa-compose');

function wrapAndWarnNonErrors(object) {
  if (object instanceof Error) {
    return object;
  }
  console.warn(`
Job failed without providing an error.
Ensure your promise was rejected with an *Error* and not a *String*

correct:\treject(new Error('message'))
incorrect:\treject('message')
  `);
  return new Error(object || 'Job failed with no error or message given');
}

module.exports = class Processor {
  constructor(options = {}) {
    const { queues, middleware } = options;

    if (queues && queues.length > 0) {
      this.queues = Array.isArray(queues) ? queues : [queues];
    } else {
      this.queues = ['default'];
    }

    this.wid = options.wid;
    this.registry = options.registry || {};
    this.withConnection = options.withConnection;
    this.handle = this.createHandler(middleware || []);
  }

  createHandler(middleware) {
    const execute = async (ctx, next) => {
      const { registry, job: { jobtype, args } } = ctx;
      const fn = registry[jobtype];

      if (!fn) throw new Error(`No jobtype registered: ${jobtype}`);

      const thunkOrPromise = await fn(...args);
      if (typeof thunkOrPromise === 'function') {
        await thunkOrPromise(ctx);
      } else {
        await thunkOrPromise;
      }
      return next();
    };

    const middlewareFn = compose(middleware.concat([execute]));

    return async (job) => {
      const ctx = this.createContext(job);
      try {
        // this.log(jobtype);
        // @TODO keep in-progress queue to FAIL those jobs during hard shutdown
        this.currentJob = job;
        await middlewareFn(ctx);
        return this.ack(job.jid);
      } catch (e) {
        return ctx.onError(e);
      } finally {
        this.currentJob = null;
      }
    };
  }

  get working() {
    return !!this.currentJob;
  }

  start() {
    return this.loop();
  }

  quiet() {
    this._quiet = true;
  }

  async stop() {
    this._stopping = true;
    this.quiet();
    await this.handling;
  }

  async loop() {
    for (;;) {
      if (this._quiet) return;
      let job;

      try {
        job = await this.fetch(...shuffle(this.queues));
        if (job) {
          this.handling = this.handle(job);
          await this.handling;
        }
      } catch (e) {
        if (!this._stopping) {
          Processor.onError(e);
          await Processor.sleep(2000);
        }
      } finally {
        job = null;
        this.handling = null;
      }
    }
  }

  createContext(job) {
    const onError = (err) => {
      // for use with node-style callbacks
      // istanbul ignore next
      if (err === null) return err;
      const wrappedError = wrapAndWarnNonErrors(err);
      this.log(`jid=${job.jid} ERROR: ${wrappedError.toString()}`);
      return this.fail(job.jid, wrappedError);
    };
    return { job, onError, registry: this.registry };
  }

  static onError(err) {
    const wrappedErr = wrapAndWarnNonErrors(err);
    const msg = wrappedErr.stack || wrappedErr.toString();
    console.error();
    console.error(msg.replace(/^/gm, '  '));
    console.error();
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  fetch(...args) {
    return this.withConnection(c => c.fetch(...args));
  }

  ack(...args) {
    return this.withConnection(c => c.ack(...args));
  }

  fail(...args) {
    return this.withConnection(c => c.fail(...args));
  }

  log(msg) {
    console.log(`${new Date().toJSON()} wid=${this.wid} pid=${process.pid} ${msg}`);
  }
};
