# faktory_worker_node

[![Travis branch](https://img.shields.io/travis/jbielick/faktory_worker_node/master.svg)](https://travis-ci.org/jbielick/faktory-client)
[![Coveralls github branch](https://img.shields.io/coveralls/github/jbielick/faktory_worker_node/master.svg)](https://coveralls.io/github/jbielick/faktory_worker_node)
![David](https://img.shields.io/david/jbielick/faktory_worker_node.svg)
![node](https://img.shields.io/node/v/faktory-worker.svg)
[![npm](https://img.shields.io/npm/dm/faktory-worker.svg)](https://www.npmjs.com/package/faktory-worker)

This repository provides a client and node worker framework for [Faktory](https://github.com/contribsys/faktory). The client allows you to push jobs and communicate with the Faktory server and the worker process fetches background jobs from the Faktory server and processes them.

## Installation

```
npm install faktory-worker
```

## Usage

To process background jobs, follow these steps:

1. Register your jobs and their associated functions
2. Set a few optional parameters
3. Start processing

To stop the process, send the TERM or INT signal.

```js
const faktory = require('faktory-worker');

const doWork = async (id, size) => {
  await somethingAsync();
  // job will automatically be ack'd if it does not error
}

faktory.register('MyDoWorkJob', doWork);

// this will block and listen for signals
faktory.work();
```

## FAQ

* How do I specify the Faktory server location?

By default, it will use localhost:7419 which is sufficient for local development.
Use FAKTORY_URL to specify the URL, e.g. `faktory.example.com:12345` or
use FAKTORY_PROVIDER to specify the environment variable which does
contain the URL: FAKTORY_PROVIDER=FAKTORYTOGO_URL.  This level of
indirection is useful for SaaSes, Heroku Addons, etc.

* How do I push new jobs to Faktory?

```js
const faktory = require('faktory-worker');

const client = await faktory.connect();

client.push({
  queue: 'default', // `default` if omitted
  jobtype: 'MyDoWorkJob',
  args: []
});
```

See the [Faktory client for other languages](https://github.com/contribsys/faktory/wiki/Related-Projects)

You can implement a Faktory client in any programming langauge.
See [the wiki](https://github.com/contribsys/faktory/wiki) for details.

## TODO

 - [ ] TLS
 - [ ] Middleware
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
