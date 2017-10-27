const debug = require('debug')('faktory-worker:manager');
const Client = require('./client');

module.exports = class Manager {

  constructor(options = {}) {
    const { queues, registry } = options;

    if (options.queues) {
      this.queues = Array.isArray(queues) ? queues : [queues];
    } else {
      this.queues = ['default'];
    }
    this.registry = registry || {};
    this.exiting = false;
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
    this.client.shutdown();
  }

  /**
   * stop accepting new jobs, fail those that are in progress and shutdown
   * @return {[type]} [description]
   */
  stop() {
    this.exiting = true;
    this.quiet();
    this.log('Shutting down');
    // fail the in-progress after a timeout
    // process.exit(0);
  }

  loop() {
    return this.client
      .fetch(...this.queues)
      .then((resp) => {
        if (resp) {
          this.dispatch(resp.payload);
        }
        this.loop();
      })
      .catch((err) => {
        console.error(err);
        this.stop();
      });
  }

  dispatch(job) {
    debug(`DISPATCH: ${JSON.stringify(job)}`);
    const { jid, jobtype, args } = job;
    const jobFn = this.registry[jobtype];

    if (!jobFn) {
      this.fail(
        jid,
        new Error(`Job function named ${jobFn} is not registered`)
      );
    }

    // @TODO invoke middleware stack. koa-compose?
    // @TODO keep in-progress queue to FAIL those jobs during shutdown
    try {
      jobFn(job, /* done */ (err) => {
        if (err) {
          return this.fail(jid, err);
        }
        this.ack(jid);
      })(args);

    } catch(e) {
      this.fail(jid, e);
    }
  }

  ack(jid) {
    return this.client.send(['ACK', { jid }], 'OK');
  }

  fail(jid, e) {
    console.error(e);
    return this.client.send([
      'FAIL',
      {
        message: e.message,
        errtype: e.code,
        jid: jid,
        backtrace: e.stack.split('\n')
      }
    ], 'OK');
  }

  log(msg) {
    const { wid, pid } = this.meta;
    console.log(`${new Date().toJSON()} wid=${wid} pid=${pid} ${msg}`)
  }

  run() {
    this.trapSignals();

    this.client
      .connect()
      .then((meta) => {
        this.meta = meta;
        this.log(`Connected to server`);
        this.loop();
      })
      .catch((err) => {
        console.error('Failed to start Faktory worker manager:');
        console.error(err);
        this.stop();
      });
  }
}
