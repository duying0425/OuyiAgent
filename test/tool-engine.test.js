import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolEngine, defaultToolEngine } from '../src/tool-engine/index.js';
import { extractToolBlock } from '../src/tool-engine/parsers/block-parser.js';
import { normalizeToolCalls } from '../src/tool-engine/parsers/normalizer.js';

test('formatInbound renders default template with toolChoice auto', () => {
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

  const inbound = defaultToolEngine.formatInbound({ tools, toolChoice: 'auto' });
  assert.equal(inbound.hasTools, true);
  assert.match(inbound.toolPrompt, /create_directory/);
  assert.match(inbound.toolPrompt, /Create directory on filesystem/);
  assert.match(inbound.toolPrompt, /tool_call/);
});

test('formatInbound respects toolChoice none', () => {
  const tools = [{ function: { name: 'create_directory' } }];
  const inbound = defaultToolEngine.formatInbound({ tools, toolChoice: 'none' });
  assert.equal(inbound.hasTools, false);
  assert.equal(inbound.toolPrompt, '');
});

test('formatInbound respects toolChoice required', () => {
  const tools = [{ function: { name: 'create_directory' } }];
  const inbound = defaultToolEngine.formatInbound({ tools, toolChoice: 'required' });
  assert.match(inbound.toolPrompt, /You MUST invoke at least one tool/);
});

test('extractToolBlock parses markdown block', () => {
  const text = 'Thought process.\n```tool_call\n[{"name": "create_directory", "arguments": {"path": "test"}}]\n```';
  const { rawPayload, cleanContent } = extractToolBlock(text);
  assert.equal(cleanContent, 'Thought process.');
  assert.match(rawPayload, /create_directory/);
});

test('extractToolBlock parses XML tags', () => {
  const text = '<tool_call>\n[{"name": "run_command", "arguments": {"command": "ls"}}]\n</tool_call>';
  const { rawPayload, cleanContent } = extractToolBlock(text);
  assert.equal(cleanContent, '');
  assert.match(rawPayload, /run_command/);
});

test('normalizeToolCalls validates and creates standard OpenAI tool_calls', () => {
  const payload = JSON.stringify([{ name: 'create_directory', arguments: { path: '0828' } }]);
  const toolCalls = normalizeToolCalls(payload, [{ function: { name: 'create_directory' } }]);
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].type, 'function');
  assert.equal(toolCalls[0].function.name, 'create_directory');
  assert.equal(JSON.parse(toolCalls[0].function.arguments).path, '0828');
  assert.match(toolCalls[0].id, /^call_/);
});

test('parseOutbound handles natural conversation without tools cleanly', () => {
  const text = '你好！有什么我可以帮你的吗？';
  const res = defaultToolEngine.parseOutbound(text, [{ function: { name: 'create_directory' } }]);
  assert.equal(res.content, text);
  assert.equal(res.toolCalls, null);
  assert.equal(res.finishReason, 'stop');
});
