const test = require('ava');
const Connection = require('./connection');
const { mocked, flush } = require('../test/_helper');

test.beforeEach(() => flush());
test.afterEach.always(() => flush());

test('#open: resolves after HI', t => {
  return mocked(async (server, port) => {
    let acc = '';
    server.on('HI', () => acc += 'A');
    const conn = new Connection(port);
    const resolved = await conn.open();
    acc += 'B';
    t.is(acc, 'AB');
  });
});

test('#open: resolves with the server greeting', t => {
  return mocked(async (server, port) => {
    const conn = new Connection(port);
    const greeting = await conn.open();
    t.deepEqual(greeting, {v: 2});
  });
});

test('#close: connects after disconnect', t => {
  return mocked(async (server, port) => {
    let acc = '';
    server.on('connection', () => acc += 'Co');
    const conn = new Connection(port);
    conn.on('close', () => acc += 'Cl')
    await conn.open();
    await conn.close();
    await conn.open();
    await conn.close();
    await conn.open();
    await conn.close();
    t.is(acc, 'CoClCoClCoCl');
  });
});

test('#close: emits close', t => {
  return mocked(async (server, port) => {
    const conn = new Connection(port);
    conn.on('close', () => t.pass())
    await conn.open();
    await conn.close();
    t.is(conn.connected, false);
  });
});

test.cb('#open: emits connect', t => {
  mocked((server, port) => {
    const conn = new Connection(port);
    conn.on('connect', () => {
      t.pass();
      t.end();
    });
    return conn.open();
  });
});

test('#open: rejects when connection fails', t => {
  const port = 1001;
  const conn = new Connection(port);
  conn.on('error', () => {});
  return t.throws(conn.open(), /ECONNREFUSED/);
});

test.cb('#open: emits error when connection fails to connect', t => {
  const port = 1002;
  const conn = new Connection(port);
  conn.on('error', (err) => {
    t.truthy(err);
    t.end();
  });
  conn.open().catch((err) => {}).then();
});

test('#send: resolves with server response', t => {
  return mocked(async (server, port) => {
    const conn = new Connection(port);
    await conn.open();
    const resp = await conn.send(['HELLO', {v: 2}]);
    t.is(resp, 'OK');
  });
});

test('#sendWithAssert: throws when response does not match assertion', t => {
  return mocked(async (server, port) => {
    const conn = new Connection(port);
    await conn.open();
    return t.throws(conn.sendWithAssert(['HELLO', {v: 2}], 'GOODBYE'), /expected .* response/);
  });
});

test('#sendWithAssert: does not throw when response matches assertion', t => {
  return mocked(async (server, port) => {
    const conn = new Connection(port);
    await conn.open();
    return t.notThrows(conn.sendWithAssert(['HELLO', {v: 2}], 'OK'));
  });
});

test('#send: throws when the server responds with error', t => {
  return mocked(async (server, port) => {
    server.on('INFO', ({ socket }) => {
      socket.write("-ERR Something is wrong\r\n");
    });
    const conn = new Connection(port);
    await conn.open();
    return t.throws(conn.send(['INFO']), /something is wrong/i);
  });
});

test('#send: emits timeout when exceeds deadline', t => {
  return mocked(async (server, port) => {
    let acc = '';
    server.on('INFO', ({ socket }) => {
      setTimeout(() => mocked.ok()({ socket }), 301);
    });
    const conn = new Connection(port);
    await conn.open();
    conn.setTimeout(100);
    conn.on('timeout', () => acc += 'To');
    await conn.send(['INFO']);
    t.is(acc, 'To');
  });
});
