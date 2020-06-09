import test from "ava";

import { Worker, MiddlewareContext } from "../worker";
import { sleep, push, registerCleaner } from "./_helper";

registerCleaner(test);

test("invokes middleware", async (t) => {
  const { queue, jobtype } = await push();

  await new Promise((resolve) => {
    const worker = new Worker({
      concurrency: 1,
      queues: [queue],
      middleware: [
        (ctx, next) => {
          ctx.job.args = ["hello"];
          return next();
        },
      ],
      registry: {
        [jobtype]: (...args) => {
          t.deepEqual(args, ["hello"], "middleware not executed");
          resolve();
        },
      },
    });

    worker.work();
  });
});

test("invokes middleware in order", async (t) => {
  const recorder: string[] = [];
  const { queue, jobtype } = await push();
  const worker = new Worker({
    concurrency: 1,
    queues: [queue],
    middleware: [
      async (_, next) => {
        recorder.push("before 1");
        await next();
        recorder.push("after 1");
      },
      async (_, next) => {
        recorder.push("before 2");
        await next();
        recorder.push("after 2");
      },
    ],
  });

  await new Promise((resolve) => {
    worker.register(jobtype, async () => {
      recorder.push("run 1");
      await sleep(1);
      recorder.push("run 2");
      resolve();
    });
    worker.work();
  });

  await worker.stop();

  t.deepEqual(
    recorder,
    ["before 1", "before 2", "run 1", "run 2", "after 2", "after 1"],
    "middleware not executed in order"
  );
});

test(".use() adds middleware to the stack", (t) => {
  const worker = new Worker();
  const mmw = () => {};

  worker.use(mmw);

  t.is(
    worker.middleware[0],
    mmw,
    "middleware function not added to .middleware"
  );
});

type MyAppContext = {
  memo: string[];
} & MiddlewareContext;

test("middleware context is passed to job thunk", async (t) => {
  const { queue, jobtype } = await push({ args: [1] });
  const worker = new Worker({ queues: [queue], concurrency: 1 });

  worker.use((ctx: MyAppContext, next) => {
    ctx.memo = ["hello"];
    return next();
  });
  worker.use((ctx: MyAppContext, next) => {
    ctx.memo.push("world");
    return next();
  });

  await new Promise((resolve) => {
    worker.register(jobtype, (...args) => ({ memo }: { memo: string[] }) => {
      t.deepEqual(args, [1], "args not correct");
      t.deepEqual(memo, ["hello", "world"]);
      worker.stop();
      resolve();
    });
    worker.work();
  });
});
