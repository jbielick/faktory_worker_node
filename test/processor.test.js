const test = require('ava');
const {
  withConnection,
  sleep,
  push
} = require('./_helper');
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

test('handles sync jobfn and sync thunk', async t => {
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

test('handles sync jobfn and async thunk', async t => {
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

test('handles async jobfn and sync thunk', async t => {
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

test('handles async jobfn and async thunk', async t => {
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

test('.fail() FAILs the job on the server', async t => {
  const processor = create({
    withConnection: (cb) => {
      cb({
        fail() {
          t.pass();
        }
      });
    }
  });
  const jid = 'wellhello';

  await processor.handle({ jid, jobtype: 'none' });
});

test('.handle() FAILs and throws when no job is registered', async t => {
  const jid = 'wellhello';
  const processor = create({
    withConnection: (cb) => {
      cb({
        fail(failedJid, e) {
          t.is(failedJid, jid);
          t.truthy(/no jobtype registered/i.test(e.message));
        }
      });
    }
  });

  await processor.handle({ jid, jobtype: 'none' });
});

test('.handle() FAILs and throws when the job throws (sync) during execution', async t => {
  const jobtype = 'FailingJob';
  const jid = 'wellhello';
  const processor = create({
    registry: {
      [jobtype]: () => { throw new Error('always fails') }
    },
    withConnection: (cb) => {
      cb({
        fail(failedJid, e) {
          t.is(failedJid, jid);
          t.truthy(e instanceof Error);
          t.truthy(/always fails/.test(e.message));
        }
      });
    }
  });

  await processor.handle({ jid, jobtype, args: [] });
});

// #2
test('.handle() FAILs and throws when the job rejects (async) during execution', async t => {
  const jobtype = 'RejectedJob';
  const jid = 'wellhello';
  const processor = create({
    registry: {
      [jobtype]: async () => { throw new Error('rejected promise') }
    },
    withConnection: (cb) => {
      cb({
        fail(failedJid, e) {
          t.is(failedJid, jid);
          t.truthy(e instanceof Error);
          t.truthy(/rejected promise/.test(e.message));
        }
      });
    }
  });

  await processor.handle({ jid, jobtype, args: [] });
});

// #2
test('.handle() FAILs when the job returns a rejected promise with no error', async t => {
  const jobtype = 'RejectedJob';
  const jid = 'wellhello';
  const processor = create({
    registry: {
      [jobtype]: async () => Promise.reject()
    },
    withConnection: (cb) => {
      cb({
        fail(failedJid, e) {
          t.is(failedJid, jid);
          t.truthy(e instanceof Error);
          t.truthy(/no error or message/i.test(e.message));
        }
      });
    }
  });

  await processor.handle({ jid, jobtype, args: [] });
});

test('.stop awaits in-progress job', async t => {
  const { queue, jobtype } = await push();

  const stop = await new Promise((resolve, reject) => {
    const processor = create({
      queues: [queue],
      registry: {
        [jobtype]: async (...args) => {
          resolve(async () => processor.stop());
          await sleep(10);
        }
      }
    });
    processor.ack = () => {
      t.pass();
    };

    processor.start();
  });
  await stop();
});

test('invokes middleware', async t => {
  const { queue, jobtype } = await push();

  await new Promise((resolve) => {
    const processor = create({
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

    processor.start();
  });
});

test('invokes middleware in order', async t => {
  const recorder = [];
  const { queue, jobtype } = await push();
  let processor;

  await new Promise((resolve) => {

    processor = create({
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
    processor.start();
  });

  await processor.stop();

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

test('.stop() breaks the work loop', async t => {
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

test('.sleep() sleeps', async t => {
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
