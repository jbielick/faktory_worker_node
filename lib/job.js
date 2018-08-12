class Job {
  constructor(jobtype) {
    if (!jobtype) throw new Error('must provide jobtype');
    this.payload = {
      jobtype,
      args: [],
    };
  }
  client(client) {
    this.client = client;
    return this;
  }
  // with?
  args(...args) {
    this.payload.args = args;
    return this;
  }
  at(time) {
    this.payload.at = time;
    return this;
  }
  retry(enable = true) {
    this.payload.retry = enable;
    return this;
  }
  custom(data) {
    this.payload.custom = data;
    return this;
  }
  reserveFor(seconds) {
    this.payload.reserve_for = seconds;
    return this;
  }
  queue(name) {
    this.payload.queue = name;
    return this;
  }
  priority(num) {
    this.payload.priority = parseInt(num, 10);
    return this;
  }
  toJSON() {
    return Object.assign({}, this.payload);
  }
  push() {
    return this.client.push(this.toJSON());
  }
}

module.exports = Job;
