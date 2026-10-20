// Design (rice.md): while Canvas's own widget-dashboard dark mode is on, a
// b²c LIGHT theme applies nothing on the new dashboard (the two would fight);
// a b²c dark theme paints as normal. The state is exposed to the popup and the
// Studio in the Show-original reply: { nativeDark: true }.
import type { Worker } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const host = () => new URL(CANVAS).hostname;
const ask = (sw: Worker) => sw.evaluate(async origin => {
  const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
  return chrome.tabs.sendMessage(tab!.id!, { type: 'b2c:dark:original', op: 'query' });
}, CANVAS);

test('Canvas\'s widget dark + a b²c light theme: b²c yields on the dashboard, says so, and paints elsewhere', async ({ context, setSettings, sw }) => {
  await context.addCookies(Object.entries({ mock_delay: '0', mock_dashboard_view: 'widget', mock_dashboard_tab: 'dashboard', mock_widget_dark: '2' }).map(([name, value]) => ({ name, value, domain: host(), path: '/' })));
  await setSettings({ 'palette.useDark': 'never', 'palette.light': 'sepia' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await page.waitForFunction(() => !!document.getElementById('widget-dashboard-dark-mode'));
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-theme', /.*/);
  expect(await ask(sw)).toMatchObject({ nativeDark: true, original: false, dark: true });
  // pre-paint on reload in this tab
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-b2c-theme'))).toBeNull();
  // other pages still get the light theme
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  expect(await ask(sw)).toMatchObject({ nativeDark: false });
});

test('Canvas\'s widget dark + a b²c dark theme: b²c paints as normal', async ({ context, setSettings, sw }) => {
  await context.addCookies(Object.entries({ mock_delay: '0', mock_dashboard_view: 'widget', mock_dashboard_tab: 'dashboard', mock_widget_dark: '2' }).map(([name, value]) => ({ name, value, domain: host(), path: '/' })));
  await setSettings({ 'palette.useDark': 'always', 'palette.dark': 'dark' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await page.waitForFunction(() => !!document.getElementById('widget-dashboard-dark-mode'));
  await page.waitForTimeout(200);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  expect(await ask(sw)).toMatchObject({ nativeDark: false });
});

test('switching the b²c theme from light to dark lifts the hold live', async ({ context, setSettings }) => {
  await context.addCookies(Object.entries({ mock_delay: '0', mock_dashboard_view: 'widget', mock_dashboard_tab: 'dashboard', mock_widget_dark: '2' }).map(([name, value]) => ({ name, value, domain: host(), path: '/' })));
  await setSettings({ 'palette.useDark': 'never', 'palette.light': 'paper' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await page.waitForFunction(() => !!document.getElementById('widget-dashboard-dark-mode'));
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-theme', /.*/);
  await setSettings({ 'palette.useDark': 'always' });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-scheme', 'dark');
});
