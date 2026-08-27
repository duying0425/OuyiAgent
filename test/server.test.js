import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdapterServer } from '../src/server.js';

const config = {
  host: '127.0.0.1',
  port: 0,
  adapterApiKey: 'test-adapter-key-12345678',
  maxConcurrency: 2,
  maxRequestBytes: 1024 * 1024,
  upstreamTimeoutMs: 5000,
};

test('GET /healthz returns ok without auth', async () => {
  const fakeClient = { getStatus: () => ({ state: 'healthy' }) };
  const fakeCatalog = { status: () => ({ count: 1 }) };
  const server = createAdapterServer({ config, client: fakeClient, catalog: fakeCatalog });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.provider, 'ouyi');
  } finally {
    server.close();
  }
});

test('POST /v1/chat/completions requires valid API key', async () => {
  const fakeClient = { getStatus: () => ({ state: 'healthy' }) };
  const fakeCatalog = { status: () => ({ count: 1 }) };
  const server = createAdapterServer({ config, client: fakeClient, catalog: fakeCatalog });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    });
    assert.equal(res.status, 401);
    const err = await res.json();
    assert.equal(err.error.code, 'invalid_api_key');
  } finally {
    server.close();
  }
});
