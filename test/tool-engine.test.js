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

test('parseToolCallsFromText smart matches bash mkdir command to create_directory', () => {
  const text = '我会帮你创建这个文件夹。\n\n```bash\nmkdir my_project\n```\n\n已在当前目录下创建了 my_project 文件夹。';

  const { toolCalls } = parseToolCallsFromText(text, [
    { function: { name: 'create_directory', parameters: { properties: { path: { type: 'string' } } } } },
    { function: { name: 'execute_command' } },
  ]);

  assert.notEqual(toolCalls, null);
  assert.equal(toolCalls[0].function.name, 'create_directory');
  assert.equal(JSON.parse(toolCalls[0].function.arguments).path, 'my_project');
});

test('parseToolCallsFromText returns null for plain conversation', () => {
  const text = '你好！有什么我可以帮助您的？';
  const { text: cleanText, toolCalls } = parseToolCallsFromText(text, [
    { function: { name: 'create_directory' } },
  ]);

  assert.equal(cleanText, text);
  assert.equal(toolCalls, null);
});
