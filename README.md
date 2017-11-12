# faktory_worker_node

[![Travis branch](https://img.shields.io/travis/jbielick/faktory_worker_node/master.svg)](https://travis-ci.org/jbielick/faktory-client)
[![Coveralls github branch](https://img.shields.io/coveralls/github/jbielick/faktory_worker_node/master.svg)](https://coveralls.io/github/jbielick/faktory_worker_node)
![David](https://img.shields.io/david/jbielick/faktory_worker_node.svg)
![node](https://img.shields.io/node/v/faktory-worker.svg)
[![npm](https://img.shields.io/npm/dm/faktory-worker.svg)](https://www.npmjs.com/package/faktory-worker)

This repository provides a client and node worker framework for [Faktory](https://github.com/contribsys/faktory). The client allows you to push jobs and communicate with the Faktory server and the worker process fetches background jobs from the Faktory server and processes them.

Faktory server compatibility: v0.6.0

## Installation

```
npm install faktory-worker
```

## Usage

To process background jobs, follow these steps:

1. Push a job to faktory server
2. Register your jobs and their associated functions
3. Set a few optional parameters
4. Start working

To stop the process, send the TERM or INT signal.

Pushing Jobs:

A job is a payload of keys and values according to [the faktory job payload specification](https://github.com/contribsys/faktory/wiki/The-Job-Payload). Any keys provided will be passed to the faktory server during PUSH. A `jid` (uuid) is created automatically for your job when using this library. See [the spec](https://github.com/contribsys/faktory/wiki/The-Job-Payload) for more options and defaults.

```js
const faktory = require('faktory-worker');

const client = await faktory.connect();

client.push({
  queue: 'default', // `default` if omitted
  jobtype: 'MyDoWorkJob',
  args: []
});
```

Processing Jobs:

A job function can be a sync or async function. Simply return a promise or use `await` in your async function to perform async tasks during your job. If you return early or don't `await` properly, the job will be ACKed when the function returns.

```js
const faktory = require('faktory-worker');

faktory.register('MyDoWorkJob', async (id, size) => {
  await somethingAsync(id);
  // job will automatically be ack'd if it does not error
});

// starts the work loop and waits for signals
faktory.work();
```

## FAQ

* How do I specify the Faktory server location?

By default, it will use localhost:7419 which is sufficient for local development.
Use FAKTORY_URL to specify the URL, e.g. `faktory.example.com:12345` or
use FAKTORY_PROVIDER to specify the environment variable which does
contain the URL: FAKTORY_PROVIDER=FAKTORYTOGO_URL.  This level of
indirection is useful for SaaSes, Heroku Addons, etc.

* How do I access the job payload itself?

You can register your job function with `faktory.register()` and provide a thunk. The registered function always receives the job `args` and if you return a function, that function will be called and provided the raw `job` payload, where you can access custom props and other meta.

```js
faktory.register('JobWithHeaders', (...args) => async (job) => {
  // job args available as `args`
  // use job custom properties
  await sendEmail({ locale: job.custom.locale });
  log(job.custom.txid);
});
```

See the [Faktory client for other languages](https://github.com/contribsys/faktory/wiki/Related-Projects)

You can implement a Faktory client in any programming langauge.
See [the wiki](https://github.com/contribsys/faktory/wiki) for details.

## TODO

 - [ ] Middleware
 - [ ] Handle signals from server heartbeat response
 - [ ] Require jobs from folder and automatically register
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
