import { default as makeDebug } from "debug";
import { Client } from "./client";
import { Job } from "./job";
import { encode } from "./utils";

const debug = makeDebug("faktory-worker:batch");

export type BatchOptions = {
  description?: string;
  success?: Job;
  complete?: Job;
};

export type BatchStatus = {
  bid: string;
  total: number;
  pending: number;
  failed: number;
  created_at: string;
  description?: string;
  complete_st: string;
  success_st: string;
};

export class Batch {
  bid: string;
  description?: string;
  success?: Job;
  complete?: Job;
  private client: Client;
  private committed: boolean;
  private isNew: boolean;

  constructor(client: Client, options: BatchOptions = {}) {
    this.client = client;
    this.bid = "";
    this.committed = false;
    this.isNew = true;
    this.description = options.description;
    this.success = options.success;
    this.complete = options.complete;
  }

  toJSON(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (this.description) payload.description = this.description;
    if (this.success) payload.success = this.success.toJSON();
    if (this.complete) payload.complete = this.complete.toJSON();
    return payload;
  }

  async jobs(fn: () => Promise<void>): Promise<void> {
    if (!this.isNew) {
      throw new Error("batch must be new to call jobs()");
    }
    this.bid = await this.client.batchNew(this);
    this.isNew = false;
    debug("created batch %s", this.bid);
    try {
      await fn();
    } finally {
      await this.commit();
    }
  }

  async push(job: Job): Promise<string> {
    if (!this.bid) {
      throw new Error("batch must be opened before it can be used");
    }
    if (this.committed) {
      throw new Error("batch has already been committed, must reopen");
    }
    job.custom = { ...(job.custom || {}), bid: this.bid };
    return this.client.push(job);
  }

  async commit(): Promise<void> {
    if (this.committed) {
      throw new Error("batch has already been committed, must reopen");
    }
    await this.client.batchCommit(this.bid);
    this.committed = true;
    debug("committed batch %s", this.bid);
  }
}
