const test = require('ava');
const { sleep, push } = require('./helper');
const {
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

  await new Promise(async (resolve) => {
    const manager = create({
      concurrency: 1,
      queues: [queue],
      timeout: 250,
      registry: {
        [jobtype]: async () => {
          manager.stop();
          manager.processors[0].ack = () => {
            // job should be ackd even after the manager
            // is given a .stop() command to drain the pool
            t.falsy(manager.pool._draining);
          }
          await sleep(100);
          resolve();
        }
      }
    });

    manager.run();
  });
});

test('manager drains pool after stop timeout', async t => {
  const { queue, jobtype } = await push();
  t.plan(2);

  await new Promise(async (resolve) => {
    const manager = create({
      concurrency: 1,
      queues: [queue],
      timeout: 50,
      registry: {
        [jobtype]: async () => {
          manager.stop();
          manager.processors[0].ack = () => {
            // processor will try to ack, but the pool
            // will be draining and throw an error.
            t.truthy(true);
          }
          await sleep(100);
          t.truthy(manager.pool._draining);
          resolve();
        }
      }
    });

    manager.run();
  });
});

function create(...args) {
  return new Manager(...args);
}
