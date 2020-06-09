import test from "ava";

import { Worker } from "../faktory";
import { sleep, push, mocked, registerCleaner } from "./_helper";

registerCleaner(test);

const concurrency = 1;

function create(options = {}) {
  return new Worker(Object.assign({ concurrency }, options));
}

test(".quiet() stops job fetching", async (t) => {
  let fetched = 0;
  await mocked(async (server, port) => {
    server.once("BEAT", mocked.beat()).on("FETCH", (serverControl) => {
      fetched += 1;
      mocked.fetch(null)(serverControl);
    });

    const worker = create({ port });

    await worker.work();
    await sleep(20);
    const before = fetched;
    worker.quiet();
    await sleep(20);
    const after = fetched;
    t.truthy(fetched > 1);
    t.truthy(after - before < 2);
    worker.stop();
  });
});

test(".stop() breaks the work loop", async (t) => {
  let called = 0;
  const { queue, jobtype } = await push();
  await push({ queue, jobtype });

  const stop: Function = await new Promise((resolve) => {
    const worker = create({
      queues: [queue],
      registry: {
        [jobtype]: async () => {
          resolve(() => worker.stop());
          called += 1;
        },
      },
    });

    worker.work();
  });
  await stop();
  t.is(called, 1, "continued fetching after .stop");
});

test(".stop() allows in-progress jobs to finish", async (t) => {
  const { queue, jobtype } = await push();

  const stop: Function = await new Promise((resolve) => {
    const worker = create({
      queues: [queue],
      timeout: 250,
      registry: {
        [jobtype]: async () => {
          resolve(() => worker.stop());
          await sleep(100);
          t.pass();
        },
      },
    });

    worker.work();
  });
  await stop();
});

test("worker drains pool after stop timeout", async (t) => {
  const { queue, jobtype } = await push();
  let exited = false;

  const originalExit = process.exit;
  // @ts-ignore
  process.exit = (code?: number) => {
    exited = true;
    process.exit = originalExit;
  };

  await new Promise(async (resolve) => {
    const worker = create({
      queues: [queue],
      timeout: 0.05,
      registry: {
        [jobtype]: async () => {
          worker.stop();
          await sleep(100);
          t.truthy(exited);
          resolve();
        },
      },
    });

    worker.work();
  });
});

test.serial("SIGTERM stops the worker", async (t) => {
  t.plan(1);
  const worker = create();

  await worker.work();

  const originalStop = worker.stop.bind(worker);
  const promise = new Promise((resolve) => {
    worker.stop = async () => {
      t.pass();
      originalStop();
      resolve();
    };
  });

  process.kill(process.pid, "SIGTERM");

  await promise;
});

test.serial("SIGINT stops the worker", async (t) => {
  t.plan(1);
  const worker = create();

  await worker.work();

  const originalStop = worker.stop.bind(worker);
  const promise = new Promise((resolve) => {
    worker.stop = async () => {
      t.pass();
      originalStop();
      resolve();
    };
  });

  process.kill(process.pid, "SIGINT");

  await promise;
});

test.serial("SIGTSTP quiets the worker", async (t) => {
  t.plan(1);
  const worker = create();

  await worker.work();

  const originalQuiet = worker.quiet.bind(worker);
  const promise = new Promise((resolve) => {
    worker.quiet = () => {
      t.pass();
      originalQuiet();
      resolve();
    };
  });

  process.kill(process.pid, "SIGTSTP");

  await promise;
});

test("quiets when the heartbeat response says so", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    server.once("BEAT", mocked.beat("quiet")).on("FETCH", mocked.fetch(null));

    const worker = create({ port });

    const originalQuiet = worker.quiet.bind(worker);
    const promise = new Promise((resolve) => {
      worker.quiet = () => {
        t.pass();
        worker.quiet = originalQuiet;
        worker.stop();
        resolve();
      };
    });

    await worker.beat();
    await promise;
  });
});

test("stops when the heartbeat response says terminate", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    server.on("BEAT", mocked.beat("terminate")).on("FETCH", mocked.fetch(null));

    const worker = create({ port });

    const originalStop = worker.stop.bind(worker);
    const promise = new Promise((resolve) => {
      worker.stop = async () => {
        t.pass();
        originalStop();
        resolve();
      };
    });

    await worker.beat();
    await promise;
  });
});
