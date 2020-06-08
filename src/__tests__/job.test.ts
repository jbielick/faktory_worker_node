import test from "ava";
import Job from '../job';
import Client from "../client";

test(".jid: generates a uuid jid", (t) => {
  t.truthy(Job.jid().length > 8);
});

test("get jid: returns generated jid", (t) => {
  const job = new Job("test", new Client());

  t.truthy(job.jid);
});

test("set jid: sets the jid", (t) => {
  const job = new Job("test", new Client());

  job.jid = "123";

  t.is(job.jid, "123");
});

test("get jobtype: returns jobtype", (t) => {
  const job = new Job("test", new Client());

  t.is(job.jobtype, "test");
});

test("set jobtype: sets jobtype", (t) => {
  const job = new Job("test", new Client());

  job.jobtype = "other";

  const data = job.toJSON();
  t.is(data.jobtype, "other");
});

test("get queue: returns queue default", (t) => {
  const job = new Job("test", new Client());

  t.is(job.queue, "default");
});

test("set queue: sets the queue", (t) => {
  const job = new Job("test", new Client());

  job.queue = "new";

  const data = job.toJSON();
  t.is(data.queue, "new");
});

test("get args: returns args default", (t) => {
  const job = new Job("test", new Client());

  t.deepEqual(job.args, []);
});

test("set args: sets the args", (t) => {
  const job = new Job("test", new Client());

  job.args = [1, 2, 3];

  const data = job.toJSON();
  t.deepEqual(data.args, [1, 2, 3]);
});

test("get priority: returns priority default", (t) => {
  const job = new Job("test", new Client());

  t.is(job.priority, 5);
});

test("set priority: sets the priority", (t) => {
  const job = new Job("test", new Client());

  job.priority = 1;

  const data = job.toJSON();
  t.is(data.priority, 1);
});

test("get at: returns the at default", (t) => {
  const job = new Job("test", new Client());

  t.is(job.at, undefined);
});

test("set at: set the scheduled job time", (t) => {
  const job = new Job("test", new Client());
  const jobAt = new Date();

  job.at = new Date();

  const data = job.toJSON();
  t.is(data.at, jobAt.toISOString());
});

test("get retry: returns the retry default", (t) => {
  const job = new Job("test", new Client());

  t.is(job.retry, 25);
});

test("set retry: set the number of retries", (t) => {
  const job = new Job("test", new Client());

  job.retry = -1;

  const data = job.toJSON();
  t.is(data.retry, -1);
});

test("get reserveFor: returns the reserveFor default", (t) => {
  const job = new Job("test", new Client());

  t.is(job.reserveFor, undefined);
});

test("set reserveFor: sets the reserveFor", (t) => {
  const job = new Job("test", new Client());

  job.reserveFor = 100;

  const data = job.toJSON();
  t.is(data.reserve_for, 100);
});

test("get custom: returns the custom default", (t) => {
  const job = new Job("test", new Client());

  t.is(job.custom, undefined);
});

test("set custom: set the custom context", (t) => {
  const job = new Job("test", new Client());

  job.custom = { some: "thing" };

  const data = job.toJSON();
  t.deepEqual(data.custom, { some: "thing" });
});

test("job push sends specification to client", (t) => {
  t.plan(1);
  const client = {
    push: (arg: Job) => t.is(arg, job),
  };
  const job: Job = new Job("MyJob", <Client>client);

  job.push();
});

test("job serializes to JSON", (t) => {
  const jobAt = new Date().toISOString();
  const job = new Job("MyJob", new Client());

  job.args = [1, 2, 3];
  job.custom = { locale: "en-us" };
  job.priority = 10;
  job.queue = "critical";
  job.at = jobAt;
  job.reserveFor = 300;
  job.retry = 1;

  const data = job.toJSON();

  t.truthy(data.jid);
  delete data.jid;

  t.deepEqual(data, {
    jobtype: "MyJob",
    args: [1, 2, 3],
    custom: { locale: "en-us" },
    priority: 10,
    queue: "critical",
    at: jobAt,
    reserve_for: 300,
    retry: 1,
  });
});

test("defaults match protocol specification", (t) => {
  const job = new Job("test", new Client());

  const data = job.toJSON();
  delete data.jid;

  t.deepEqual(data, {
    jobtype: "test",
    queue: "default",
    args: [],
    priority: 5,
    retry: 25,
  });
});

test("throws an error when no jobtype provided", (t) => {
  // @ts-ignore
  t.throws(() => new Job());
});
