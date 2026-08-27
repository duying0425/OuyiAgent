import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, UpstreamError, normalizeError, openAIErrorBody } from '../src/errors.js';

test('AppError default properties', () => {
  const err = new AppError('test error');
  assert.equal(err.message, 'test error');
  assert.equal(err.status, 500);
  assert.equal(err.type, 'server_error');
  assert.equal(err.code, 'internal_error');
});

test('normalizeError with UpstreamError rate_limited', () => {
  const upstream = new UpstreamError('too many requests', { kind: 'rate_limited' });
  const app = normalizeError(upstream);
  assert.equal(app.status, 429);
  assert.equal(app.code, 'rate_limited');
});

test('openAIErrorBody format', () => {
  const err = new AppError('Bad request', { status: 400, type: 'invalid_request_error', code: 'bad_input' });
  const body = openAIErrorBody(err, 'req-123');
  assert.deepEqual(body, {
    error: {
      message: 'Bad request',
      type: 'invalid_request_error',
      param: null,
      code: 'bad_input',
      request_id: 'req-123',
    },
  });
});
