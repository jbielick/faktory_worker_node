const uuid = require('uuid/v4');
import { JobPayload } from './types';
import Client from './client';

/**
 * A class wrapping a {@link external:JobPayload|JobPayload}
 *
 * Creating and pushing a job is typically accomplished by using
 * a faktory client, which implements `.job` and automatically
 * sets the client for the job when calling `.push` on the job later.
 *
 * You do not need to use this class directly.`
 *
 * @example <caption>with a faktory client</caption>
 * // with a client
 * const client = await faktory.connect();
 * const job = client.job('SendWelcomeEmail', id);
 */
export default class Job {
  client: Client;
  payload: JobPayload;
  /**
   * Creates a job
   *
   * @param  {string} jobtype {@link external:Jobtype|Jobtype} string
   * @param  {Client} [client]  a client to use for communicating to the server (if calling push)
   */
  constructor(jobtype: string, client: Client) {
    if (!jobtype) throw new Error('must provide jobtype');
    this.client = client;
    this.payload = Object.assign({
      jid: Job.jid(),
      jobtype,
    }, Job.defaults);
  }

  get jid() {
    return this.payload.jid;
  }

  /**
   * sets the jid
   *
   * @param  {string} value the >8 length jid
   * @see  external:JobPayload
   */
  set jid(value) {
    this.payload.jid = value;
  }

  get jobtype() {
    return this.payload.jobtype;
  }

  set jobtype(value) {
    this.payload.jobtype = value;
  }

  get queue() {
    return this.payload.queue;
  }

  /**
   * sets the queue
   *
   * @param  {string} value queue name
   * @see  external:JobPayload
   */
  set queue(value) {
    this.payload.queue = value;
  }

  get args() {
    return this.payload.args;
  }

  /**
   * sets the args
   *
   * @param  {Array} value array of positional arguments
   * @see  external:JobPayload
   */
  set args(value) {
    this.payload.args = value;
  }

  get priority() {
    return this.payload.priority;
  }

  /**
   * sets the priority of this job
   *
   * @param  {number} value 0-9
   * @see  external:JobPayload
   */
  set priority(value) {
    this.payload.priority = value;
  }

  get retry() {
    return this.payload.retry;
  }

  /**
   * sets the retry count
   *
   * @param  {number} value {@see external:JobPayload}
   * @see  external:JobPayload
   */
  set retry(value) {
    this.payload.retry = value;
  }

  get at() {
    return this.payload.at;
  }

  /**
   * sets the scheduled time
   *
   * @param  {Date|string} value the date object or RFC3339 timestamp string
   * @see  external:JobPayload
   */
  set at(value) {
    const string = typeof value === 'object' ? value.toISOString() : value;
    this.payload.at = string;
  }

  get reserveFor() {
    return this.payload.reserve_for;
  }

  /**
   * sets the reserveFor parameter
   *
   * @param  {number} value
   * @see  external:JobPayload
   */
  set reserveFor(value) {
    this.payload.reserve_for = value;
  }

  get custom() {
    return this.payload.custom;
  }

  /**
   * sets the custom object property
   *
   * @param  {object} value the custom data
   * @see  external:JobPayload
   */
  set custom(value) {
    this.payload.custom = value;
  }

  /**
   * Generates an object from this instance for transmission over the wire
   *
   * @return {object} the job as a serializable javascript object
   *                      @link external:JobPayload|JobPayload}
   * @see  external:JobPayload
   */
  toJSON() {
    return Object.assign({}, this.payload);
  }

  /**
   * Pushes this job to the faktory server. Modifications after this point are not
   * persistable to the server
   *
   * @return {string} return of client.push(job)
   */
  push() {
    return this.client.push(this);
  }

  static get defaults() {
    return {
      queue: 'default',
      args: [],
      priority: 5,
      retry: 25,
    };
  }

  /**
   * generates a uuid
   *
   * @return {string} a uuid/v4 string
   */
  static jid() {
    return uuid();
  }
}
