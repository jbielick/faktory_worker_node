import { TestInterface } from 'ava';
import { Socket, createServer, Server } from 'net';
const uuid = require('uuid/v4');
import getPort from 'get-port';
import Client from '../client';
import { JobPayload, PartialJobPayload } from "../job";
import { Command } from "../connection";

export type ServerControl = {
  socket: Socket;
  command?: string;
  data?: string;
};

export const mockServer = () => {
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
      } catch (_) {}
      server.emit(command, <ServerControl>{ command, data, socket });
      server.emit("*", <ServerControl>{ command, data, socket });
    });

    socket.write('+HI {"v":2,"s":"abc","i":3}\r\n');
    server.emit("HI");
  });
  return server;
};

export const mocked = async (fn: (server: Server, port: number) => any | void) => {
  const server = mockServer();
  const port = await getPort();
  server.listen(port, "127.0.0.1");
  try {
    return fn(server, port);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
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
mocked.fetch = (job: JobPayload | null) => ({ socket }: ServerControl) => {
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

export const sleep = (ms: number, value: any = true) => {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
};

export const randQueue = (label: string = "test") => {
  return `${label}-${uuid().slice(0, 6)}`;
};

export const createJob = (...args: any[]): PartialJobPayload => {
  return {
    jobtype: "testJob",
    queue: randQueue(),
    args,
  };
};

export const push = async (
  { args, queue, jobtype }: { args?: any[], queue?: string, jobtype?: string } = {}
) => {
  const client = new Client();

  const job = client.job(jobtype || "test");
  job.queue = queue || randQueue();
  job.args = args || [];

  await job.push();

  client.close();

  return job;
};

export const flush = () => new Client().flush();

export function registerCleaner(test: TestInterface) {
  test.beforeEach(async () => {
    await flush();
  });
  test.afterEach.always(async () => {
    await flush();
  });
}
