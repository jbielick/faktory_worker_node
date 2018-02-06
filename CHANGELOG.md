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

