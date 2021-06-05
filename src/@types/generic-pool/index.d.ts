import { EventEmitter } from "koa";

declare module "generic-pool" {
  export interface Pool<T> {
    ready(): PromiseLike<void>;
  }
}
