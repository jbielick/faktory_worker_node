import test from "ava";

import { Parser } from "../parser";

test.cb("parses HI", (t) => {
  const parser = new Parser();
  parser.on("error", t.end);
  parser.on("message", (resp) => {
    t.is(resp, 'HI {"v":2}');
    t.end();
  });
  parser.parse(new Buffer('+HI {"v":2}\r\n'));
});

test.cb("parses HI with salt", (t) => {
  const parser = new Parser();
  parser.on("error", t.end);
  parser.on("message", (resp) => {
    t.is(resp, 'HI {"v":2,"s":"123456789abc","i":1735}');
    t.end();
  });
  parser.parse(new Buffer('+HI {"v":2,"s":"123456789abc","i":1735}\r\n'));
});

test.cb("parses OK", (t) => {
  const parser = new Parser();
  parser.on("error", t.end);
  parser.on("message", (resp) => {
    t.is(resp, "OK");
    t.end();
  });
  parser.parse(new Buffer("+OK\r\n"));
});

test.cb("parses work unit", (t) => {
  const parser = new Parser();
  parser.on("error", t.end);
  parser.on("message", (resp) => {
    t.is(resp, '{"jid":"1234"}');
    t.end();
  });
  parser.parse(new Buffer('+{"jid":"1234"}\r\n'));
});

test.cb("parses errors", (t) => {
  const parser = new Parser();
  parser.on("error", (err) => {
    console.log(err);
    t.is(err.message, "ERR Something wrong");
    t.end();
  });
  parser.on("message", () => t.fail());
  parser.parse(new Buffer("-ERR Something wrong\r\n"));
});

test.cb("parses fatal errors", (t) => {
  const parser = new Parser();
  parser.on("error", (err) => {
    t.truthy(/Protocol error/.test(err.message));
    t.end();
  });
  parser.on("message", () => t.fail());
  parser.parse(new Buffer("invalid\r\n"));
});
