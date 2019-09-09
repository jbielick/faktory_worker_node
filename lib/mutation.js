const encode = require('./encode');

const MUTATE = 'MUTATE';

/**
 * commands
 * @private
 */
const CLEAR = 'clear';
const KILL = 'kill';
const DISCARD = 'discard';
const REQUEUE = 'requeue';

/**
 * targets
 * @private
 */
const RETRIES = 'retries';
const SCHEDULED = 'scheduled';
const DEAD = 'dead';

/**
 *
 */
class Mutation {
  constructor(client) {
    this.client = client;
    this.filter = {};
  }

  ofType(type) {
    if (typeof type !== 'string') {
      throw new Error('jobtype given to ofType must be a string');
    }
    this.filter.jobtype = type;
    return this;
  }

  withJids(...jids) {
    const ids = Array.isArray(jids[0]) ? jids[0] : jids;
    this.filter.jids = ids;
    return this;
  }

  /**
   * Filters the MUTATE selection to jobs matching a Redis SCAN pattern
   *
   * Note the regexp filter scans the entire job payload and can be tricky to
   * get right, for instance you'll probably need * on both sides. The regexp
   * filter option is passed to Redis's SCAN command directly, read the SCAN
   * documentation for further details.
   * https://redis.io/commands/scan
   */
  matching(pattern) {
    if (typeof pattern !== 'string') {
      throw new Error(`
Argument given to matching() must be a redis SCAN compatible pattern string,
other object types cannot be translated.
See the Redis SCAN documentation for pattern matching examples.
https://redis.io/commands/scan
      `.trim());
    }
    this.filter.regexp = pattern;
    return this;
  }

  /**
   * @private
   */
  toJSON() {
    const { cmd, target, filter } = this;
    return { cmd, target, filter };
  }

  clear() {
    this.cmd = CLEAR;
    return this.send();
  }

  kill() {
    this.cmd = KILL;
    return this.send();
  }

  discard() {
    this.cmd = DISCARD;
    return this.send();
  }

  requeue() {
    this.cmd = REQUEUE;
    return this.send();
  }

  send() {
    return this.client.sendWithAssert([
      MUTATE,
      encode(this.toJSON())
    ], 'OK');
  }
}

Mutation.SCHEDULED = SCHEDULED;
Mutation.RETRIES = RETRIES;
Mutation.DEAD = DEAD;

module.exports = Mutation;
