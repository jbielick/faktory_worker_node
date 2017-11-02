const Client = require('faktory-client');
const Manager = require('./manager');

const registry = {};

module.exports = {
  get registry() {
    return registry;
  },
  register(name, fn) {
    registry[name] = fn;
  },
  connect(...args) {
    return new Client(...args).connect();
  },
  async work(options = {}) {
    const manager = new Manager(Object.assign({}, options, { registry }));
    await manager.run();
    return manager;
  }
};
