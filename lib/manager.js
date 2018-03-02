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
      timeout: 8000,
      heartbeatInterval: 15000
    }, options);

    this.concurrency = opts.concurrency;
    this.timeout = opts.timeout;
    this.wid = opts.wid;
    this.pool = Manager.createPool(opts, this.concurrency + 2);
    this.heartbeatInterval = opts.heartbeatInterval;

    debug('starting %i worker(s)', this.concurrency);

    this.processors = new Array(this.concurrency).fill(0).map(() => (
      new Processor({
        wid: opts.wid,
        queues: opts.queues,
        registry: opts.registry,
        middleware: opts.middleware,
        withConnection: this.pool.use.bind(this.pool),
      })
    ));
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

  trapSignals() {
    // istanbul ignore next
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

    const cleanup = async () => {
      debug('cleaning up');
      clearInterval(this.heartbeat);
      await this.pool.drain();
      this.pool.clear();
    };

    const forceShutdown = setTimeout(() => {
      this.log(`Shutting down. In progress: ${this.busy.length}`);
      cleanup();
    }, this.timeout);

    debug('awaiting in-progress jobs');
    await Promise.all(this.processors.map(p => p.stop()));
    clearTimeout(forceShutdown);
    await cleanup();
  }

  get busy() {
    return this.processors.filter(p => p.working);
  }

  static beat(client) {
    return client.beat();
  }

  async run() {
    await this.pool.use(Manager.beat);
    this.startHeartbeat();
    this.trapSignals();
    this.processors.map(p => p.start());
    return this;
  }

  startHeartbeat() {
    this.heartbeat = setInterval(
      () => this.pool.use(Manager.beat),
      this.heartbeatInterval
    );
    return this;
  }

  log(msg) {
    debug(msg);
    console.log(`${new Date().toJSON()} faktory-manager wid=${this.wid} ${msg}`);
  }
};
