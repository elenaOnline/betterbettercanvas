// global-search (⌘K): open, search, navigate, commands, live on/off, warm
// cache, the read-safety guard, and the speed budgets (@perf).
import type { BrowserContext, Page, Request } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';
import { isReadSafe } from '../../src/features/global-search/indexer.ts';

const HOST = 'b2c-search';
const NOW = '2026-10-21T10:00:00-07:00';

async function open(context: BrowserContext, path = '/', scenario?: string): Promise<Page> {
  if (scenario) await context.addCookies([{ name: 'mock_scenario', value: scenario, url: CANVAS + '/' }]);
  const page = await context.newPage();
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + path);
  await expect(page.locator('#header, .ic-app-header').first()).toBeAttached();
  // main.js has started features once the instance attribute is set.
  // Features have started (main.ts marks it after the first reconcile), so
  // the ⌘K listener is in place.
  await page.waitForFunction(() => performance.getEntriesByName('b2c:started').length > 0);
  return page;
}

const box = (page: Page) => page.locator(HOST).getByRole('combobox', { name: 'Search Canvas' });
const options = (page: Page) => page.locator(HOST).getByRole('option');
const status = (page: Page) => page.locator(HOST).locator('.status');

async function hotkey(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
}

/** Open the palette and wait until the index has finished building. */
async function openBuilt(page: Page) {
  await hotkey(page);
  await expect(box(page)).toBeFocused();
  await ready(page);
  await expect(page.locator(HOST).getByRole('group', { name: 'Courses' })).toBeVisible();
}

/** The index has loaded and no refresh is running. */
const ready = (page: Page) => expect(page.locator(HOST)).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });

/** Every API request b²c makes from the page (fetch/xhr), recorded. */
function recordApi(page: Page) {
  const reqs: { method: string; path: string }[] = [];
  page.on('request', (r: Request) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/v1/') && ['fetch', 'xhr'].includes(r.resourceType())) reqs.push({ method: r.method(), path: u.pathname + u.search });
  });
  return reqs;
}

test('⌘K turns on live, searches, and turning it off removes every trace', async ({ context, setSettings }) => {
  await setSettings({ 'global-search.enabled': false });
  const page = await open(context);
  await hotkey(page);
  await page.waitForTimeout(200);
  await expect(page.locator(HOST)).toHaveCount(0);

  await setSettings({ 'global-search.enabled': true });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-global-search', '');
  // start() runs right after the mirror updates; press until the palette shows.
  await expect.poll(async () => {
    if (!(await page.locator(HOST).isVisible())) await hotkey(page);
    return page.locator(HOST).isVisible();
  }, { timeout: 5000 }).toBe(true);
  await expect(box(page)).toBeFocused();
  await ready(page);

  await box(page).fill('office hours contact');
  await expect(options(page).first()).toContainText('Office Hours and Contact');
  await expect(page.locator(HOST).getByRole('group', { name: 'Pages' })).toBeVisible();

  // Esc closes and gives focus back.
  await box(page).press('Escape');
  await expect(page.locator(HOST)).toBeHidden();

  await setSettings({ 'global-search.enabled': false });
  await expect(page.locator(HOST)).toHaveCount(0);
  await hotkey(page);
  await page.waitForTimeout(200);
  await expect(page.locator(HOST)).toHaveCount(0);
});

test('results come from every list: courses, modules, assignments, quizzes, pages, files, discussions, announcements', async ({ context }) => {
  const page = await open(context);
  await openBuilt(page);
  const groupsFor = async (q: string) => {
    await box(page).fill(q);
    await expect(options(page).first()).toBeVisible();
    return page.locator(HOST).locator('.group-label').allTextContents();
  };
  expect(await groupsFor('algebra')).toContain('Courses');
  expect(await groupsFor('lecture')).toContain('Files');
  expect(await groupsFor('syllabus')).toContain('Pages');
  expect(await groupsFor('week')).toContain('Modules');
  expect(await groupsFor('homework')).toContain('Assignments');
  expect(await groupsFor('quiz')).toContain('Quizzes');
  expect(await groupsFor('office hours moved')).toContain('Announcements');
  expect(await groupsFor('discussion')).toContain('Discussions');
  // Each row is a real link to a Canvas page (never an API URL).
  await box(page).fill('lecture');
  const hrefs = await page.locator(HOST).locator('a.row').evaluateAll(els => els.map(e => (e as HTMLAnchorElement).getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) expect(h).toMatch(/^\/courses\/\d+\/(files\/\d+|modules)/);
});

test('keyboard: arrows move, Enter opens, ⌘Enter opens a new tab, typos still find', async ({ context }) => {
  const page = await open(context);
  await openBuilt(page);
  await box(page).fill('ofice contact'); // typo
  await expect(options(page).first()).toContainText('Office Hours and Contact');
  await box(page).press('ArrowDown');
  await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await box(page).press('ArrowUp');
  await expect(options(page).first()).toHaveAttribute('aria-selected', 'true');
  const href = await options(page).first().getAttribute('href');

  const [tab] = await Promise.all([context.waitForEvent('page'), box(page).press('ControlOrMeta+Enter')]);
  await tab.waitForLoadState('domcontentloaded');
  expect(new URL(tab.url()).pathname + new URL(tab.url()).hash).toBe(href);
  await tab.close();
  await expect(page.locator(HOST)).toBeHidden();

  await hotkey(page);
  await box(page).fill('ofice contact');
  await expect(options(page).first()).toContainText('Office Hours and Contact');
  await Promise.all([page.waitForURL(u => u.pathname === href), box(page).press('Enter')]);

  // The opened item is first under Recent on the next open.
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-b2c-instance'));
  await hotkey(page);
  await expect(page.locator(HOST).getByRole('group', { name: 'Recent' }).getByRole('option').first()).toContainText('Office Hours and Contact');
});

test('commands: settings deep link and pause', async ({ context, sw }) => {
  const page = await open(context);
  await hotkey(page);
  await box(page).fill('settings sites');
  await expect(options(page).first()).toContainText('Settings: Sites');
  await box(page).press('Enter');
  await expect(page.locator(HOST)).toBeHidden();
  // The SW opens the settings tab; Playwright doesn't see SW-created tabs as pages, so ask Chrome.
  await expect.poll(() => sw.evaluate(async () => (await chrome.tabs.query({})).map(t => t.url ?? ''))).toContainEqual(expect.stringMatching(/options\.html#sites$/));

  await page.bringToFront();
  await hotkey(page);
  await box(page).fill('pause');
  await expect(options(page).first()).toContainText('Pause b²c');
  await box(page).press('Enter');
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.sync.get('core.paused'))['core.paused'])).toBe(true);
  // Paused: nothing of b²c remains, ⌘K included.
  await expect(page.locator(HOST)).toHaveCount(0);
  await hotkey(page);
  await page.waitForTimeout(200);
  await expect(page.locator(HOST)).toHaveCount(0);
});

test('dark mode commands set the mode (when dark mode is in the build)', async ({ context, sw }) => {
  const hasDark = await sw.evaluate(async () => {
    const s = (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings as Record<string, unknown>;
    return 'palette.useDark' in s;
  });
  test.skip(!hasDark, 'lane build without the palette feature');
  const page = await open(context);
  await hotkey(page);
  await box(page).fill('dark on');
  await expect(options(page).first()).toContainText('Dark mode: On');
  await box(page).press('Enter');
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.sync.get('palette.useDark'))['palette.useDark'])).toBe('always');
  await hotkey(page);
  await box(page).fill('dark off');
  await box(page).press('Enter');
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.sync.get('palette.useDark'))['palette.useDark'])).toBe('never');
});

test('read safety: page load costs nothing; indexing touches only list endpoints, GET only', async ({ context }) => {
  const page = await context.newPage();
  const reqs = recordApi(page);
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  // Settle Canvas's own requests first, with b²c's search unused.
  await page.goto(CANVAS + '/courses/118200');
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-b2c-instance'));
  await page.waitForTimeout(1500);
  const beforeOpen = reqs.length;
  expect(reqs.filter(r => /modules|pages|files|discussion_topics|announcements|assignment_groups/.test(r.path))).toEqual([]);

  await openBuilt(page);
  for (const q of ['syllabus', 'lecture', 'week 2', 'office', 'quiz', 'proof', 'textbook']) {
    await box(page).fill(q);
    await page.waitForTimeout(50);
  }
  const ours = reqs.slice(beforeOpen);
  expect(ours.length).toBeGreaterThan(5);
  for (const r of ours) {
    expect(r.method, r.path).toBe('GET');
    expect(isReadSafe(r.path), `item view or unknown endpoint: ${r.path}`).toBe(true);
  }
  // Courses whose Files tab is hidden answer 403 and are skipped quietly.
  await box(page).fill('lecture');
  await expect(status(page)).toHaveText('');
  await expect(page.locator(HOST)).toHaveAttribute('data-state', 'ready');

  // Second open within 10 minutes: no network at all.
  await box(page).press('Escape');
  const n = reqs.length;
  await hotkey(page);
  await box(page).fill('homework');
  await page.waitForTimeout(800);
  expect(reqs.slice(n)).toEqual([]);
});

test('warm cache: a later page searches the saved index before the network answers', async ({ context }) => {
  const page = await open(context);
  await openBuilt(page);
  await page.close();

  // 20 minutes later (the index is stale), every API call hangs for 5 s:
  // results must come from the saved index, with a quiet "Updating…".
  await context.route('**/api/v1/**', async route => {
    await new Promise(r => setTimeout(r, 5000));
    await route.continue().catch(() => {});
  });
  const later = await context.newPage();
  await later.addInitScript(n => localStorage.setItem('b2c_now', n), new Date(Date.parse(NOW) + 20 * 60_000).toISOString());
  await later.goto(CANVAS + '/');
  await later.waitForFunction(() => document.documentElement.hasAttribute('data-b2c-instance'));
  const t0 = Date.now();
  await hotkey(later);
  await box(later).fill('office hours contact');
  await expect(options(later).first()).toContainText('Office Hours and Contact', { timeout: 1500 });
  expect(Date.now() - t0).toBeLessThan(1500);
  await expect(status(later)).toHaveText('Updating…');
  await expect(later.locator(HOST)).toHaveAttribute('data-state', 'updating');
});

test('speed: opens < 50 ms, each keystroke < 16 ms on the heavy mock at 4× CPU @perf', async ({ context }) => {
  test.setTimeout(90_000);
  const page = await open(context, '/', 'heavy');
  await openBuilt(page);
  await box(page).press('Escape');
  await page.reload(); // a fresh page: the runtime chunk loads on this first ⌘K
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-b2c-instance'));
  await page.waitForTimeout(1000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Install the probe first, then press, then read: keydown → host shown
  // (DOM) and → the next animation frame (painted).
  const arm = () =>
    page.evaluate(() => {
      const w = window as unknown as { __open?: Promise<{ shown: number; frame: number }> };
      w.__open = new Promise(resolve => {
        let t0 = -1;
        addEventListener('keydown', () => (t0 = performance.now()), { capture: true, once: true });
        const mo = new MutationObserver(() => {
          const h = document.querySelector('b2c-search');
          if (t0 < 0 || !h || h.hasAttribute('hidden')) return;
          mo.disconnect();
          const shown = performance.now() - t0;
          requestAnimationFrame(() => resolve({ shown, frame: performance.now() - t0 }));
        });
        mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
      });
    });
  const read = () => page.evaluate(() => (window as unknown as { __open: Promise<{ shown: number; frame: number }> }).__open);
  await arm();
  await hotkey(page);
  const first = await read();
  await box(page).press('Escape');
  await arm();
  await hotkey(page);
  const warm = await read();
  await ready(page);

  // Keystrokes: input event → results in the DOM and laid out, synchronously.
  // The sequence runs 3 times; the budget applies to each keystroke's best
  // run (scheduler noise on a busy machine is not the palette's cost), and
  // the first, cold run is reported too.
  const keys = await page.evaluate(async () => {
    const root = document.querySelector('b2c-search')!.shadowRoot!;
    const input = root.querySelector('input')!;
    const list = root.querySelector('.list') as HTMLElement;
    const seq = ['h', 'ho', 'hom', 'home', 'homew', 'homewo', 'homewor', 'homework', 'homework ', 'homework 1', 'e', 'ex', 'exa', 'exam', 'exam i', 'exam in', 'l', 'le', 'lec', 'lect', 'lectu', 'lectur', 'lecture', 'lecture 3', 'ofice'];
    const runs: number[][] = [];
    for (let r = 0; r < 3; r++) {
      const times: number[] = [];
      for (const q of seq) {
        const t = performance.now();
        input.value = q;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        void list.offsetHeight; // style + layout before paint
        times.push(performance.now() - t);
        await new Promise(res => requestAnimationFrame(res));
      }
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(res => requestAnimationFrame(res));
      runs.push(times);
    }
    const best = seq.map((_, i) => Math.min(...runs.map(t => t[i]!)));
    const sorted = [...best].sort((a, b) => a - b);
    return {
      cold: runs[0]!.map(t => Math.round(t * 10) / 10),
      best: best.map(t => Math.round(t * 10) / 10),
      max: Math.max(...best),
      p50: sorted[Math.floor(sorted.length / 2)]!,
      coldMax: Math.max(...runs[0]!),
      rows: root.querySelectorAll('[role=option]').length,
    };
  });
  const size = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    return dbs.map(d => d.name).filter(n => n?.startsWith('b2c-search'));
  });
  console.log('search perf (4x CPU, heavy):', JSON.stringify({ firstOpen: first, warmOpen: warm, keys, dbs: size }));
  expect(keys.rows).toBeGreaterThan(0); // the empty query shows Recent and Courses
  expect(keys.max).toBeLessThan(16);
  expect(warm.frame).toBeLessThan(50);
  expect(first.frame).toBeLessThan(50);
});
