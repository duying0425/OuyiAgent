import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToolsSystemPrompt, parseToolCallsFromText } from '../src/tool-engine.js';

test('buildToolsSystemPrompt formats tools cleanly', () => {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'create_directory',
        description: 'Create directory on filesystem',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
      },
    },
  ];

  const prompt = buildToolsSystemPrompt(tools);
  assert.match(prompt, /create_directory/);
  assert.match(prompt, /Create directory on filesystem/);
  assert.match(prompt, /tool_call/);
});

test('parseToolCallsFromText extracts markdown tool_call block', () => {
  const text = 'I will create the folder for you.\n```tool_call\n[\n  {\n    "name": "create_directory",\n    "arguments": {\n      "path": "test_folder"\n    }\n  }\n]\n```';

  const { text: cleanText, toolCalls } = parseToolCallsFromText(text, [
    { function: { name: 'create_directory' } },
  ]);

  assert.equal(cleanText, 'I will create the folder for you.');
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].function.name, 'create_directory');
  assert.equal(JSON.parse(toolCalls[0].function.arguments).path, 'test_folder');
});

test('parseToolCallsFromText extracts XML format', () => {
  const text = '<tool_call>\n[\n  {\n    "name": "run_command",\n    "arguments": { "command": "ls -la" }\n  }\n]\n</tool_call>';

  const { toolCalls } = parseToolCallsFromText(text, [
    { function: { name: 'run_command' } },
  ]);

  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].function.name, 'run_command');
});

test('parseToolCallsFromText returns null for plain conversation', () => {
  const text = '你好！有什么我可以帮助您的？';
  const { text: cleanText, toolCalls } = parseToolCallsFromText(text, [
    { function: { name: 'create_directory' } },
  ]);

  assert.equal(cleanText, text);
  assert.equal(toolCalls, null);
});
