const debug = require('debug')('faktory-worker:processor');

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
    return !!this.inProgress;
  }

  start() {
    this.startHeartbeat();
    this.loop();
  }

  quiet() {
    this._quiet = true;
    return this;
  }

  async stop() {
    this.quiet();
    await this.inProgressFn;
    clearInterval(this.heartbeat);
    return this;
  }

  async loop() {
    for (;;) {
      if (this._quiet) {
        break;
      }

      // eslint-disable-next-line no-await-in-loop
      const job = await this.fetch(...Processor.shuffle(this.queues));

      if (job) {
        // eslint-disable-next-line no-await-in-loop
        const fn = await this.dispatch(job);

        if (fn) {
          // eslint-disable-next-line no-await-in-loop
          await this.execute(fn, job);
        }
      }
    }
    return this;
  }

  async dispatch(job) {
    debug(`DISPATCH: ${JSON.stringify(job)}`);

    const { jobtype, jid } = job;
    const fn = this.registry[jobtype];

    if (!fn) {
      const err = new Error(`No jobtype registered for: ${jobtype}`);
      await this.fail(jid, err);
      console.error(err);
      return null;
    }

    // this.log(jobtype);

    return fn;
  }

  async execute(fn, job) {
    const { jid, args } = job;
    let result;

    // @TODO invoke middleware stack. koa-compose?
    // @TODO keep in-progress queue to FAIL those jobs during shutdown
    try {
      // job is a function
      this.inProgress = true;
      this.inProgressFn = fn(...args);
      const thunk = await this.inProgressFn;
      // job is a thunk that returns the job
      if (typeof thunk === 'function') {
        this.inProgressFn = thunk(job);
        await this.inProgressFn;
      }
      await this.ack(jid);
    } catch (e) {
      await this.fail(jid, e);
      console.error(e);
    } finally {
      this.inProgress = false;
    }

    return result;
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * https://bost.ocks.org/mike/shuffle/
   * @param  {Array} array array to shuffle
   * @return {Array}       shuffled array
   */
  static shuffle(arrayToShuffle) {
    const array = arrayToShuffle.slice();
    let counter = array.length;

    while (counter > 0) {
      const index = Math.floor(Math.random() * counter);

      counter -= 1;

      const temp = array[counter];
      array[counter] = array[index];
      array[index] = temp;
    }

    return array;
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

  startHeartbeat() {
    this.heartbeat = setInterval(() => {
      this.withConnection(c => c.beat());
    }, 15000);
    return this;
  }
};
