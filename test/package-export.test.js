const test = require('ava');
const {
  sleep,
  push,
  mocked
} = require('./_helper');
const create = require('../');

test('.register() returns self', t => {
  const faktory = create();

  const returned = faktory.register('test', () => {});

  t.is(faktory, returned, '`this` not returned by .register');
});

test('.use() returns self', t => {
  const faktory = create();

  const returned = faktory.use(() => {});

  t.is(faktory, returned, '`this` not returned by .use');
});

test('.use() throws when arg is not a function', t => {
  const faktory = create();

  t.throws(() => {
    faktory.use('');
  });
});

test('.registry returns the registry object', t => {
  const faktory = create();
  const myFunc = () => {};

  faktory.register('MyJob', myFunc);

  t.is(faktory.registry['MyJob'], myFunc, 'job not found in registry');
});

test('.connect() resolve a client', async t => {
  const faktory = create();

  const client = await faktory.connect();

  t.is(typeof client.fetch, 'function', '.connect did not resolve object with .fetch method');
  t.truthy(client.connected, 'client not connected');

  client.close();
});

test('.work() creates a worker, runs it and resolve the worker', async t => {
  t.plan(1);
  await mocked(async (server, port) => {
    server
      .on('BEAT', (msg, socket) => {
        socket.write("+OK\r\n");
      })
      .on('FETCH', async (msg, socket) => {
        await sleep(10);
        socket.write("$-1\r\n");
      });
    const faktory = create();
    const worker = await faktory.work({ port, concurrency: 1 });

    t.truthy(worker.heartbeat, 'worker not started (no heartbeat)');

    await worker.stop();
  });
});

test('it exports the client', t => {
  t.is(require('../client'), require('../lib/client'));
});
