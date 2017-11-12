const {
  queueName,
  withConnection
} = require('faktory-client/test/support/helper');

module.exports.push = async function push(opts = {}) {
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

module.exports.sleep = function sleep(ms, value = true) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
};
