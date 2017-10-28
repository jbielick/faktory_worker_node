const Client = require('faktory-client');
const Manager = require('./manager');
const registry = {};
const middleware = [];

module.exports = {
  get registry() {
    return registry;
  },
  register(name, fn) {
    registry[name] = fn;
  },
  async connect(...args) {
    return await client.connect();
  },
  async work(options = {}) {
    manager = new Manager(Object.assign({}, options, { registry }));
    await manager.run();
    return manager;
  }
};
