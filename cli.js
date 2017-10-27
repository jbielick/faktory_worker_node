#!/usr/bin/env node

var program = require('commander');

function list(val) {
  return val.split(',');
}

module.exports = program
  .version('0.1.0')
  .usage('[options]')
  .option('-q, --queues <items>', 'Comma-separated queues to work on', list)
  .parse(process.argv);
