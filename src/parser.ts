import { EventEmitter } from "events";

import RedisParser from "redis-parser";

interface Adapter {
  execute(buffer: Buffer): void;
}

/**
 * @private
 */
export default class Parser extends EventEmitter {
  adapter: Adapter;

  constructor() {
    super();
    this.adapter = new RedisParser({
      returnReply: (response: string) => this.emit("message", response),
      returnError: (err: Error) => this.emit("error", err),
    });
  }

  parse(buffer: Buffer): void {
    this.adapter.execute(buffer);
  }
}
