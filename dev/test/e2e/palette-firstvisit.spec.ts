// Agent kit finding (render, 2026-10-20): under Black the new dashboard's
// header band stayed white. Not #000: the render's first page load had no
// pre-paint mirror yet, so the page-world InstUI layer didn't install at
// document_start and emotion's rules kept their literals. Themes whose render
// happened to load the dashboard once first (to apply course colours) looked
// fine. Fix: the palette runtime asks the page world to install late and
// rewrite the rules already inserted. Also covers a live switch from Canvas
// to a theme in an open tab (no reload).
import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const host = () => new URL(CANVAS).hostname;
const whiteIslands = (p: Page) =>
  p.evaluate(() => Array.from(document.querySelectorAll('#content *')).filter(e => {
    const r = e.getBoundingClientRect();
    return getComputedStyle(e).backgroundColor === 'rgb(255, 255, 255)' && r.width * r.height > 2000 && r.top < 900;
  }).map(e => `${e.tagName}.${e.className.toString().slice(0, 40)}`));

for (const dark of ['black', 'dark', 'gray']) test(`${dark} on the new dashboard, very first visit (no mirror yet): no white "Hello" header band`, async ({ context, setSettings }) => {
  await context.addCookies(Object.entries({ mock_delay: '0', mock_dashboard_view: 'widget', mock_dashboard_tab: 'courses' }).map(([name, value]) => ({ name, value, domain: host(), path: '/' })));
  await setSettings({ 'palette.useDark': 'always', 'palette.dark': dark });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => 0)).toBe(0);
  await page.goto(CANVAS + '/'); // the first Canvas page in this profile: localStorage is empty
  await page.locator('.ic-DashboardCard').first().waitFor();
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  await expect.poll(() => whiteIslands(page)).toEqual([]);
  // the greeting and tabs are light text on black
  const c = await page.locator('h1:not(.screenreader-only), h2').first().evaluate(e => getComputedStyle(e).color);
  expect(c).not.toBe('rgb(39, 53, 64)');
  await page.screenshot({ path: `.scratch/dark/shots/firstvisit-${dark}-dashboard.png` });
});

test('switching from Canvas to a dark theme in an open tab covers InstUI live, no reload', async ({ context, setSettings }) => {
  await context.addCookies(Object.entries({ mock_delay: '0', mock_dashboard_view: 'widget', mock_dashboard_tab: 'courses' }).map(([name, value]) => ({ name, value, domain: host(), path: '/' })));
  await setSettings({ 'palette.useDark': 'never', 'palette.light': 'canvas', 'shape.corner': 2 });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(CANVAS + '/');
  await page.goto(CANVAS + '/');
  await page.locator('.ic-DashboardCard').first().waitFor();
  const marker = await page.evaluate(() => ((window as unknown as { __m: number }).__m = 7));
  await setSettings({ 'palette.useDark': 'always', 'palette.dark': 'black' });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  await expect.poll(() => whiteIslands(page)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __m: number }).__m)).toBe(marker);
});
