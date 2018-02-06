const debug = require('debug')('faktory-worker:manager');
const Client = require('faktory-client');
const uuid = require('uuid');
const pool = require('generic-pool');
const Processor = require('./processor');

const DEFAULT_HEARTBEAT_INTERVAL = 15000;
const DEFAULT_SHUTDOWN_TIMEOUT = 8000;
const DEFAULT_CONCURRENCY = 20;

module.exports = class Manager {
  constructor(options = {}) {
    const opts = Object.assign({
      wid: uuid().slice(0, 8),
      concurrency: DEFAULT_CONCURRENCY,
      timeout: DEFAULT_SHUTDOWN_TIMEOUT
    }, options);

    this.concurrency = opts.concurrency;
    this.timeout = opts.timeout;
    this.wid = opts.wid;
    this.pool = Manager.createPool(opts, this.concurrency + 2);
    this.heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL;

    debug('starting %i worker(s)', this.concurrency);
    this.processors = [];
    for (let i = this.concurrency; i > 0; i -= 1) {
      this.processors.push(new Processor({
        wid: opts.wid,
        queues: opts.queues,
        registry: opts.registry,
        withConnection: this.withConnection.bind(this),
      }));
    }
  }

  static createPool(options, size) {
    debug('creating connection pool with max %i', size);
    const faktoryPool = pool.createPool({
      create() {
        debug('creating pool resource');
        return new Client(options).connect();
      },
      destroy(client) {
        debug('destroying pool resource');
        client.close();
      },
      validate: client => client.connected,
    }, {
      testOnBorrow: true,
      acquireTimeoutMillis: 10000,
      min: 1,
      max: size
    });
    return faktoryPool;
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
        } else {
          setTimeout(shutdown, 10);
        }
      };

      shutdown().catch((err) => {
        console.error(err);
        process.exit(1);
      });
    });
  }

  get busy() {
    return this.processors.filter(p => p.working);
  }

  async run() {
    await this.withConnection(() => this.startHeartbeat());
    this.trapSignals();
    this.processors.map(p => p.start());
  }

  startHeartbeat() {
    this.heartbeat = setInterval(() => {
      this.withConnection(c => c.beat());
    }, this.heartbeatInterval);
    return this;
  }

  log(msg) {
    debug(msg);
    console.log(`${new Date().toJSON()} faktory-manager wid=${this.wid} ${msg}`);
  }
};
