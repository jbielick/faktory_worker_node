import { TestFn, ExecutionContext } from "ava";
import { promisify } from 'util'
import { Socket, createServer, Server } from "net";
import { v4 as uuid } from "uuid";
import getPort from "get-port";
import { Client } from "../client";
import { JobPayload, PartialJobPayload } from "../job";

export type ServerControl = {
  socket: Socket;
  command?: string;
  data?: string;
};

export const mockServer = (): Server => {
  const server = createServer();

  server.on("connection", (socket) => {
    server
      .once("HELLO", ({ socket }: ServerControl) => socket.write("+OK\r\n"))
      .on("END", ({ socket }: ServerControl) => socket.destroy());

    socket.on("data", (chunk) => {
      const string = chunk.toString();
      const [command] = string.replace(/\r\n$/, "").split(" ", 1);
      const rawData = string.replace(`${command} `, "");
      let data = rawData;
      try {
        data = JSON.parse(rawData);
      } catch (_) { }
      server.emit(command, <ServerControl>{ command, data, socket });
      server.emit("*", <ServerControl>{ command, data, socket });
    });

    socket.write('+HI {"v":2,"s":"abc","i":3}\r\n');
    server.emit("HI");
  });
  server.on('error', console.error);
  return server;
};

type ServerUser = {
  (server: Server, port: number): Promise<unknown>;
};

export const mocked = async (fn: ServerUser): Promise<unknown> => {
  const server = mockServer();
  const port = await getPort();
  return new Promise((resolve, reject) => {
    server.listen({ port, host: "127.0.0.1" }, async () => {
      try {
        resolve(await fn(server, port));
      } finally {
        server.close(resolve);
      }
    });
  })
};

mocked.ok = () => ({ socket }: ServerControl) => {
  socket.write("+OK\r\n");
};

mocked.fail = mocked.ok;

mocked.beat = (state?: string) => ({ socket }: ServerControl) => {
  if (!state) {
    socket.write("+OK\r\n");
  } else {
    const json = JSON.stringify({ state });
    socket.write(`$${json.length}\r\n${json}\r\n`);
  }
};
mocked.fetch = (job: PartialJobPayload | null) => ({ socket }: ServerControl) => {
  if (job) {
    const string = JSON.stringify(job);
    socket.write(`$${string.length}\r\n${string}\r\n`);
  } else {
    socket.write("$-1\r\n");
  }
};

mocked.info = () => ({ socket }: ServerControl) => {
  const json = JSON.stringify({
    queues: [],
    faktory: {},
    server_utc_time: Date.now(),
  });
  socket.write(`$${json.length}\r\n${json}\r\n`);
};

export const sleep = (ms: number, value?: unknown): Promise<unknown> => {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
};

export const randQueue = (label = "test"): string => {
  return `${label}-${uuid().slice(0, 6)}`;
};

export const createJob = (...args: unknown[]): PartialJobPayload => {
  return {
    jobtype: "testJob",
    queue: randQueue(),
    args,
  };
};

export const push = async ({
  args,
  queue,
  jobtype,
}: { args?: unknown[]; queue?: string; jobtype?: string } = {}): Promise<
  JobPayload
> => {
  const client = new Client();

  const job = client.job(jobtype || "test");
  job.queue = queue || randQueue();
  job.args = args || [];

  await job.push();

  client.close();

  return job;
};

export const flush = (): Promise<string> => new Client().flush();

export function registerCleaner(test: TestFn): void {
  test.beforeEach(async () => {
    await flush();
  });
  test.afterEach.always(async () => {
    await flush();
  });
}

export const withCallback = (fn: Function) => async (t: ExecutionContext) => {
  await promisify(fn)(t);
  t.pass();
}
