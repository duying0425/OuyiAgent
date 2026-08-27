import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSystemAndPrompt, translateChatRequest } from '../src/translator.js';

test('extractSystemAndPrompt extracts system message and single user message', () => {
  const messages = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' }
  ];
  const res = extractSystemAndPrompt(messages);
  assert.equal(res.systemMessage, 'You are helpful.');
  assert.equal(res.prompt, 'Hello');
});

test('extractSystemAndPrompt formats multi-turn dialogue', () => {
  const messages = [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello!' },
    { role: 'user', content: 'How are you?' }
  ];
  const res = extractSystemAndPrompt(messages);
  assert.ok(res.prompt.includes('User: Hi'));
  assert.ok(res.prompt.includes('Assistant: Hello!'));
  assert.ok(res.prompt.includes('User: How are you?'));
});

test('translateChatRequest validates body and model', async () => {
  const fakeCatalog = {
    validateModel: async (m) => m || 'default-model'
  };
  const res = await translateChatRequest({
    model: 'claude-3-7-sonnet',
    messages: [{ role: 'user', content: 'test' }],
    stream: true,
    temperature: 0.5,
  }, fakeCatalog);

  assert.equal(res.model, 'claude-3-7-sonnet');
  assert.equal(res.stream, true);
  assert.equal(res.temperature, 0.5);
});
