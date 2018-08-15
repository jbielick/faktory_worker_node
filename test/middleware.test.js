const test = require('ava');
const {
  sleep,
  push,
  mockServer
} = require('./_helper');
const Worker = require('../lib/worker');
const faktoryFactory = require('../');

test('invokes middleware', async t => {
  const { queue, jobtype } = await push();

  await new Promise((resolve) => {
    const worker = new Worker({
      concurrency: 1,
      queues: [queue],
      middleware: [
        (ctx, next) => {
          ctx.job.args = ['hello'];
          return next();
        }
      ],
      registry: {
        [jobtype]: (...args) => {
          t.deepEqual(args, ['hello'], 'middleware not executed');
          resolve();
        }
      }
    });

    worker.work();
  });
});

test('invokes middleware in order', async t => {
  const recorder = [];
  const { queue, jobtype } = await push();
  let worker;

  await new Promise((resolve) => {

    worker = new Worker({
      concurrency: 1,
      queues: [queue],
      middleware: [
        async (ctx, next) => {
          recorder.push('before 1');
          await next();
          recorder.push('after 1');
        },
        async (ctx, next) => {
          recorder.push('before 2');
          await next();
          recorder.push('after 2');
        }
      ],
      registry: {
        [jobtype]: async (...args) => {
          recorder.push('run 1');
          await sleep(1);
          recorder.push('run 2');
          resolve();
        }
      }
    });
    worker.work();
  });

  await worker.stop();

  t.deepEqual(
    recorder,
    [
      'before 1',
      'before 2',
      'run 1',
      'run 2',
      'after 2',
      'after 1'
    ],
    'middleware not executed in order'
  );
});

test('.use() adds middleware to the stack', t => {
  const instance = faktoryFactory();
  const mmw = () => {};

  instance.use(mmw);

  t.is(instance.middleware[0], mmw, 'middleware function not added to .middleware');
});

test('middleware context is passed to job thunk', async t => {
  const { queue, jobtype } = await push({args: [1]});
  const instance = faktoryFactory();

  instance.use((ctx, next) => {
    ctx.memo = ['hello'];
    return next();
  });
  instance.use((ctx, next) => {
    ctx.memo.push('world');
    return next();
  });

  await new Promise((resolve) => {
    instance.register(jobtype, (...args) => ({ memo }) => {
      t.deepEqual(args, [1], 'args not correct');
      t.deepEqual(memo, ['hello', 'world']);
      instance.stop();
      resolve();
    });
    instance.work({queues: [queue], concurrency: 1});
  });

});
