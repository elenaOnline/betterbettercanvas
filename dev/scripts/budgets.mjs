// Byte budgets for a built extension folder. `node scripts/budgets.mjs <dist>`
// prints a table and exits 1 if anything is over (dev/budgets.json).
//
// Keys: a file ("boot.js"), a glob in one folder ("chunks/*.js"; a file with
// its own exact key is held to that one instead), or a sum of those joined by
// " + " ("content.css + css/*.css": every matching file together).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(process.argv[2] ?? path.join(DEV, 'dist'));
const { bytes } = JSON.parse(fs.readFileSync(path.join(DEV, 'budgets.json'), 'utf8'));

/** Files (relative to dist) matching one pattern. */
function match(pattern) {
  const [dir, glob] = pattern.includes('/') ? pattern.split('/') : ['', pattern];
  const folder = path.join(dist, dir);
  if (!fs.existsSync(folder)) return [];
  const re = new RegExp('^' + glob.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
  return fs.readdirSync(folder).filter(f => re.test(f)).map(f => path.join(dir, f));
}
const size = f => fs.statSync(path.join(dist, f)).size;
const exact = new Set(Object.keys(bytes).filter(k => !k.includes('*') && !k.includes(' + ')));

let over = 0;
const rows = [];
const row = (label, n, limit) => {
  const ok = n <= limit;
  if (!ok) over++;
  rows.push(`${ok ? '  ' : '✘ '}${label.padEnd(34)} ${String(n).padStart(8)} / ${limit}`);
};
for (const [key, limit] of Object.entries(bytes)) {
  if (key.startsWith('$')) continue;
  if (key.includes(' + ')) {
    const files = [...new Set(key.split(' + ').flatMap(p => match(p.trim())))];
    if (files.length) row(key, files.reduce((n, f) => n + size(f), 0), limit);
    continue;
  }
  for (const f of match(key)) if (key === f || !exact.has(f)) row(f, size(f), limit);
}
console.log('weight budget (bytes, raw):\n' + rows.join('\n'));
if (over) {
  console.error(`${over} artifact(s) over budget`);
  process.exit(1);
}
