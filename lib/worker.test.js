const test = require('ava');

const Worker = require('./worker');
const { sleep, mocked, push, flush } = require('../test/_helper');

test.beforeEach(() => flush());
test.afterEach.always(() => flush());

const concurrency = 1;

function create(opts) {
  return new Worker(Object.assign({ concurrency }, opts));
}

test('accepts queues as array', t => {
  const worker = new Worker({queues: 'test'});

  t.deepEqual(worker.queues, ['test'], 'queue passed as string does not yield array');
});

test('accepts queues as an array', t => {
  const worker = new Worker({queues: ['test']});

  t.deepEqual(worker.queues, ['test'], 'queues passed as array does not yield array');
});

test('does not add default to an empty queue array', t => {
  const worker = new Worker({queues: []});

  t.deepEqual(worker.queues, []);
});

test('hearbeats', async t => {
  return mocked(async (server, port) => {
    let worker;
    let called = 0;

    return new Promise(resolve => {
      server
        .on('BEAT', ({ socket }) => {
          called += 1;
          if (called == 3) {
            t.pass();
            resolve();
            worker.stop();
          }
          mocked.beat()({ socket });
        })
        .on('FETCH', mocked.fetch(null));

      worker = new Worker({ concurrency, port, beatInterval: 0.1 });
      worker.work();
    });
  });
});
