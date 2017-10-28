const test = require('ava');
const {
  spawnFaktory,
  shutdownFaktory,
  createJob,
  createClient,
  queueName,
  withConnection: connect
} = require('faktory-client/test/support/helper');
const Manager = require('../manager');

(async () => {

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

    const manager = create({
      queues: [queue],
      registry: {
        [jobtype]: createJobFn(t)
      }
    });

    manager.run().then(() => {
      manager.stop();
    });
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

    const manager = create({
      registry: {
        [jobtype]: createJobFn(t)
      }
    });

    manager.run().then(() => {
      manager.stop();
    });
  });

  test('FAILs and throws when no job is registered', async (t) => {
    const manager = create();
    const jid = 'wellhello';

    manager.client.fail = (failed_jid, e) => {
      t.is(failed_jid, jid);
    };

    await t.throws(manager.dispatch({
      jid,
      jobtype: 'NonExistant'
    }), );
  });

  test('FAILs and throws when the job throws during perform', async (t) => {
    const jobtype = 'FailingJob';
    const manager = create({
      registry: {
        [jobtype]: () => { throw new Error('always fails') }
      }
    });

    const jid = 'wellhello';

    manager.client.fail = (failed_jid, e) => {
      t.is(failed_jid, jid);
    };

    await t.throws(
      manager.dispatch({ jid, jobtype, args: [] }),
      /always fails/,
      'throws the proper error'
    );
  });

})();

function create(opts) {
  return new Manager(opts);
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
  }
}
