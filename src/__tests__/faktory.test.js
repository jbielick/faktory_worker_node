const test = require('ava');

const create = require('./faktory');
const Client = require('./client');
const { sleep, mocked, flush } = require('../test/_helper');

test.beforeEach(() => flush());
test.afterEach.always(() => flush());

test('#register: returns self', t => {
  const faktory = create();

  const returned = faktory.register('test', () => {});

  t.is(faktory, returned, '`this` not returned by .register');
});

test('#use: returns self', t => {
  const faktory = create();

  const returned = faktory.use(() => {});

  t.is(faktory, returned, '`this` not returned by .use');
});

test('#use: throws when arg is not a function', t => {
  const faktory = create();

  t.throws(() => {
    faktory.use('');
  });
});

test('#work: throws when called twice', t => {
  const faktory = create();

  faktory.work();

  t.throws(() => faktory.work(), /once/);

  faktory.stop();
});

test('.registry returns the registry object', t => {
  const faktory = create();
  const myFunc = () => {};

  faktory.register('MyJob', myFunc);

  t.is(faktory.registry['MyJob'], myFunc, 'job not found in registry');
});

test('.connect() resolves a client', async t => {
  const faktory = create();

  const client = await faktory.connect();

  t.truthy(client instanceof Client);
});

test('.work() creates a worker, runs it and resolve the worker', async t => {
  t.plan(1);
  await mocked(async (server, port) => {
    server
      .on('BEAT', ({ socket }) => {
        socket.write("+OK\r\n");
      })
      .on('FETCH', async ({ socket }) => {
        await sleep(10);
        socket.write("$-1\r\n");
      });
    const faktory = create();
    const worker = await faktory.work({ port, concurrency: 1 });

    t.truthy(worker.heartbeat, 'worker not started (no heartbeat)');

    await worker.stop();
  });
});

test('it exports Client', t => {
  t.is(require('./client'), require('./client'));
});

test('it exports Worker', t => {
  t.is(require('./worker'), require('./worker'));
});

test('exports .connect', (t) => {
  t.is(typeof require('./faktory').connect, 'function');
});

test('exports .use', (t) => {
  t.is(typeof require('./faktory').use, 'function');
});

test('exports .register', (t) => {
  t.is(typeof require('./faktory').register, 'function');
});

test('exports .work', (t) => {
  t.is(typeof require('./faktory').work, 'function');
});

test('exports .stop', (t) => {
  t.is(typeof require('./faktory').stop, 'function');
});

