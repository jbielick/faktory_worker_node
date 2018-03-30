const debug = require('debug')('faktory-worker:test-helper');
const {
  queueName,
  withConnection,
  mockedServer,
  mocked
} = require('faktory-client/test/support/helper');

const sleep = (ms, value = true) => {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
};

const push = async (opts = {}) => {
  const queue = opts.queue || queueName();
  const jobtype = 'TestJob';
  const args = opts.args || [];
  const jid = await withConnection(async (client) => {
    return client.push({
      jobtype,
      queue,
      args
    });
  });
  return { queue, jobtype, args, jid };
};

module.exports = {
  sleep,
  push,
  mockedServer,
  mocked
};
