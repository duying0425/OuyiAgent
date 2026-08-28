import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { AppError, normalizeError, openAIErrorBody } from './errors.js';
import { Semaphore } from './semaphore.js';
import { translateChatRequest } from './translator.js';
import { parseToolCallsFromText } from './tool-engine.js';

function writeJson(response, status, body) {
  if (response.writableEnded) return;
  const data = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  response.end(data);
}

function safeRequestId(header) {
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value)
    ? value
    : randomUUID();
}

function constantTimeEqual(left, right) {
  const a = createHash('sha256').update(String(left)).digest();
  const b = createHash('sha256').update(String(right)).digest();
  return timingSafeEqual(a, b);
}

function authorize(request, expectedKey) {
  const header = String(request.headers.authorization ?? '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return Boolean(match && constantTimeEqual(match[1], expectedKey));
}

function readJson(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(new AppError('Request body is too large', {
          status: 413,
          type: 'invalid_request_error',
          code: 'request_too_large',
        }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(new AppError('Request body must be valid JSON', {
          status: 400,
          type: 'invalid_request_error',
          code: 'invalid_json',
          cause: error,
        }));
      }
    });
    request.on('error', reject);
  });
}

function openAIChunk(id, created, model, delta, finishReason = null, usage) {
  const body = {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  if (usage) body.usage = usage;
  return body;
}

function routePath(request) {
  try { return new URL(request.url, 'http://adapter.local').pathname; }
  catch { return '/__invalid__'; }
}

export function createAdapterServer({ config, client, catalog, logger }) {
  const semaphore = new Semaphore(config.maxConcurrency);

  return http.createServer(async (request, response) => {
    const requestId = safeRequestId(request.headers['x-request-id']);
    response.setHeader('X-Request-Id', requestId);
    const startedAt = Date.now();
    const path = routePath(request);
    const abortController = new AbortController();
    request.once('aborted', () => abortController.abort(new Error('client aborted')));
    response.once('close', () => {
      if (!response.writableEnded) abortController.abort(new Error('client disconnected'));
    });

    try {
      if (request.method === 'GET' && path === '/healthz') {
        writeJson(response, 200, { status: 'ok', version: '0.1.0', provider: 'ouyi' });
        return;
      }

      if (request.method === 'GET' && path === '/readyz') {
        try {
          await catalog.get({ signal: abortController.signal, allowStale: true });
          writeJson(response, 200, {
            status: 'ready',
            account: client.getStatus(),
            catalog: catalog.status(),
            concurrency: semaphore.status(),
          });
        } catch (error) {
          writeJson(response, 503, {
            status: 'not_ready',
            account: client.getStatus(),
            catalog: catalog.status(),
          });
        }
        return;
      }

      if (!authorize(request, config.adapterApiKey)) {
        throw new AppError('Invalid or missing API key', {
          status: 401,
          type: 'authentication_error',
          code: 'invalid_api_key',
        });
      }

      if (request.method === 'GET' && path === '/v1/models') {
        const list = await catalog.formatOpenAIList({ signal: abortController.signal });
        writeJson(response, 200, list);
        return;
      }

      if (request.method === 'POST' && path === '/v1/chat/completions') {
        const body = await readJson(request, config.maxRequestBytes);
        const translated = await translateChatRequest(body, catalog, { signal: abortController.signal });

        await semaphore.acquire();
        let topicId = null;

        try {
          topicId = await client.createTopic({
            model: translated.model,
            systemMessage: translated.systemMessage,
            maxTokens: translated.maxTokens,
            temperature: translated.temperature,
            signal: abortController.signal,
          });

          const botMsgId = await client.sendMessage({
            topicId,
            content: translated.prompt,
            signal: abortController.signal,
          });

          const created = Math.floor(startedAt / 1000);
          const completionId = `chatcmpl-${randomUUID().replace(/-/g, '')}`;

          if (translated.stream && (!translated.tools || translated.tools.length === 0)) {
            response.writeHead(200, {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            });

            response.write(`data: ${JSON.stringify(openAIChunk(completionId, created, translated.model, { role: 'assistant', content: '' }))}\n\n`);

            let fullText = '';
            for await (const deltaText of client.streamMessage({ botMsgId, signal: abortController.signal })) {
              fullText += deltaText;
              response.write(`data: ${JSON.stringify(openAIChunk(completionId, created, translated.model, { content: deltaText }))}\n\n`);
            }

            const estPromptTokens = Math.max(1, Math.ceil(translated.prompt.length / 2));
            const estCompletionTokens = Math.max(1, Math.ceil(fullText.length / 2));
            const usage = {
              prompt_tokens: estPromptTokens,
              completion_tokens: estCompletionTokens,
              total_tokens: estPromptTokens + estCompletionTokens,
            };

            response.write(`data: ${JSON.stringify(openAIChunk(completionId, created, translated.model, {}, 'stop', usage))}\n\n`);
            response.write('data: [DONE]\n\n');
            response.end();
          } else {
            let fullText = '';
            for await (const deltaText of client.streamMessage({ botMsgId, signal: abortController.signal })) {
              fullText += deltaText;
            }

            const estPromptTokens = Math.max(1, Math.ceil(translated.prompt.length / 2));
            const estCompletionTokens = Math.max(1, Math.ceil(fullText.length / 2));
            const usage = {
              prompt_tokens: estPromptTokens,
              completion_tokens: estCompletionTokens,
              total_tokens: estPromptTokens + estCompletionTokens,
            };

            const { text: contentText, toolCalls } = parseToolCallsFromText(fullText, translated.tools);
            const hasToolCalls = Boolean(toolCalls && toolCalls.length > 0);

            logger?.info('chat_completion_result', {
              requestId,
              model: translated.model,
              has_tool_calls: hasToolCalls,
              tools_called: hasToolCalls ? toolCalls.map((t) => t.function.name) : [],
              stream: translated.stream,
            });

            if (translated.stream) {
              response.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
              });

              if (hasToolCalls) {
                if (contentText) {
                  response.write(`data: ${JSON.stringify(openAIChunk(completionId, created, translated.model, { role: 'assistant', content: contentText }))}\n\n`);
                }
                response.write(`data: ${JSON.stringify(openAIChunk(completionId, created, translated.model, { role: 'assistant', content: null, tool_calls: toolCalls }))}\n\n`);
                response.write(`data: ${JSON.stringify(openAIChunk(completionId, created, translated.model, {}, 'tool_calls', usage))}\n\n`);
              } else {
                response.write(`data: ${JSON.stringify(openAIChunk(completionId, created, translated.model, { role: 'assistant', content: fullText }))}\n\n`);
                response.write(`data: ${JSON.stringify(openAIChunk(completionId, created, translated.model, {}, 'stop', usage))}\n\n`);
              }
              response.write('data: [DONE]\n\n');
              response.end();
            } else {
              writeJson(response, 200, {
                id: completionId,
                object: 'chat.completion',
                created,
                model: translated.model,
                choices: [
                  {
                    index: 0,
                    message: {
                      role: 'assistant',
                      content: hasToolCalls ? (contentText || null) : fullText,
                      ...(hasToolCalls ? { tool_calls: toolCalls } : {}),
                    },
                    finish_reason: hasToolCalls ? 'tool_calls' : 'stop',
                  },
                ],
                usage,
              });
            }
          }

          logger?.info('chat_completed', {
            requestId,
            model: translated.model,
            stream: translated.stream,
            durationMs: Date.now() - startedAt,
          });
        } finally {
          semaphore.release();
          if (topicId) {
            client.deleteTopic({ topicId }).catch(() => {});
          }
        }
        return;
      }

      throw new AppError(`Route ${request.method} ${path} not found`, {
        status: 404,
        type: 'invalid_request_error',
        code: 'route_not_found',
      });
    } catch (error) {
      const normalized = normalizeError(error);
      logger?.error('request_failed', {
        requestId,
        path,
        status: normalized.status,
        code: normalized.code,
        message: normalized.message,
      });
      writeJson(response, normalized.status, openAIErrorBody(normalized, requestId));
    }
  });
}
