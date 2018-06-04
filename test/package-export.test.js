const test = require('ava');
const {
  withConnection: connect,
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

test('.use() adds middleware to the stack', t => {
  const faktory = create();
  const mmw = () => {};

  faktory.use(mmw);

  t.is(faktory.middleware[0], mmw, 'middleware function not added to .middleware');
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

test('.work() creates a manager, runs it and resolve the manager', async t => {
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
    const manager = await faktory.work({ port, concurrency: 1 });

    t.truthy(manager.heartbeat, 'manager not started (no heartbeat)');

    await manager.stop();
  });
});

test('middleware end to end', async t => {
  const faktory = create();
  const { queue, jobtype } = await push({args: [1]});

  faktory.use(({ job }, next) => {
    job.memo = ['hello'];
    return next();
  });
  faktory.use(({ job }, next) => {
    job.memo.push('world');
    return next();
  });

  await new Promise((resolve) => {
    faktory.register(jobtype, (...args) => (job) => {
      t.deepEqual(args, [1], 'args not correct');
      t.deepEqual(job.memo, ['hello', 'world']);
      resolve();
    });
    faktory.work({queues: [queue], concurrency: 1});
  });

});
