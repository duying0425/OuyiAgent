import { AppError } from './errors.js';
import { buildToolsSystemPrompt } from './tool-engine.js';

export function extractSystemAndPrompt(messages, tools = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AppError('messages must be a non-empty array', {
      status: 400,
      type: 'invalid_request_error',
      code: 'missing_messages',
    });
  }

  const systemParts = [];
  const conversation = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    let role = String(msg.role ?? 'user').toLowerCase();
    let content = '';
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .filter((part) => part && (part.type === 'text' || part.type === 'input_text' || typeof part === 'string'))
        .map((part) => (typeof part === 'string' ? part : part.text ?? ''))
        .join('\n');
    }

    // Handle assistant tool_calls in history
    if (!content && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      content = msg.tool_calls
        .map((tc) => `[Tool Call: ${tc.function?.name ?? 'unknown'}(${tc.function?.arguments ?? ''})]`)
        .join('\n');
    }

    if (role === 'system' || role === 'developer') {
      if (content.trim()) systemParts.push(content.trim());
    } else {
      if (role === 'tool' || role === 'function') {
        const toolName = msg.name || msg.tool_call_id || 'function';
        content = `[Tool Result: ${toolName}]\n${content}`;
        role = 'user';
      }
      if (content.trim()) {
        conversation.push({ role: role === 'assistant' ? 'assistant' : 'user', content });
      }
    }
  }

  if (Array.isArray(tools) && tools.length > 0) {
    systemParts.push(buildToolsSystemPrompt(tools));
  }

  const systemMessage = systemParts.join('\n\n');

  if (conversation.length === 0) {
    if (systemParts.length > 0) {
      conversation.push({ role: 'user', content: systemParts.pop() });
    } else {
      throw new AppError('At least one user or assistant message is required', {
        status: 400,
        type: 'invalid_request_error',
        code: 'missing_user_message',
      });
    }
  }

  let prompt = '';
  if (conversation.length === 1 && conversation[0].role === 'user') {
    prompt = conversation[0].content;
  } else {
    prompt = conversation
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
  }

  if (Array.isArray(tools) && tools.length > 0 && systemMessage) {
    prompt = `${systemMessage}\n\n${prompt}`;
  }
  return { systemMessage, prompt, conversation };
}

export async function translateChatRequest(body, catalog, { signal } = {}) {
  if (!body || typeof body !== 'object') {
    throw new AppError('Request body must be a JSON object', {
      status: 400,
      type: 'invalid_request_error',
      code: 'invalid_payload',
    });
  }

  const tools = Array.isArray(body.tools) ? body.tools : [];
  const { systemMessage, prompt, conversation } = extractSystemAndPrompt(body.messages, tools);
  const rawModel = typeof body.model === 'string' ? body.model.trim() : '';
  const model = await catalog.validateModel(rawModel, { signal });

  const stream = Boolean(body.stream);
  const maxTokens = Number.isSafeInteger(body.max_tokens) && body.max_tokens > 0 ? body.max_tokens : 4096;
  const temperature = typeof body.temperature === 'number' ? Math.max(0, Math.min(2, body.temperature)) : 0.7;

  return {
    model,
    systemMessage,
    prompt,
    conversation,
    stream,
    maxTokens,
    temperature,
    tools,
  };
}
