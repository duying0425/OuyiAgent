import test from 'node:test';
import assert from 'node:assert/strict';
import { Semaphore } from '../src/semaphore.js';

test('Semaphore limits concurrent operations', async () => {
  const sem = new Semaphore(2);
  let active = 0;
  let maxActive = 0;

  async function worker() {
    await sem.acquire();
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 10));
    active -= 1;
    sem.release();
  }

  await Promise.all([worker(), worker(), worker(), worker()]);
  assert.equal(maxActive, 2);
  assert.equal(sem.status().running, 0);
  assert.equal(sem.status().queued, 0);
});
