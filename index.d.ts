type JobFunction = (...args: unknown[]) => unknown;

interface Registry {
  [JobType: string]: JobFunction;
}

type JobOptions = unknown[];
export class Job {
  public jid: string;
  public jobtype: string;
  public queue: string;
  public args: JobOptions;
  public priority: number;
  public retry: number;
  public at: Date | string;
  public reserveFor: number;
  public custom: object;

  constructor(jobtype: string, client: Client);
  public toJSON(): object;
  public push(): string;
}

export interface ClientOptions {
  url?: string;
  host?: string;
  port?: string | number;
  password?: string;
  wid?: string;
  labels?: string[];
  poolSize?: number;
}

export class Client {
  constructor(options?: ClientOptions);
  public connect(): Promise<Client>;
  public close(): void;
  public job(jobtype: string, ...args: unknown[]): Job;
  public push(job: Job | Record<string, unknown>): Promise<string>;
}

export interface WorkerOptions extends ClientOptions {
  wid?: string;
  concurrency?: number;
  poolSize?: number;
  shutdownTimeout?: number;
  beatInterval?: number;
  queues?: string[];
  middleware?: Function[];
  registry?: Registry;
}

export class Worker {
  constructor(options?: WorkerOptions);
  public stop(): Promise<void>;
}

export interface MiddleWareContext {
  job: Job;
}

export interface faktory {
  middleware: Function[];
  registry: Registry;
  use(fn: (ctx: MiddleWareContext, next: Function) => void): faktory;
  register(name: string, fn: JobFunction): faktory;
  connect(options?: ClientOptions): Promise<Client>;
  work(options?: WorkerOptions): Promise<Worker>;
  stop(): Promise<void>;
  Worker: typeof Worker;
  Client: typeof Client;
}

export default faktory;
