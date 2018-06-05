# faktory_worker_node

[![Travis branch](https://img.shields.io/travis/jbielick/faktory_worker_node/master.svg)](https://travis-ci.org/jbielick/faktory-client)
[![Coveralls github branch](https://img.shields.io/coveralls/github/jbielick/faktory_worker_node/master.svg)](https://coveralls.io/github/jbielick/faktory_worker_node)
![David](https://img.shields.io/david/jbielick/faktory_worker_node.svg)
![node](https://img.shields.io/node/v/faktory-worker.svg)
[![npm](https://img.shields.io/npm/dm/faktory-worker.svg)](https://www.npmjs.com/package/faktory-worker)

This repository provides a client and node worker framework for [Faktory](https://github.com/contribsys/faktory). The client allows you to push jobs and communicate with the Faktory server and the worker process fetches background jobs from the Faktory server and processes them.

Faktory server compatibility: v0.7.0

## Installation

```
npm install faktory-worker
```

## Usage

### Pushing jobs

```js
const faktory = require('faktory-worker');

const client = await faktory.connect();

const jid = await client.push({
  jobtype: 'MyDoWorkJob',
  args: [3, 'small']
});

await client.close();
```

A job is a payload of keys and values according to [the faktory job payload specification](https://github.com/contribsys/faktory/wiki/The-Job-Payload). Any keys provided will be passed to the faktory server during `PUSH`. A `jid` (uuid) is created automatically for your job when using this library. See [the spec](https://github.com/contribsys/faktory/wiki/The-Job-Payload) for more options and defaults.

### Processing jobs

```js
const faktory = require('faktory-worker');

faktory.register('MyDoWorkJob', async (id, size) => {
  const img = await Image.find(id);
  await resize(img.blob, size);
});

await faktory.work();
// send INT signal to shutdown gracefully
```

A job function can be a sync or async function. Simply return a promise or use `await` in your async function to perform async tasks during your job. If you return early or don't `await` properly, the job will be `ACK`ed when the function returns.

`faktory.work()` traps `INT` and `TERM` signals so that it can gracefully shut down and finish any in-progress jobs before the `options.timeout` is reached.

### Middleware

```js
const faktory = require('faktory-worker');

faktory.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.job.jobtype} took ${ms}ms`);
});

await faktory.work();
```

Faktory middleware works just like [`koa`](https://github.com/koajs/koa) middleware. You can register a middleware function (async or sync) with `.use`. Middleware is called for every job that is performed. Always return a promise, `await next()`, or `return next();` to allow execution to continue down the middleware chain.

### CLI

`faktory-worker` comes with two helper scripts:

`node_modules/.bin/faktory-work`

Starts one worker. Use `--help` for more information.

and

`node_modules/.bin/faktory-cluster`

### Worker Options

You can override the default options for a faktory worker by providing an object to the `work()` method or `new Manager()` constructor.

```js
faktory.work({

  // default: 127.0.0.1 -- can be set in FAKTORY_URL env (see FAQ)
  host: '127.0.0.1',

  // default: 7419 -- can be set in FAKTORY_URL env
  port: 7419,

  // can be set in FAKTORY_URL env
  password: 's33kr3t',

  // default: 20, this is a max number of jobs the worker will have
  // in progress at any time
  concurrency: 5,

  // default: ['default'] the queues the worker will process
  queues: ['critical', 'default', 'eventually'],

  // default: 8000 the number of milliseconds jobs have to complete after
  // receiving a shutdown signal before the job is aborted and the worker
  // shuts down abruptly
  timeout: 25 * 1000,

  // default: uuid().first(8) the worker id to use in the faktory-server connection
  // for this process. must be unique per process
  wid: 'alpha-worker',

  // default: [] labels for the faktory worker process to see in the UI
  labels: [],
});
```

### Debugging

Use `DEBUG=faktory*` to see related debug log lines.

## FAQ

* How do I specify the Faktory server location?

By default, it will connect to `tcp://localhost:7419`.
Use FAKTORY_URL to specify the URL, e.g. `tcp://faktory.example.com:12345` or use FAKTORY_PROVIDER to specify the environment variable which contains the URL: `FAKTORY_PROVIDER=FAKTORYTOGO_URL`.  This level of
indirection is useful for SaaSes, Heroku Addons, etc.

* How do I access the job payload in my function?

The function passed to `register` can be a thunk. The registered function will receive the job `args` and if that function returns a function, that returned function will be called and provided the raw `job` payload containing all custom props and other metadata of the job payload.

```js
faktory.register('JobWithHeaders', (...args) => async (job) => {
  const [ email ] = args;
  I18n.locale = job.custom.locale;
  log(job.custom.txid);
  await sendEmail(email);
});
```

## TODO

 - [ ] Handle signals from server heartbeat response
 - [ ] Require jobs from folder and automatically register
 - [ ] Logging
 - [x] Middleware
 - [x] CLI
 - [x] Heartbeat
 - [x] Tests
 - [x] Authentication
 - [x] Fail jobs
 - [x] Add'l client commands API
 - [x] Labels

## Development

Install docker.

`bin/server` will run the faktory server in a docker container. The server is available at `localhost:7419`

Use `DEBUG=faktory*` to see debug lines.

## Author

Josh Bielick, @jbielick
