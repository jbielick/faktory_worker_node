const debug = require('debug')('faktory-worker');
const Client = require('faktory-client');
const blocked = require('blocked');

blocked((ms) => {
  debug(`Event loop blocked ${ms}`);
}, { threshold: 10 });

module.exports = class Processor {
  constructor(options = {}) {
    const { queues, registry, concurrency } = options;

    if (options.queues) {
      this.queues = Array.isArray(queues) ? queues : [queues];
    } else {
      this.queues = ['default'];
    }

    this.concurrency = concurrency || 20;
    this.inProgress = 0;
    this.registry = registry || {};
    this.client = new Client();
  }

  trapSignals() {
    process
      .on('SIGTERM', () => this.stop())
      .on('SIGTSTP', () => this.quiet())
      .on('SIGINT', () => this.stop());
  }

  /**
   * stop accepting new jobs and finish what's currently in progress
   * @return {void}
   */
  quiet() {
    this.log('Quieting');
    // flush the tcp buffer before closing the connection
    this.gracefulShutdown = true;
  }

  /**
   * stop accepting new jobs, fail those that are in progress and shutdown
   * @return {[type]} [description]
   */
  async stop() {
    const start = Date.now();

    this.quiet();
    this.log('Stopping');

    return new Promise((resolve) => {
      const shutdown = () => {
        if (this.inProgress <= 0 || Date.now() - start > 8000) {
          debug(`Shutting down. In progress: ${this.inProgress}`);
          // fail any currently processing jobs
          clearInterval(this.hearbeat);
          this.client.shutdown();
          resolve();
        } else {
          setTimeout(shutdown, 10);
        }
      };

      shutdown();
    });
  }

  async loop() {
    for (;;) {
      if (this.gracefulShutdown) {
        break;
      }

      if (this.inProgress >= this.concurrency) {
        // eslint-disable-next-line no-await-in-loop
        await Processor.sleep(1);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const job = await this.client.fetch(...this.queues);

        if (job) {
          this.dispatch(job);
        }
      }
    }
  }

  async execute(fn, job) {
    const { jid, args } = job;
    let result;

    this.inProgress += 1;
    // @TODO invoke middleware stack. koa-compose?
    // @TODO keep in-progress queue to FAIL those jobs during shutdown
    try {
      const thunk = await fn(...args);
      if (typeof thunk === 'function') {
        await thunk(job);
      }
      await this.client.ack(jid);
    } catch (e) {
      await this.client.fail(jid, e);
      throw e;
    } finally {
      this.inProgress -= 1;
    }

    return result;
  }

  async dispatch(job) {
    debug(`DISPATCH: ${JSON.stringify(job)}`);
    const { jobtype, jid } = job;
    const jobFn = this.registry[jobtype];

    if (!jobFn) {
      const err = new Error(`No jobtype registered for: ${jobtype}`);
      await this.client.fail(jid, err);
      throw err;
    }

    return this.execute(jobFn, job);
  }

  log(msg) {
    const { wid, pid } = this.client;
    console.log(`${new Date().toJSON()} wid=${wid} pid=${pid} ${msg}`);
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  startHeartbeat() {
    this.hearbeat = setInterval(() => this.client.beat(), 15000);
  }

  async run() {
    this.trapSignals();
    await this.client.connect();
    this.startHeartbeat();
    this.log('Connected to server');
    this.loop();
  }
};
