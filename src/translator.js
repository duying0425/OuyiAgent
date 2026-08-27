import { AppError } from './errors.js';

export function extractSystemAndPrompt(messages) {
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
    const role = String(msg.role ?? 'user').toLowerCase();
    let content = '';
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .filter((part) => part && part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n');
    }

    if (role === 'system') {
      if (content.trim()) systemParts.push(content.trim());
    } else {
      conversation.push({ role, content });
    }
  }

  const systemMessage = systemParts.join('\n\n');

  if (conversation.length === 0) {
    throw new AppError('At least one user or assistant message is required', {
      status: 400,
      type: 'invalid_request_error',
      code: 'missing_user_message',
    });
  }

  // If single message, use it directly. If multi-turn, format cleanly.
  let prompt = '';
  if (conversation.length === 1 && conversation[0].role === 'user') {
    prompt = conversation[0].content;
  } else {
    prompt = conversation
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
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

  const { systemMessage, prompt, conversation } = extractSystemAndPrompt(body.messages);
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
  };
}
