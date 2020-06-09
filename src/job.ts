import { v4 as uuid } from "uuid";
import Client from "./client";

export interface JobCustomParams {
  [propName: string]: unknown;
}

/**
 * A work unit that can be scheduled by the faktory work server and executed by clients
 *
 * @typedef {object} JobPayload
 * @see  {@link https://github.com/contribsys/faktory/wiki/The-Job-Payload}
 * @external
 * @property {string} [jid=uuid()] globally unique ID for the job.
 * @property {external:Jobtype} jobtype
 * @property {string} [queue=default] which job queue to push this job onto.
 * @property {array} [args=[]] parameters the worker should use when executing the job.
 * @property {number} [priority=5] higher priority jobs are dequeued before lower priority jobs.
 * @property {number} [retry=25] number of times to retry this job if it fails. 0 discards the
 *                               failed job, -1 saves the failed job to the dead set.
 * @property {external:RFC3339_DateTime} [at] run the job at approximately this time; immediately if blank
 * @property {number} [reserve_for=1800] number of seconds a job may be held by a worker before it
 *                                       is considered failed.
 * @property {?object} custom provides additional context to the worker executing the job.
 * @see  {@link https://github.com/contribsys/faktory/blob/master/docs/protocol-specification.md#work-units|Faktory Protocol Specification - Work Units}
 */
export type PartialJobPayload = {
  jid?: string;
  jobtype: string;
  queue: string;
  args: unknown[];
  priority?: number;
  retry?: number;
  custom?: JobCustomParams;
  at?: Date | string;
  reserve_for?: number;
};

export type JobPayload = PartialJobPayload & {
  jid: string;
};

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
    if (!jobtype) throw new Error("must provide jobtype");
    this.client = client;
    this.payload = Object.assign(Job.defaults, {
      jid: Job.jid(),
      jobtype,
    });
  }

  get jid(): string {
    return this.payload.jid;
  }

  /**
   * sets the jid
   *
   * @param  {string} value the >8 length jid
   * @see  external:JobPayload
   */
  set jid(value: string) {
    this.payload.jid = value;
  }

  get jobtype(): string {
    return this.payload.jobtype;
  }

  set jobtype(value: string) {
    this.payload.jobtype = value;
  }

  get queue(): string {
    return this.payload.queue;
  }

  /**
   * sets the queue
   *
   * @param  {string} value queue name
   * @see  external:JobPayload
   */
  set queue(value: string) {
    this.payload.queue = value;
  }

  get args(): unknown[] {
    return this.payload.args;
  }

  /**
   * sets the args
   *
   * @param  {Array} value array of positional arguments
   * @see  external:JobPayload
   */
  set args(args: unknown[]) {
    this.payload.args = args;
  }

  get priority(): number | undefined {
    return this.payload.priority;
  }

  /**
   * sets the priority of this job
   *
   * @param  {number} value 0-9
   * @see  external:JobPayload
   */
  set priority(value: number | undefined) {
    this.payload.priority = value;
  }

  get retry(): number | undefined {
    return this.payload.retry;
  }

  /**
   * sets the retry count
   *
   * @param  {number} value {@see external:JobPayload}
   * @see  external:JobPayload
   */
  set retry(value: number | undefined) {
    this.payload.retry = value;
  }

  get at(): Date | string | undefined {
    return this.payload.at;
  }

  /**
   * sets the scheduled time
   *
   * @param  {Date|string} value the date object or RFC3339 timestamp string
   * @see  external:JobPayload
   */
  set at(value: Date | string | undefined) {
    const string = typeof value === "object" ? value.toISOString() : value;
    this.payload.at = string;
  }

  get reserveFor(): number | undefined {
    return this.payload.reserve_for;
  }

  /**
   * sets the reserveFor parameter
   *
   * @param  {number} value
   * @see  external:JobPayload
   */
  set reserveFor(value: number | undefined) {
    this.payload.reserve_for = value;
  }

  get custom(): JobCustomParams | undefined {
    return this.payload.custom;
  }

  /**
   * sets the custom object property
   *
   * @param  {object} value the custom data
   * @see  external:JobPayload
   */
  set custom(custom: JobCustomParams | undefined) {
    this.payload.custom = custom;
  }

  /**
   * Generates an object from this instance for transmission over the wire
   *
   * @return {object} the job as a serializable javascript object
   *                      @link external:JobPayload|JobPayload}
   * @see  external:JobPayload
   */
  toJSON(): PartialJobPayload {
    return Object.assign({}, this.payload);
  }

  /**
   * Pushes this job to the faktory server. Modifications after this point are not
   * persistable to the server
   *
   * @return {string} return of client.push(job)
   */
  push(): Promise<string> {
    return this.client.push(this);
  }

  static get defaults(): PartialJobPayload {
    return {
      jobtype: "",
      queue: "default",
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
  static jid(): string {
    return uuid();
  }
}
