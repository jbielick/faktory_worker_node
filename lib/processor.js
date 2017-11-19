const debug = require('debug')('faktory-worker:processor');
const shuffle = require('./shuffle');

module.exports = class Processor {
  constructor(options = {}) {
    const { queues } = options;

    if (queues) {
      this.queues = Array.isArray(queues) ? queues : [queues];
    } else {
      this.queues = ['default'];
    }

    this.wid = options.wid;
    this.registry = options.registry || {};
    this.withConnection = options.withConnection;
  }

  get working() {
    return !!this.current;
  }

  start() {
    return this.loop();
  }

  quiet() {
    this._quiet = true;
  }

  async stop() {
    this.quiet();
    await this.current;
  }

  async loop() {
    for (;;) {
      if (this._quiet) {
        break;
      }

      // fetch always blocks for 2s,
      // so this loop is naturally throttled
      const job = await this.fetch(...shuffle(this.queues));

      if (job) {
        // set current for sync jobs, otherwise a sync
        // job could be in-progress, but this.current
        // isn't set until that function returns
        this.current = job;
        // set current for async jobs
        this.current = this.dispatch(job);
        await this.current;
        this.current = null;
      }
    }
  }

  async dispatch(job) {
    debug(`DISPATCH: ${JSON.stringify(job)}`);

    const { jobtype, jid } = job;
    const fn = this.registry[jobtype];

    if (!fn) {
      const err = new Error(`No jobtype registered for: ${jobtype}`);
      console.error(err);
      return this.fail(jid, err);
    }

    // this.log(jobtype);

    return this.execute(fn, job);
  }

  async execute(fn, job) {
    const { jid, args } = job;

    // @TODO invoke middleware stack. koa-compose?
    // @TODO keep in-progress queue to FAIL those jobs during shutdown
    try {
      const thunk = await fn(...args);
      // jobfn returns a function to accept the job payload
      // ex: (...args) => (job) => { ... }
      if (typeof thunk === 'function') {
        await thunk(job);
      }
      await this.ack(jid);
    } catch (e) {
      let error;
      if (!(e instanceof Error)) {
        error = new Error(e || 'Job failed with no error or message given');
        console.warn(`
Job failed without providing an error.
Ensure your promise was rejected with an error and not a string
reject(new Error('message')) vs. reject('message')
        `);
      } else {
        error = e;
      }
      await this.fail(jid, error);
      console.error(error);
    }
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
