#!/usr/bin/env node
// Contract tests: agentkit/CONTRACT.md §1–§3, from outside, against b²c's test build on the mock Canvas.
//   node agentkit/tests/contract.test.mjs [--ext DIR] [--require]
// --ext DIR: test that built extension (ship passes the build it's about to ship); default: a test build of dev/.
// --require: a build without the contract FAILS (default: PENDING). Runs from any cwd; needs no env vars.
// Headless (--headless=new), throwaway profile (dev/mock-canvas/tools/browser.mjs), mock in-process. Nothing real.
// Exit 1 on any FAIL. PENDING = a part of the contract Dev has said is still coming (not a failure).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DEV } from '../tools/theme-adapter.mjs';
import { ensureTestBuild } from '../tools/devbuild.mjs';

const HOST = 'b2c-mock-school.instructure.com';
const ORIGIN = `https://${HOST}`;
const STATES = ['excused', 'graded', 'submitted', 'done', 'missing', 'late', 'overdue', 'past', 'upcoming'];
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?([+-]\d\d:\d\d|Z)$/;
const ID = /^[a-z_]+:\d+$/;
const MARKS_READ = /mark_read|bulk_mark_read|\/read(_all)?(\?|$)|\/entries\/\d+\/read/;

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, status: cond ? 'PASS' : 'FAIL', detail: cond ? '' : detail });
const pending = (name, detail) => results.push({ name, status: 'PENDING', detail });
const info = (name, detail) => results.push({ name, status: 'INFO', detail });

function chromiumPath() {
  if (process.env.MOCK_CHROMIUM) return process.env.MOCK_CHROMIUM;
  for (const pkg of [path.join(DEV, 'mock-canvas/.tools/package.json'), path.join(DEV, 'package.json')]) {
    try { const p = createRequire(pkg)('playwright-core').chromium.executablePath(); if (fs.existsSync(p)) return p; } catch {}
  }
  throw new Error('no Playwright Chromium: (cd dev && npx playwright install chromium)');
}

// The raw-event form from CONTRACT.md §2 (what an agent without the wrapper does).
const rawDescribe = (page, req) => page.evaluate(req => new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error('no answer')), 2500);
  const h = e => { const d = JSON.parse(e.detail); if (d.id === req.id) { clearTimeout(t); document.removeEventListener('b2c:described', h); ok(d); } };
  document.addEventListener('b2c:described', h);
  document.dispatchEvent(new CustomEvent('b2c:describe', { detail: JSON.stringify(req) }));
}), req);

async function main() {
  const args = process.argv.slice(2);
  let ext = args[args.indexOf('--ext') + 1];
  if (!args.includes('--ext')) {
    const b = ensureTestBuild();
    if (!b.dir) throw new Error(`no test build: ${b.why}`);
    ext = b.dir;
    console.log(`build ${b.buildId} (${b.status})`);
  }
  process.env.MOCK_CHROMIUM = chromiumPath();
  const { launch, startMock, mockCookies } = await import(pathToFileURL(path.join(DEV, 'mock-canvas/tools/browser.mjs')).href);
  const mock = await startMock();
  const { ctx, close } = await launch({ port: mock.port, hosts: [HOST], extraArgs: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  const requests = [];
  const windows = []; // [start, end] around each describe call: b²c must not write inside them
  // The window includes 300 ms of quiet on the same page after the answer, so a write b²c fires late still
  // lands inside it, and the next page's own load-time writes don't.
  const timed = async (f) => { const a = Date.now(); try { return await f(); } finally { await new Promise(r => setTimeout(r, 300)); windows.push([a, Date.now()]); } };
  ctx.on('request', r => requests.push({ url: r.url(), method: r.method(), t: Date.now() }));
  try {
    await ctx.addCookies(mockCookies({ scenario: 'default', delay: 0, view: 'widget', tab: 'courses', domain: HOST }));
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 10_000 }));
    for (let i = 0; i < 100 && !(await sw.evaluate(() => typeof chrome?.runtime?.getURL === 'function').catch(() => false)); i++) await new Promise(r => setTimeout(r, 50));
    const setSettings = v => sw.evaluate(v => chrome.storage.sync.set(v), v);

    // ---- §1 detection
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    const attr = await page.evaluate(() => document.documentElement.getAttribute('data-b2c-agent'));
    if (attr === null) {
      // --require (ship uses it): a build that should carry the contract and doesn't is a failure, not pending.
      if (args.includes('--require')) ok('§1 data-b2c-agent on the dashboard', false, 'absent, and --require was given');
      else pending('§1 data-b2c-agent on the dashboard', 'absent: this build has no agent contract yet');
      return;
    }
    ok('§1 data-b2c-agent="1" on the dashboard', attr === '1', `got ${attr}`);
    ok('§2 window.b2cAgent is defined with v 1', await page.evaluate(() => window.b2cAgent?.v === 1), 'missing or wrong v');
    // Dev byte-tests the wrapper source against agentkit/tests/describe-wrapper.js; bundling may reformat it, so
    // here we test behaviour (ids, concurrency, raw form) below rather than text.

    // ---- §2 describe: zero network with refresh false, shape, ids, times
    await page.waitForTimeout(1500); // let b²c's own warm-up requests settle
    const before = requests.length;
    const t0 = Date.now();
    const d = await page.evaluate(() => window.b2cAgent.describe({ id: 'agentkit-1' }));
    const ms = Date.now() - t0;
    const during = requests.slice(before).filter(r => r.url.startsWith(ORIGIN) && r.t <= Date.now());
    ok('§2 describe() answers', !!d && !d.error, d?.error ?? 'no answer');
    ok('§2 refresh:false makes no Canvas requests', during.length === 0, during.map(r => `${r.method} ${r.url.replace(ORIGIN, '')}`).join(', '));
    // Cold (first call loads chunks/agent.js): report only, with a loose sanity bound. Warm: best of 3 is the gate.
    info('§2 cold first describe (chunk load included)', `${ms} ms round trip`);
    ok('§2 cold first describe answers within 2 s', ms < 2000, `${ms} ms`);
    const warm = [];
    for (let i = 0; i < 3; i++) { const a = Date.now(); await page.evaluate(i => window.b2cAgent.describe({ id: 'warm-' + i }), i); warm.push(Date.now() - a); }
    ok('§2 warm describe < 150 ms round trip (best of 3; contract budget 50 ms in-page)', Math.min(...warm) < 150, `${warm.join(', ')} ms`);
    info('§2 warm describe round trips', `${warm.join(', ')} ms`);
    ok('§2 header: $b2c, v, id echoed', d.$b2c === 'describe' && d.v === 1 && d.id === 'agentkit-1', JSON.stringify({ $b2c: d.$b2c, v: d.v, id: d.id }));
    ok('§2 origin, timeZone, at', d.origin === ORIGIN && typeof d.timeZone === 'string' && ISO.test(d.at ?? ''), JSON.stringify({ origin: d.origin, timeZone: d.timeZone, at: d.at }));
    ok('§2 page.kind dashboard, url absolute', d.page?.kind === 'dashboard' && String(d.page?.url).startsWith(ORIGIN), JSON.stringify(d.page));
    ok('§2 courses: ids course:<n>, absolute urls, favorite bool|null', Array.isArray(d.courses) && d.courses.length > 0 && d.courses.every(c => /^course:\d+$/.test(c.id) && String(c.url).startsWith(ORIGIN) && [true, false, null].includes(c.favorite)), JSON.stringify(d.courses?.slice(0, 2)));
    const due = d.due ?? [];
    ok('§2 due: non-empty list', Array.isArray(due) && due.length > 0, `got ${due.length}`);
    const badDue = due.filter(x => !ID.test(x.id) || !(x.courseId === null || /^course:\d+$/.test(x.courseId)) || !(x.due === null || ISO.test(x.due)) || !STATES.includes(x.state) || !(x.url === null || (String(x.url).startsWith(ORIGIN) && !String(x.url).includes('/api/'))) || typeof x.marksRead !== 'boolean');
    ok('§2 due items: type:id, course:id|null, ISO-with-offset due, known state, absolute page url (never /api/), boolean marksRead', badDue.length === 0, JSON.stringify(badDue.slice(0, 2)));
    // State order: whatever Canvas's planner flags missing (and not excused) is `missing`, even if a zero was graded.
    const wide = await page.evaluate(() => window.b2cAgent.describe({ from: '2026-01-01', to: '2027-12-31' }));
    const planner = await page.evaluate(([a, b]) => fetch(`/api/v1/planner/items?start_date=${a}&end_date=${b}&per_page=100`, { headers: { Accept: 'application/json+canvas-string-ids' } }).then(r => r.json()), ['2026-01-01', '2027-12-31']);
    const flagged = planner.filter(i => i.submissions && i.submissions.missing && !i.submissions.excused).map(i => `${i.plannable_type}:${i.plannable_id}`);
    const wrong = (wide.due ?? []).filter(x => flagged.includes(x.id) && x.state !== 'missing').map(x => `${x.id}=${x.state}`);
    ok('§2 state order: planner-flagged missing items are "missing" (beats graded)', flagged.length > 0 && wrong.length === 0, wrong.join(', ') || 'no flagged items in the mock to test');
    ok('§2 due sorted oldest first', due.every((x, i) => i === 0 || !x.due || !due[i - 1].due || due[i - 1].due <= x.due), 'out of order');
    ok('§2 fresh.courses and fresh.due are ISO times', ISO.test(d.fresh?.courses ?? '') && ISO.test(d.fresh?.due ?? ''), JSON.stringify(d.fresh));
    ok('§2 readSafety lists marksReadPaths incl. grades', (d.readSafety?.marksReadPaths ?? []).some(p => p.includes('/grades')), JSON.stringify(d.readSafety?.marksReadPaths));
    const json = await page.evaluate(() => document.getElementById('b2c-describe')?.textContent ?? null);
    ok('§2 the latest answer is also in <script id="b2c-describe">', !!json && JSON.parse(json).id === wide.id, json ? `holds ${JSON.parse(json).id}, not the latest (${wide.id})` : 'missing');

    // concurrency: two callers, distinct ids, no crossing
    const [a, b] = await page.evaluate(() => Promise.all([window.b2cAgent.describe({ from: '2026-10-01' }), window.b2cAgent.describe({ id: 'x2' })]));
    ok('§2 concurrent calls get their own answers', a.id !== b.id && b.id === 'x2' && !a.error && !b.error, JSON.stringify([a.id, b.id]));
    const raw = await rawDescribe(page, { v: 1, id: 'raw-1' });
    ok('§2 the raw event form works without the wrapper', raw.id === 'raw-1' && !raw.error, JSON.stringify(raw).slice(0, 120));

    // ---- §3 anchors (after a describe call)
    // b²c's own rows live in open shadow roots (CONTRACT §3): search the light DOM and every open shadow root.
    const anchors = await page.evaluate(() => {
      const all = sel => { const out = []; const walk = root => { out.push(...root.querySelectorAll(sel)); for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot); }; walk(document); return out; };
      return ({
      cards: all('[data-b2c-id^="course:"]').length,
      items: all('[data-b2c-id]').map(e => e.getAttribute('data-b2c-id')),
      due: all('[data-b2c-due]').map(e => e.getAttribute('data-b2c-due')),
      states: all('[data-b2c-state]').map(e => e.getAttribute('data-b2c-state')),
      regions: all('[data-b2c-region]').map(e => e.getAttribute('data-b2c-region')),
      actions: all('[data-b2c-action]').map(e => e.getAttribute('data-b2c-action')),
    });
    });
    ok('§3 dashboard cards carry data-b2c-id="course:<n>"', anchors.cards > 0, 'none');
    ok('§3 every data-b2c-id is type:id', anchors.items.every(x => ID.test(x)), anchors.items.filter(x => !ID.test(x)).slice(0, 3).join(', '));
    ok('§3 every data-b2c-due is ISO with offset', anchors.due.every(x => ISO.test(x)), anchors.due.filter(x => !ISO.test(x)).slice(0, 3).join(', '));
    ok('§3 every data-b2c-state is a known state', anchors.states.every(x => STATES.includes(x)), anchors.states.filter(x => !STATES.includes(x)).join(', '));
    const onPage = d.onPage ?? [];
    const resolvable = await page.evaluate(list => list.filter(o => !o.shadowHost).filter(o => !document.querySelector(o.selector)).map(o => o.selector), onPage);
    ok('§2/§3 onPage selectors (light DOM) resolve', resolvable.length === 0, resolvable.slice(0, 3).join(', '));
    if (!anchors.regions.length) pending('§3 data-b2c-region on b²c regions', "Dev's follow-up sweep onto b²c's own rows");
    else ok('§3 regions are known names', anchors.regions.every(r => ['panel', 'todo', 'card-due', 'pins', 'search', 'notes', 'gpa'].includes(r)), anchors.regions.join(', '));
    const VERBS = ['mark-done', 'mark-undone', 'dismiss', 'restore', 'set-color', 'set-nickname', 'move-card', 'unfavorite',
      'set-label', 'clear-label', 'add-item', 'delete-item', 'hide-card', 'set-view', 'set-range', 'apply-theme'];
    if (!anchors.actions.length) pending('§3 data-b2c-action on state-changing b²c controls', "Dev's follow-up sweep");
    else ok('§3 data-b2c-action: present, every verb on the contract list', anchors.actions.every(v => VERBS.includes(v)), [...new Set(anchors.actions.filter(v => !VERBS.includes(v)))].join(', '));

    // ---- §2 refresh:true never touches a mark-read endpoint; other pages
    await timed(() => page.evaluate(() => window.b2cAgent.describe({ refresh: true })));
    for (const p of ['/courses', '/calendar']) {
      await page.goto(`${ORIGIN}${p}`, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {}); // Canvas's own load-time writes first
      const x = await timed(() => page.evaluate(() => window.b2cAgent?.describe()));
      ok(`§2 describe works on ${p}`, !!x && !x.error && typeof x.page?.kind === 'string', x?.error ?? 'no answer');
    }
    // Canvas's own pages write too (the dashboard POSTs GraphQL; the calendar PUTs a user colour), so writes are
    // only judged inside describe windows. Mark-read endpoints are judged over the whole run.
    if (process.env.AK_DEBUG) { console.log('windows', JSON.stringify(windows)); for (const r of requests.filter(r => r.method !== 'GET')) console.log('req', r.t, r.method, r.url.replace(ORIGIN, '')); }
    const inWin = r => windows.some(([a, b]) => r.t >= a && r.t <= b);
    const bad = requests.filter(r => MARKS_READ.test(r.url) || (inWin(r) && r.url.startsWith(ORIGIN) && r.method !== 'GET' && !/\/api\/graphql$/.test(r.url)));
    ok('ground rule 1: no mark-read endpoint all run; no write during any describe()', bad.length === 0, bad.map(r => `${r.method} ${r.url.replace(ORIGIN, '')}`).slice(0, 5).join(', '));

    // ---- §1 setting off
    await setSettings({ 'core.agentContract': false });
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    const off = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-b2c-agent'), api: 'b2cAgent' in window }));
    ok('§1 core.agentContract off → no attribute, no window.b2cAgent', off.attr === null && !off.api, JSON.stringify(off));
    await setSettings({ 'core.agentContract': true });
  } finally {
    await close();
    await mock.close();
  }
}

try { await main(); } catch (e) { results.push({ name: 'harness', status: 'FAIL', detail: e.message }); }
for (const r of results) console.log(`${r.status.padEnd(7)} ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`);
const n = s => results.filter(r => r.status === s).length;
console.log(`\n${n('PASS')} pass, ${n('FAIL')} fail, ${n('PENDING')} pending`);
process.exit(n('FAIL') ? 1 : 0);
