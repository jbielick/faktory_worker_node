const test = require('ava');
const Client = require('../lib/client');
const {
  createClient: create,
  queueName,
  withConnection: connect,
  mocked
} = require('./_helper');

test.before(async () => {
  await connect(client => client.flush());
});

test.after.always(async () => {
  await connect(client => client.flush());
});

test('job push sends job specification to server', async (t) => {
  const jobAt = Date.now();
  return mocked((server, port) => {
    server.on('PUSH', ({ data, socket }) => {
      socket.write("+OK\r\n");
      const {
        jobtype,
        args,
        custom,
        priority,
        queue,
        at,
        reserve_for,
        retry
      } = data;
      t.is(jobtype, 'MyJob');
      t.deepEqual(args, [ 1, 2, 3 ]);
      t.deepEqual(custom, { locale: 'en-us' });
      t.is(priority, 10);
      t.is(queue, 'critical');
      t.is(at, jobAt);
      t.is(reserve_for, 300);
      t.is(retry, false);
    });
    return connect({ port }, async (client) => {
      await client.job('MyJob')
        .args(1, 2, 3)
        .custom({ locale: 'en-us' })
        .priority(10)
        .queue('critical')
        .at(jobAt)
        .reserveFor(300)
        .retry(false)
        .push();
    });
  });
});

test('job push sends retry specification to server', async (t) => {
  const jobAt = Date.now();
  return mocked((server, port) => {
    server.on('PUSH', ({ data, socket }) => {
      socket.write("+OK\r\n");
      const { retry } = data;
      t.is(retry, true);
    });
    return connect({ port }, async (client) => {
      await client.job('MyJob').retry().push();
    });
  });
});


test('job push resolves with the jid', async (t) => {
  const jobAt = Date.now();
  return mocked((server, port) => {
    server.on('PUSH', ({ data, socket }) => {
      socket.write("+OK\r\n");
    });
    return connect({ port }, async (client) => {
      const jid = await client.job('MyJob').retry().push();
      t.truthy(/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/.test(jid));
    });
  });
});

test('throws an error when no jobtype provided', t => {
  t.throws(() => {
    new Job();
  });
});
