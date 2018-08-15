const debug = require('debug')('faktory-worker:connection-pool');
const pool = require('generic-pool');
const Client = require('./client');

module.exports = {
  create(size, options = {}) {
    return pool.createPool({
      create: () => {
        debug('creating connection');
        return new Client(options).connect();
      },
      destroy: (client) => {
        debug('closing connection');
        return client.close();
      },
      validate: client => client.connected,
    }, {
      testOnBorrow: true,
      acquireTimeoutMillis: 10000,
      min: 1,
      max: size,
    });
  }
};
