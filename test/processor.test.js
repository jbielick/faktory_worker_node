require('./helper');
const test = require('ava');
const {
  createJob,
  createClient,
  queueName,
  withConnection
} = require('faktory-client/test/support/helper');
const Processor = require('../lib/processor');

test('takes queues as array or string', t => {
  let processor;

  processor = create({
    queues: 'test'
  });

  t.deepEqual(processor.queues, ['test'], 'queue passed as string does not yield array');

  processor = create({
    queues: ['test']
  });

  t.deepEqual(processor.queues, ['test'], 'queues passed as array does not yield array');
});

test('passes args to jobfn', async t => {
  let called = false;
  const args = [1, 2, 'three'];
  const { queue, jobtype } = await push({ args });

  await new Promise((resolve) => {
    const processor = create({
      queues: [queue],
      registry: {
        [jobtype]: (...args) => {
          t.deepEqual(args, [1, 2, 'three'], 'args do not match');
          resolve();
        }
      }
    });

    processor.start();
  });
});

test('await async jobfns', async t => {
  let called = false;
  const args = [1, 2, 'three'];
  const { queue, jobtype } = await push({ args });

  await new Promise((resolve) => {
    const processor = create({
      queues: [queue],
      registry: {
        [jobtype]: async (...args) => {
          await sleep(1);
          t.deepEqual(args, [1, 2, 'three'], 'args do not match');
          resolve();
        }
      }
    });

    processor.start();
  });
});

test('executes sync jobfn and sync thunk', async t => {
  let called = false;
  const args = [1, 2, 'three'];
  const { queue, jobtype, jid } = await push({ args });

  await new Promise((resolve) => {
    const processor = create({
      queues: [queue],
      registry: {
        [jobtype]: (...args) => (job) => {
          t.is(job.jid, jid, 'jid does not match');
          t.deepEqual(args, [1, 2, 'three'], 'args do not match');
          resolve();
        }
      }
    });

    processor.start();
  });
});

test('executes sync jobfn and async thunk', async t => {
  let called = false;
  const args = [1, 2, 'three'];
  const { queue, jobtype, jid } = await push({ args });

  await new Promise((resolve) => {
    const processor = create({
      queues: [queue],
      registry: {
        [jobtype]: (...args) => async (job) => {
          await sleep(1);
          t.is(job.jid, jid, 'jid does not match');
          t.deepEqual(args, [1, 2, 'three'], 'args do not match');
          resolve();
        }
      }
    });

    processor.start();
  });
});

test('executes async jobfn and sync thunk', async t => {
  const args = [1, 2, 'three'];
  const { queue, jobtype, jid } = await push({ args });

  await new Promise((resolve) => {
    const processor = create({
      queues: [queue],
      registry: {
        [jobtype]: async (...args) => (job) => {
          t.is(job.jid, jid, 'jid does not match');
          t.deepEqual(args, [1, 2, 'three'], 'args do not match');
          resolve();
        }
      }
    });

    processor.start();
  });
});

test('executes async jobfn and async thunk', async t => {
  const args = [1, 2, 'three'];
  const { queue, jobtype, jid } = await push({ args });

  await new Promise((resolve) => {
    const processor = create({
      queues: [queue],
      registry: {
        [jobtype]: async (...args) => async (job) => {
          await sleep(1);
          t.is(job.jid, jid, 'jid does not match');
          t.deepEqual(args, [1, 2, 'three'], 'args do not match');
          resolve();
        }
      }
    });

    processor.start();
  });
});

test('.dispatch returns the jobfn from the registry', async t => {
  const fn = () => {};
  const jobtype = 'TestJob';
  const processor = create({
    registry: {
      [jobtype]: fn
    }
  });

  t.is(
    await processor.dispatch({ jobtype }),
    fn,
    'dispatch did not return jobfn'
  );
});

test('.dispatch FAILs and throws when no job is registered', async t => {
  const processor = create();
  const jid = 'wellhello';
  let called = false;

  processor.fail = (failed_jid, e) => {
    t.is(failed_jid, jid);
    called = true;
  };

  await processor.dispatch({ jid, jobtype: 'NonExistant' });
  t.truthy(called, '.fail not called for jid');
});

test('.execute FAILs and throws when the job throws during execution', async t => {
  const jobtype = 'FailingJob';
  const processor = create({ registry: {} });
  let called = false;

  const jid = 'wellhello';

  processor.fail = (failedJid, e) => {
    t.is(failedJid, jid);
    called = true;
  };

  await processor.execute(
    () => { throw new Error('always fails') },
    { jid, jobtype, args: [] }
  ),
  t.truthy(called, '.fail not called for jid');
});

test('.stop awaits in-progress job', async t => {
  const { queue, jobtype } = await push();

  const stop = await new Promise((resolve, reject) => {
    const processor = create({
      queues: [queue],
      registry: {
        [jobtype]: async (...args) => {
          resolve(async () => processor.stop());
          await sleep(50);
          t.pass();
        }
      }
    });

    processor.start();
  });
  await stop();
});

test('.stop breaks the work loop', async t => {
  let called = 0;
  const { queue, jobtype } = await push();
  await push({ queue, jobtype });

  const stop = await new Promise((resolve, reject) => {
    const processor = create({
      queues: [queue],
      registry: {
        [jobtype]: async (...args) => {
          resolve(async () => processor.stop());
          called += 1;
        }
      }
    });

    processor.start();
  });
  await stop();
  t.is(called, 1, 'continued fetching after .stop');
});

test('sleep sleeps', async t => {
  let pass = false;
  setTimeout(() => {
    pass = true;
  }, 2);
  await Processor.sleep(5);
  if (pass) {
    t.pass('slept');
  }
});

function create(opts) {
  return new Processor(Object.assign({ withConnection }, opts));
}

function sleep(ms, value = true) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(value), ms);
  });
}

function createJobWithThunkFn(t) {
  return (...args) => async (job) => {
    t.truthy(job.created_at, 'raw job object is provided');
    t.is(await sleep(1, 'slept'), 'slept', 'awaits promises');
    t.deepEqual(args, [1, 2, 'three'], 'arguments are correct');
    t.end();
    return true;
  }
}

async function push(opts = {}) {
  const queue = opts.queue || queueName();
  const jobtype = 'TestJob';
  const args = opts.args || [];
  const jid = await withConnection((client) => {
    return client.push({
      jobtype,
      queue,
      args
    });
  });
  return { queue, jobtype, args, jid };
};
