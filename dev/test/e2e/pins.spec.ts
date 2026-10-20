import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

// Mock scenario `weeks`: Fall 2026 starts Mon Sep 28; module ids are
// <course>*10 + 500 + week. Each course names its weeks differently.
const MATH401 = '118200', MATH301 = '118207', CHEM101 = '118214', CHEM107 = '118221', WRIT202 = '118228';
const modId = (course: string, week: number) => String(+course * 10 + 500 + week);
const WED_WK4 = '2026-10-21T10:00:00-07:00';
const WED_WK5 = '2026-10-28T10:00:00-07:00';

const DOCK = 'b2c-pins-dock';
const chip = (page: Page, label: string) => page.locator(DOCK).locator('a.pin', { hasText: label }).first();

const PINS = [
  { id: 'a', label: 'Algebra this week', target: { kind: 'module', course: MATH401, which: 'this-week' } },
  { id: 'b', label: 'Analysis this week', target: { kind: 'module', course: MATH301, which: 'this-week' } },
  { id: 'c', label: 'Chem this week', target: { kind: 'module', course: CHEM101, which: 'this-week' } },
  { id: 'd', label: 'Lab this week', target: { kind: 'module', course: CHEM107, which: 'this-week' } },
  { id: 'e', label: 'Writing this week', target: { kind: 'module', course: WRIT202, which: 'this-week' } },
  { id: 'f', label: 'Algebra lecture', target: { kind: 'latest-file', course: MATH401, match: 'lecture' } },
];

async function scenario(context: BrowserContext, now = WED_WK4, extra: Record<string, string> = {}) {
  const cookies = { mock_scenario: 'weeks', mock_now: now, mock_delay: '0', ...extra };
  await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: CANVAS + '/' })));
}
async function open(page: Page, path = '/', now = WED_WK4) {
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), now);
  await page.goto(CANVAS + path);
}

test('turns on live with no reload, resolves each week pattern, and turns off without a trace', async ({ context, setSettings }) => {
  await scenario(context);
  await setSettings({ 'pins.enabled': false, 'pins.list': PINS });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator('#DashboardCard_Container')).toBeAttached();
  await expect(page.locator(DOCK)).toHaveCount(0);

  await setSettings({ 'pins.enabled': true });
  await expect(page.locator(DOCK)).toHaveCount(1);
  // Each course's naming pattern lands on week 4, and says how it knows.
  const cases: [string, string, number, RegExp][] = [
    ['Algebra this week', MATH401, 4, /by module name/],
    ['Analysis this week', MATH301, 4, /by module name/],
    ['Chem this week', CHEM101, 4, /by unlock dates/],
    ['Lab this week', CHEM107, 4, /by module name/],
    ['Writing this week', WRIT202, 4, /by due dates/],
  ];
  for (const [label, course, week, why] of cases) {
    const a = chip(page, label);
    await expect(a).toHaveAttribute('href', `/courses/${course}/modules#module_${modId(course, week)}`);
    await expect(a).toHaveAttribute('title', why);
  }
  await expect(chip(page, 'Algebra this week').locator('.d')).toHaveText('Week 4');
  await expect(chip(page, 'Analysis this week').locator('.d')).toHaveText('Week Four');
  await expect(chip(page, 'Chem this week').locator('.d')).toHaveText('Week 4 · Gases');
  // One accessible name per chip, with the rule (Design).
  await expect(page.locator(DOCK).getByRole('link', { name: 'Chem this week: Week 4, Gases, resolved by unlock dates' })).toBeVisible();
  await expect(chip(page, 'Algebra lecture')).toHaveAttribute('href', /\/courses\/118200\/files\/\d+$/);
  await expect(chip(page, 'Algebra lecture').locator('.d')).toHaveText(/^Lecture 4 slides\.pdf|added Oct 19$/);

  await setSettings({ 'pins.enabled': false });
  await expect(page.locator(DOCK)).toHaveCount(0);
  const attrs = await page.evaluate(() => [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-b2c-pins')));
  expect(attrs).toEqual([]);
  expect(await page.locator('#DashboardCard_Container').evaluate(e => getComputedStyle(e).paddingTop)).toBe('0px');
});

test('a week later the same pins resolve to the next modules', async ({ context, setSettings }) => {
  await scenario(context, WED_WK5);
  await setSettings({ 'pins.enabled': true, 'pins.list': PINS });
  const page = await context.newPage();
  await open(page, '/', WED_WK5);
  for (const [label, course] of [['Algebra this week', MATH401], ['Analysis this week', MATH301], ['Chem this week', CHEM101], ['Lab this week', CHEM107], ['Writing this week', WRIT202]] as const) {
    await expect(chip(page, label)).toHaveAttribute('href', `/courses/${course}/modules#module_${modId(course, 5)}`);
  }
});

test('warm cache: the second load paints resolved pins before the network answers, and the bar moves nothing', async ({ context, setSettings }) => {
  await scenario(context);
  await setSettings({ 'pins.enabled': true, 'pins.list': PINS.slice(0, 3) });
  const page = await context.newPage();
  await open(page);
  await expect(chip(page, 'Chem this week')).toHaveAttribute('href', `/courses/${CHEM101}/modules#module_${modId(CHEM101, 4)}`);

  // Hold module lists for 5 s on the next load.
  await context.route('**/api/v1/courses/*/modules**', async r => {
    await new Promise(res => setTimeout(res, 5000));
    await r.continue().catch(() => {});
  });
  // Record the card grid's top padding the moment it is parsed, before b²c's runtime runs.
  await page.addInitScript(() => {
    const w = window as unknown as { __gridPad?: string };
    new MutationObserver((_, mo) => {
      const g = document.getElementById('DashboardCard_Container');
      if (g) {
        w.__gridPad = getComputedStyle(g).paddingTop;
        mo.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const t0 = Date.now();
  await page.reload();
  await expect(chip(page, 'Chem this week')).toHaveAttribute('href', `/courses/${CHEM101}/modules#module_${modId(CHEM101, 4)}`, { timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(2500);
  await expect(chip(page, 'Chem this week').locator('.d')).toHaveText('Week 4 · Gases');

  // The bar sits in space reserved before first paint (the mirror), so its arrival moves nothing.
  const geo = await page.evaluate(() => {
    const grid = document.getElementById('DashboardCard_Container')!;
    const g = grid.getBoundingClientRect();
    const d = document.querySelector('b2c-pins-dock')!.getBoundingClientRect();
    return { parsedPad: (window as unknown as { __gridPad: string }).__gridPad, pad: getComputedStyle(grid).paddingTop, grid: g.top, dockTop: d.top, dockH: d.height };
  });
  expect(geo.parsedPad).toBe('52px'); // 44 px row + 8 px gap
  expect(geo.pad).toBe('52px');
  expect(geo.dockTop).toBe(geo.grid);
  expect(geo.dockH).toBe(52);
});

test('the new dashboard (Courses tab) gets the bar first in the tab', async ({ context, setSettings }) => {
  await scenario(context, WED_WK4, { mock_dashboard_view: 'widget', mock_dashboard_tab: 'courses' });
  await setSettings({ 'pins.enabled': true, 'pins.list': PINS.slice(0, 1) });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator(`[data-testid="courses-tab-content"] > ${DOCK}`)).toHaveCount(1);
  await expect(chip(page, 'Algebra this week')).toHaveAttribute('href', `/courses/${MATH401}/modules#module_${modId(MATH401, 4)}`);
  // React replaces the tab once cards load; the bar follows into the new tab.
  await expect(page.locator('[data-testid="courses-tab-content"] .ic-DashboardCard').first()).toBeVisible();
  await expect(page.locator(`[data-testid="courses-tab-content"] > ${DOCK}`)).toHaveCount(1);
});

test('course pages: a short list under the course navigation, this course only by default', async ({ context, setSettings }) => {
  await scenario(context);
  await setSettings({ 'pins.enabled': true, 'pins.list': [...PINS, { id: 'g', label: 'Next due anywhere', target: { kind: 'next-due' } }], 'pins.scope': 'course' });
  const page = await context.newPage();
  await open(page, `/courses/${MATH401}/assignments`);
  const dock = page.locator(`#left-side ${DOCK}`);
  await expect(dock).toHaveCount(1);
  await expect(dock.locator('a.pin')).toHaveText([/Algebra this week/, /Algebra lecture/, /Next due anywhere/]);
  await setSettings({ 'pins.scope': 'all' });
  await expect(dock.locator('a.pin')).toHaveCount(7);
  await setSettings({ 'pins.courseNav': false });
  await expect(page.locator(DOCK)).toHaveCount(0);
});

test('pin this page from a modules page (smart: this week\'s module), Undo, then build, edit and remove a pin', async ({ context, setSettings, sw }) => {
  await scenario(context);
  await setSettings({ 'pins.enabled': true, 'pins.list': [] });
  const page = await context.newPage();
  await open(page, `/courses/${CHEM107}/modules`);
  const dock = page.locator(DOCK);
  // "+ Pin" at the foot of the course-nav list pins the smart choice at once.
  await dock.getByRole('button', { name: 'Pin this page' }).click();
  await expect(chip(page, 'CHEM 107 this week')).toHaveAttribute('href', `/courses/${CHEM107}/modules#module_${modId(CHEM107, 4)}`);
  const stored = async () => (await sw.evaluate(async () => (await chrome.storage.sync.get('pins.list'))['pins.list'])) as { label: string; target: unknown }[];
  expect(await stored()).toEqual([expect.objectContaining({ label: 'CHEM 107 this week', target: { kind: 'module', course: CHEM107, which: 'this-week' } })]);

  // Undo from the toast.
  await page.locator('b2c-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(dock.locator('a.pin')).toHaveCount(0);
  expect(await stored()).toEqual([]);

  // Editor: newest lecture file in CHEM 107, whose Files tab is hidden (falls back to modules).
  await dock.getByRole('button', { name: 'Edit pins' }).click();
  const dialog = dock.getByRole('dialog', { name: 'Pins' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'New pin…' }).click();
  await dialog.getByLabel('Points to').selectOption('latest-file');
  await dialog.getByLabel('Course').selectOption(CHEM107);
  await dialog.getByLabel('Matching').fill('lecture');
  await expect(dialog.locator('.preview')).toContainText('Lecture 4');
  await dialog.getByLabel('Label').fill('Lab slides');
  await dialog.getByRole('button', { name: 'Pin', exact: true }).click();
  await expect(chip(page, 'Lab slides')).toHaveAttribute('href', new RegExp(`/courses/${CHEM107}/modules/items/\\d+$`));

  // Edit it, reorder by keyboard, then remove it.
  await dialog.getByRole('button', { name: 'Edit Lab slides' }).click();
  await dialog.getByLabel('Label').fill('Lab lecture');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(chip(page, 'Lab lecture')).toBeVisible();
  await dock.getByRole('button', { name: 'Pin this page' }).click(); // a second pin to reorder against
  await expect(dock.locator('a.pin')).toHaveCount(2);
  await dock.getByRole('button', { name: 'Edit pins' }).click();
  await dialog.getByRole('button', { name: 'Edit CHEM 107 this week' }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(dock.locator('a.pin')).toHaveText([/CHEM 107 this week/, /Lab lecture/]);
  await dialog.getByRole('button', { name: 'Remove Lab lecture' }).click();
  await expect(dock.locator('a.pin')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('honest states: fallback, not found, next week from Thursday, and the chip menu', async ({ context, setSettings }) => {
  const THU = '2026-10-22T10:00:00-07:00';
  await scenario(context, THU);
  await setSettings({
    'pins.enabled': true,
    'pins.list': [
      PINS[0],
      { id: 'adv', label: 'Advising this week', target: { kind: 'module', course: '100100', which: 'this-week' } },
      { id: 'gone', label: 'Old handout', target: { kind: 'page', course: MATH401, match: 'handout from 2019' } },
    ],
  });
  const page = await context.newPage();
  await open(page, '/', THU);
  // Thursday: the chip says what next week holds, and still opens this week.
  await expect(chip(page, 'Algebra this week').locator('.d')).toHaveText('Week 4 · next: Week 5');
  await expect(chip(page, 'Algebra this week')).toHaveAttribute('href', `/courses/${MATH401}/modules#module_${modId(MATH401, 4)}`);
  // No rule matched: this week's due items, said plainly.
  await expect(chip(page, 'Advising this week').locator('.d')).toHaveText("This week's due items · fallback");
  await expect(chip(page, 'Advising this week')).toHaveAttribute('href', '/courses/100100/assignments');
  // Target gone: struck through, never silently removed; clicking opens the editor.
  const gone = page.locator(DOCK).getByRole('button', { name: 'Old handout: not found. Edit' });
  await expect(gone).toContainText('Not found · Edit');
  await gone.click();
  const dialog = page.locator(DOCK).getByRole('dialog', { name: 'Pins' });
  await expect(dialog.getByLabel('Matching')).toHaveValue('handout from 2019');
  await page.keyboard.press('Escape');
  // The chip's menu offers next week's module.
  await chip(page, 'Algebra this week').click({ button: 'right' });
  await expect(dialog.getByRole('link', { name: "Open next week's: Week 5" })).toHaveAttribute('href', `/courses/${MATH401}/modules#module_${modId(MATH401, 5)}`);
});

test('the row never wraps: chips that do not fit fold into "+N"; chip height follows density', async ({ context, setSettings }) => {
  await scenario(context);
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, label: `Pinned link number ${i + 1}`, target: { kind: 'url', href: `/courses/${MATH401}/pages/p${i}` } }));
  await setSettings({ 'pins.enabled': true, 'pins.list': many });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const dock = page.locator(DOCK);
  const more = dock.getByRole('button', { name: /more pins?$/ });
  await expect(more).toBeVisible();
  const n = Number((await more.textContent())!.replace('+', ''));
  expect(n).toBeGreaterThan(0);
  await expect(dock.locator('li:not([hidden]) a.pin')).toHaveCount(12 - n);
  expect(await dock.evaluate(h => h.shadowRoot!.querySelector('.dock')!.getBoundingClientRect().height)).toBe(44);
  await more.click();
  await expect(dock.getByRole('dialog', { name: 'Pins' }).locator('a.pin')).toHaveCount(n);
  await page.keyboard.press('Escape');

  for (const [density, h] of [['compact', 36], ['roomy', 52]] as const) {
    await page.evaluate(d => document.documentElement.setAttribute('data-b2c-density', d), density);
    await expect.poll(() => dock.evaluate(x => x.shadowRoot!.querySelector('a.pin')!.getBoundingClientRect().height)).toBe(h);
  }
});

test('read-safe: only list endpoints, and nothing at all on pages without the dock', async ({ context, setSettings }) => {
  await scenario(context);
  await setSettings({ 'pins.enabled': true, 'pins.list': [...PINS, { id: 's', label: 'Syllabus', target: { kind: 'page', course: CHEM101, match: 'syllabus' } }, { id: 'n', label: 'Next', target: { kind: 'next-due' } }] });
  const page = await context.newPage();
  const api: string[] = [];
  page.on('request', r => {
    if (/\/api\/v1\//.test(r.url())) api.push(new URL(r.url()).pathname);
  });
  await open(page);
  await expect(chip(page, 'Syllabus')).toHaveAttribute('href', `/courses/${CHEM101}/pages/syllabus`);
  await expect(chip(page, 'Next')).toHaveAttribute('href', /\/courses\/\d+\/(assignments|quizzes|discussion_topics)\/\d+/);
  const pinsCalls = api.filter(p => /\/(modules|pages|files)\b/.test(p));
  expect(pinsCalls.length).toBeGreaterThan(0);
  // Never an item view (they mark things read or tick "must view" steps).
  for (const p of api) expect(p).not.toMatch(/\/(pages|files|assignments|discussion_topics|modules\/\d+\/items)\/[^/]+$/);

  // Calendar has no dock: no pins traffic.
  const before = api.length;
  await page.goto(CANVAS + '/calendar');
  await page.waitForTimeout(600);
  expect(api.slice(before).filter(p => /\/(modules|pages|files)\b/.test(p))).toEqual([]);
});

test('big courses: when Canvas leaves module items out, they are fetched for that course only', async ({ context, setSettings, canvas }) => {
  await scenario(context);
  // Real Canvas omits `items` from the module list when it's long. Do that for WRIT 202.
  await context.route(u => u.pathname === `/api/v1/courses/${WRIT202}/modules`, async r => {
    // Fetch from the mock directly (Playwright's own requests don't use the browser's host mapping).
    const u = new URL(r.request().url());
    const res = await r.fetch({ url: `https://127.0.0.1:${canvas.port}${u.pathname}${u.search}` });
    const body = await res.json();
    if (!Array.isArray(body)) throw new Error(`modules list: ${r.request().url()} → ${JSON.stringify(body).slice(0, 200)}`);
    await r.fulfill({ response: res, json: (body as Record<string, unknown>[]).map(({ items: _items, ...m }) => m) });
  });
  await setSettings({ 'pins.enabled': true, 'pins.list': [PINS[0], PINS[4]] });
  const page = await context.newPage();
  const itemCalls: string[] = [];
  page.on('request', r => {
    if (/\/modules\/\d+\/items/.test(r.url())) itemCalls.push(new URL(r.url()).pathname);
  });
  await open(page);
  // Rule 4 (due dates) needs the items: still week 4.
  await expect(chip(page, 'Writing this week')).toHaveAttribute('href', `/courses/${WRIT202}/modules#module_${modId(WRIT202, 4)}`);
  await expect(chip(page, 'Writing this week')).toHaveAttribute('title', /by due dates/);
  await expect(chip(page, 'Algebra this week')).toHaveAttribute('href', `/courses/${MATH401}/modules#module_${modId(MATH401, 4)}`);
  expect(itemCalls.length).toBeGreaterThan(0);
  expect(itemCalls.every(p => p.startsWith(`/api/v1/courses/${WRIT202}/`))).toBe(true);
});
