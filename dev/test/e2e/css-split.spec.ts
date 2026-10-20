// Split stylesheets (lane css-split): a page carries only the feature sheets
// its settings need, they're there before the first frame like manifest CSS,
// a feature switched on live gets its sheet with no reload (frames too), and
// lost registrations give plain Canvas for one load, never a half-styled one.
// Sheets register only on exact school hosts b²c has run on: New Quizzes
// never gets one, and a school's first visit heals live.
import type { Page, Worker } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const host = () => new URL(CANVAS).hostname;
const DARK = { 'palette.useDark': 'always', 'palette.dark': 'black' };

/** Sheets present in a document (each sets --b2c-css-<id> on <html>). */
const sheets = (p: Page | import('@playwright/test').Frame) =>
  p.evaluate(() => ['palette', 'shape', 'type', 'hide-logo'].filter(id => getComputedStyle(document.documentElement).getPropertyValue(`--b2c-css-${id}`).trim()));
const registered = (sw: Worker) =>
  sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).filter(s => s.id.startsWith('b2c-css-')).map(s => s.id).sort());

/**
 * Record what each rendered frame shows: the first one from a ResizeObserver
 * (it runs after every requestAnimationFrame callback, right before paint, so
 * boot's pre-paint check has run), then one sample per frame.
 */
const recordFrames = (page: Page) =>
  page.addInitScript(() => {
    const out: { theme: string | null; palette: boolean; t: number }[] = [];
    (window as unknown as { frames_: typeof out }).frames_ = out;
    const sample = () => {
      const html = document.documentElement;
      out.push({ theme: html.getAttribute('data-b2c-theme'), palette: getComputedStyle(html).getPropertyValue('--b2c-css-palette').trim() !== '', t: performance.now() });
    };
    let n = 0;
    const loop = () => { sample(); if (++n < 40) requestAnimationFrame(loop); };
    const start = () => {
      const ro = new ResizeObserver(() => { ro.disconnect(); sample(); requestAnimationFrame(() => requestAnimationFrame(loop)); });
      ro.observe(document.documentElement);
    };
    if (document.documentElement) start();
    else new MutationObserver((_, mo) => { if (document.documentElement) mo.disconnect(), start(); }).observe(document, { childList: true });
  });
const frames = (page: Page) => page.evaluate(() => (window as unknown as { frames_: { theme: string | null; palette: boolean; t: number }[] }).frames_);
const firstPaint = (page: Page) =>
  page.evaluate(() => new Promise<number>(r => new PerformanceObserver(l => { const e = l.getEntries().find(x => x.name === 'first-paint'); if (e) r(e.startTime); }).observe({ type: 'paint', buffered: true })));

test('a page carries only the sheets its settings need, from before the first frame at 6x CPU', async ({ context, setSettings, sw }) => {
  await context.addCookies([{ name: 'mock_delay', value: '0', domain: host(), path: '/' }]);
  await setSettings(DARK);
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  // The first load reported what the settings want: type is off, so unregistered.
  await expect.poll(() => registered(sw)).not.toContain('b2c-css-type');
  expect(await registered(sw)).toContain('b2c-css-palette');
  // (Renderers pick registration changes up asynchronously.)
  await expect.poll(async () => (await page.reload(), sheets(page))).toEqual(['palette', 'shape']);
  await recordFrames(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName('b2c:started').length > 0);
  const fp = await firstPaint(page);
  const f = await frames(page);
  expect(f[0]!.t).toBeLessThanOrEqual(fp + 1);
  // Every frame, the first included: themed, with the palette sheet in place.
  expect(f.filter(x => x.theme !== 'on' || !x.palette)).toEqual([]);
  expect(await sheets(page)).toEqual(['palette', 'shape']);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

test('a feature switched on live gets its sheet in the open tab and its editor frame, no reload; registrations follow', async ({ context, setSettings, sw }) => {
  await context.addCookies([{ name: 'mock_delay', value: '0', domain: host(), path: '/' }]);
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect.poll(() => registered(sw)).not.toContain('b2c-css-type');
  // Renderers pick registration changes up asynchronously: a load right after
  // may still get the old set (harmless: an extra inert sheet).
  await expect.poll(async () => (await page.reload(), sheets(page))).toEqual(['palette', 'shape']);
  // A same-origin editor frame written by script, as TinyMCE does.
  await page.evaluate(() => {
    const f = document.createElement('iframe');
    f.id = 'ed';
    document.body.append(f);
    f.contentDocument!.open();
    f.contentDocument!.write('<!doctype html><html><head></head><body><p>Draft</p></body></html>');
    f.contentDocument!.close();
  });
  const ed = page.frame({ url: /about:blank/ })!;
  await expect.poll(() => ed.evaluate(() => document.documentElement.hasAttribute('data-b2c'))).toBe(true);
  const marker = await page.evaluate(() => ((window as unknown as { __m: number }).__m = 7));

  await setSettings({ 'type.family': 'System' });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-font', '');
  expect(await sheets(page)).toContain('type');
  await expect.poll(() => sheets(ed)).toContain('type');
  await expect.poll(() => ed.evaluate(() => document.documentElement.hasAttribute('data-b2c-font'))).toBe(true);
  // The body font follows in both, from the inserted sheet.
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/system-ui|-apple-system|BlinkMacSystemFont/);
  await expect.poll(() => registered(sw)).toContain('b2c-css-type');

  await setSettings({ 'type.family': 'Canvas default' });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-font', /.*/);
  await expect.poll(() => registered(sw)).not.toContain('b2c-css-type');
  expect(await page.evaluate(() => (window as unknown as { __m: number }).__m)).toBe(marker);
});

test('lost registrations: plain Canvas for that load (never half-styled), then correct; the next load is pre-paint again', async ({ context, setSettings, sw }) => {
  await context.addCookies([{ name: 'mock_delay', value: '0', domain: host(), path: '/' }]);
  await setSettings(DARK);
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on'); // mirror written
  await expect.poll(() => registered(sw)).toContain('b2c-css-palette');
  // An old install mid-update, or a cleared registration.
  await sw.evaluate(async () => {
    const ids = (await chrome.scripting.getRegisteredContentScripts()).filter(s => s.id.startsWith('b2c-css-')).map(s => s.id);
    await chrome.scripting.unregisterContentScripts({ ids });
  });
  await recordFrames(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.reload();
  // main.js has the sheet inserted, then themes the page live.
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  await expect.poll(() => sheets(page)).toContain('palette');
  const f = await frames(page);
  expect(f.length).toBeGreaterThan(0);
  // Never a frame with the theme's attributes but not its sheet.
  expect(f.filter(x => x.theme === 'on' && !x.palette)).toEqual([]);
  // That load reported, and the service worker registered again.
  await expect.poll(() => registered(sw)).toContain('b2c-css-palette');
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName('b2c:started').length > 0);
  const g = await frames(page);
  expect(g.filter(x => x.theme !== 'on' || !x.palette)).toEqual([]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

test('paused: no feature sheet anywhere; unpausing brings them back live', async ({ context, setSettings, sw }) => {
  await setSettings({ ...DARK, 'core.paused': true });
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect.poll(() => registered(sw)).toEqual([]);
  await page.reload();
  expect(await sheets(page)).toEqual([]);
  await setSettings({ 'core.paused': false });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  expect(await sheets(page)).toEqual(['palette', 'shape']);
  await expect.poll(() => registered(sw)).toContain('b2c-css-palette');
});

/** Injected (extension) stylesheets in the top frame, counted by CDP. */
async function injectedSheets(context: import('@playwright/test').BrowserContext, url: string) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const frames: string[] = [];
  cdp.on('CSS.styleSheetAdded', e => { if (e.header.origin === 'injected') frames.push(e.header.frameId); });
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await page.goto(url);
  await page.waitForTimeout(600);
  const top = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
  const attrs = await page.evaluate(() => Array.from(document.documentElement.attributes).map(a => a.name).filter(n => n.startsWith('data-b2c')));
  const out = { injected: frames.filter(f => f === top).length, attrs, sheets: await sheets(page) };
  await page.close();
  return out;
}

test('quiz-safe: a top-level New Quizzes tab gets no b²c stylesheet and no attribute, before and after a school page has loaded', async ({ context, setSettings, sw }) => {
  await setSettings(DARK);
  const quiz = 'https://b2c-mock-school.quiz-lti-b2c-mock-prod.instructure.com/';
  expect(await injectedSheets(context, quiz)).toEqual({ injected: 0, attrs: [], sheets: [] });
  // A school page: b²c runs, and its sheets register for that exact host.
  const school = await injectedSheets(context, CANVAS + '/');
  expect(school.attrs).toContain('data-b2c-theme');
  await expect.poll(() => registered(sw)).toContain('b2c-css-palette');
  expect(await sw.evaluate(async () => [...new Set((await chrome.scripting.getRegisteredContentScripts()).filter(s => s.id.startsWith('b2c-css-')).flatMap(s => s.matches))])).toEqual([CANVAS + '/*']);
  expect(await injectedSheets(context, quiz)).toEqual({ injected: 0, attrs: [], sheets: [] });
  expect(await injectedSheets(context, 'https://b2c-mock-school.quiz-api-b2c-mock-prod.instructure.com/')).toEqual({ injected: 0, attrs: [], sheets: [] });
});

test('first visit to a school b²c has never run on: plain Canvas, then themed live; the next load is pre-paint', async ({ context, setSettings, sw }) => {
  await context.addCookies([{ name: 'mock_delay', value: '0', domain: host(), path: '/' }]);
  await setSettings(DARK);
  expect(await registered(sw)).toEqual([]); // fresh install: no school known yet
  const page = await context.newPage();
  await recordFrames(page);
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  await expect.poll(() => sheets(page)).toEqual(['palette', 'shape']);
  const f = await frames(page);
  expect(f.length).toBeGreaterThan(0);
  expect(f.filter(x => x.theme === 'on' && !x.palette)).toEqual([]);
  await expect.poll(() => registered(sw)).toEqual(['b2c-css-better-todo', 'b2c-css-card-assignments', 'b2c-css-card-customization', 'b2c-css-card-grades', 'b2c-css-card-overlay', 'b2c-css-full-width', 'b2c-css-palette', 'b2c-css-shape']);
  await expect.poll(async () => {
    await page.reload();
    await page.waitForFunction(() => performance.getEntriesByName('b2c:started').length > 0);
    return (await frames(page)).filter(x => x.theme !== 'on' || !x.palette).length;
  }).toBe(0);
});

test('an update with schools known paints correctly on the first load after it', async ({ context, setSettings, sw }) => {
  // Drives the service worker's test-only hook, so it runs in ship's probe pass (test build).
  test.skip(!(await sw.evaluate(() => typeof (globalThis as { __b2cSheetsUpdated?: unknown }).__b2cSheetsUpdated === 'function')), 'needs a non-release build (test hook)');
  await context.addCookies([{ name: 'mock_delay', value: '0', domain: host(), path: '/' }]);
  await setSettings(DARK);
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect.poll(() => registered(sw)).toContain('b2c-css-palette');
  // The new build's service worker starts with no (or an older build's) registrations.
  await sw.evaluate(async () => {
    const ids = (await chrome.scripting.getRegisteredContentScripts()).filter(s => s.id.startsWith('b2c-css-')).map(s => s.id);
    await chrome.scripting.unregisterContentScripts({ ids });
    await (globalThis as unknown as { __b2cSheetsUpdated: () => Promise<unknown> }).__b2cSheetsUpdated();
  });
  // Every sheet, on the known school, until a tab reports.
  expect(await registered(sw)).toContain('b2c-css-type');
  const next = await context.newPage();
  await recordFrames(next);
  const cdp = await context.newCDPSession(next);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await next.goto(CANVAS + '/');
  await next.waitForFunction(() => performance.getEntriesByName('b2c:started').length > 0);
  const f = await frames(next);
  expect(f.length).toBeGreaterThan(0);
  expect(f.filter(x => x.theme !== 'on' || !x.palette)).toEqual([]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});
