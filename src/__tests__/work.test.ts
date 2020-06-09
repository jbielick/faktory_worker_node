import test from "ava";

import { Worker, WorkerOptions, MiddlewareContext } from "../worker";
import { sleep, push, mocked, registerCleaner } from "./_helper";

const concurrency = 1;

registerCleaner(test);

function create(options: WorkerOptions = {}): Worker {
  return new Worker(Object.assign({ concurrency }, options));
}

test("passes args to jobfn", async (t) => {
  const args = [1, 2, "three"];
  const { queue, jobtype } = await push({ args });

  await new Promise((resolve) => {
    const worker = create({
      queues: [queue],
      registry: {
        [jobtype]: (...args) => {
          t.deepEqual(args, [1, 2, "three"], "args do not match");
          resolve();
        },
      },
    });

    worker.work();
  });
});

test("awaits async jobfns", async (t) => {
  const args = [1, 2, "three"];
  const { queue, jobtype } = await push({ args });

  await new Promise((resolve) => {
    const worker = create({
      queues: [queue],
      registry: {
        [jobtype]: async (...args: unknown[]) => {
          await sleep(1);
          t.deepEqual(args, [1, 2, "three"], "args do not match");
          resolve();
        },
      },
    });

    worker.work();
  });
});

test("handles sync jobfn and sync thunk", async (t) => {
  const args = [1, 2, "three"];
  const { queue, jobtype, jid } = await push({ args });

  await new Promise((resolve) => {
    const worker = create({
      queues: [queue],
      registry: {
        [jobtype]: (...args) => ({ job }: MiddlewareContext) => {
          t.is(job.jid, jid, "jid does not match");
          t.deepEqual(args, [1, 2, "three"], "args do not match");
          resolve();
        },
      },
    });

    worker.work();
  });
});

test("handles sync jobfn and async (thunk)", async (t) => {
  const args = [1, 2, "three"];
  const { queue, jobtype, jid } = await push({ args });

  await new Promise((resolve) => {
    const worker = create({
      queues: [queue],
      registry: {
        [jobtype]: (...args) => async ({ job }: MiddlewareContext) => {
          await sleep(1);
          t.is(job.jid, jid, "jid does not match");
          t.deepEqual(args, [1, 2, "three"], "args do not match");
          resolve();
        },
      },
    });

    worker.work();
  });
});

test("handles async jobfn and sync thunk", async (t) => {
  const args = [1, 2, "three"];
  const { queue, jobtype, jid } = await push({ args });
  const worker = create({ queues: [queue] });

  await new Promise(async (resolve) => {
    worker.register(
      jobtype,
      async (...args) => ({ job }: MiddlewareContext) => {
        t.is(job.jid, jid, "jid does not match");
        t.deepEqual(args, [1, 2, "three"], "args do not match");
        resolve();
      }
    );

    await worker.work();
    await worker.stop();
  });
});

test("handles async jobfn and async thunk", async (t) => {
  const args = [1, 2, "three"];
  const { queue, jobtype, jid } = await push({ args });

  await new Promise((resolve) => {
    const worker = create({
      queues: [queue],
      registry: {
        [jobtype]: async (...args) => async ({ job }: MiddlewareContext) => {
          await sleep(1);
          t.is(job.jid, jid, "jid does not match");
          t.deepEqual(args, [1, 2, "three"], "args do not match");
          resolve();
        },
      },
    });

    worker.work();
  });
});

test(".handle() FAILs and throws when no job is registered", async (t) => {
  const job = { jid: "123", jobtype: "Unknown", args: [], queue: "default" };
  await mocked(async (server, port) => {
    let worker: Worker;

    return new Promise((resolve) => {
      server
        .on("BEAT", mocked.beat())
        .on("FETCH", mocked.fetch(job))
        .on("FAIL", ({ data }) => {
          t.is(data.jid, job.jid);
          worker.stop();
          resolve();
        });
      worker = create({ port });
      worker.work();
    });
  });
});

test(".handle() FAILs and throws when the job throws (sync) during execution", async (t) => {
  const jid = "123";
  const jobtype = "failingjob";
  const queue = "default";
  const job = { jid, jobtype, args: [], queue };
  await mocked(async (server, port) => {
    let worker: Worker;

    return new Promise((resolve) => {
      server
        .on("BEAT", mocked.beat())
        .on("FETCH", mocked.fetch(job))
        .on("FAIL", ({ data }) => {
          t.is(data.jid, jid);
          t.truthy(/always fails/.test(data.message));
          worker.stop();
          resolve();
        });
      worker = create({
        port,
        registry: {
          [jobtype]: () => {
            throw new Error("always fails");
          },
        },
      });
      worker.work();
    });
  });
});

// #2
test(".handle() FAILs and throws when the job rejects (async) during execution", async (t) => {
  const jid = "123";
  const jobtype = "failingjob";
  const queue = "default";
  const job = { jid, jobtype, args: [], queue };
  await mocked(async (server, port) => {
    let worker: Worker;

    return new Promise((resolve) => {
      server
        .on("BEAT", mocked.beat())
        .on("FETCH", mocked.fetch(job))
        .on("FAIL", ({ data }) => {
          t.is(data.jid, jid);
          t.truthy(/rejected promise/.test(data.message));
          worker.stop();
          resolve();
        });
      worker = create({
        port,
        registry: {
          [jobtype]: async () => {
            throw new Error("rejected promise");
          },
        },
      });
      worker.work();
    });
  });
});

// #2
test(".handle() FAILs when the job returns a rejected promise with no error", async (t) => {
  const jid = "123";
  const jobtype = "failingjob";
  const queue = "default";
  const job = { jid, jobtype, args: [], queue };
  await mocked(async (server, port) => {
    let worker: Worker;

    return new Promise((resolve) => {
      server
        .on("BEAT", mocked.beat())
        .on("FETCH", mocked.fetch(job))
        .on("FAIL", ({ data }) => {
          t.is(data.jid, jid);
          t.truthy(/no error or message/.test(data.message));
          worker.stop();
          resolve();
        });
      worker = create({
        port,
        registry: {
          [jobtype]: async () => Promise.reject(),
        },
      });
      worker.work();
    });
  });
});
