// Colour budget (design/spec/rice.md): on the dashboard at rest, colour only
// for course identity, overdue (once per item, on the due text) and one UI
// accent. Measured with the shared helper in colour-budget.ts.
import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';
import { budgetFor, checkBudget, measureColours } from './colour-budget.ts';

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 2400 }); // the whole grid on screen
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  await expect(page.locator('b2c-card-due li[data-key]').first()).toBeVisible();
  await page.mouse.move(0, 0); // at rest: nothing hovered
  await page.waitForTimeout(400);
}

test('dashboard at rest: ≤ course colours + 1 accent + danger, and b²c adds no other hue', async ({ context, setSettings }) => {
  await setSettings({ 'card-assignments.enabled': true, 'card-assignments.count': 8, 'card-assignments.view': 'rows', 'card-grades.enabled': true, 'card-customization.enabled': true, 'core.todoMarks': {} });
  const page = await context.newPage();
  await open(page);
  const budget = await budgetFor(page, 'b2c-card-due');

  // b²c's own regions on the cards: accent and danger only, danger once per item.
  const ours = await measureColours(page, 'b2c-card-due, b2c-card-grade, b2c-card-kebab');
  const r = checkBudget(ours, { ...budget, courses: [] });
  expect(r.extra.map(p => `${p.where} ${p.hex}`)).toEqual([]);
  expect(r.dangerTwice).toEqual([]);
  const overdueRows = await page.locator('b2c-card-due').evaluateAll(hs => hs.reduce((n, h) => n + h.shadowRoot!.querySelectorAll('li.overdue').length, 0));
  expect(overdueRows).toBeGreaterThan(0);
  expect(r.byFamily.danger).toBe(overdueRows); // the "Overdue 2d" text, nothing else (no row marker)

  // The whole card grid (Canvas's parts included): course colours + one accent + danger.
  const grid = await measureColours(page, '.ic-DashboardCard__box');
  const g = checkBudget(grid, budget);
  // Canvas's own link and brand colours are the same accent role (rice.md "Kept on purpose").
  const canvasRoles = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return [s.getPropertyValue('--ic-link-color'), s.getPropertyValue('--ic-brand-primary')].map(v => v.trim().toLowerCase()).filter(Boolean);
  });
  const extra = g.extra.filter(p => !canvasRoles.includes(p.hex.toLowerCase()));
  expect(extra.map(p => `${p.where} ${p.hex}`)).toEqual([]);
  const coursesOnPage = await page.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)').count();
  expect(g.families).toBeLessThanOrEqual(coursesOnPage + 2);

  // Submitted (when shown) is an outlined tonal chip, never a fill.
  await setSettings({ 'card-assignments.showCompleted': true });
  await expect.poll(() => page.locator('b2c-card-due').evaluateAll(hs => hs.some(h => !!h.shadowRoot!.querySelector('.chip')))).toBe(true);
  const chip = await page.locator('b2c-card-due').evaluateAll(hs => {
    const c = hs.map(h => h.shadowRoot!.querySelector('.chip')).find(Boolean)!;
    const s = getComputedStyle(c);
    return { bg: s.backgroundColor, border: s.borderTopWidth };
  });
  expect(chip.bg).toBe('rgba(0, 0, 0, 0)');
  expect(chip.border).toBe('1px');
  await setSettings({ 'card-assignments.showCompleted': false });
});

test('recolouring a card paints only its hero, never the title', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true });
  const page = await context.newPage();
  await open(page);
  const card = page.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)').nth(1);
  const titleBefore = await card.locator('.ic-DashboardCard__header-title').evaluate(e => ((e.querySelector(':scope > span') as HTMLElement | null) ?? (e as HTMLElement)).style.color);
  await card.locator('b2c-card-kebab').getByRole('button').click();
  await page.locator('b2c-card-menu').getByRole('menuitem', { name: 'Color…' }).click();
  await page.locator('b2c-card-menu').getByRole('radio', { name: '#009688' }).click();
  await expect.poll(() => card.locator('.ic-DashboardCard__header_hero').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(0, 150, 136)');
  expect(await card.locator('.ic-DashboardCard__header-title').evaluate(e => ((e.querySelector(':scope > span') as HTMLElement | null) ?? (e as HTMLElement)).style.color)).toBe(titleBefore);
});
