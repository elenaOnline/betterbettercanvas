// A signed-in Canvas tab with b²c, on the mock, for agents and scripts to practise on.
//
//   import { openCanvas } from '<root>/agentkit/tools/canvas-session.mjs';
//   const { page, origin, close } = await openCanvas();        // headless; mock Canvas; b²c loaded
//   await page.goto(origin + '/');
//   const d = await page.evaluate(() => window.b2cAgent?.describe());
//   await close();
//
// Stands in for "the person's own browser, already signed in": same page world an agent reaches through
// Claude in Chrome's javascript_tool or Playwright. Headless (--headless=new), throwaway profile, the mock
// served in-process on b2c-mock-school.instructure.com. Never touches a real account.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEV } from './theme-adapter.mjs';
import { chromiumPath } from './chromium.mjs';
import { ensureTestBuild } from './devbuild.mjs';

const HOST = 'b2c-mock-school.instructure.com';


/** Open a headless Canvas tab with b²c. opts: { scenario: 'default'|'heavy'|'empty'|…, now: ISO 8601 (default: the real clock), ext: dir } */
export async function openCanvas(opts = {}) {
  let ext = opts.ext;
  if (!ext) {
    const b = ensureTestBuild();
    if (!b.dir) throw new Error(`b²c doesn't build right now: ${b.why}`);
    ext = b.dir;
  }
  process.env.MOCK_CHROMIUM = await chromiumPath();
  const { launch, startMock, mockCookies } = await import(pathToFileURL(path.join(DEV, 'mock-canvas/tools/browser.mjs')).href);
  const mock = await startMock();
  const { ctx, close } = await launch({ port: mock.port, hosts: [HOST], extraArgs: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  // The mock's "now" defaults to the real clock, so its dates and b²c's (which reads the machine clock) agree.
  // Pass opts.now (ISO 8601) for a fixed, reproducible world.
  const now = opts.now ?? new Date().toISOString();
  await ctx.addCookies(mockCookies({ scenario: opts.scenario ?? 'default', now, delay: 0, view: 'widget', tab: 'courses', domain: HOST }));
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 10_000 }));
  for (let i = 0; i < 100 && !(await sw.evaluate(() => typeof chrome?.runtime?.getURL === 'function').catch(() => false)); i++) await new Promise(r => setTimeout(r, 50));
  // Every page any tab navigates to (and every non-GET request) is kept in `log`, and appended to
  // $B2C_SESSION_LOG if set, so a run can be audited afterwards ("did it open anything that marks read?").
  const log = [];
  // Default log file: <tmpdir>/b2c-session-log.jsonl, entries tagged with the calling script and its cwd.
  const logFile = process.env.B2C_SESSION_LOG ?? path.join(os.tmpdir(), 'b2c-session-log.jsonl');
  const who = { script: process.argv[1] ?? null, cwd: process.cwd() };
  const note = e => { log.push(e); try { fs.appendFileSync(logFile, JSON.stringify({ ...e, ...who }) + '\n'); } catch {} };
  ctx.on('request', r => {
    if (r.isNavigationRequest() && r.frame() === r.frame().page()?.mainFrame()) note({ t: Date.now(), nav: r.url() });
    else if (r.method() !== 'GET' && r.url().includes(HOST)) note({ t: Date.now(), write: `${r.method()} ${r.url()}` });
  });
  const page = await ctx.newPage();
  return {
    log,
    page, context: ctx, origin: `https://${HOST}`,
    close: async () => { await close(); await mock.close(); },
  };
}
