import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const NOW = '2026-10-21T10:00:00-07:00';

test.beforeEach(async ({ context }) => {
  const p = await context.newPage();
  await p.request.post(CANVAS + '/__mock/reset');
  await p.close();
});

async function open(page: Page) {
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + '/');
  await expect(page.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)').first()).toBeVisible();
}
const heroColors = (page: Page): Promise<[string, string][]> =>
  page.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)').evaluateAll(els =>
    els.map(e => [e.querySelector('a.ic-DashboardCard__link')!.getAttribute('href')!.split('/').pop()!, getComputedStyle(e.querySelector('.ic-DashboardCard__header_hero')!).backgroundColor] as [string, string]));
const canvasColors = async (page: Page) =>
  ((await page.evaluate(async () => (await fetch('/api/v1/users/self/colors')).json())) as { custom_colors: Record<string, string> }).custom_colors;
const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

test('"Set all" to one colour repaints at once, writes Canvas, and Undo restores', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await open(page);
  const before = await canvasColors(page);
  const ids = (await heroColors(page)).map(([id]) => id);

  await setSettings({ 'card-colors.request': { id: 'r1', mode: 'single', color: '#2d6a4f' } });
  // Optimistic: every card repaints immediately, before the writes finish.
  await expect.poll(async () => (await heroColors(page)).every(([, c]) => c === rgb('#2d6a4f')), { timeout: 2000 }).toBe(true);
  await expect.poll(async () => { const c = await canvasColors(page); return ids.every(id => c[`course_${id}`]?.toLowerCase() === '#2d6a4f'); }).toBe(true);
  await expect(page.locator('b2c-toast')).toContainText('Card colors saved to Canvas');

  // Survives a reload (it's Canvas's colour now, so Canvas paints it).
  await page.reload();
  await expect.poll(async () => (await heroColors(page)).every(([, c]) => c === rgb('#2d6a4f'))).toBe(true);

  // Undo = revert to the colours from before.
  await setSettings({ 'card-colors.request': { id: 'r2', mode: 'revert' } });
  await expect.poll(async () => { const c = await canvasColors(page); return ids.every(id => (c[`course_${id}`] ?? '').toLowerCase() === (before[`course_${id}`] ?? '').toLowerCase()); }).toBe(true);
});

test('a refused write rolls that card back and offers Retry', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await open(page);
  const [victim, original] = (await heroColors(page))[0]!;
  await page.route(`**/api/v1/users/self/colors/course_${victim}`, r => r.fulfill({ status: 500, body: '{}' }));
  await setSettings({ 'card-colors.request': { id: 'r3', mode: 'palette', palette: 'Berry' } });
  await expect(page.locator('b2c-toast')).toContainText("Couldn't save 1 card color to Canvas");
  const now = new Map(await heroColors(page));
  expect(now.get(victim)).toBe(original);
  await expect(page.locator('b2c-toast').getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('a request applies once, even with two dashboards open', async ({ context, setSettings }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await open(a);
  await open(b);
  let puts = 0;
  for (const p of [a, b]) p.on('request', r => { if (r.method() === 'PUT' && r.url().includes('/users/self/colors/')) puts++; });
  const n = (await heroColors(a)).length;
  await setSettings({ 'card-colors.request': { id: 'r4', mode: 'gradient', from: '#7b2cbf', to: '#0b4f6c' } });
  await expect.poll(() => puts).toBeGreaterThanOrEqual(n);
  await a.waitForTimeout(800);
  expect(puts).toBe(n);
  // The other tab picks the new colours up on its next load.
  await b.reload();
  await expect(b.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)').first()).toBeVisible();
  const colors = (await heroColors(b)).map(([, c]) => c);
  expect(colors[0]).toBe(rgb('#7b2cbf'));
  expect(colors[n - 1]).toBe(rgb('#0b4f6c'));
});
