import test from "ava";

import { Client } from "../client";
import { Mutation, SCHEDULED, RETRIES, DEAD } from "../mutation";
import { mocked, registerCleaner } from "./_helper";

registerCleaner(test);

test("integration: #clear discards all retries", async (t) => {
  const client = new Client();
  await client.connect();
  await client.job("fail").push();
  const job = await client.fetch("default");
  if (!job) return t.fail("job not fetched");
  await client.fail(job.jid, new Error("test"));

  let info = await client.info();
  t.is(info.faktory.tasks.Retries.size, 1);

  await client.retries.clear();

  info = await client.info();
  t.is(info.faktory.tasks.Retries.size, 0);
  return;
});

test("integration: #kill moves retries to dead", async (t) => {
  const client = new Client();
  await client.connect();
  await client.job("fail").push();
  const job = await client.fetch("default");
  if (!job) return t.fail("job not fetched");
  await client.fail(job.jid, new Error("test"));

  let info = await client.info();
  t.is(info.faktory.tasks.Retries.size, 1);

  await client.retries.ofType("fail").kill();

  info = await client.info();
  t.is(info.faktory.tasks.Retries.size, 0);
  t.is(info.faktory.tasks.Dead.size, 1);

  await client.dead.ofType("fail").discard();

  info = await client.info();
  t.is(info.faktory.tasks.Retries.size, 0);
  t.is(info.faktory.tasks.Dead.size, 0);
  return;
});

test("integration: #kill moves scheduled to dead", async (t) => {
  const client = new Client();
  await client.connect();
  const job = client.job("fail", "unique");
  const date = new Date();
  date.setDate(date.getDate() + 1);
  job.at = date;
  await job.push();

  let info = await client.info();
  t.is(info.faktory.tasks.Scheduled.size, 1);
  t.is(info.faktory.tasks.Dead.size, 0);

  await client.scheduled.matching("*unique*").kill();

  info = await client.info();
  t.is(info.faktory.tasks.Dead.size, 1);
});

test("integration: #requeue moves retries to queue", async (t) => {
  const client = new Client();
  await client.connect();
  await client.job("fail").push();
  const job = await client.fetch("default");
  if (!job) return t.fail("job not fetched");
  await client.fail(job.jid, new Error("test"));

  let info = await client.info();
  t.is(info.faktory.tasks.Retries.size, 1);

  await client.retries.withJids(job.jid).requeue();

  info = await client.info();
  t.is(info.faktory.queues.default, 1);
  t.is(info.faktory.tasks.Retries.size, 0);
  t.is(info.faktory.tasks.Dead.size, 0);
  return;
});

test("#clear clears retries", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "clear",
        target: RETRIES,
        filter: {
          jobtype: "clearsRetries",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.retries
      .ofType("clearsRetries")
      .withJids(["123"])
      .matching("*Not Found*")
      .clear();
  });
});

test("#clear clears scheduled jobs", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "clear",
        target: SCHEDULED,
        filter: {
          jobtype: "clearsScheduled",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.scheduled
      .ofType("clearsScheduled")
      .withJids(["123"])
      .matching("*Not Found*")
      .clear();
  });
});

test("#clear clears dead jobs", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "clear",
        target: DEAD,
        filter: {
          jobtype: "clearsDead",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.dead
      .ofType("clearsDead")
      .withJids(["123"])
      .matching("*Not Found*")
      .clear();
  });
});

test("#kill kills retries", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "kill",
        target: RETRIES,
        filter: {
          jobtype: "killsRetries",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.retries
      .ofType("killsRetries")
      .withJids(["123"])
      .matching("*Not Found*")
      .kill();
  });
});

test("#kill kills scheduled jobs", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "kill",
        target: SCHEDULED,
        filter: {
          jobtype: "killsScheduled",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.scheduled
      .ofType("killsScheduled")
      .withJids(["123"])
      .matching("*Not Found*")
      .kill();
  });
});

test("#kill kills dead jobs", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "kill",
        target: DEAD,
        filter: {
          jobtype: "killsDead",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.dead
      .ofType("killsDead")
      .withJids(["123"])
      .matching("*Not Found*")
      .kill();
  });
});

test("#discard discards retries", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "discard",
        target: RETRIES,
        filter: {
          jobtype: "discardsRetries",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.retries
      .ofType("discardsRetries")
      .withJids(["123"])
      .matching("*Not Found*")
      .discard();
  });
});

test("#discard discards scheduled jobs", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "discard",
        target: SCHEDULED,
        filter: {
          jobtype: "discardsScheduled",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.scheduled
      .ofType("discardsScheduled")
      .withJids(["123"])
      .matching("*Not Found*")
      .discard();
  });
});

test("#discard discards dead jobs", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "discard",
        target: DEAD,
        filter: {
          jobtype: "discardsDead",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.dead
      .ofType("discardsDead")
      .withJids(["123"])
      .matching("*Not Found*")
      .discard();
  });
});

test("#requeue requeues retries", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "requeue",
        target: RETRIES,
        filter: {
          jobtype: "requeuesRetries",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.retries
      .ofType("requeuesRetries")
      .withJids(["123"])
      .matching("*Not Found*")
      .requeue();
  });
});

test("#requeue requeues scheduled jobs", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "requeue",
        target: SCHEDULED,
        filter: {
          jobtype: "requeuesScheduled",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.scheduled
      .ofType("requeuesScheduled")
      .withJids(["123"])
      .matching("*Not Found*")
      .requeue();
  });
});

test("#requeue requeues dead jobs", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const client = new Client({ port });

    server.on("MUTATE", ({ data, socket }) => {
      t.deepEqual(data, {
        cmd: "requeue",
        target: DEAD,
        filter: {
          jobtype: "requeuesDead",
          jids: ["123"],
          regexp: "*Not Found*",
        },
      });
      socket.write("+OK\r\n");
    });

    await client.dead
      .ofType("requeuesDead")
      .withJids(["123"])
      .matching("*Not Found*")
      .requeue();
  });
});

test("#matching disallows nonstrings", (t) => {
  t.throws(
    () => {
      const mutation = new Mutation(new Client());
      // @ts-ignore
      mutation.matching(new RegExp("something"));
    },
    { message: /redis SCAN/ }
  );
});

test("#ofType disallows nonstring argument", (t) => {
  t.throws(
    () => {
      const mutation = new Mutation(new Client());
      const MyJob = () => { };
      // @ts-ignore
      mutation.ofType(MyJob);
    },
    {
      message: /must be a string/i,
    }
  );
});
