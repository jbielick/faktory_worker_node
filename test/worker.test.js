const test = require('ava');
const {
  sleep,
  push,
  mocked
} = require('./_helper');
const Worker = require('../lib/worker');
const concurrency = 1;

function create(opts) {
  return new Worker(Object.assign({ concurrency }, opts));
}

test('accepts queues as array', t => {
  const worker = create({queues: 'test'});

  t.deepEqual(worker.queues, ['test'], 'queue passed as string does not yield array');
});

test('accepts queues as an array', t => {
  const worker = create({queues: ['test']});

  t.deepEqual(worker.queues, ['test'], 'queues passed as array does not yield array');
});

test('does not add default to an empty queue array', t => {
  const worker = create({queues: []});

  t.deepEqual(worker.queues, []);
});

test.only('hearbeats', async t => {
  await mocked(async (server, port) => {
    let worker;
    let called = 0;

    return new Promise(resolve => {
      server
        .on('BEAT', (msg, socket) => {
          called += 1;
          if (called == 3) {
            t.pass();
            resolve();
            worker.stop();
          }
          mocked.beat(msg, socket);
        })
        .on('FETCH', mocked.fetch(null));

      worker = create({ port, beatInterval: 0.1 });
      worker.work();
    });
  });
});
