import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const NOW = '2026-10-21T10:00:00-07:00';
const CHIP = 'b2c-card-grade';

async function open(page: Page) {
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + '/');
}
const chipText = (page: Page) =>
  page.locator(CHIP).evaluateAll(els => els.map(e => [e.closest('.ic-DashboardCard')!.querySelector('a.ic-DashboardCard__link')!.getAttribute('href'), (e as HTMLElement).hidden ? null : e.shadowRoot!.querySelector('a')!.textContent]));

test('grade chips turn on live, match Canvas, and turn off without a trace', async ({ context, setSettings }) => {
  await setSettings({ 'card-grades.enabled': false });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)').first()).toBeVisible();
  await expect(page.locator(CHIP)).toHaveCount(0);

  await setSettings({ 'card-grades.enabled': true });
  const n = await page.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)').count();
  await expect(page.locator(CHIP)).toHaveCount(n);
  // Expected values straight from the API the chip is meant to mirror.
  const courses = (await page.evaluate(async () =>
    (await fetch('/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=100', { headers: { Accept: 'application/json' } })).json())) as {
    id: number | string; hide_final_grades: boolean; enrollments: { computed_current_score?: number | null; computed_current_grade?: string | null }[];
  }[];
  const expected = new Map(courses.map(c => {
    const e = c.enrollments[0]!;
    const s = e.computed_current_score;
    const text = c.hide_final_grades ? null : s == null ? 'No grade' : `${Number(s.toFixed(2))}%${e.computed_current_grade ? ' ' + e.computed_current_grade : ''}`;
    return [`/courses/${c.id}`, text];
  }));
  await expect.poll(async () => (await chipText(page)).every(([href, t]) => expected.get(href!) === t)).toBe(true);
  expect((await chipText(page)).some(([, t]) => t && /%/.test(t))).toBe(true);
  // The chip links to the course's grades page.
  const href = await page.locator(CHIP).first().evaluate(e => e.shadowRoot!.querySelector('a')!.getAttribute('href'));
  expect(href).toMatch(/^\/courses\/\d+\/grades$/);

  await setSettings({ 'card-grades.enabled': false });
  await expect(page.locator(CHIP)).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-card-grades', '');
});

test('only-on-hover hides the chip (space kept) until the card is hovered', async ({ context, setSettings }) => {
  await setSettings({ 'card-grades.enabled': true, 'card-grades.hoverOnly': false });
  const page = await context.newPage();
  await open(page);
  const chip = page.locator(`${CHIP}:not([hidden])`).first();
  await expect(chip).toBeVisible();
  await setSettings({ 'card-grades.hoverOnly': true });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-card-grades-hover', '');
  await expect.poll(() => chip.evaluate(e => getComputedStyle(e).opacity)).toBe('0');
  await page.mouse.move(0, 0);
  await chip.evaluate(e => e.closest('.ic-DashboardCard')!.scrollIntoView());
  const box = await chip.evaluate(e => { const r = e.closest('.ic-DashboardCard')!.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height - 10 }; });
  await page.mouse.move(box.x, box.y);
  await expect.poll(() => chip.evaluate(e => getComputedStyle(e).opacity)).toBe('1');
  await setSettings({ 'card-grades.hoverOnly': false });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-card-grades-hover', '');
});

test('warm cache: chips render before the courses request answers', async ({ context, setSettings }) => {
  await setSettings({ 'card-grades.enabled': true });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator(`${CHIP}:not([hidden])`).first()).toBeVisible();
  const before = await chipText(page);
  await page.route('**/api/v1/courses?**', async r => {
    await new Promise(res => setTimeout(res, 5000));
    await r.continue().catch(() => {});
  });
  await page.reload();
  await expect(page.locator(`${CHIP}:not([hidden])`).first()).toBeVisible({ timeout: 3000 });
  expect(await chipText(page)).toEqual(before);
});
