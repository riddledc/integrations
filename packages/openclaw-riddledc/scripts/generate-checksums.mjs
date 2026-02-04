import { createHash } from 'crypto';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

const dist = './dist';
const files = await readdir(dist);
const lines = [];

for (const f of files.sort()) {
  const buf = await readFile(join(dist, f));
  const hash = createHash('sha256').update(buf).digest('hex');
  lines.push(`${hash}  dist/${f}`);
}

await writeFile('CHECKSUMS.txt', lines.join('\n') + '\n');
console.log('Generated CHECKSUMS.txt');
