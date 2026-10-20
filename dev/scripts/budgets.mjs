// Byte budgets for a built extension folder. `node scripts/budgets.mjs <dist>`
// prints a table and exits 1 if anything is over (dev/budgets.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(process.argv[2] ?? path.join(DEV, 'dist'));
const { bytes } = JSON.parse(fs.readFileSync(path.join(DEV, 'budgets.json'), 'utf8'));

let over = 0;
const rows = [];
for (const [pattern, limit] of Object.entries(bytes)) {
  const [dir, glob] = pattern.includes('/') ? pattern.split('/') : ['', pattern];
  const folder = path.join(dist, dir);
  if (!fs.existsSync(folder)) continue;
  const re = new RegExp('^' + glob.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
  for (const f of fs.readdirSync(folder).filter(f => re.test(f))) {
    const size = fs.statSync(path.join(folder, f)).size;
    const ok = size <= limit;
    if (!ok) over++;
    rows.push(`${ok ? '  ' : '✘ '}${path.join(dir, f).padEnd(34)} ${String(size).padStart(8)} / ${limit}`);
  }
}
console.log('weight budget (bytes, raw):\n' + rows.join('\n'));
if (over) {
  console.error(`${over} artifact(s) over budget`);
  process.exit(1);
}
