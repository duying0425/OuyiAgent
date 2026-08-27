export class AppError extends Error {
  constructor(message, {
    status = 500,
    type = 'server_error',
    code = 'internal_error',
    param = null,
    retryable = false,
    cause,
  } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.status = status;
    this.type = type;
    this.code = code;
    this.param = param;
    this.retryable = retryable;
  }
}

export class UpstreamError extends Error {
  constructor(message, {
    kind = 'upstream_error',
    status = 502,
    retryable = false,
    cause,
  } = {}) {
    super(message, { cause });
    this.name = 'UpstreamError';
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

export function normalizeError(error) {
  if (error instanceof AppError) return error;
  if (error instanceof UpstreamError) {
    const status = error.kind === 'rate_limited' ? 429 : 502;
    return new AppError(error.message, {
      status,
      type: 'upstream_error',
      code: error.kind,
      retryable: error.retryable,
      cause: error,
    });
  }
  return new AppError('Internal server error', { cause: error });
}

export function openAIErrorBody(error, requestId) {
  const normalized = normalizeError(error);
  return {
    error: {
      message: normalized.message,
      type: normalized.type,
      param: normalized.param,
      code: normalized.code,
      request_id: requestId,
    },
  };
}
