const pool = require('generic-pool');
const Client = require('./client');

module.exports = {
  create(size, options = {}) {
    return pool.createPool({
      create: () => new Client(options).connect(),
      destroy: client => client.close(),
      validate: client => client.connected,
    }, {
      testOnBorrow: true,
      acquireTimeoutMillis: 10000,
      min: 1,
      max: size,
    });
  }
};
