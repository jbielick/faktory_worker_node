const Client = require('faktory-client');
const Processor = require('./processor');

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
    const processor = new Processor(Object.assign({}, options, { registry }));
    await processor.run();
    return processor;
  }
};
