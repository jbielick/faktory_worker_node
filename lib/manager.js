const debug = require('debug')('faktory-worker:manager');
const Processor = require('./processor');
const Client = require('faktory-client');
const blocked = require('blocked');
const pool = require('generic-pool');

blocked((ms) => {
  debug(`Event loop blocked ${ms}`);
}, { threshold: 10 });

module.exports = class Manager {
  constructor(options = {}) {
    const { concurrency, timeout } = options;

    this.concurrency = concurrency || 20;
    this.timeout = timeout || 8000;

    this.pool = this.constructor.createPool(options, this.concurrency + 2);
    options.withConnection = this.withConnection.bind(this);

    this.processors = [];
    for (let i = this.concurrency; i > 0; i--) {
      this.processors.push(new Processor(options));
    }
  }

  static createPool(options, size) {
    return pool.createPool({
      create() {
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
    const client = await this.pool.acquire();
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
        let working = this.busy;
        if (working.length === 0 || Date.now() - start > this.timeout) {
          this.log(`Shutting down. In progress: ${working.length}`);
          await this.pool.drain();
          this.pool.clear();
          resolve();
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
    this.processors.map(p => p.start())
    return this;
  }

  log(msg) {
    console.log(`${new Date().toJSON()} faktory-manager ${msg}`);
  }
};
