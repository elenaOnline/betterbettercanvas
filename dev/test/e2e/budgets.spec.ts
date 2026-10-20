// Speed and request budgets (dev/budgets.json), measured on the heavy mock
// dashboard with every feature on, 4x CPU, warm cache. @perf: run serially.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, CANVAS } from './fixtures.ts';

const DEV = path.resolve(import.meta.dirname, '../..');
const budgets = JSON.parse(fs.readFileSync(path.join(DEV, 'budgets.json'), 'utf8'));

async function warmLoad(context: import('@playwright/test').BrowserContext) {
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/'); // cold: fills caches
  await page.waitForTimeout(1500);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const api: string[] = [];
  page.on('request', r => { if (/\/api\/v1\//.test(r.url())) api.push(new URL(r.url()).pathname); });
  await page.reload(); // warm
  await page.waitForTimeout(2500);
  return { page, api };
}

test('budget: every feature starts fast and adds few requests on a warm dashboard @perf', async ({ context, sw, setSettings }) => {
  await context.addCookies([{ name: 'mock_scenario', value: 'heavy', url: CANVAS + '/' }]);
  // Baseline: what Canvas itself requests (b²c paused).
  await setSettings({ 'core.paused': true });
  const base = await warmLoad(context);
  await base.page.close();

  // Every feature with an `enabled` switch on, dark mode on.
  const all = await sw.evaluate(async () => {
    const schema = (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings as Record<string, unknown>;
    return Object.keys(schema).filter(k => k.endsWith('.enabled') && !k.startsWith('test-'));
  });
  await setSettings({ 'core.paused': false, ...Object.fromEntries(all.map(k => [k, true])), 'dark-mode.mode': 'on' });
  const { page, api } = await warmLoad(context);

  // b²c's own requests = this run's minus Canvas's baseline (multiset diff).
  const remaining = [...base.api];
  const ours = api.filter(u => {
    const i = remaining.indexOf(u);
    if (i >= 0) { remaining.splice(i, 1); return false; }
    return true;
  });
  const report = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://b2c-mock-school.instructure.com/*' });
    return chrome.tabs.sendMessage(tab!.id!, { type: 'b2c:health' });
  });
  // start() time minus its chunk load = the feature's own work; chunk loads
  // run concurrently, so the slowest one is the wall-clock cost.
  const loads = (report.loads ?? {}) as Record<string, number>;
  const timings = Object.fromEntries(Object.entries(report.timings as Record<string, number>).map(([id, ms]) => [id, Math.max(0, Math.round((ms - (loads[id] ?? 0)) * 10) / 10)]));
  const total = Object.values(timings).reduce((a, b) => a + b, 0);
  const slowestLoad = Math.max(0, ...Object.values(loads));
  const out = { timings, total, loads, slowestLoad, oursOnWarmLoad: ours, canvasBaseline: base.api.length };
  console.log('budget report:', JSON.stringify(out));
  fs.mkdirSync(path.join(DEV, '.scratch/budgets'), { recursive: true });
  fs.writeFileSync(path.join(DEV, '.scratch/budgets/last.json'), JSON.stringify(out, null, 2));

  expect(Object.keys(timings).length).toBeGreaterThan(5);
  for (const [id, ms] of Object.entries(timings)) expect(ms, `start time of ${id}`).toBeLessThanOrEqual(budgets.time.startPerFeature);
  expect(total).toBeLessThanOrEqual(budgets.time.startTotal);
  expect(slowestLoad, 'slowest lazy chunk load (wall clock, chunks load concurrently)').toBeLessThanOrEqual(budgets.time.chunkLoadWall);
  expect(ours.length, `b²c requests on a warm dashboard: ${ours.join(', ')}`).toBeLessThanOrEqual(budgets.requests.dashboardWarm);
});
