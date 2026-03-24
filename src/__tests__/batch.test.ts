import test from "ava";
import { Client } from "../client";
import { Batch } from "../batch";
import { mocked } from "./_helper";

test("Batch: constructor sets defaults", (t) => {
  const client = new Client();
  const batch = new Batch(client, {
    description: "test batch",
  });
  t.is(batch.description, "test batch");
  t.is(batch.bid, "");
  t.is(batch.success, undefined);
  t.is(batch.complete, undefined);
});

test("Batch: toJSON serializes options", (t) => {
  const client = new Client();
  const successJob = client.job("OnSuccess");
  const completeJob = client.job("OnComplete");
  const batch = new Batch(client, {
    description: "test",
    success: successJob,
    complete: completeJob,
  });
  const json = batch.toJSON();
  t.is(json.description, "test");
  t.truthy(json.success);
  t.truthy(json.complete);
});

test("Batch: push throws if not opened", async (t) => {
  const client = new Client();
  const batch = new Batch(client);
  const job = client.job("TestJob");
  await t.throwsAsync(() => batch.push(job), {
    message: /must be opened/,
  });
});

test("Batch: push throws if already committed", async (t) => {
  await mocked(async (server, port) => {
    const bid = "b-test123";
    server.on("BATCH", mocked.bid(bid));
    server.on("PUSH", mocked.ok());

    const client = new Client({ port });
    const batch = client.batch({ description: "test" });
    await batch.jobs(async () => {
      await batch.push(client.job("TestJob"));
    });
    await t.throwsAsync(() => batch.push(client.job("TestJob")), {
      message: /already been committed/,
    });
  });
});

test("Batch: commit throws if already committed", async (t) => {
  await mocked(async (server, port) => {
    const bid = "b-test456";
    server.on("BATCH", mocked.bid(bid));

    const client = new Client({ port });
    const batch = client.batch({ description: "test" });
    await batch.jobs(async () => {});
    await t.throwsAsync(() => batch.commit(), {
      message: /already been committed/,
    });
  });
});

test("Batch: push sets custom.bid on job", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const bid = "b-push-test";
    server.on("BATCH", mocked.bid(bid));
    server.on("PUSH", ({ data, socket }) => {
      t.is(data.custom.bid, bid);
      socket.write("+OK\r\n");
    });

    const client = new Client({ port });
    const batch = client.batch();
    await batch.jobs(async () => {
      await batch.push(client.job("TestJob"));
    });
  });
});

test("Batch: jobs() sends BATCH NEW then BATCH COMMIT", async (t) => {
  const commands: string[] = [];
  await mocked(async (server, port) => {
    const bid = "b-lifecycle";
    server.on("BATCH", ({ data, socket }) => {
      const str = typeof data === "string" ? data : "";
      if (str.startsWith("NEW")) {
        commands.push("NEW");
        socket.write(`$${bid.length}\r\n${bid}\r\n`);
      } else if (str.startsWith("COMMIT")) {
        commands.push("COMMIT");
        socket.write("+OK\r\n");
      }
    });
    server.on("PUSH", ({ socket }) => {
      commands.push("PUSH");
      socket.write("+OK\r\n");
    });

    const client = new Client({ port });
    const batch = client.batch({ description: "lifecycle test" });
    await batch.jobs(async () => {
      await batch.push(client.job("TestJob"));
    });

    t.deepEqual(commands, ["NEW", "PUSH", "COMMIT"]);
    t.is(batch.bid, bid);
  });
});

test("client.batchOpen sends BATCH OPEN and returns usable batch", async (t) => {
  t.plan(1);
  await mocked(async (server, port) => {
    const bid = "b-reopen";
    server.on("BATCH", mocked.bid(bid));
    server.on("PUSH", ({ data, socket }) => {
      t.is(data.custom.bid, bid);
      socket.write("+OK\r\n");
    });

    const client = new Client({ port });
    const batch = await client.batchOpen(bid);
    await batch.push(client.job("MoreWork"));
    await batch.commit();
  });
});

test("client.batchStatus returns parsed status", async (t) => {
  await mocked(async (server, port) => {
    const bid = "b-status";
    server.on("BATCH", ({ data, socket }) => {
      const status = JSON.stringify({
        bid,
        total: 5,
        pending: 2,
        failed: 1,
        created_at: "2026-03-24T00:00:00Z",
        complete_st: "1",
        success_st: "",
      });
      socket.write(`$${status.length}\r\n${status}\r\n`);
    });

    const client = new Client({ port });
    const status = await client.batchStatus(bid);
    t.is(status.bid, bid);
    t.is(status.total, 5);
    t.is(status.pending, 2);
    t.is(status.failed, 1);
  });
});
