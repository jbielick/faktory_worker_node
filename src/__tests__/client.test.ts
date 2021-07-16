import test from "ava";
import { Client } from "../client";
import { Job, JobPayload } from "../job";
import { mocked, registerCleaner } from "./_helper";


registerCleaner(test);

test("#new: host defaults to localhost", (t) => {
  const client = new Client();
  t.is(client.connectionFactory.host, "localhost");
});

test("#new: port defaults to 7419", (t) => {
  const client = new Client();
  t.is(client.connectionFactory.port, "7419");
});

test("#buildHello: client builds a passwordless ahoy", (t) => {
  const client = new Client();

  const hello = client.buildHello({ i: 3, s: "123", v: 3 });

  t.truthy(hello.hostname, "hostname is present");
});

test("#buildHello: client builds a salty ahoy", (t) => {
  const client = new Client({
    password: "abcde123",
  });

  const hello = client.buildHello({ i: 3, s: "123", v: 3 });

  t.is(
    hello.pwdhash,
    "ef646abadf4ffba660d9bbb8de8e45576970de917b4c9da8cad96b49e64636d9"
  );
});

test("#buildHello: wid is present in HELLO", (t) => {
  const client = new Client({ wid: "workerid" });

  const hello = client.buildHello({ v: 2, s: "abc", i: 3 });

  t.is(hello.wid, client.wid, "wid in ahoy does not match");
});

test("#buildHello: pid is present when wid is given in ahoy", (t) => {
  const client = new Client();

  const hello = client.buildHello({ i: 3, s: "123", v: 3 });

  t.truthy(!hello.pid, "pid should not be present");
});

test("#buildHello: labels are passed in ahoy", (t) => {
  const labels = ["hippo"];
  const client = new Client({ labels, wid: "something" });

  const hello = client.buildHello({ i: 3, s: "123", v: 3 });

  t.deepEqual(hello.labels, labels, "hello does not includes labels correctly");
});

test(".assertVersion: does not throw when version matches supported", (t) => {
  t.notThrows(() => {
    Client.assertVersion(2);
  });
});

test(".assertVersion: throws when version does not match supported", (t) => {
  t.throws(() => {
    Client.assertVersion(4);
  });
});

test("#new: unescapes password in url", (t) => {
  const client = new Client({ url: "tcp://:abcd=@somehost:7419" });

  t.is(client.password, "abcd=");
});

test("#info: sends info and parses response", async (t) => {
  const client = new Client();

  const info = await client.info();

  t.truthy(info.faktory);
  t.truthy(info.server_utc_time);
});

test("#info: client subsequent serial requests", async (t) => {
  t.plan(5);
  const client = new Client();

  for (let i = 5; i > 0; i -= 1) {
    t.truthy(await client.info(), `reply for info #${i} not ok`);
  }
});

test("#push: pushes serially", async (t) => {
  t.plan(4);
  const client = new Client();

  for (let i = 4; i > 0; i -= 1) {
    t.truthy(await client.job("test", i).push());
  }
});

test("#push: pushes concurrently", async (t) => {
  const client = new Client();
  const args = [0, 1, 2, 3, 4];

  Promise.all(args.map((arg) => client.job("test", arg).push()));

  t.pass();
});

test("#push: accepts a Job object", async (t) => {
  const client = new Client();
  const job = client.job("test");

  t.is(await client.push(job), job.jid);
});

test("#fetch: fetches jobs", async (t) => {
  const client = new Client();
  const job = client.job("test");
  await job.push();

  const fetched = await client.fetch(job.queue);
  if (!fetched) return t.fail("job not fetched");

  t.truthy(fetched);
  t.is(fetched.jid, job.jid);
  t.deepEqual(fetched.args, job.args);
  t.is(fetched.jobtype, job.jobtype);
});

test("#beat: sends a heartbeat", async (t) => {
  const client = new Client({ wid: "123" });

  const resp = await client.beat();

  t.is(resp, "OK");
});

test("#beat: returns a signal from the server", async (t) => {
  await mocked(async (server, port) => {
    server.on("BEAT", mocked.beat("quiet"));
    const client = new Client({ port });

    const resp = await client.beat();

    t.is(resp, "quiet");
  });
});

test("#connect: rejects connect when connection cannot be established", async (t) => {
  const client = new Client({ url: "tcp://localhost:1" });

  await t.throwsAsync(client.connect(), { message: /ECONNREFUSED/ });
});

test("#connect: rejects if handshake is not successful", async (t) => {
  const client = new Client();
  client.buildHello = () => {
    throw new Error("test");
  };
  await t.throwsAsync(client.connect(), { message: /test/i });
});

test("#connect: connects explicitly", async (t) => {
  t.plan(2);
  await mocked(async (server, port) => {
    server
      .on("HELLO", () => {
        t.is(1, 1);
      })
      .on("END", () => {
        t.is(1, 1);
      });
    const client = new Client({ port });

    await client.connect();
    return client.close();
  });
});

test("#job: returns a Job", (t) => {
  const client = new Client();

  t.truthy(client.job("test") instanceof Job);
});

test("#ack: ACKs a job", async (t) => {
  const client = new Client();
  const job = client.job("jobtype");
  await job.push();
  const fetched = await client.fetch(job.queue);
  if (!fetched) return t.fail("job not fetched");

  t.is(await client.ack(fetched.jid), "OK");
});

test("#fetch: returns null when queue is empty", async (t) => {
  await mocked(async (server, port) => {
    server.on("FETCH", ({ socket }) => {
      // null bulkstring
      socket.write("$-1\r\n");
    });
    const client = new Client({ port });
    const fetched = await client.fetch("default");
    t.is(fetched, null);
  });
});

test("#push: defaults job payload values according to spec", async (t) => {
  let serverJob: JobPayload;
  await mocked(async (server, port) => {
    server.on("PUSH", ({ data, socket }) => {
      serverJob = data;
      socket.write("+OK\r\n");
    });
    const jobtype = "TestJob";
    const client = new Client({ port });
    const jid = await client.push({ jobtype });
    t.deepEqual(serverJob, {
      jid,
      jobtype: "TestJob",
      queue: "default",
      args: [],
      priority: 5,
      retry: 25,
    });
  });
});

test("#fail: FAILs a job", async (t) => {
  const client = new Client();
  const job = client.job("test");
  await job.push();

  const fetched = await client.fetch(job.queue);
  if (!fetched) return t.fail("job not fetched");

  t.is(await client.fail(fetched.jid, new Error("EHANGRY")), "OK");
});

test("#fail: FAILs a job without a stack", async (t) => {
  // #29
  const client = new Client();
  const job = client.job("test");
  await job.push();

  const fetched = await client.fetch(job.queue);
  if (!fetched) return t.fail("job not fetched");

  const error = new Error("EHANGRY");
  delete error.stack;

  t.is(await client.fail(fetched.jid, error), "OK");
});

test("#fail: FAILs a job with a non-string error code", async (t) => {
  const client = new Client();
  const job = client.job("test");
  await job.push();

  const fetched = await client.fetch(job.queue);
  if (!fetched) return t.fail("job not fetched");

  class CustomError extends Error {
    public readonly code;

    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  }

  const error = new CustomError(1234 ,"ETOOMANYDIGITS");

  t.is(await client.fail(fetched.jid, error), "OK");
});

test("#job: returns a job builder", (t) => {
  const client = new Client();
  const job = client.job("MyTestJob");

  t.truthy(job instanceof Job);
});

test("#job: provides the client to the job", (t) => {
  const client = new Client();
  const job = client.job("MyTestJob");

  t.is(job.client, client);
});

test("#job: provides the args to the job", (t) => {
  const client = new Client();
  const job = client.job("MyTestJob", 1, 2, 3);

  t.deepEqual(job.args, [1, 2, 3]);
});

test("#job: push sends job specification to server", async (t) => {
  await mocked(async (server, port) => {
    server.on("PUSH", ({ data, socket }) => {
      socket.write("+OK\r\n");
      const { jobtype, args, custom, retry } = data;
      t.is(jobtype, "MyJob");
      t.deepEqual(args, [1, 2, 3]);
      t.deepEqual(custom, { locale: "en-us" });
      t.is(retry, -1);
    });
    const client = new Client({ port });
    const job = client.job("MyJob", 1, 2, 3);

    job.retry = -1;
    job.custom = { locale: "en-us" };

    await job.push();
  });
});

test("#job: push resolves with the jid", async (t) => {
  await mocked(async (server, port) => {
    server.on("PUSH", ({ data, socket }) => {
      socket.write("+OK\r\n");
    });
    const client = new Client({ port });

    const jid = await client.job("MyJob").push();

    t.truthy(/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/.test(jid));
  });
});

test.skip('shutdown: shutsdown before timeout', async (t) => {

});
