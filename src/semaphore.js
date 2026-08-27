export class Semaphore {
  constructor(capacity) {
    this.capacity = capacity;
    this.running = 0;
    this.queue = [];
  }

  status() {
    return { capacity: this.capacity, running: this.running, queued: this.queue.length };
  }

  acquire() {
    if (this.running < this.capacity) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.running = Math.max(0, this.running - 1);
    }
  }
}
