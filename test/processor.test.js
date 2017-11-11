const test = require('ava');
const {
  spawnFaktory,
  shutdownFaktory,
  createJob,
  createClient,
  queueName,
  withConnection: connect
} = require('faktory-client/test/support/helper');
const Processor = require('../lib/processor');

test.before(async () => {
  await spawnFaktory();
});

test.after.always(async () => {
  await connect(async (client) => {
    await client.flush();
  });
  shutdownFaktory();
});

test.cb('works with args', (t) => {
  const jobtype = 'MyDoWorkJob';
  const queue = queueName();

  connect(async (client) => {
    client.push({
      jobtype,
      queue,
      args: [1, 2, 'three']
    });
  });

  const processor = create({
    queues: [queue],
    registry: {
      [jobtype]: createJobFn(t)
    }
  });

  processor.run();
  processor.client.socket.unref();
});

test('takes queues as array or string', (t) => {
  let processor;

  processor = create({
    queues: 'test'
  });

  t.deepEqual(processor.queues, ['test']);

  processor = create({
    queues: ['test']
  });

  t.deepEqual(processor.queues, ['test']);
});

test.cb('works with args and job thunk', (t) => {
  const jobtype = 'MyDoWorkJob2';

  connect(async (client) => {
    client.push({
      jobtype,
      queue: 'default',
      args: [1, 2, 'three']
    });
  });

  const processor = create({
    registry: {
      [jobtype]: createJobWithThunkFn(t)
    }
  });

  processor.run();
  processor.client.socket.unref();
});

test('FAILs and throws when no job is registered', async (t) => {
  const processor = create();
  const jid = 'wellhello';

  processor.client.fail = (failed_jid, e) => {
    t.is(failed_jid, jid);
  };

  await t.throws(processor.dispatch({
    jid,
    jobtype: 'NonExistant'
  }), );
});

test('FAILs and throws when the job throws during perform', async (t) => {
  const jobtype = 'FailingJob';
  const processor = create({
    registry: {
      [jobtype]: () => { throw new Error('always fails') }
    }
  });

  const jid = 'wellhello';

  processor.client.fail = (failed_jid, e) => {
    t.is(failed_jid, jid);
  };

  await t.throws(
    processor.dispatch({ jid, jobtype, args: [] }),
    /always fails/,
    'throws the proper error'
  );
});

test('stop shuts job processing down', async (t) => {
  const processor = create({
    queues: ['nonexist']
  });
  await processor.run();
  await processor.stop();
  t.pass();
});

test('sleep sleeps', async (t) => {
  let pass = false;
  setTimeout(() => {
    pass = true;
  }, 2);
  await Processor.sleep(5);
  if (pass) {
    t.pass('slept');
  }
});

test.skip('shuts down gracefully SIGINT', async (t) => {
  const processor = create();
  await processor.run();
  // process.kill(process.pid, 'SIGINT');
  t.pass();
});

function create(opts) {
  return new Processor(opts);
}

process.on('exit', () => {
  shutdownFaktory();
});

function sleep(ms, value = true) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(value), ms);
  });
}

function createJobFn(t) {
  return async (...args) => {
    t.is(await sleep(1, 'slept'), 'slept', 'awaits promises');
    t.deepEqual(args, [1, 2, 'three'], 'arguments are correct');
    t.end();
  }
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
