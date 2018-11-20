const net = require('net');
const uuid = require('uuid/v4');
const getPort = require('get-port');
const debug = require('debug')('faktory-worker:test-helper');
const Client = require('../lib/client');

const mockServer = () => {
  const server = net.createServer();

  server.on('connection', (socket) => {
    server
      .once('HELLO', ({ socket }) => socket.write("+OK\r\n"))
      .on('END', ({ socket }) => socket.destroy());

    socket.on('data', (chunk) => {
      const string = chunk.toString();
      const [ command, ] = string.replace(/\r\n$/, '').split(' ', 1)
      const rawData = string.replace(`${command} `, '');
      let data = rawData;
      try {
        data = JSON.parse(rawData);
      } catch(_) {}
      server.emit(command, { command, data, socket });
      server.emit('*', { command, data, socket });
    });

    socket.write("+HI {\"v\":2}\r\n");
    server.emit('HI');
  });
  return server;
}

const mocked = async (fn) => {
  const server = mockServer();
  const port = await getPort();
  server.listen(port, '127.0.0.1');
  try {
    return fn(server, port);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
};

mocked.ok = () => ({ socket }) => {
  socket.write("+OK\r\n");
};

mocked.fail = mocked.ok;

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

mocked.info = () => ({ socket }) => {
  const json = JSON.stringify({ queues: [], faktory: {}, server_utc_time: Date.now() });
  socket.write(`$${json.length}\r\n${json}\r\n`);
};

const sleep = (ms, value = true) => {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
};

const randQueue = (label = 'test') => {
  return `${label}-${uuid().slice(0, 6)}`;
};

const createJob = (...args) => {
  return {
    jobtype: 'testJob',
    queue: randQueue(),
    args
  };
};

const push = async (options = {}) => {
  const client = new Client();

  const job = client.job('test');
  job.queue = randQueue();
  job.args = options.args || [];

  await job.push();

  client.close();

  return job;
};

const flush = () => {
  return new Client().flush();
};

module.exports = {
  randQueue,
  sleep,
  push,
  flush,
  mockServer,
  mocked,
  createJob,
};
