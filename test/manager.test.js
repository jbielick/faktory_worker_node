const test = require('ava');
const {
  withConnection: connect,
  sleep,
  push,
  mocked,
  mockServer
} = require('./_helper');
const Manager = require('../lib/manager');

function create(options = {}) {
  return new Manager(Object.assign({concurrency: 1}, options));
}

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

test('.stop() allows in-progress jobs to finish', async t => {
  const { queue, jobtype } = await push();

  const stop = await new Promise(async (resolve) => {
    const manager = create({

      queues: [queue],
      timeout: 250,
      registry: {
        [jobtype]: async () => {
          resolve(async () => manager.stop());
          await sleep(100);
          t.pass();
        }
      }
    });

    manager.run();
  });
  await stop();
});

test('manager drains pool after stop timeout', async t => {
  const { queue, jobtype } = await push();

  await new Promise(async (resolve) => {
    const manager = create({

      queues: [queue],
      timeout: 50,
      registry: {
        [jobtype]: async () => {
          manager.stop();
          await sleep(100);
          t.truthy(manager.pool._draining);
          t.pass();
          resolve();
        }
      }
    });

    manager.run();
  });
});

test('manager stops when SIGTERM', async t => {
  t.plan(1);
  const manager = create();

  await manager.run();

  const originalStop = manager.stop.bind(manager);
  const promise = new Promise((resolve) => {
    manager.stop = () => {
      t.pass();
      originalStop();
      resolve();
    };
  });

  process.kill(process.pid, 'SIGTERM');

  return promise;
});

test('manager stops when SIGINT', async t => {
  t.plan(1);
  const manager = create();

  await manager.run();

  const originalStop = manager.stop.bind(manager);
  const promise = new Promise((resolve) => {
    manager.stop = () => {
      t.pass();
      originalStop();
      resolve();
    };
  });

  process.kill(process.pid, 'SIGINT');

  return promise;
});

test('manager quiets when SIGTSTP', async t => {
  t.plan(1);
  const manager = create();

  await manager.run();

  const originalQuiet = manager.quiet.bind(manager);
  const promise = new Promise((resolve) => {
    manager.quiet = () => {
      t.pass();
      originalQuiet();
      resolve();
    };
  });

  process.kill(process.pid, 'SIGTSTP');

  return promise;
});

test('.run() resolves with a manager', async t => {
  t.plan(1);
  await mocked(async (server, port) => {
    server
      .on('BEAT', (msg, socket) => {
        socket.write("+OK\r\n");
      })
      .on('FETCH', async (msg, socket) => {
        await sleep(100);
        socket.write("$-1\r\n");
      });
    const manager = create({ port, concurrency: 1 });
    const resolved = await manager.run();
    t.is(manager, resolved, '.run did not resolve with self');
    await manager.stop();
  });
});

test('quiets when the heartbeat response says so', async t => {
  t.plan(1);
  await mocked(async (server, port) => {
    server
      .on('BEAT', (msg, socket) => {
        socket.write('$17\r\n{"state":"quiet"}\r\n');
      })
      .on('FETCH', async (msg, socket) => {
        await sleep(100);
        socket.write("$-1\r\n");
      });
    const manager = create({ port, concurrency: 1 });

    const originalQuiet = manager.quiet.bind(manager);
    const promise = new Promise((resolve) => {
      manager.quiet = () => {
        t.pass();
        originalQuiet();
        manager.stop();
        resolve();
      };
    });

    await manager.run();
    await promise;
  });
});

test('stops when the heartbeat response says so', async t => {
  t.plan(1);
  await mocked(async (server, port) => {
    server
      .on('BEAT', (msg, socket) => {
        socket.write('$21\r\n{"state":"terminate"}\r\n');
      })
      .on('FETCH', async (msg, socket) => {
        await sleep(100);
        socket.write("$-1\r\n");
      });
    const manager = create({ port, concurrency: 1 });

    const originalStop = manager.stop.bind(manager);
    const promise = new Promise((resolve) => {
      manager.stop = () => {
        t.pass();
        originalStop();
        resolve();
      };
    });

    await manager.run();
    await promise;
  });
});

test.skip('sends a hearbeat on heartbeatInterval', async t => {
  const server = mockServer();
  let beats = 0;
  server.reply = async (msg) => {
    if (/beat/i.test(msg)) {
      beats += 1;
      return "+OK\r\n";
    } else if (/fetch/i.test(msg)) {
      await sleep(100);
      return "$-1\r\n";
    }
  };
  server.listen(7444, '127.0.0.1');
  const manager = create({heartbeatInterval: 20, port: 7444, concurrency: 1});

  manager.startHeartbeat();
  await sleep(60);

  t.is(beats, 2);

  await manager.stop();
  server.close();
});
