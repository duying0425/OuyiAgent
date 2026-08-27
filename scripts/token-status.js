import { loadConfig } from '../src/config.js';

try {
  const config = loadConfig();
  const token = config.upstreamToken.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length < 2) {
    console.error('Invalid JWT token format');
    process.exit(1);
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
  console.log('=== Ouyi Token Status ===');
  console.log('Account:', payload.Account || payload.NickName || payload.MemberId);
  console.log('Issued At (iat):', new Date((payload.iat || 0) * 1000).toLocaleString());
  console.log('Expires At (exp):', new Date((payload.exp || 0) * 1000).toLocaleString());
  const remainingDays = Math.floor(((payload.exp || 0) * 1000 - Date.now()) / (1000 * 60 * 60 * 24));
  console.log(`Valid for: ${remainingDays} days`);
} catch (error) {
  console.error('Failed to read token status:', error.message);
  process.exit(1);
}
