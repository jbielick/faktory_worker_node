import test from "ava";

import {
  Worker,
  MiddlewareContext,
  CLEANUP_DELAY_MS,
  SHUTDOWN_TIMEOUT_EXCEEDED_MSG,
  WorkerOptions,
} from "../worker";
import {
  sleep,
  push,
  mocked,
  registerCleaner,
  randQueue,
  ServerControl,
} from "./_helper";
import { setTimeout } from "timers/promises";
import { JobPayload } from "../job";

registerCleaner(test);

const concurrency = 1;

function create(options: WorkerOptions = {}) {
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

test("worker exits the process after stop timeout", async (t) => {
  const { queue, jobtype } = await push();
  let exited = false;

  await new Promise<void>(async (resolve) => {
    const originalExit = process.exit;
    // @ts-ignore
    process.exit = (code?: number) => {
      exited = true;
      resolve();
      process.exit = originalExit;
    };
    const worker = create({
      queues: [queue],
      timeout: 0.05,
      registry: {
        [jobtype]:
          () =>
          async ({ signal }: MiddlewareContext) => {
            worker.stop();
            await setTimeout(5000, undefined, { signal });
          },
      },
    });

    await worker.work();
  });
  t.assert(exited);
});

test.serial.skip("SIGTERM stops the worker", async (t) => {
  t.plan(1);
  const worker = create();

  await worker.work();

  const originalStop = worker.stop.bind(worker);
  const promise = new Promise<void>((resolve) => {
    worker.stop = async () => {
      t.pass();
      originalStop();
      resolve();
    };
  });

  process.kill(process.pid, "SIGTERM");

  await promise;
});

test.serial.skip("SIGINT stops the worker", async (t) => {
  t.plan(1);
  const worker = create();

  await worker.work();

  const originalStop = worker.stop.bind(worker);
  const promise = new Promise<void>((resolve) => {
    worker.stop = async () => {
      t.pass();
      originalStop();
      resolve();
    };
  });

  process.kill(process.pid, "SIGINT");

  await promise;
});

test.serial.skip("SIGTSTP quiets the worker", async (t) => {
  t.plan(1);
  const worker = create();

  await worker.work();

  const originalQuiet = worker.quiet.bind(worker);
  const promise = new Promise<void>((resolve) => {
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
    const promise = new Promise<void>((resolve) => {
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
    const promise = new Promise<void>((resolve) => {
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

test("job context AbortSignal is sent when shutdown timeout is reached", async (t) => {
  t.plan(2);
  const args = [1, 2, "three"];
  const { queue, jobtype, jid } = await push({ args });
  const worker = create({ queues: [queue], timeout: 0.05 });
  let exitCode: number | null = null;

  await new Promise<void>(async (resolve, reject) => {
    const originalExit = process.exit;
    // @ts-ignore
    process.exit = (code?: number = 0) => {
      exitCode = code;
      process.exit = originalExit;
      resolve();
    };
    const listening = new Promise<void>(async (isListening) => {
      worker.register(
        jobtype,
        async (...args) =>
          async ({ job, signal }: MiddlewareContext) => {
            signal.addEventListener(
              "abort",
              (reason) => {
                t.assert(
                  signal.reason.message == SHUTDOWN_TIMEOUT_EXCEEDED_MSG
                );
              },
              { once: true }
            );
            isListening();
            await setTimeout(500, undefined);
          }
      );
    });
    worker.work();
    await listening;
    worker.stop();
  });
  t.assert(exitCode === 1);
});

test("jobs are FAILed after the AbortSignal is sent during a hard shutdown", async (t) => {
  const args = [1, 2, "three"];
  const queue = randQueue();
  const jobtype = "sleepy";
  const events: string[] = [];
  let exitCode: number | null = null;
  const jobs = [
    await push({ args, queue, jobtype }),
    await push({ args, queue, jobtype }),
  ];
  const fetched = jobs.slice();
  let failed: Map<string, JobPayload> = new Map();
  let started = 0;

  await mocked(async (server, port) => {
    await new Promise<void>(async (resolve) => {
      const originalExit = process.exit;
      // @ts-ignore
      process.exit = (code?: number = 0) => {
        events.push("EXIT");
        exitCode = code;
        process.exit = originalExit;
        resolve();
      };
      server
        .on("BEAT", mocked.beat())
        .on("FETCH", ({ socket }) => {
          events.push("FETCH");
          const job = fetched.pop();
          if (!job) {
            throw new Error("too many fetches");
          }
          return mocked.fetch(job)({ socket });
        })
        .on(
          "FAIL",
          ({
            data,
            socket,
          }: {
            data: JobPayload;
            socket: ServerControl["socket"];
          }) => {
            events.push("FAIL");
            failed.set(data.jid, data);
            return mocked.fail()({ socket });
          }
        );

      const worker = create({
        concurrency: 2,
        queues: [queue],
        port,
        timeout: 0.05,
        registry: {
          [jobtype]:
            async () =>
            async ({ signal }: MiddlewareContext) => {
              events.push("START");
              started += 1;
              if (started == 2) {
                // request stop after both are in progress (and sleeping)
                events.push("STOP");
                worker.stop();
              }
              try {
                await setTimeout(5000, undefined);
              } finally {
                // never reached because we cannot interrupt the timeout
                events.push("FINALLY");
              }
            },
        },
      });
      events.push("WORK");
      await worker.work();
    });
    t.is(failed.size, 2);
    t.deepEqual(events, [
      "WORK",
      "FETCH",
      "START",
      "FETCH",
      "START",
      "STOP",
      "FAIL",
      "FAIL",
      "EXIT",
    ]);
    t.notDeepEqual(
      failed.keys(),
      jobs.map((j) => j.jid)
    );
  });
});

test("jobs are FAILed after the AbortSignal is sent during a hard shutdown and have time to clean up", async (t) => {
  const args = [1, 2, "three"];
  const queue = randQueue();
  const jobtype = "sleepy";
  const events: string[] = [];
  let exitCode: number | null = null;
  const jobs = [
    await push({ args, queue, jobtype }),
    await push({ args, queue, jobtype }),
  ];
  const fetched = jobs.slice();
  let failed: Map<string, JobPayload> = new Map();
  let started = 0;

  await mocked(async (server, port) => {
    await new Promise<void>(async (resolve) => {
      const originalExit = process.exit;
      // @ts-ignore
      process.exit = (code?: number = 0) => {
        events.push("EXIT");
        exitCode = code;
        process.exit = originalExit;
        resolve();
      };
      server
        .on("BEAT", mocked.beat())
        .on("FETCH", ({ socket }) => {
          events.push("FETCH");
          const job = fetched.pop();
          if (!job) {
            throw new Error("too many fetches");
          }
          return mocked.fetch(job)({ socket });
        })
        .on(
          "FAIL",
          ({
            data,
            socket,
          }: {
            data: JobPayload;
            socket: ServerControl["socket"];
          }) => {
            events.push("FAIL");
            failed.set(data.jid, data);
            return mocked.fail()({ socket });
          }
        )
        .on("ACK", ({ socket }: { socket: ServerControl["socket"] }) => {
          events.push("ACK");
          return mocked.ok()({ socket });
        });

      const worker = create({
        concurrency: 2,
        queues: [queue],
        port,
        timeout: 0.05,
        registry: {
          [jobtype]:
            async () =>
            async ({ signal }: MiddlewareContext) => {
              events.push("START");
              started += 1;
              if (started == 2) {
                // request stop after both are in progress (and sleeping)
                events.push("STOP");
                worker.stop();
              }
              try {
                // this settimeout will be interrupted with an ABORT_ERR
                // it is not caught, so it is propagated to the handler
                // and naturally FAILs
                await setTimeout(5000, undefined, { signal });
              } catch (e) {
                // error is suppressed
              } finally {
                // this has a chance to run before exit
                events.push("FINALLY");
                // if something is placed on the event loop, it will occur after the job is FAILed
                await sleep(50);
                events.push("FINALLY AFTER ASYNC");
              }
            },
        },
      });
      events.push("WORK");
      await worker.work();
    });
    t.is(failed.size, 2);
    t.deepEqual([...failed.keys()].sort(), jobs.map((j) => j.jid).sort());
    t.deepEqual(events, [
      "WORK",
      "FETCH",
      "START",
      "FETCH",
      "START",
      "STOP",
      "FINALLY",
      "FINALLY",
      "FAIL",
      "FAIL",
      "FINALLY AFTER ASYNC",
      "FINALLY AFTER ASYNC",
      "EXIT",
    ]);
  });
});
