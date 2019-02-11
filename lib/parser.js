const RedisParser = require('redis-parser');
const EventEmitter = require('events');

/**
 * @private
 */
class Parser extends EventEmitter {
  constructor() {
    super();
    this.adapter = new RedisParser({
      returnReply: response => this.emit('message', response),
      returnError: err => this.emit('error', err),
    });
  }

  parse(buffer) {
    this.adapter.execute(buffer);
  }
}

module.exports = Parser;
