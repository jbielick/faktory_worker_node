const debug = require('debug')('faktory-worker');
const Manager = require('./manager');
const Client = require('./client');
const registry = {};
const middleware = [];

// queues?

module.exports = {
  get registry() {
    return registry;
  },
  register: (name, fn) => {
    registry[name] = fn;
  },
  connect() {
    return new Client().connect();
  },
  work: (options = {}) => {
    const manager = new Manager(Object.assign({}, options, { registry }));
    manager.run();
  }
};
