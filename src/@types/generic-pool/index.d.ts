import "generic-pool";

declare module "generic-pool" {
  export interface Pool {
    ready(): PromiseLike<void>;
  }
}
