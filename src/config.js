const DEFAULTS = Object.freeze({
  host: '0.0.0.0',
  port: 8081,
  upstreamBaseUrl: 'https://api-8.rcouyi.com',
  maxConcurrency: 3,
  maxRequestBytes: 8 * 1024 * 1024,
  upstreamTimeoutMs: 5 * 60 * 1000,
  catalogTtlMs: 10 * 60 * 1000,
  logLevel: 'info',
});

function readPositiveInteger(env, name, fallback, { max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new Error(`${name} must be a positive integer no greater than ${max}`);
  }
  return value;
}

function readRequiredSecret(env, name) {
  const value = String(env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required`);
  if (/^replace-with/i.test(value)) throw new Error(`${name} must not use an example placeholder`);
  if (value.length < 16) throw new Error(`${name} must contain at least 16 characters`);
  return value;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('OUYI_BASE_URL must use http or https');
  }
  return url.toString().replace(/\/$/, '');
}

export function loadConfig(env = process.env) {
  const logLevel = String(env.LOG_LEVEL ?? DEFAULTS.logLevel).toLowerCase();
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error('LOG_LEVEL must be debug, info, warn, or error');
  }

  return Object.freeze({
    host: String(env.HOST ?? DEFAULTS.host),
    port: readPositiveInteger(env, 'PORT', DEFAULTS.port, { max: 65535 }),
    adapterApiKey: readRequiredSecret(env, 'ADAPTER_API_KEY'),
    upstreamBaseUrl: normalizeBaseUrl(env.OUYI_BASE_URL ?? DEFAULTS.upstreamBaseUrl),
    upstreamToken: readRequiredSecret(env, 'OUYI_TOKEN'),
    maxConcurrency: readPositiveInteger(env, 'MAX_CONCURRENCY', DEFAULTS.maxConcurrency, { max: 100 }),
    maxRequestBytes: readPositiveInteger(env, 'MAX_REQUEST_BYTES', DEFAULTS.maxRequestBytes),
    upstreamTimeoutMs: readPositiveInteger(env, 'UPSTREAM_TIMEOUT_MS', DEFAULTS.upstreamTimeoutMs),
    catalogTtlMs: readPositiveInteger(env, 'CATALOG_TTL_MS', DEFAULTS.catalogTtlMs),
    logLevel,
  });
}

export function publicConfig(config) {
  return {
    host: config.host,
    port: config.port,
    upstreamBaseUrl: config.upstreamBaseUrl,
    maxConcurrency: config.maxConcurrency,
    maxRequestBytes: config.maxRequestBytes,
    upstreamTimeoutMs: config.upstreamTimeoutMs,
    catalogTtlMs: config.catalogTtlMs,
    logLevel: config.logLevel,
  };
}
