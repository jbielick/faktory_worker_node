declare module "redis-parser" {
  type Config = {
    returnReply: (response: string) => void;
    returnError: (error: Error) => void;
  };

  class RedisParser {
    // eslint-disable-next-line  @typescript-eslint/explicit-module-boundary-types
    constructor(config: Config);
    execute(buffer: Buffer): (err: Error | null, response: string) => void;
  }

  export default RedisParser;
}
