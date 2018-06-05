#!/usr/bin/env node

const program = require('commander');
const { version } = require('../package.json');

function collectSplit(val, memo) {
  return memo.concat(val.split(','));
}

module.exports = program
  .version(`faktory-worker ${version}`)
  .usage('[options]')
  .description(`
   ___     __   __                                  __
  / _/__ _/ /__/ /____  ______ __  _    _____  ____/ /_____ ____
 / _/ _ \`/  '_/ __/ _ \\/ __/ // / | |/|/ / _ \\/ __/  '_/ -_) __/
/_/ \\_,_/_/\\_\\\\__/\\___/_/  \\_, /  |__,__/\\___/_/ /_/\\_\\\\__/_/
                          /___/
  `)
  .option('-q, --queue <queue[,weight]>', 'queues to process with optional weights', collectSplit, [])
  .option('-c, --concurrency <n>', 'number of concurrent workers', parseInt)
  .option('-t, --timeout <n>', 'shutdown timeout', parseInt)
  // .option('-e, --environment <env>', 'application environment')
  .option('-l, --label <label>', 'worker label', collect, [])
  // .option('-r, --require <path>', 'worker directory to require')
  .option('-v, --verbose', 'print verbose output')
  .option('-v, --version', 'print version and exit')
  .parse(process.argv);

program.queues = program.queue;
program.labels = program.label;
