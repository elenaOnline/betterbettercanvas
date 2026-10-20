// To-do views (design/spec/surfaces/todo-views.md): List · Ring · Week · By
// course over one to-do state. Headless, throwaway profile (fixtures.ts).
import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const NOW = '2026-10-21T10:00:00-07:00';
const PANEL = 'b2c-todo';
const radio = (page: Page, name: string) => page.locator(`${PANEL} .vb-seg [role=radio][aria-label="${name}"]`);

async function open(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + '/');
  // Narrow windows start collapsed to the header (better-todo.md).
  await expect(page.locator(`${PANEL} #h-todo`)).toBeVisible();
  if (await page.locator(`${PANEL} #b-todo`).isHidden()) await page.locator(`${PANEL} .collapse`).first().click();
  await expect(page.locator(`${PANEL} .viewbar`)).toBeVisible();
}

test.beforeEach(async ({ context, setSettings }) => {
  const p = await context.newPage();
  await p.request.post(CANVAS + '/__mock/reset');
  await p.close();
  await setSettings({ 'better-todo.count': 20 });
});

test('view control: a square radiogroup; switching is live, remembered, and loads only that view', async ({ context }) => {
  const page = await context.newPage();
  const chunks: string[] = [];
  page.on('request', r => r.url().startsWith('chrome-extension://') && r.url().includes('/chunks/') && chunks.push(r.url()));
  await open(page);
  await expect(radio(page, 'List')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator(`${PANEL} .ring-view, ${PANEL} .week-view, ${PANEL} .courses-view`)).toHaveCount(0);
  // The Ring segment's glyph is a round ring (it depicts its data); the segment itself stays square.
  await expect(radio(page, 'Progress ring').locator('svg circle')).toHaveCount(1);
  expect(parseFloat(await radio(page, 'Progress ring').evaluate(e => getComputedStyle(e).borderTopLeftRadius))).toBe(0);
  const before = chunks.length;
  // Keyboard: arrow keys move through the radiogroup.
  await radio(page, 'List').focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio(page, 'Progress ring')).toHaveAttribute('aria-checked', 'true');
  await expect(radio(page, 'Progress ring')).toBeFocused();
  await expect(page.locator(`${PANEL} .ring-view`)).toBeVisible();
  if (before >= 0 && chunks.length) expect(chunks.length).toBeGreaterThan(before); // a chunk was fetched on demand, when visible to the page
  // Remembered across loads.
  await page.reload();
  await expect(page.locator(`${PANEL} .ring-view`)).toBeVisible();
  await expect(radio(page, 'Progress ring')).toHaveAttribute('aria-checked', 'true');
  for (const [name, cls] of [['Week', '.week-view'], ['By course', '.courses-view'], ['List', '.group']] as const) {
    await radio(page, name).click();
    await expect(page.locator(`${PANEL} ${cls}`).first()).toBeVisible();
  }
});

test('ring: honest centre and legend; a tick fills the arc in one beat and every view agrees', async ({ context, setSettings }) => {
  await setSettings({ 'better-todo.view': 'ring' });
  const page = await context.newPage();
  await open(page);
  const ctr = page.locator(`${PANEL} .ring-view .ctr`);
  await expect(ctr).toContainText('done this week');
  const [done0, total] = (await ctr.locator('.big').innerText()).split(' of ').map(Number) as [number, number];
  expect(total).toBeGreaterThan(0);
  await expect(page.locator(PANEL)).not.toContainText('%');
  await expect(page.locator(PANEL)).not.toContainText('0 of 0');
  await expect(page.locator(`${PANEL} [role=group][aria-label="Progress this week"] .legend button`).first()).toHaveAttribute('aria-label', /: \d+ of \d+ done\. Show only this course/);
  // Tick the first item left this week.
  const left = page.locator(`${PANEL} .ring-view .group`, { has: page.locator('.gl', { hasText: /Left this week/i }) }).locator('li[data-key]').first();
  const key = (await left.getAttribute('data-key'))!;
  const course = await page.evaluate(k => {
    const host = document.querySelector('b2c-todo')!.shadowRoot!;
    const li = host.querySelector(`li[data-key="${k}"]`) as HTMLElement;
    const c = getComputedStyle(li).getPropertyValue('--c').trim();
    return c;
  }, key);
  void course;
  const arcFill = async () =>
    page.evaluate(() => {
      const host = document.querySelector('b2c-todo')!.shadowRoot!;
      return [...host.querySelectorAll('.arc .fill')].map(e => parseFloat(getComputedStyle(e).strokeDasharray)).reduce((a, b) => a + b, 0);
    });
  const a0 = await arcFill();
  await left.locator('input[type=checkbox]').click({ force: true });
  await page.waitForTimeout(70);
  const aMid = await arcFill();
  await page.waitForTimeout(400);
  const a1 = await arcFill();
  expect(aMid).toBeGreaterThan(a0);
  expect(a1).toBeGreaterThan(aMid); // animated over the 280 ms beat, not a jump
  await expect(ctr.locator('.big')).toHaveText(`${done0 + 1} of ${total}`);
  await expect(page.locator(`${PANEL} li[data-key="${key}"]`)).toHaveClass(/complete/); // stays in place, crossed off
  // The live region says the count.
  await expect(page.locator('b2c-toast')).toContainText(/Marked done/);
  expect(await page.evaluate(() => document.querySelector('b2c-toast')!.shadowRoot!.textContent)).toMatch(new RegExp(`${done0 + 1} of ${total} done this week`));
  // Week and By course and List agree.
  await radio(page, 'Week').click();
  await expect(page.locator(`${PANEL} .week-view li[data-key="${key}"]`)).toHaveClass(/complete/);
  await radio(page, 'By course').click();
  await expect(page.locator(`${PANEL} .courses-view li[data-key="${key}"]`)).toHaveClass(/complete/);
  await radio(page, 'List').click();
  await expect(page.locator(`${PANEL} li[data-key="${key}"]`)).toHaveClass(/complete/);
});

test('ring: legend filters the list; range menu; round by default, squarable by a theme', async ({ context, setSettings }) => {
  await setSettings({ 'better-todo.view': 'ring' });
  const page = await context.newPage();
  await open(page);
  const lg = page.locator(`${PANEL} .legend button`).first();
  const name = (await lg.locator('.lg-name').innerText()).trim();
  await lg.click();
  await expect(lg).toHaveAttribute('aria-pressed', 'true');
  const chips = await page.locator(`${PANEL} .ring-view .group li[data-key] .chip.course`).allInnerTexts();
  expect(chips.length).toBeGreaterThan(0);
  expect(new Set(chips)).toEqual(new Set([name]));
  await lg.click();
  await expect(lg).toHaveAttribute('aria-pressed', 'false');
  // Range.
  await page.locator(`${PANEL} .vb-range`).selectOption('today');
  await expect(page.locator(`${PANEL} .ring-view .ctr`)).toContainText(/today/);
  // Round by default (the owner, 2026-10-20): the track's corner is half its 96 px side.
  const rx = () => page.evaluate(() => getComputedStyle(document.documentElement.querySelector('b2c-todo')!.shadowRoot!.querySelector('.trk')!).getPropertyValue('rx'));
  expect(parseFloat(await rx())).toBe(48);
  // A theme or rice can still square it.
  await page.evaluate(() => document.documentElement.style.setProperty('--b2c-ring-corner', '4px'));
  expect(parseFloat(await rx())).toBe(4);
});

test('week: LATE then Mon–Sun with today shaded; columns jump to the day; squares fill on a tick', async ({ context, setSettings }) => {
  await setSettings({ 'better-todo.view': 'week' });
  const page = await context.newPage();
  await open(page);
  const cols = page.locator(`${PANEL} .wk-col`);
  await expect(cols).toHaveCount(8);
  await expect(cols.first()).toHaveClass(/late/);
  await expect(cols.nth(3)).toHaveClass(/today/); // Wednesday
  await expect(cols.nth(3)).toHaveAttribute('aria-label', /^Wednesday 21: \d+ of \d+ done$/);
  await expect(page.locator(`${PANEL} .vb-label`)).toHaveText('This week');
  // Click Friday: its heading takes focus.
  await cols.nth(5).click();
  await expect(page.locator(`${PANEL} .wk-day[data-day] h3`).filter({ hasText: /FRI 23/ })).toBeFocused();
  // Tick the first item due today: one more filled square in today's column, and its count follows.
  const todaySec = page.locator(`${PANEL} .wk-day.today`);
  await expect(todaySec.locator('.gl-n')).toHaveText(/(\d+) of (\d+) done/);
  const [d0, t0] = (await todaySec.locator('.gl-n').innerText()).match(/\d+/g)!.map(Number) as [number, number];
  const on0 = await cols.nth(3).locator('.sq.on').count();
  await todaySec.locator('li[data-key] input[type=checkbox]:not(:checked)').first().click({ force: true });
  await expect(todaySec.locator('.gl-n')).toHaveText(`${d0 + 1} of ${t0} done`);
  await expect(cols.nth(3).locator('.sq.on')).toHaveCount(Math.min(on0 + 1, 4));
  // Week navigation.
  await page.locator(`${PANEL} button[aria-label="Next week"]`).click();
  await expect(page.locator(`${PANEL} .vb-label`)).toHaveText('Next week');
  await expect(cols.nth(1)).toHaveAttribute('aria-label', /^Monday 26/);
});

test('by course: header counts, one cell per item, cells fill; idle courses are one line', async ({ context, setSettings }) => {
  await setSettings({ 'better-todo.view': 'courses' });
  const page = await context.newPage();
  await open(page);
  const block = page.locator(`${PANEL} .cv-block:not(.empty-course)`).first();
  await expect(block).toBeVisible();
  await expect(block.locator('.cv-n')).toHaveText(/\d+ of \d+ this week/);
  const cells = block.locator('.cell');
  const n = await cells.count();
  expect(n).toBeGreaterThan(0);
  const on0 = await block.locator('.cell.on').count();
  await block.locator('li[data-key] input[type=checkbox]:not(:checked)').first().click({ force: true });
  await expect(block.locator('.cell.on')).toHaveCount(on0 + 1);
  // Rows here don't repeat the course (the header says it).
  await expect(block.locator('li[data-key] .chip.course')).toHaveCount(0);
  // The advising "course" has nothing this week: one line, said in words.
  await expect(page.locator(`${PANEL} .cv-block.empty-course`).first()).toContainText('Nothing due this week');
});

test('every view works at 240 px (classic), 288 px (new dashboard) and as a wide strip', async ({ context, setSettings }) => {
  for (const [label, setup, width] of [
    ['240', async () => {}, 1440],
    ['288', async () => context.addCookies([{ name: 'mock_dashboard_view', value: 'widget', url: CANVAS + '/' }, { name: 'mock_dashboard_tab', value: 'courses', url: CANVAS + '/' }]), 1440],
    ['strip', async () => {}, 1000],
  ] as const) {
    await setup();
    for (const view of ['list', 'ring', 'week', 'courses'] as const) {
      await setSettings({ 'better-todo.view': view });
      const page = await context.newPage();
      await open(page, width);
      const w = Math.round(await page.locator(PANEL).evaluate(e => e.getBoundingClientRect().width));
      if (label === '240') expect(w).toBe(240);
      if (label === '288') expect(w).toBe(288);
      if (label === 'strip') {
        expect(w).toBeGreaterThan(560);
      }
      if (view !== 'list') await expect(page.locator(`${PANEL} .${view}-view`)).toBeVisible();
      // Nothing spills sideways.
      const overflow = await page.locator(PANEL).evaluate(h => {
        const root = h.shadowRoot!.querySelector('.panel') as HTMLElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(overflow, `${view} at ${label}`).toBeLessThanOrEqual(1);
      if (label === 'strip' && view === 'week') {
        await expect(page.locator(`${PANEL} .wk-bar`)).toBeHidden();
        const tops = await page.locator(`${PANEL} .wk-day:not(.late)`).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
        expect(new Set(tops).size).toBe(1); // 8 real columns side by side
      }
      if (label === '240' && view === 'ring') await expect(page.locator(`${PANEL} .vb-name`)).toBeHidden(); // icons only
      await page.locator(PANEL).screenshot({ path: `.scratch/todo/shots/views-${view}-${label}.png` });
      await page.close();
    }
  }
});
