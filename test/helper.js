const test = require('ava');
const {
  spawnFaktory,
  shutdownFaktory,
  withConnection
} = require('faktory-client/test/support/helper');

test.before(async () => {
  await spawnFaktory();
});

test.after.always(async () => {
  await withConnection(async (client) => {
    await client.flush();
  });
  shutdownFaktory();
});

process.on('exit', () => {
  shutdownFaktory();
});
