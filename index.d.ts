type RegistryFunction = (...args: any[]) => void;

interface Registry {
    [JobType: string]: RegistryFunction;
}

type JobOptions = any[];
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
    public job(jobtype: string, ...args: any[]): Job;
}

export interface WorkerOptions {
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
    job: {
        jid: string;
        queue: string;
        jobtype: string;
        args: JobOptions;
        created_at: string;
        enqueued_at: string;
        retry: number;
    };
}

export class faktory {
    static middleware: Function[];
    static registry: Registry;
    static use(fn: (ctx: MiddleWareContext, next: Function) => void): void;
    static register(name: string, fn: RegistryFunction): faktory;
    static connect(args?: ClientOptions): Client;
    static work(options?: WorkerOptions): Worker;
    static stop(): Promise<void>;
}

export default faktory;
