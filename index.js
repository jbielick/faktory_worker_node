const Client = require('./lib/client');
const Manager = require('./lib/manager');
const debug = require('debug')('faktory-worker');
const assert = require('assert');

const faktory = () => {
  const middleware = [];
  const registry = {};

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
      const manager = new Manager(Object.assign({}, options, { registry, middleware }));
      return manager.run();
    }
  };
};

module.exports = Object.assign(faktory, faktory());
