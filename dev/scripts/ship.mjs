// npm run ship: build a release, test it, then atomically swap it into
// release/b2c, the folder the owner's Helium loads unpacked. Her running b²c sees
// the new build-id.txt within a minute and reloads itself.
//
//   node scripts/ship.mjs            full: typecheck, unit, e2e against the release build
//   node scripts/ship.mjs --no-e2e   skip e2e (emergencies only; say so in board/status.md)
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL = path.join(DEV, 'release');
const NEXT = path.join(REL, '.b2c.next');
const LIVE = path.join(REL, 'b2c');
const PREV = path.join(REL, '.b2c.prev');
// Only features listed in SHIPPING go out; lanes' work in progress elsewhere
// must not block a ship (or leak into it).
const shipping = fs.readFileSync(path.join(DEV, 'SHIPPING'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
// House rule 2: every browser this ship starts is the background-only copy
// (no Dock icon; scripts/quiet-chrome.mjs), and a watcher fails the ship if a
// test browser ever shows up in the Dock anyway.
const { quietChrome } = await import('./quiet-chrome.mjs');
const QUIET = quietChrome();
const env = { B2C_FEATURES: shipping.join(','), B2C_STRICT_LAYOUT: '1', ...(QUIET ? { MOCK_CHROMIUM: QUIET } : {}) };
const DOCK_LOG = path.join(DEV, '.scratch/ship/dock-watch.jsonl');
fs.mkdirSync(path.dirname(DOCK_LOG), { recursive: true });
const dock = process.platform === 'darwin' ? spawn(process.execPath, [path.join(DEV, 'scripts/dock-watch.mjs'), '--record', DOCK_LOG], { stdio: 'ignore' }) : null;
process.on('exit', () => dock?.kill());
async function dockCheck() {
  if (!dock) return;
  await new Promise(r => { dock.once('exit', r); dock.kill('SIGTERM'); });
  const lines = fs.readFileSync(DOCK_LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const hits = lines.filter(l => l.name);
  console.log(`dock watch: ${lines.at(-1)?.samples ?? 0} samples, ${hits.length} Dock appearances`);
  if (hits.length) { console.error('A test browser showed in the Dock (house rule 2):', hits.slice(0, 5)); process.exit(1); }
}
const run = (cmd, args, extra = {}) => execFileSync(cmd, args, { cwd: DEV, stdio: 'inherit', env: { ...process.env, ...env, ...extra } });

// Typecheck: fail on errors in core, UI, tests of shipped features, or the
// shipped features themselves. Errors inside unshipped feature folders are a
// lane's work in progress and are reported but don't block.
function typecheck() {
  let out = '';
  try {
    execFileSync('npx', ['tsc', '--noEmit', '-p', '.'], { cwd: DEV, encoding: 'utf8' });
    return;
  } catch (e) {
    out = String(e.stdout ?? '');
  }
  const errs = out.split('\n').filter(l => /error TS/.test(l));
  const owner = l => l.match(/^(?:src\/features|test\/(?:e2e|unit))\/([a-z0-9-]+)/)?.[1]?.replace(/\.(spec|test)$/, '').replace(/\..*$/, '');
  const blocking = errs.filter(l => {
    const f = l.match(/^src\/features\/([a-z0-9-]+)\//)?.[1] ?? (l.startsWith('test/') ? owner(l) : null);
    if (f === null) return true; // core
    return shipping.some(id => f === id || f.startsWith(id));
  });
  if (errs.length > blocking.length) console.log(`(${errs.length - blocking.length} type errors in unshipped features ignored)`);
  if (blocking.length) {
    console.error(blocking.join('\n'));
    process.exit(1);
  }
}

fs.mkdirSync(REL, { recursive: true });
typecheck();
// Core suites (always shipped: core, popup/options UI, shared panel) + each shipped feature's.
const CORE_SUITES = ['core', 'side-panel', 'ui-', 'agent-', 'theme', 'grade-periods'];
run('npx', ['vitest', 'run', ...CORE_SUITES.map(x => `test/unit/${x}`), ...shipping.map(id => `test/unit/${id}`)]);
// Core lifecycle probes need test-only features, so they run on a test build
// of the same feature set; everything else runs on the release build itself.
if (!process.argv.includes('--no-e2e')) {
  const probeOut = path.join(DEV, '.scratch/ship/probe-dist');
  const probeEnv = { B2C_TEST_FEATURES: '1', B2C_TEST_GRANT: 'https://canvas.b2c-mock.test' };
  run(process.execPath, ['build.mjs', '--out', probeOut], probeEnv);
  run('npx', ['playwright', 'test', 'core', 'custom-domain', 'migrate', 'css-split', '--output', path.join(DEV, '.scratch/ship/probe-results')], { B2C_DIST: probeOut, ...probeEnv });
}
run(process.execPath, ['build.mjs', '--release', '--out', NEXT]);
// Weight budget (dev/budgets.json): bytes per artifact. Fails the ship.
run(process.execPath, ['scripts/budgets.mjs', NEXT]);
// Snapshot exactly what the build produced: tests run against this folder, and
// anything a test leaves behind must never ship.
const listFiles = dir => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(d => d.isFile()).map(d => path.relative(dir, path.join(d.parentPath ?? d.path, d.name)));
const built = new Set(listFiles(NEXT));
if (!process.argv.includes('--no-e2e')) {
  run('npx', ['playwright', 'test', 'core', 'update', 'ui-', 'agent', 'theme', 'budgets', 'css-', ...shipping, '--grep-invert', '@slow|@perf', '--output', path.join(DEV, '.scratch/ship/results')], { B2C_DIST: NEXT });
  // Hand-feel measurements (layout shift, timing) mean nothing on a contended
  // CPU: run them alone, one at a time.
  run('npx', ['playwright', 'test', 'budgets', 'css-weight', ...shipping, '--grep', '@perf', '--workers', '1', '--output', path.join(DEV, '.scratch/ship/perf-results')], { B2C_DIST: NEXT });
  // The Agent kit's contract test (agentkit/CONTRACT.md) against the exact
  // build being shipped; --require makes a missing contract a failure.
  const contractTest = path.join(DEV, '../agentkit/tests/contract.test.mjs');
  if (fs.existsSync(contractTest) && fs.existsSync(path.join(DEV, 'src/core/agent/run.ts'))) run(process.execPath, [contractTest, '--ext', NEXT, '--require']);
}

// Every browser phase is over: fail now if anything showed in the Dock.
await dockCheck();

for (const f of listFiles(NEXT)) {
  if (!built.has(f)) {
    console.log(`removing test leftover from release: ${f}`);
    fs.rmSync(path.join(NEXT, f), { force: true });
  }
}
fs.rmSync(PREV, { recursive: true, force: true });
if (fs.existsSync(LIVE)) fs.renameSync(LIVE, PREV);
fs.renameSync(NEXT, LIVE);
const id = fs.readFileSync(path.join(LIVE, 'build-id.txt'), 'utf8').trim();
// Every green ship is a commit in the project's own git dir (separate from
// the outer ~/Intelligence repo; see board/decisions.md 2026-10-20).
try {
  const git = (...a) => execFileSync('git', a, { cwd: path.dirname(DEV), env: { ...process.env, GIT_DIR: `${process.env.HOME}/code/betterbettercanvas.git` }, stdio: 'pipe' });
  git('add', '-A');
  // Identity comes from the user's own git config (never hard-coded here).
  git('commit', '-q', '--allow-empty', '-m',
    `ship ${id}\n\nFeatures: ${shipping.join(', ')}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
  console.log('committed ship to ~/code/betterbettercanvas.git');
} catch (e) {
  console.warn('ship commit failed (release is still shipped):', String(e.stderr ?? e));
}
console.log(`\nshipped ${id} [${shipping.join(', ')}] → ${LIVE}\n(previous build kept at ${PREV}; to roll back, swap the two folders)`);
