const debug = require('debug')('faktory-worker:manager');
const Client = require('faktory-client');
const uuid = require('uuid');
const pool = require('generic-pool');
const Processor = require('./processor');

module.exports = class Manager {
  constructor(options = {}) {
    const opts = Object.assign({
      wid: uuid().slice(0, 8),
      concurrency: 20,
      timeout: 8000
    }, options);

    this.concurrency = opts.concurrency || 20;
    this.timeout = opts.timeout || 8000;
    this.wid = opts.wid;

    this.pool = this.constructor.createPool(opts, this.concurrency + 2);
    opts.withConnection = this.withConnection.bind(this);

    this.processors = [];
    for (let i = this.concurrency; i > 0; i -= 1) {
      this.processors.push(new Processor(opts));
    }
  }

  static createPool(options, size) {
    return pool.createPool({
      create() {
        debug('Connection created');
        return new Client(options).connect();
      },
      destroy(client) {
        return client.close();
      }
    }, {
      min: 1,
      max: size
    });
  }

  async withConnection(fn, priority) {
    const client = await this.pool.acquire(priority);
    try {
      return fn(client);
    } finally {
      await this.pool.release(client);
    }
  }

  trapSignals() {
    process
      .on('SIGTERM', () => this.stop())
      .on('SIGTSTP', () => this.quiet())
      .on('SIGINT', () => this.stop());
  }

  /**
   * stop accepting new jobs and continue working on what's currently in progress
   * @return {void}
   */
  quiet() {
    this.log('Quieting');
    this.processors.map(p => p.quiet());
  }

  /**
   * stop accepting new jobs, fail those that are in progress and shutdown
   * @return {[type]} [description]
   */
  async stop() {
    this.log('Stopping');
    const start = Date.now();

    this.processors.map(p => p.stop());

    return new Promise((resolve) => {
      const shutdown = async () => {
        const timeoutExceeded = Date.now() - start > this.timeout;

        if (this.busy.length === 0 || timeoutExceeded) {
          this.log(`Shutting down. In progress: ${this.busy.length}`);

          clearInterval(this.heartbeat);
          await this.pool.drain();
          this.pool.clear();
          resolve();
          // process.exit(0 / 1)?
        } else {
          setTimeout(shutdown, 10);
        }
      };

      shutdown();
    });
  }

  get busy() {
    return this.processors.filter(p => p.working);
  }

  run() {
    this.trapSignals();
    this.startHeartbeat();
    this.processors.map(p => p.start());
    return this;
  }

  startHeartbeat() {
    this.heartbeat = setInterval(() => (
      this.withConnection(c => c.beat())
    ), 15000);
    return this;
  }

  log(msg) {
    console.log(`${new Date().toJSON()} faktory-manager wid=${this.wid} ${msg}`);
  }
};
