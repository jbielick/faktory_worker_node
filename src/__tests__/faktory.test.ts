import test from "ava";

import { create } from "../faktory";
import { Client } from "../client";
import { Worker } from "../worker";
import { sleep, mocked, registerCleaner } from "./_helper";

registerCleaner(test);

test("#register: returns self", (t) => {
  const faktory = create();

  const returned = faktory.register("test", () => { });

  t.is(faktory, returned, "`this` not returned by .register");
});

test("#use: returns self", (t) => {
  const faktory = create();

  const returned = faktory.use(() => { });

  t.is(faktory, returned, "`this` not returned by .use");
});

test("#use: throws when arg is not a function", (t) => {
  const faktory = create();

  t.throws(() => {
    // @ts-ignore
    faktory.use("");
  });
});

test("#work: throws when called twice", (t) => {
  const faktory = create();

  faktory.work();

  t.throws(() => faktory.work(), { message: /once/ });

  faktory.stop();
});

test(".registry returns the registry object", (t) => {
  const faktory = create();
  const myFunc = () => { };

  faktory.register("MyJob", myFunc);

  t.is(faktory.registry["MyJob"], myFunc, "job not found in registry");
});

test(".connect() resolves a client", async (t) => {
  const faktory = create();

  const client = await faktory.connect();

  t.truthy(client instanceof Client);
});

test('.work() resolves the worker after starting', async (t) => {
  const faktory = create();

  const worker = await faktory.work();

  worker.on('test', () => { });

  t.is(worker.listenerCount('test'), 1);
});

test(".work() creates a worker, runs, then resolves the worker", async (t) => {
  t.plan(3);
  await mocked(async (server, port) => {
    server
      .on("BEAT", ({ socket }) => {
        socket.write("+OK\r\n");
        t.true(true);
      })
      .on("FETCH", async ({ socket }) => {
        await sleep(10);
        t.true(true);
        socket.write("$-1\r\n");
      });
    const faktory = create();
    const worker = await faktory.work({ port, concurrency: 1 });

    t.true(worker instanceof Worker);

    await worker.stop();
  });
});

test("it exports Client", (t) => {
  t.is(require("../faktory").Client, Client);
});

test("it exports Worker", (t) => {
  t.is(require("../faktory").Worker, Worker);
});

test("exports .connect", (t) => {
  t.is(typeof require("../faktory").connect, "function");
});

test("exports .use", (t) => {
  t.is(typeof require("../faktory").use, "function");
});

test("exports .register", (t) => {
  t.is(typeof require("../faktory").register, "function");
});

test("exports .work", (t) => {
  t.is(typeof require("../faktory").work, "function");
});

test("exports .stop", (t) => {
  t.is(typeof require("../faktory").stop, "function");
});
