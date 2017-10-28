const debug = require('debug')('faktory-worker');
const Client = require('faktory-client');

module.exports = class Manager {

  constructor(options = {}) {
    const { queues, registry } = options;

    if (options.queues) {
      this.queues = Array.isArray(queues) ? queues : [queues];
    } else {
      this.queues = ['default'];
    }

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
    this.quiet = true;
  }

  /**
   * stop accepting new jobs, fail those that are in progress and shutdown
   * @return {[type]} [description]
   */
  stop() {
    this.quiet = true;
    this.log('Shutting down');
    let start = Date.now();

    let interval = setInterval(() => {
      if (this.inProgress < 0 || Date.now() - start > 10000) {
        this.client.shutdown();
        clearInterval(interval);
      }
    }, 100);
    // fail the in-progress after a timeout
    // process.exit(0);
  }

  async loop() {
    for (;;) {
      const job = await this.client.fetch(...this.queues);
      if (job) {
        this.dispatch(job);
        this.inProgress++;
      }
      if (this.quiet) break;
    }
  }

  async dispatch(job) {
    debug(`DISPATCH: ${JSON.stringify(job)}`);
    const { jid, jobtype, args } = job;
    const jobFn = this.registry[jobtype];
    let result;

    if (!jobFn) {
      const err = new Error(`No jobtype registered for: ${jobtype}`);
      await this.client.fail(jid, err);
      throw err;
    }

    // @TODO invoke middleware stack. koa-compose?
    // @TODO keep in-progress queue to FAIL those jobs during shutdown
    try {
      const thunk = await jobFn(...args);
      if (typeof thunk === 'function') {
        await thunk(job);
      }
      await this.client.ack(jid);
    } catch(e) {
      await this.client.fail(jid, e);
      throw e;
    } finally {
      this.inProgress--;
    }
    return result;
  }

  log(msg) {
    const { wid, pid } = this.client;
    console.log(`${new Date().toJSON()} wid=${wid} pid=${pid} ${msg}`)
  }

  async run() {
    this.trapSignals();
    await this.client.connect();
    this.log(`Connected to server`);
    this.loop();
  }
}
