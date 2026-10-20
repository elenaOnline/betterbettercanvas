// The b²c test build render loads: agentkit/.scratch/b2c-test (gitignored), rebuilt
// only when dev/src (or build.mjs) changed since the last build. Never dev/dist or dev/release.
//
// B2C_TEST_FEATURES=1: the service worker answers b2c:themes:apply-file (Import → Apply).
// B2C_FEATURES=<every feature>: the full feature set, as a "lane build", so build.mjs
// writes only into --out (a plain full build also rewrites dev/schema.json and
// src/features/index.gen.ts, which belong to Dev).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DEV, ROOT } from './theme-adapter.mjs';

export const TEST_BUILD = path.join(ROOT, 'agentkit/.scratch/b2c-test');
const STAMP = '.agentkit-src-hash';

/** Hash of everything the build reads from dev/ (paths, sizes, mtimes). */
export function sourceHash() {
  const h = crypto.createHash('sha1');
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const s = fs.statSync(p); h.update(`${p}\0${s.size}\0${s.mtimeMs}\n`); }
    }
  };
  for (const d of ['src', 'test/features', 'static']) if (fs.existsSync(path.join(DEV, d))) walk(path.join(DEV, d));
  for (const f of ['build.mjs', 'package.json', '../design/spec/tokens.css']) {
    const p = path.join(DEV, f);
    if (fs.existsSync(p)) { const s = fs.statSync(p); h.update(`${p}\0${s.size}\0${s.mtimeMs}\n`); }
  }
  return h.digest('hex').slice(0, 16);
}

export function testBuildCurrent(hash = sourceHash()) {
  try { return fs.readFileSync(path.join(TEST_BUILD, STAMP), 'utf8').trim() === hash; } catch { return false; }
}

/**
 * → { dir, buildId, status: 'current' | 'rebuilt' | 'stale', why?, ms }
 * 'stale': the source changed but doesn't build right now; the previous build is used.
 */
export function ensureTestBuild() {
  const t0 = performance.now();
  const hash = sourceHash();
  const id = () => { try { return fs.readFileSync(path.join(TEST_BUILD, 'build-id.txt'), 'utf8').trim(); } catch { return '?'; } };
  if (testBuildCurrent(hash)) return { dir: TEST_BUILD, buildId: id(), status: 'current', ms: Math.round(performance.now() - t0) };
  const tmp = `${TEST_BUILD}.${process.pid}`;
  const ids = fs.readdirSync(path.join(DEV, 'src/features'), { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(DEV, 'src/features', d.name, 'index.ts'))).map(d => d.name);
  const r = spawnSync(process.execPath, [path.join(DEV, 'build.mjs'), '--out', tmp], {
    cwd: DEV, encoding: 'utf8', env: { ...process.env, B2C_FEATURES: ids.join(','), B2C_TEST_FEATURES: '1' },
  });
  if (r.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    const text = (r.stderr || '') + (r.stdout || '');
    const why = (/ERROR: .*/.exec(text)?.[0] ?? /(src\/\S+: .*)/.exec(text)?.[1] ?? text.trim().split('\n')[0] ?? 'build failed').slice(0, 200);
    const have = fs.existsSync(path.join(TEST_BUILD, 'manifest.json'));
    return { dir: have ? TEST_BUILD : null, buildId: have ? id() : null, status: 'stale', why, ms: Math.round(performance.now() - t0) };
  }
  fs.writeFileSync(path.join(tmp, STAMP), hash + '\n');
  fs.mkdirSync(path.dirname(TEST_BUILD), { recursive: true });
  const old = `${TEST_BUILD}.old.${process.pid}`;
  if (fs.existsSync(TEST_BUILD)) fs.renameSync(TEST_BUILD, old);
  fs.renameSync(tmp, TEST_BUILD);
  fs.rmSync(old, { recursive: true, force: true });
  return { dir: TEST_BUILD, buildId: id(), status: 'rebuilt', ms: Math.round(performance.now() - t0) };
}
