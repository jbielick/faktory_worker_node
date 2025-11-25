import { JobPayload, JobFunction } from "./job";
import { Middleware as KoaMiddleware } from "koa-compose";

export interface Context {
  job: JobPayload;
  signal: AbortSignal;
  fn?: JobFunction;
}

export type Middleware = KoaMiddleware<Context>;
