const debug = require('debug')('faktory-worker');
const assert = require('assert');
const Client = require('./lib/client');
const Manager = require('./lib/manager');

const faktory = () => {
  const middleware = [];
  const registry = {};
  let manager;

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
      assert(typeof fn === 'function');
      registry[name] = fn;
      return this;
    },
    connect(...args) {
      return new Client(...args).connect();
    },
    work(options = {}) {
      if (!manager) {
        manager = new Manager(Object.assign({}, options, { registry, middleware }));
      }
      return manager.run();
    },
    stop() {
      const temp = manager;
      manager = undefined;
      return temp.stop();
    }
  };
};

module.exports = Object.assign(faktory, faktory());
