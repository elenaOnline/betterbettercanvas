// The same card features on Canvas's new dashboard (Courses tab), which is
// what the owner sees: cards inside [data-testid=courses-tab-content], no
// #DashboardCard_Container.
import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const CARD = '.ic-DashboardCard:has(a.ic-DashboardCard__link)';

test.beforeEach(async ({ context }) => {
  await context.addCookies(['mock_dashboard_view=widget', 'mock_dashboard_tab=courses'].map(c => {
    const [name, value] = c.split('=') as [string, string];
    return { name, value, url: CANVAS + '/' };
  }));
  const p = await context.newPage();
  await p.request.post(CANVAS + '/__mock/reset');
  await p.close();
});

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  await expect(page.locator(`[data-testid=courses-tab-content] ${CARD}`).first()).toBeVisible();
  await expect(page.locator('#DashboardCard_Container')).toHaveCount(0);
}

test('new dashboard: due lists, grade chips, the one ⋮ menu and notes all mount', async ({ context, setSettings }) => {
  await setSettings({
    'card-assignments.enabled': true,
    'card-grades.enabled': true,
    'card-customization.enabled': true,
    'dashboard-notes.enabled': true,
    'dashboard-notes.text': 'hello',
    'dashboard-notes.at': 1,
  });
  const page = await context.newPage();
  await open(page);
  const n = await page.locator(CARD).count();
  await expect(page.locator('b2c-card-due')).toHaveCount(n);
  await expect(page.locator('b2c-card-grade')).toHaveCount(n);
  await expect(page.locator('b2c-card-kebab')).toHaveCount(n);
  // Canvas's own ⋮ gives way to ours on every decorated card.
  await expect(page.locator(`${CARD}[data-b2c-card] .ic-DashboardCard__header-button`).first()).toBeHidden();
  await page.locator('b2c-card-kebab').first().getByRole('button').click();
  await expect(page.locator('b2c-card-menu').getByRole('menuitem', { name: 'Color…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('b2c-card-due li[data-key]').first()).toBeVisible();
  const heights = await page.locator(CARD).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  await expect(page.locator('b2c-dashboard-notes').getByRole('textbox', { name: 'Notes' })).toHaveValue('hello');
});

test('new dashboard: card colors repaint and write Canvas', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await open(page);
  await setSettings({ 'card-colors.request': { id: 'nd1', mode: 'single', color: '#386641' } });
  await expect
    .poll(() => page.locator(CARD).evaluateAll(els => els.every(e => getComputedStyle(e.querySelector('.ic-DashboardCard__header_hero')!).backgroundColor === 'rgb(56, 102, 65)')))
    .toBe(true);
  await expect(page.locator('b2c-toast')).toContainText('Card colors saved to Canvas');
});

test('new dashboard: no grid layout shift, including the stale-mirror first load @perf', async ({ context, setSettings }) => {
  const run = async (enabled: boolean) => {
    await setSettings({ 'card-assignments.enabled': enabled });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as { __g: number };
      w.__g = 0;
      new PerformanceObserver(l => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources: { node?: Node }[] }[]) {
          if (e.hadRecentInput) continue;
          const inGrid = e.sources.some(s => {
            const n = s.node;
            const el = n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null;
            return !!el?.closest('.ic-DashboardCard__box, [data-testid=courses-tab-content] .ic-DashboardCard');
          });
          if (inGrid) w.__g += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await open(page);
    if (enabled) await expect(page.locator('b2c-card-due li[data-key]').first()).toBeVisible();
    await page.waitForTimeout(1200);
    const g = await page.evaluate(() => (window as unknown as { __g: number }).__g);
    await page.close();
    return g;
  };
  const base = Math.max(await run(false), await run(false)); // leaves the mirror stale
  const cold = await run(true);
  const warm = await run(true);
  expect(cold - base).toBeLessThan(0.01);
  expect(warm - base).toBeLessThan(0.01);
});
