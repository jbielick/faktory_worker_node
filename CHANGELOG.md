0.10.0 | 2018-06-04
---

 * moves `faktory-client` into this repo
 * `require('faktory-worker/client')` export now available
 * manager now respects faktory-server heartbeat signals (quiet, terminate) so buttons clicked in the UI will now quiet and terminate the faktory work process

0.9.2 | 2018-06-04
---

 * fix incorrectly pathed faktory-work bin in package.json

0.9.1 | 2018-03-30
---

 * Fixed issues where job payload attributes assumed to be defaulted by the faktory server were not being sent by the client. [The server does not default these](https://gitter.im/contribsys/faktory?at=5abe55f32b9dfdbc3a3bbafc) so now faktory-client defaults these values.

0.9.0 | 2018-03-28
---

 * adds `faktory.use` to add middleware to the job execution stack (koa.js style)

0.8.1 | 2018-03-26
---

 * bugfix: process.exit after graceful shutdown of manager

0.8.0 | 2018-03-24
---

 * Upgrade faktory-client to `v0.6.0`
 * FAKTORY_URL is parsed by URL lib—must contain protocol `tcp://` where it previously did not

0.7.0 | 2018-02-05
---

 * Upgrade faktory-client to `v0.5.0`
 * Run tests against faktory `v0.7.0`
 * Allow `options.heartbeatInterval` override (default 15s)
 * Gracefully reconnect when connections are interrupted / closed

0.6.3 | 2017-11-19
---

 * Allow jobs to reject and FAIL with a string or undefined (without an error object). [#2](https://github.com/jbielick/faktory_worker_node/issues/2)

0.6.2 | 2017-11-12
---

 * Upgrade faktory-client to `v0.4.2`

0.6.1 | 2017-11-12
---

 * Check job timeout completion more frequently

0.6.0 | 2017-11-12
---

 * Upgrade faktory-client for faktory protocol version 2
 * BUGFIX: don't try to execute jobs that aren't dispatched
 * Interpret heartbeat response for quiet|terminate
 * Fix race condition in which graceful shutdown drains the pool too early and prevents the processor from ACKing of FAILing a job
 * Heartbeat now occurs only for the manager, not for every processor and connection in the pool.
 * Tests now run in parallel; faktory is not spawned by node. The faktory server must be started before running the tests. Use bin/server for convenience.

0.5.0 | 2017-11-11
---

 * Shuffle the queues array to prevent queue starvation

0.4.1 | 2017-11-11
---

 * Throwing / propagating errors during .execute() was causing some stabilities issues when shutting down the process. I believe this was interrupting with the normal work .loop() and preventing graceful shutdown. Ideally, the errors thrown in jobs are propagated to the application code in an emitter or registered callback (e.g. errorCallbacks << () => { ... }) so applications can send those errors to a reporting service. Until then, the error is logged to console.error instead of thrown. The same applies for dispatching.

0.4.0 | 2017-11-11
---

 * Based on the discussion in gitter, it became evident that a best practice for throughput was to create a pool of connections equal to the desired concurrency. This didn't produce fruitful results at first, but the introduction of a Processor pool within the Manager with a connection pool of TCP sockets to the faktory server produced some substantial (2x+) improvements to throughput and some pieces of the code became easier to reason about.

 Prior to this work:
    Concurrency: 20
    Duration: 4.639131743s
    Jobs/s: 6467
 With Processor Pool:
    Concurrency: 20
    Duration: 3.31144746s
    Jobs/s: 9059

 - *benchmarking was done by running faktory directly, not through docker*

 * Introduce Processor pool (w/ connection pool) within Manager: the number of TCP connections to the faktory server will now be equal to the concurrency setting (default 20).
 * benchmark scripts added

0.3.0 | 2017-11-01
---

 * Add heartbeat
 * Allow `concurrency` option in constructor, CLI


0.2.6 | 2017-10-28
---

 * .stop() waits for the in-progress job to complete before timeout
 * Upgrades `faktory-client` dependency to 0.2.2

0.2.5 | 2017-10-28
---

 * Upgrades faktory-client to 0.2.1

0.2.4 | 2017-10-28
---

 * Shutdown gracefully via .stop()

0.2.0 | 2017-10-28
---

 * Extact client code to `faktory-client` package
 * Add TravisCI
 * Use async/await
 * Tests for manager.js
 * add ava for tests, nyc for coverage

## `faktory-client` (moved to this repo)

0.6.0 | 2018-03-24
---

 * connection URL is now parsed by the [node URL module](https://nodejs.org/api/url.html#url_the_whatwg_url_api). The previous URL parsing did not allow protocols hints (tls) or passwords in the url. Because the URL lib is now used, a connection string without a protocol cannot be used. `localhost:7419` and the like will not work—please use `tcp://localhost:7419`

0.5.0 | 2018-02-04
---

 * Refactor connection process: reconnect on close if not initial connection attempt
 * Improve debug logging output
 * Use assert module for response expectations
 * Parse connection URLs better (allow tcp://)

0.4.3 | 2017-11-12
---

 * Bugfix: in the rare case a response is dropped from the server, the code was using a variable that was not defined to log the dropped message.

0.4.2 | 2017-11-12
---

 * Bugfix: server now sends NULL for fetch requests when queues are empty. The code attempted to use string methods on this, expecting that it was a buffer/string.

0.4.1 | 2017-11-12
---

 * Test updates

0.4.0 | 2017-11-12
---

 * Updates for faktory protocol verison 2 compatibility https://github.com/contribsys/faktory/pull/72

### Breaking

 * Must provide `wid` in construction if the client is going to heartbeat, otherwise it will error.
 * .beat() now returns a string with either 'OK' or the `state` value 'quiet'|'terminate'
