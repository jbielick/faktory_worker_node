import test from "ava";

import Connection from "../connection";
import { mocked, registerCleaner } from "./_helper";

registerCleaner(test);

test("#open: resolves after HI", async (t) => {
  await mocked(async (server, port) => {
    let acc = "";
    server.on("HI", () => (acc += "A"));
    const conn = new Connection(port);
    await conn.open();
    acc += "B";
    t.is(acc, "AB");
  });
});

test("#open: resolves with the server greeting", async (t) => {
  await mocked(async (_, port) => {
    const conn = new Connection(port);
    const greeting = await conn.open();
    t.deepEqual(greeting, { v: 2, s: "abc", i: 3 });
  });
});

test("#close: connects after disconnect", async (t) => {
  await mocked(async (server, port) => {
    let acc = "";
    server.on("connection", () => (acc += "Co"));
    const conn = new Connection(port);
    conn.on("close", () => (acc += "Cl"));
    await conn.open();
    await conn.close();
    await conn.open();
    await conn.close();
    await conn.open();
    await conn.close();
    t.is(acc, "CoClCoClCoCl");
  });
});

test("#close: emits close", async (t) => {
  await mocked(async (_, port) => {
    const conn = new Connection(port);
    conn.on("close", () => t.pass());
    await conn.open();
    await conn.close();
    t.is(conn.connected, false);
  });
});

test.cb("#open: emits connect", (t) => {
  mocked((_, port) => {
    const conn = new Connection(port);
    conn.on("connect", () => {
      t.pass();
      t.end();
    });
    return conn.open();
  });
});

test("#open: rejects when connection fails", async (t) => {
  const port = 1001;
  const conn = new Connection(port);
  conn.on("error", () => {});
  await t.throwsAsync(conn.open(), { message: /ECONNREFUSED/ });
});

test.cb("#open: emits error when connection fails to connect", (t) => {
  const port = 1002;
  const conn = new Connection(port);
  conn.on("error", (err: Error) => {
    t.truthy(err);
    t.end();
  });
  conn
    .open()
    .catch(() => {})
    .then();
});

test("#send: resolves with server response", async (t) => {
  await mocked(async (_, port) => {
    const conn = new Connection(port);
    await conn.open();
    const resp = await conn.send(["HELLO", '{ "v": 2, "s": "abc", "i": 3 }']);
    t.is(resp, "OK");
  });
});

test("#sendWithAssert: throws when response does not match assertion", async (t) => {
  await mocked(async (_, port) => {
    const conn = new Connection(port);
    await conn.open();
    return t.throwsAsync(
      conn.sendWithAssert(
        ["HELLO", '{ "v": 2, "s": "abc", "i": 3 }'],
        "GOODBYE"
      ),
      { message: /expected .* response/ }
    );
  });
});

test("#sendWithAssert: does not throw when response matches assertion", async (t) => {
  await mocked(async (_, port) => {
    const conn = new Connection(port);
    await conn.open();
    return t.notThrowsAsync(
      conn.sendWithAssert(["HELLO", '{ "v": 2, "s": "abc", "i": 3 }'], "OK")
    );
  });
});

test("#send: throws when the server responds with error", async (t) => {
  await mocked(async (server, port) => {
    server.on("INFO", ({ socket }) => {
      socket.write("-ERR Something is wrong\r\n");
    });
    const conn = new Connection(port);
    await conn.open();
    return t.throwsAsync(conn.send(["INFO"]), {
      message: /something is wrong/i,
    });
  });
});

test("#send: emits timeout when exceeds deadline", async (t) => {
  await mocked(async (server, port) => {
    let acc = "";
    server.on("INFO", ({ socket }) => {
      setTimeout(() => mocked.ok()({ socket }), 301);
    });
    const conn = new Connection(port);
    await conn.open();
    conn.setTimeout(100);
    conn.on("timeout", () => (acc += "To"));
    await conn.send(["INFO"]);
    t.is(acc, "To");
  });
});
