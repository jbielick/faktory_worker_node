const faktory = require('../');

// define a function for your job
const doWork = (job, done) => (id, size) => {
  // do some work with the given arguments
  // call `done` when finished with or without an error
  console.log(`working on job ${job.jid}`);

  setTimeout(() => {
    done();
  }, 1);
}

faktory.register('MyDoWorkJob', doWork);

// this will block and listen for signals
faktory.work();
