import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig validates required secrets', () => {
  assert.throws(() => loadConfig({}), /ADAPTER_API_KEY is required/);
  assert.throws(
    () => loadConfig({ ADAPTER_API_KEY: 'replace-with-example' }),
    /ADAPTER_API_KEY must not use an example placeholder/
  );
  assert.throws(
    () => loadConfig({ ADAPTER_API_KEY: '12345' }),
    /ADAPTER_API_KEY must contain at least 16 characters/
  );
});

test('loadConfig parses valid environment', () => {
  const config = loadConfig({
    ADAPTER_API_KEY: 'valid-secret-key-12345678',
    OUYI_TOKEN: 'valid-ouyi-jwt-token-12345678',
    PORT: '9000',
  });
  assert.equal(config.port, 9000);
  assert.equal(config.adapterApiKey, 'valid-secret-key-12345678');
  assert.equal(config.upstreamBaseUrl, 'https://api-8.rcouyi.com');
});
