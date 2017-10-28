# faktory_worker_node

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

// define a function for your job
const doWork = async (id, size) => {
  // do some work with the given arguments
  // call `done` when finished with or without an error
  console.log(`working on job ${ctx.jid}`);

  await somethingAsync();
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
  queue: 'default',
  jobtype: 'MyDoWorkJob',
  args: []
});
```

See the [Faktory client for other languages](https://github.com/contribsys/faktory/wiki/Related-Projects)

You can implement a Faktory client in any programming langauge.
See [the wiki](https://github.com/contribsys/faktory/wiki) for details.

## TODO

 - [ ] Tests
 - [ ] TLS
 - [ ] Authentication
 - [ ] Middleware
 - [ ] CLI API
 - [ ] Fail jobs
 - [ ] Retries
 - [ ] Heartbeat
 - [ ] Add'l client commands API
 - [ ] Labels

## Development

Use docker-compose for easy setup of the faktory server and node container:

`docker-compose run server` to start the faktory server container

`docker-compose run client bash` to start the node client container. The server is available at `server:7419`

Use `DEBUG=faktory*` to see debug lines.

## Author

Josh Bielick, @jbielick
