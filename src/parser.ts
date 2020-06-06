const RedisParser = require('redis-parser');
const EventEmitter = require('events');

type Response = object;

/**
 * @private
 */
export default class Parser extends EventEmitter {
  constructor() {
    super();
    this.adapter = new RedisParser({
      returnReply: (response: Response) => this.emit('message', response),
      returnError: (err: Error) => this.emit('error', err),
    });
  }

  parse(buffer: Buffer) {
    this.adapter.execute(buffer);
  }
}
