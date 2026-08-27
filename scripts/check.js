import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectFiles(full));
    } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      results.push(full);
    }
  }
  return results;
}

const files = [...collectFiles('src'), ...collectFiles('test'), ...collectFiles('scripts')];
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed = true;
    console.error(`Syntax check failed: ${file}`);
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log(`Checked ${files.length} files successfully.`);
}
