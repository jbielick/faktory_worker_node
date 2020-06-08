const RedisParser = require('redis-parser');
const EventEmitter = require('events');

type EventHandler = (resp: any) => void | any;

/**
 * @private
 */
export default class Parser extends EventEmitter {
  on: (event: string, handler: EventHandler) => Parser;
  emit: (event: string, object: any) => Parser;

  constructor() {
    super();
    this.adapter = new RedisParser({
      returnReply: (response: string) =>
        this.emit("message", response),
      returnError: (err: Error) => this.emit("error", err),
    });
  }

  parse(buffer: Buffer) {
    this.adapter.execute(buffer);
  }
}
