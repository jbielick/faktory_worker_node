const test = require('ava');
const {
  withConnection: connect,
  sleep,
  push,
  mocked,
  mockServer
} = require('./_helper');
const Worker = require('../lib/worker');
const concurrency = 1;

function create(options = {}) {
  return new Worker(Object.assign({ concurrency }, options));
}

test('creates execution pool size of concurrency', async t => {
  const concurrency = 2;
  const worker = create({ concurrency });
  await worker.work();
  t.is(Object.values(worker.processors).length, concurrency, 'has incorrect number of processors');
  await worker.stop();
});


