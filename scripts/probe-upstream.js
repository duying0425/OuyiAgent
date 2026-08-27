import { loadConfig } from '../src/config.js';
import { UpstreamClient } from '../src/upstream-client.js';

async function run() {
  const config = loadConfig();
  const client = new UpstreamClient(config);
  console.log('1. Probing Ouyi memberInfo & catalog...');
  const models = await client.fetchModelCatalog();
  console.log(`Found ${models.length} models. Sample:`, models.slice(0, 8));

  const allowCompletion = process.argv.includes('--allow-completion');
  if (!allowCompletion) {
    console.log('\n[INFO] Pass --allow-completion to test an actual generation.');
    return;
  }

  const testModel = models.includes('claude-3-7-sonnet-20250219-vip')
    ? 'claude-3-7-sonnet-20250219-vip'
    : (models[0] || 'ouyi-chat');

  console.log(`\n2. Testing live completion with ${testModel}...`);
  const topicId = await client.createTopic({ model: testModel });
  try {
    const botMsgId = await client.sendMessage({ topicId, content: '请回复五个字：测试已通过。' });
    let text = '';
    for await (const chunk of client.streamMessage({ botMsgId })) {
      text += chunk;
      process.stdout.write(chunk);
    }
    console.log(`\n\nCompletion completed (${text.length} chars).`);
  } finally {
    console.log('3. Cleaning up test topic...');
    await client.deleteTopic({ topicId });
    console.log('Topic deleted.');
  }
}

run().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
