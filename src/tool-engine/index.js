import { renderDefaultTemplate } from './templates/default.js';
import { renderHermesTemplate } from './templates/hermes.js';
import { extractToolBlock } from './parsers/block-parser.js';
import { normalizeToolCalls } from './parsers/normalizer.js';

export class ToolEngine {
  constructor({ template = 'default', logger } = {}) {
    this.template = template;
    this.logger = logger;
  }

  formatInbound({ tools = [], toolChoice = 'auto' } = {}) {
    const hasTools = Array.isArray(tools) && tools.length > 0 && toolChoice !== 'none';
    let toolPrompt = '';

    if (hasTools) {
      if (this.template === 'hermes') {
        toolPrompt = renderHermesTemplate({ tools, toolChoice });
      } else {
        toolPrompt = renderDefaultTemplate({ tools, toolChoice });
      }
    }

    return {
      hasTools,
      toolPrompt,
      tools,
      toolChoice,
    };
  }

  formatMessage(message) {
    let content = '';
    if (typeof message.content === 'string') {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      content = message.content
        .filter((part) => part && (part.type === 'text' || typeof part === 'string'))
        .map((part) => (typeof part === 'string' ? part : part.text ?? ''))
        .join('\n');
    }

    if (!content && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      content = message.tool_calls
        .map((tc) => '[Tool Call: ' + (tc.function?.name ?? 'unknown') + '(' + (tc.function?.arguments ?? '') + ')]')
        .join('\n');
    }

    const role = String(message.role ?? 'user').toLowerCase();
    if (role === 'tool' || role === 'function') {
      const toolName = message.name || message.tool_call_id || 'function';
      content = '[Tool Result: ' + toolName + ']\n' + content;
    }

    return { role: (role === 'tool' || role === 'function') ? 'user' : role, content };
  }

  parseOutbound(rawText, tools = []) {
    if (!rawText || typeof rawText !== 'string') {
      return { content: '', toolCalls: null, finishReason: 'stop' };
    }

    const { rawPayload, cleanContent } = extractToolBlock(rawText);
    if (!rawPayload) {
      return { content: rawText, toolCalls: null, finishReason: 'stop' };
    }

    const toolCalls = normalizeToolCalls(rawPayload, tools);
    if (!toolCalls) {
      return { content: rawText, toolCalls: null, finishReason: 'stop' };
    }

    return {
      content: cleanContent || null,
      toolCalls,
      finishReason: 'tool_calls',
    };
  }
}

export const defaultToolEngine = new ToolEngine();
