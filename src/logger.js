const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function sanitize(value) {
  if (typeof value === 'string') {
    return value.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[REDACTED]')
      .replace(/(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '$1.[REDACTED]');
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (['authorization', 'ouyi_token', 'adapter_api_key', 'token'].includes(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = sanitize(v);
    }
  }
  return out;
}

export function createLogger(minLevel = 'info') {
  const current = LEVELS[minLevel.toLowerCase()] ?? LEVELS.info;
  function log(level, event, data = {}) {
    if ((LEVELS[level] ?? 0) < current) return;
    const entry = {
      time: new Date().toISOString(),
      level,
      event,
      ...sanitize(data),
    };
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  }
  return {
    debug: (evt, data) => log('debug', evt, data),
    info: (evt, data) => log('info', evt, data),
    warn: (evt, data) => log('warn', evt, data),
    error: (evt, data) => log('error', evt, data),
  };
}
