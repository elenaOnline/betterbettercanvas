// CSS weight (lane css-split): how much b²c CSS a page carries, and what it
// costs in style recalculation, against b²c paused (Canvas alone). @perf: run
// serially, alone (`--workers 1`); numbers on a contended CPU mean nothing.
//
//   bytes:  b²c CSS attached per page kind. content.css (manifest, always) plus
//           every split sheet present in the page. Presence is read from the
//           page itself: each css/<id>.css sets --b2c-css-<id> on <html>. The
//           count of injected sheets (CDP) cross-checks it, so a sheet
//           injected twice (registered and inserted live) shows up.
//   recalc: CDP Performance.getMetrics RecalcStyleDuration / RecalcStyleCount
//           over a page load at 4x CPU (warm caches and mirror), and a forced
//           full recalc: <html> display:none and back, then a style read. That
//           drops every computed style, so every element is matched against
//           every rule again. (A bare class toggle on <html> invalidates nothing
//           when no selector names the class, so it measures nothing.)
//
// Writes .scratch/css-split/<CSS_WEIGHT_LABEL|last>.json. CSS_WEIGHT_RUNS sets
// the runs per median (5); CSS_WEIGHT_DEFAULTS (JSON settings) varies the
// "defaults" config for experiments, e.g. '{"palette.useDark":"never"}'. Asserts only what
// must always hold (paused carries no feature sheet; sheets match registrations);
// the budgets themselves are in budgets.json (bytes) and checked on ship.
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { test, expect, CANVAS, DIST } from './fixtures.ts';

test.describe.configure({ mode: 'serial' });

const DEV = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(DEV, '.scratch/css-split', `${process.env.CSS_WEIGHT_LABEL ?? 'last'}.json`);
const RUNS = Number(process.env.CSS_WEIGHT_RUNS ?? 5);
const host = () => new URL(CANVAS).hostname;

const PAGES = {
  dashboard: '/',
  'course-home': '/courses/118200',
  modules: '/courses/118200/modules',
  assignment: '/courses/118200/assignments/11820001',
  calendar: '/calendar',
} as const;

type Config = 'paused' | 'defaults' | 'everything';

async function configure(context: BrowserContext, sw: import('@playwright/test').Worker, setSettings: (v: Record<string, unknown>) => Promise<void>, config: Config) {
  await applyConfig(sw, setSettings, config);
  // One Canvas load reports what these settings want; give the registrations
  // time to reach the renderers (they follow asynchronously).
  await (await openPage(context, '/')).page.close();
  await sw.evaluate(async () => { await (globalThis as { __b2cSheetsSettled?: () => Promise<unknown> }).__b2cSheetsSettled?.(); });
  await new Promise(r => setTimeout(r, 500));
}

async function applyConfig(sw: import('@playwright/test').Worker, setSettings: (v: Record<string, unknown>) => Promise<void>, config: Config) {
  // Start from defaults every time: clear what an earlier config wrote.
  await sw.evaluate(() => chrome.storage.sync.clear());
  if (config === 'paused') return setSettings({ 'core.paused': true });
  if (config === 'defaults') return process.env.CSS_WEIGHT_DEFAULTS ? setSettings(JSON.parse(process.env.CSS_WEIGHT_DEFAULTS)) : undefined;
  const enabled = await sw.evaluate(async () => {
    const schema = (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings as Record<string, unknown>;
    return Object.keys(schema).filter(k => k.endsWith('.enabled') && !k.startsWith('test-'));
  });
  // Worst case: every feature on, a dark theme painting, every type token set.
  await setSettings({
    ...Object.fromEntries(enabled.map(k => [k, true])),
    'palette.useDark': 'always',
    'palette.light': 'paper',
    'type.family': 'System',
    'type.scale': 1.05,
    'type.density': 'compact',
    'shape.border': '2',
  });
}

/** Bytes of each file in the build under test. */
const size = (f: string) => (fs.existsSync(path.join(DIST, f)) ? fs.statSync(path.join(DIST, f)).size : 0);
const cssIds = (): string[] => (fs.existsSync(path.join(DIST, 'css')) ? fs.readdirSync(path.join(DIST, 'css')).filter(f => f.endsWith('.css')).map(f => f.slice(0, -4)) : []);

async function settle(page: Page) {
  await page.waitForFunction(() => performance.getEntriesByName('b2c:started').length > 0, null, { timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
}

async function openPage(context: BrowserContext, url: string, throttle = 1) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const injected: string[] = [];
  cdp.on('CSS.styleSheetAdded', e => { if (e.header.origin === 'injected' && e.header.frameId) injected.push(e.header.frameId); });
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await page.goto(CANVAS + url);
  await settle(page);
  return { page, cdp, injected };
}

const metrics = async (cdp: CDPSession) => {
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  return { RecalcStyleDuration: m.RecalcStyleDuration ?? 0, RecalcStyleCount: m.RecalcStyleCount ?? 0 };
};

/** Which split sheets the top frame carries (each sets --b2c-css-<id> on <html>). */
const present = (page: Page, ids: string[]) =>
  page.evaluate(ids => {
    const cs = getComputedStyle(document.documentElement);
    return ids.filter(id => cs.getPropertyValue(`--b2c-css-${id}`).trim() !== '');
  }, ids);

async function forcedRecalc(page: Page, cdp: CDPSession) {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = await metrics(cdp);
    await page.evaluate(() => {
      const html = document.documentElement;
      html.style.display = 'none';
      void getComputedStyle(document.body).color;
      html.style.display = '';
      void getComputedStyle(document.body).color;
      for (const el of Array.from(document.querySelectorAll('body *')).slice(0, 4000)) void getComputedStyle(el).color;
    });
    const b = await metrics(cdp);
    out.push((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000);
  }
  return Math.min(...out);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.floor(s.length / 2)]! * 100) / 100 : 0;
};

const report: Record<string, unknown> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  report.dist = path.relative(DEV, DIST);
  report.at = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
};

for (const config of ['paused', 'defaults', 'everything'] as const) {
  test(`css weight: bytes per page kind, ${config} @perf`, async ({ context, sw, setSettings }) => {
    test.setTimeout(120_000);
    await context.addCookies([{ name: 'mock_delay', value: '0', domain: host(), path: '/' }]);
    await configure(context, sw, setSettings, config);
    const ids = cssIds();
    const bytes: Record<string, { total: number; sheets: string[]; injected: number }> = {};
    for (const [kind, url] of Object.entries(PAGES)) {
      await context.clearCookies({ name: 'mock_scenario' });
      if (kind === 'dashboard') await context.addCookies([{ name: 'mock_scenario', value: 'heavy', domain: host(), path: '/' }]);
      // First load writes the mirror and (after the split) the registrations;
      // the second is what a returning user gets.
      await (await openPage(context, url)).page.close();
      const { page, cdp, injected } = await openPage(context, url);
      const sheets = await present(page, ids);
      const top = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
      const injectedTop = injected.filter(f => f === top).length;
      bytes[kind] = { total: size('content.css') + sheets.reduce((n, id) => n + size(`css/${id}.css`), 0), sheets, injected: injectedTop };
      // Every split sheet present arrived once: content.css + one per sheet.
      if (ids.length) expect(injectedTop, `${kind}: injected sheets vs present split sheets ${sheets.join(',')}`).toBe(1 + sheets.length);
      await page.close();
    }
    if (config === 'paused') for (const b of Object.values(bytes)) expect(b.sheets).toEqual([]);
    console.log(`css bytes (${config}):`, JSON.stringify(bytes));
    (report.bytes ??= {} as Record<string, unknown>) && ((report.bytes as Record<string, unknown>)[config] = bytes);
    save();
  });

  test(`css weight: style recalc at 4x CPU, ${config} @perf`, async ({ context, sw, setSettings }) => {
    test.setTimeout(300_000);
    await context.addCookies([
      { name: 'mock_delay', value: '0', domain: host(), path: '/' },
      { name: 'mock_scenario', value: 'heavy', domain: host(), path: '/' },
    ]);
    await configure(context, sw, setSettings, config);
    const out: Record<string, unknown> = {};
    for (const [kind, url] of [['dashboard', PAGES.dashboard], ['modules', PAGES.modules]] as const) {
      await (await openPage(context, url)).page.close(); // warm caches, mirror, registrations
      const load: number[] = [], count: number[] = [], full: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const { page, cdp } = await openPage(context, url, 4);
        const m = await metrics(cdp);
        load.push(m.RecalcStyleDuration * 1000);
        count.push(m.RecalcStyleCount);
        full.push(await forcedRecalc(page, cdp));
        await page.close();
      }
      out[kind] = { loadRecalcMs: median(load), loadRecalcCount: median(count), fullRecalcMs: median(full), runs: { load: load.map(x => Math.round(x * 10) / 10), full: full.map(x => Math.round(x * 10) / 10) } };
    }
    console.log(`css recalc (${config}, 4x CPU, median of ${RUNS}):`, JSON.stringify(out));
    (report.recalc ??= {} as Record<string, unknown>) && ((report.recalc as Record<string, unknown>)[config] = out);
    save();
  });
}
