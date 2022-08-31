#!/usr/bin/env node

import { Command } from "commander";
import path from "path";
const program = new Command();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require("../package.json");

function collect(val: string, memo: Array<string>) {
  return memo.concat(val);
}

type QueuesFromArgs = {
  unweighted: string[];
  weighted: { [queue: string]: number };
};

function collectQueues(val: string, memo: QueuesFromArgs): QueuesFromArgs {
  const elements = val.split(",");
  if (elements.length > 1) {
    const weight = Number(elements.pop());
    memo.weighted[elements.join(",")] = weight;
  } else {
    memo.unweighted = memo.unweighted.concat(val);
  }
  return memo;
}

function requirePath(val: string) {
  if (path.isAbsolute(val)) {
    require(val);
  } else if (val.startsWith(".")) {
    require(path.resolve(val));
  } else {
    require(val);
  }
}

program
  .version(`faktory-worker ${version}`)
  .usage("[options]")
  .description(
    `
   ___     __   __                                  __
  / _/__ _/ /__/ /____  ______ __  _    _____  ____/ /_____ ____
 / _/ _ \`/  '_/ __/ _ \\/ __/ // / | |/|/ / _ \\/ __/  '_/ -_) __/
/_/ \\_,_/_/\\_\\\\__/\\___/_/  \\_, /  |__,__/\\___/_/ /_/\\_\\\\__/_/
                          /___/
  `
  )
  .option(
    "-q, --queue <name>",
    "queues to process with optional weights",
    collectQueues,
    { weighted: {}, unweighted: [] }
  )
  .option("-c, --concurrency <n>", "number of concurrent workers", parseInt)
  .option("-t, --timeout <n>", "shutdown timeout", parseInt)
  // .option('-e, --environment <env>', 'application environment')
  .option("-l, --label <label>", "worker label", collect, [])
  .option("-r, --require <path>", "worker directory to require", requirePath)
  .option("-v, --verbose", "print verbose output")
  .option("-v, --version", "print version and exit")
  .parse(process.argv);

const options = program.opts();

const {
  queue: { weighted, unweighted },
} = options;

if (Object.keys(weighted).length > 0 && unweighted.length > 0) {
  console.error(`error: cannot mix weighted and unweighted queue arguments.

Tips:
  For strictly ordered queues, do not provide weights.
  For weighted-random queues, provide queue-name,weight pairs for each --queue argument.
  For equally-weighted, random queues, provide queue-name,1 pairs (all weighted equally) for
    each --queue argument.
`);
  process.exit(1);
} else if (Object.keys(weighted).length > 0) {
  options.queues = weighted;
} else {
  options.queues = unweighted;
}

module.exports = { program, options };
