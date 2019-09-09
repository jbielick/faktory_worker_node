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
 * A wrapper for the [Mutate API](https://github.com/contribsys/faktory/wiki/Mutate-API)
 *
 * A low-level data management API to script certain repairs or migrations.
 *
 * !!! Please be warned: MUTATE commands can be slow and/or resource intensive.
 * **They should not be used as part of your application logic.**
 */
class Mutation {
  /**
   * @param {Client} client
   */
  constructor(client) {
    this.client = client;
    this.filter = {};
  }

  /**
   * Filters the affected jobs by a jobtype string.
   * Use this to ensure you're only affecting a single jobtype if applicable.
   * Can be chained.
   *
   * Note: jobtype and other filters do not apply for the *clear* command.
   *
   * @param {string} type jobtype fiter for operation
   * @example
   * client.dead.ofType('SendEmail').discard();
   */
  ofType(type) {
    if (typeof type !== 'string') {
      throw new Error('jobtype given to ofType must be a string');
    }
    this.filter.jobtype = type;
    return this;
  }

  /**
   * Filters the affected jobs by one or more job ids. This is much more
   * efficient when only one jid is provided. Can be chained.
   *
   * Note: jobtype and other filters do not apply for the *clear* command.
   *
   * @param  {...string} jids job ids to target for the operation
   * @example
   * await client.retries.withJids('1234').requeue();
   */
  withJids(...jids) {
    const ids = Array.isArray(jids[0]) ? jids[0] : jids;
    this.filter.jids = ids;
    return this;
  }

  /**
   * Filters the MUTATE selection to jobs matching a Redis SCAN pattern.
   * Can be chained.
   *
   * Note the regexp filter scans the entire job payload and can be tricky to
   * get right, for instance you'll probably need * on both sides. The regexp
   * filter option is passed to Redis's SCAN command directly, read the SCAN
   * documentation for further details.
   * https://redis.io/commands/scan
   *
   * @param {string} pattern redis SCAN pattern to target jobs for the operation
   * @example
   * await client.retries.matching("*uid:12345*").kill();
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

  /**
   * Executes a *clear* mutation. This clears the
   * set entirely **and any filtering added does not apply**.
   */
  clear() {
    this.cmd = CLEAR;
    return this.send();
  }

  /**
   * Executes a *kill* mutation. Jobs that are killed are sent to the dead set.
   */
  kill() {
    this.cmd = KILL;
    return this.send();
  }

  /**
   * Executes a *discard* mutation. Jobs that are discarded are permanently deleted.
   */
  discard() {
    this.cmd = DISCARD;
    return this.send();
  }

  /**
   * Executes a *requeue* mutation. Jobs that are requeued are sent back to their
   * original queue for processing.
   */
  requeue() {
    this.cmd = REQUEUE;
    return this.send();
  }

  /**
   * @private
   */
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
