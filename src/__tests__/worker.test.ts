import test from "ava";

import Worker from "../worker";
import { mocked, registerCleaner } from "./_helper";

registerCleaner(test);

test("accepts queues as array", (t) => {
  const worker = new Worker({ queues: ["test"] });

  t.deepEqual(
    worker.queues,
    ["test"],
    "queue passed as string does not yield array"
  );
});

test("accepts queues as an array", (t) => {
  const worker = new Worker({ queues: ["test"] });

  t.deepEqual(
    worker.queues,
    ["test"],
    "queues passed as array does not yield array"
  );
});

test("adds default to an empty queue array", (t) => {
  const worker = new Worker({ queues: [] });

  t.deepEqual(worker.queues, ["default"]);
});

test("passes the password to the client", (t) => {
  const worker = new Worker({ password: "1234" });

  t.is(worker.client.password, "1234");
});

test("passes poolSize option to Client", (t) => {
  const worker = new Worker({ poolSize: 8 });

  t.is(worker.client.pool.size, 8);
});

test.only("allows registering job functions", async (t) => {
  await mocked(async (server, port) => {
    server
      .on("BEAT", mocked.beat())
      .on("ACK", mocked.ok())
      .on(
        "FETCH",
        mocked.fetch({ jid: "123", jobtype: "test", args: [], queue: "defaut" })
      );
    const worker = new Worker({ concurrency: 1, port });

    worker.register("test", () => t.pass());

    await worker.work();
    await worker.stop();
  });
});

test("hearbeats", async (t) => {
  await mocked(async (server, port) => {
    let worker: Worker;
    let called = 0;

    return new Promise((resolve) => {
      server
        .on("BEAT", ({ socket }) => {
          called += 1;
          if (called == 3) {
            t.pass();
            resolve();
            worker.stop();
          }
          mocked.beat()({ socket });
        })
        .on("FETCH", mocked.fetch(null));

      worker = new Worker({ concurrency: 1, port, beatInterval: 0.1 });
      worker.work();
    });
  });
});
