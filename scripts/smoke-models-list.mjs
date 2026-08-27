import { loadConfig } from '../src/config.js';
import { ModelCatalog } from '../src/catalog.js';
import { UpstreamClient } from '../src/upstream-client.js';

async function run() {
  const config = loadConfig();
  const client = new UpstreamClient(config);
  const catalog = new ModelCatalog(client);
  const list = await catalog.get();
  console.log(`Successfully discovered ${list.length} available models:`);
  console.log(list.join('\n'));
}

run().catch((err) => {
  console.error('Failed to list models:', err.message);
  process.exit(1);
});
