import crypto from 'node:crypto';
import fs from 'node:fs';

const envPath = '.env';
const examplePath = '.env.example';

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('Created .env from .env.example');
  } else {
    fs.writeFileSync(envPath, '', 'utf8');
  }
}

let content = fs.readFileSync(envPath, 'utf8');
const randomKey = crypto.randomBytes(32).toString('hex');

if (content.includes('ADAPTER_API_KEY=replace-with') || !content.includes('ADAPTER_API_KEY=')) {
  content = content.replace(/ADAPTER_API_KEY=.*/, `ADAPTER_API_KEY=${randomKey}`);
  if (!content.includes('ADAPTER_API_KEY=')) {
    content += `\nADAPTER_API_KEY=${randomKey}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
  console.log('Generated new ADAPTER_API_KEY in .env');
} else {
  console.log('ADAPTER_API_KEY already configured in .env');
}
