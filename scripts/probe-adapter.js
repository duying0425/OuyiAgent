const base = process.env.ADAPTER_URL || 'http://127.0.0.1:8081';
const key = process.env.ADAPTER_API_KEY || 'test-key';

async function run() {
  console.log(`Probing adapter at ${base}...`);
  
  // 1. Healthz
  const hRes = await fetch(`${base}/healthz`);
  console.log('Healthz status:', hRes.status, await hRes.json());

  // 2. Models
  const mRes = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  console.log('Models status:', mRes.status);
  const models = await mRes.json();
  console.log(`Models count: ${models.data?.length}`);

  // 3. Chat
  const cRes = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: models.data?.[0]?.id || 'ouyi-chat',
      messages: [{ role: 'user', content: 'Ping' }],
      stream: false
    })
  });
  console.log('Chat status:', cRes.status);
  console.log('Chat response:', await cRes.json());
}

run().catch(console.error);
