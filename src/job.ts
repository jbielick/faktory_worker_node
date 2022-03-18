import { v4 as uuid } from "uuid";
import { Client } from "./client";

export type JobType = string;

/**
 * @private
 */
export interface JobCustomParams {
  [propName: string]: unknown;
}

/**
 * @private
 */
export type PartialJobPayload = {
  jid?: string;
  jobtype: string;
  queue?: string | undefined;
  args?: unknown[];
  priority?: number;
  retry?: number;
  custom?: JobCustomParams;
  at?: Date | string;
  reserve_for?: number;
};

/**
 * @private
 */
export type JobDefaults = {
  queue: string;
  args: Array<unknown>;
  priority: number;
  retry: number;
};

/**
 * @private
 */
export type JobPayload = PartialJobPayload &
  JobDefaults & {
    jid: string;
    jobtype: string;
  };

/**
 * A class wrapping a {@link JobPayload|JobPayload}
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
export class Job {
  client: Client;
  payload: JobPayload;
  /**
   * Creates a job
   *
   * @param  {string} jobtype {@link Jobtype|Jobtype} string
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
   * @see  JobPayload
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
   * @see  JobPayload
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
   * @see  JobPayload
   */
  set args(args: unknown[]) {
    this.payload.args = args;
  }

  get priority(): number {
    return this.payload.priority;
  }

  /**
   * sets the priority of this job
   *
   * @param  {number} value 0-9
   * @see  JobPayload
   */
  set priority(value: number) {
    this.payload.priority = value;
  }

  get retry(): number {
    return this.payload.retry;
  }

  /**
   * sets the retry count
   *
   * @param  {number} value {@see JobPayload}
   * @see  JobPayload
   */
  set retry(value: number) {
    this.payload.retry = value;
  }

  get at(): Date | string | undefined {
    return this.payload.at;
  }

  /**
   * sets the scheduled time
   *
   * @param  {Date|string} value the date object or RFC3339 timestamp string
   * @see  JobPayload
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
   * @see  JobPayload
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
   * @see  JobPayload
   */
  set custom(custom: JobCustomParams | undefined) {
    this.payload.custom = custom;
  }

  /**
   * Generates an object from this instance for transmission over the wire
   *
   * @return {object} the job as a serializable javascript object
   *                      @link JobPayload|JobPayload}
   * @see  JobPayload
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

  static get defaults(): JobDefaults {
    return {
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
