const debug = require('debug')('faktory-worker');
const assert = require('assert');
const Client = require('./lib/client');
const Worker = require('./lib/worker');

const faktory = () => {
  const middleware = [];
  const registry = {};
  let worker;

  return {
    get registry() {
      return registry;
    },
    get middleware() {
      return middleware;
    },
    use(fn) {
      assert(typeof fn === 'function');
      debug('use %s', fn._name || fn.name || '-');
      middleware.push(fn);
      return this;
    },
    register(name, fn) {
      assert(typeof fn === 'function', 'a registered job must be a function');
      debug('registered %s', name);
      registry[name] = fn;
      return this;
    },
    connect(...args) {
      return new Client(...args).connect();
    },
    work(options = {}) {
      if (!worker) {
        worker = new Worker(Object.assign({}, options, { registry, middleware }));
      }
      return worker.work();
    },
    stop() {
      const temp = worker;
      worker = undefined;
      return temp.stop();
    }
  };
};

module.exports = Object.assign(faktory, faktory());
