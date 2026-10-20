// Build check: the settings layout (src/ui/shared/layout.ts, Design's
// settings.md as data) may only name keys the schema has.
//
//   checkLayout(schemaJsonPath)  throws on a bad key; warns on schema keys the
//                                layout doesn't show yet.
//
// build.mjs calls it after writing schema.json. Parallel lanes build subsets
// with B2C_FEATURES=a,b: keys of features outside that list are skipped, so a
// lane's subset build never fails because of another lane's rows.
// Run it alone: node scripts/check-settings-layout.mjs [path/to/schema.json]

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadLayout() {
  const tmp = path.join(DEV, '.scratch', `layout-${process.pid}-${Date.now()}.mjs`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  await esbuild.build({ entryPoints: [path.join(DEV, 'src/ui/shared/layout.ts')], bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'silent' });
  try { return await import(pathToFileURL(tmp).href); }
  finally { fs.rmSync(tmp, { force: true }); }
}

/** Every key a row depends on, by how strictly it's checked. */
export function rowKeys(row) {
  const required = [row.key, ...(row.keys ?? []), ...(row.also ?? []).map(a => a.key), ...(row.when ?? []).map(c => c.key)];
  if (row.control === 'checks' || row.control === 'sliders') required.push(...(row.options ?? []).map(([v]) => v));
  return { required: required.filter(k => typeof k === 'string'), optional: [...(row.optional ?? [])] };
}

/** Pure check, for tests: returns { errors, warnings }. */
export function validate(layout, schema, only = null) {
  const errors = [], warnings = [];
  const inBuild = k => !only || k.startsWith('core.') || only.has(k.split('.')[0]);
  const shown = new Set(layout.NOT_SHOWN ?? []);
  const ids = new Set();
  const rows = [...layout.SECTIONS.flatMap(s => s.rows.map(r => [s.id, r])), ...(layout.POPUP_SWITCHES ?? []).map(r => ['popup', r]), ...(layout.FIRST_RUN ?? []).map(r => ['first-run', r]), ...(layout.THEME_ROWS ?? []).map(r => ['theme', r])];
  const disclosures = new Set(rows.filter(([, r]) => r.control === 'disclosure').map(([, r]) => r.id));
  for (const [sec, r] of rows) {
    const where = `${sec} › ${r.id}`;
    if (sec !== 'popup' && sec !== 'first-run' && sec !== 'theme') {
      if (ids.has(r.id)) errors.push(`${where}: duplicate row id`);
      ids.add(r.id);
    }
    if (r.in && !disclosures.has(r.in)) errors.push(`${where}: "in" names no disclosure row "${r.in}"`);
    const { required, optional } = rowKeys(r);
    for (const k of [...required, ...optional]) shown.add(k);
    if (r.pending) {
      if (r.key && schema[r.key]) warnings.push(`${where}: ${r.key} is in the schema now; drop "pending"`);
      continue;
    }
    for (const k of required) if (inBuild(k) && !schema[k]) errors.push(`${where}: "${k}" is not in the schema`);
    const s = r.key && schema[r.key];
    if (s && s.kind === 'enum' && r.options && r.control !== 'dark-mode') {
      const missing = r.options.map(([v]) => v).filter(v => !s.values.includes(v));
      const extra = s.values.filter(v => !r.options.some(([o]) => o === v));
      if (missing.length) warnings.push(`${where}: options ${missing.join(', ')} aren't values of ${r.key}`);
      if (extra.length) warnings.push(`${where}: ${r.key} values ${extra.join(', ')} have no label`);
    }
  }
  for (const k of layout.STAGE_KEYS ?? []) shown.add(k);
  for (const g of layout.DARK_ROLES ?? []) for (const role of g.roles) for (const k of role.keys) shown.add(k);
  const unshown = Object.keys(schema).filter(k => !shown.has(k));
  if (unshown.length) warnings.push(`schema keys not in the settings layout yet: ${unshown.join(', ')}`);
  return { errors, warnings };
}

export async function checkLayout(schemaJsonPath) {
  const schema = JSON.parse(fs.readFileSync(schemaJsonPath, 'utf8')).settings;
  const only = process.env.B2C_FEATURES ? new Set(process.env.B2C_FEATURES.split(',').map(x => x.trim())) : null;
  const { errors, warnings } = validate(await loadLayout(), schema, only);
  for (const w of warnings) console.warn(`settings layout: ${w}`);
  if (errors.length) throw new Error('Settings layout (src/ui/shared/layout.ts) names keys the schema lacks:\n  ' + errors.join('\n  '));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkLayout(path.resolve(process.argv[2] ?? path.join(DEV, 'schema.json')));
  console.log('settings layout ok');
}
