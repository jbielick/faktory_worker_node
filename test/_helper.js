const net = require('net');
const uuid = require('uuid/v4');
const getPort = require('get-port');
const debug = require('debug')('faktory-worker:test-helper');
const Client = require('../lib/client');
let i = 0;

const createClient = (opts) => new Client(opts);

const withConnection = async (opts, cb) => {
  if (!cb && opts) {
    cb = opts;
    opts = undefined;
  }

  const client = createClient(opts);

  debug('Connecting');
  await client.connect();

  try {
    return await cb(client);
  } catch(e) {
    throw e;
  } finally {
    debug('Shutting down client');
    await client.close();
  }
};

const mockServer = () => {
  const server = net.createServer();
  let shookhands = false;
  server.on('connection', (socket) => {
    socket.write("+HI {\"v\":2}\r\n");

    server.once('HELLO', ({ socket }) => {
      socket.write("+OK\r\n");
    });

    socket.on('data', async (chunk) => {
      const string = chunk.toString();
      const [ command, ] = string.split(' ', 1);
      const rawData = string.replace(`${command} `, '');
      let data = rawData;
      try {
        data = JSON.parse(rawData);
      } catch(_) {}
      server.emit(command, { data, socket });
    });
  });
  return server;
}

const mocked = async (fn) => {
  const server = mockServer();
  i += 1;
  const port = await getPort();
  server.listen(port, '127.0.0.1');
  try {
    return fn(server, port);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
};

mocked.beat = (state) => ({ socket }) => {
  if (!state) {
    socket.write("+OK\r\n");
  } else {
    const json = JSON.stringify({ state });
    socket.write(`$${json.length}\r\n${json}\r\n`);
  }
}
mocked.fetch = (job) => ({ socket }) => {
  if (job) {
    const string = JSON.stringify(job);
    socket.write(`$${string.length}\r\n${string}\r\n`);
  } else {
    socket.write("$-1\r\n");
  }
};
mocked.fail = () => ({ socket }) => {
  socket.write("+OK\r\n");
};

const sleep = (ms, value = true) => {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
};

const queueName = (label = 'test') => {
  return `${label}-${uuid().slice(0, 6)}`;
};

const createJob = (...args) => {
  return {
    jobtype: 'testJob',
    queue: queueName(),
    args
  };
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
  withConnection,
  queueName,
  sleep,
  push,
  mockServer,
  mocked,
  createClient,
  createJob,
};
