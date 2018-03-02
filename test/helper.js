const net = require('net');
const debug = require('debug')('faktory-worker:test-helper');
const {
  queueName,
  withConnection
} = require('faktory-client/test/support/helper');

const sleep = (ms, value = true) => {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
};

const mockServer = () => {
  const server = net.createServer();
  let shookhands = false;
  server.on('connection', (socket) => {
    socket.write("+HI {\"v\":2}\r\n");

    server.once('HELLO', (msg, socket) => {
      socket.write("+OK\r\n");
    });

    socket.on('data', async (chunk) => {
      const msg = chunk.toString();
      server.emit(msg.split(' ')[0], msg, socket);
    });
  });
  return server;
}

const mocked = async (fn) => {
  const server = mockServer();
  const port = Math.round(Math.random() * 100 + 7000, 0);
  server.listen(port, '127.0.0.1');
  try {
    return fn(server, port);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
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
  mockServer,
  mocked
};
