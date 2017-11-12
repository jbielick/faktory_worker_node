const test = require('ava');
const {
  createJob,
  createClient,
  queueName,
  withConnection: connect
} = require('faktory-client/test/support/helper');

const Manager = require('../lib/manager');

test('creates processor pool size of concurrency', t => {
  const concurrency = 10;
  const manager = create({ concurrency });
  t.is(manager.processors.length, concurrency, 'correct number of processors');
});

test('.quiet sends processors QUIET', async t => {
  const manager = create();

  manager.quiet();

  t.truthy(manager.processors.length, 'no processors to check');
  manager.processors.forEach((p) => {
    t.truthy(p._quiet, 'processor did not receive QUIET');
  })
});

test('.busy reports progressors currently working', async t => {
  const { queue, jobtype } = await push();

  await new Promise((resolve) => {
    const manager = create({
      concurrency: 1,
      queues: [queue],
      registry: {
        [jobtype]: async () => {
          t.is(manager.busy.length, 1, '.busy did not report job in progress');
          manager.stop();
          resolve();
        }
      }
    });

    manager.run();
  });
});

test('.stop allows in-progress jobs to finish', async t => {
  const { queue, jobtype } = await push();

  await new Promise((resolve) => {
    const manager = create({
      concurrency: 1,
      queues: [queue],
      shutdownTimeout: 100,
      registry: {
        [jobtype]: async () => {
          await sleep(50);
          t.pass();
          resolve();
        }
      }
    });

    manager.run();
    setTimeout(() => {
      manager.stop();
    }, 10);
  });
});

function create(...args) {
  return new Manager(...args);
}

async function push(opts = {}) {
  const queue = opts.queue || queueName();
  const jobtype = 'TestJob';
  const args = opts.args || [];
  await connect(async (client) => {
    await client.push({
      jobtype,
      queue,
      args
    });
  });
  return { queue, jobtype, args };
};

function sleep(ms, value = true) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
