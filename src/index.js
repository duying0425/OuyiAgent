import { ModelCatalog } from './catalog.js';
import { loadConfig, publicConfig } from './config.js';
import { createLogger } from './logger.js';
import { createAdapterServer } from './server.js';
import { UpstreamClient } from './upstream-client.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const client = new UpstreamClient(config, { logger });
  const catalog = new ModelCatalog(client, {
    ttlMs: config.catalogTtlMs,
    logger,
  });
  const server = createAdapterServer({ config, client, catalog, logger });

  server.requestTimeout = config.upstreamTimeoutMs + 30_000;
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 5_000;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });

  logger.info('ouyi_adapter_started', { config: publicConfig(config) });

  const shutdown = (signal) => {
    logger.info('ouyi_adapter_stopping', { signal });
    server.close((error) => {
      if (error) {
        logger.error('ouyi_adapter_stop_failed', { error });
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(JSON.stringify({
    time: new Date().toISOString(),
    level: 'error',
    event: 'ouyi_adapter_start_failed',
    error: { name: error.name, message: error.message },
  }));
  process.exitCode = 1;
});
