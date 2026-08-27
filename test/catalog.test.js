import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelCatalog } from '../src/catalog.js';

test('ModelCatalog returns fallback when client fails', async () => {
  const fakeClient = {
    fetchModelCatalog: async () => { throw new Error('network down'); }
  };
  const catalog = new ModelCatalog(fakeClient, { ttlMs: 1000 });
  const list = await catalog.get();
  assert.ok(list.length > 0);
  assert.ok(list.includes('claude-3-7-sonnet-20250219-vip'));
});

test('ModelCatalog formats OpenAI model list', async () => {
  const fakeClient = {
    fetchModelCatalog: async () => ['model-a', 'model-b']
  };
  const catalog = new ModelCatalog(fakeClient);
  const openAIList = await catalog.formatOpenAIList();
  assert.equal(openAIList.object, 'list');
  assert.equal(openAIList.data.length, 2);
  assert.equal(openAIList.data[0].id, 'model-a');
  assert.equal(openAIList.data[0].owned_by, 'ouyi');
});
