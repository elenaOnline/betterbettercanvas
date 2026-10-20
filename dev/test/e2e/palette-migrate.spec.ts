// palette migration (dev builds only: uses the SW hook globalThis.__b2cMigrate,
// which release builds don't have; ship runs this file in its test-build pass).
// Seeds v1 dark-mode.* settings as a real install has them, runs the
// migration the way the SW does on update, and checks the keys and the look.
import type { Worker } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const migrate = (sw: Worker) => sw.evaluate(() => (globalThis as unknown as { __b2cMigrate: () => Promise<string[]> }).__b2cMigrate());
/** The SW runs migrations itself on install; let that finish so it can't race ours. */
async function installSettled(sw: Worker) {
  await expect.poll(() => sw.evaluate(async () => ((await chrome.storage.local.get('b2c:migrations'))['b2c:migrations'] as string[] | undefined) ?? []), { timeout: 10_000 })
    .toContain('2026-10-20-palette');
}
const hasHook = (sw: Worker) => sw.evaluate(() => typeof (globalThis as { __b2cMigrate?: unknown }).__b2cMigrate === 'function');
const bodyBg = (p: import('@playwright/test').Page) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('v1 custom palette on a schedule (every v1 key set) keeps its look', async ({ context, sw }) => {
  test.skip(!(await hasHook(sw)), 'needs a dev build (SW migration hook)');
  await installSettled(sw);
  // v1 as shipped in 0.1.x: sync area, one item per key; a custom palette
  // with the school's link kept ('' = derived), the theme-colour nav, dim images.
  await sw.evaluate(() => chrome.storage.sync.set({
    'dark-mode.mode': 'schedule', 'dark-mode.start': '00:00', 'dark-mode.end': '23:59',
    'dark-mode.preset': 'custom',
    'dark-mode.bg': '#101820', 'dark-mode.surface': '#18222c', 'dark-mode.surfaceRaised': '#222e3a', 'dark-mode.border': '#3a4652',
    'dark-mode.text': '#eef2f6', 'dark-mode.textSecondary': '#c4cbd2', 'dark-mode.textTertiary': '#a8b0b8',
    'dark-mode.link': '', 'dark-mode.nav': '', 'dark-mode.navText': '#ffffff',
    'dark-mode.navStyle': 'theme', 'dark-mode.dimImages': true,
  }));
  expect(await migrate(sw)).toContain('2026-10-20-palette');
  const stored = await sw.evaluate(() => chrome.storage.sync.get(null));
  expect(stored).toMatchObject({
    'palette.useDark': 'schedule', 'palette.start': '00:00', 'palette.end': '23:59', 'palette.dark': 'custom',
    'palette.navStyle': 'theme', 'palette.dimImages': true,
    'palette.darkRoles': { bg: '#101820', surface: '#18222c', surfaceRaised: '#222e3a', border: '#3a4652', text: '#eef2f6', textSecondary: '#c4cbd2', textTertiary: '#a8b0b8', link: 'school', nav: 'school', navText: '#ffffff' },
  });
  expect(Object.keys(stored).filter(k => k.startsWith('dark-mode.'))).toEqual([]);
  // Running again changes nothing.
  expect(await sw.evaluate(() => (globalThis as unknown as { __b2cMigrate: () => Promise<string[]> }).__b2cMigrate())).toContain('2026-10-20-palette');
  expect(await sw.evaluate(() => chrome.storage.sync.get(null))).toEqual(stored);

  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-scheme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-nav-style', 'theme');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dim-images', '');
  expect(await bodyBg(page)).toBe('rgb(16, 24, 32)');
});

test('v1 "On" with the Warm preset; v1 "Off" stays plain Canvas', async ({ context, sw }) => {
  test.skip(!(await hasHook(sw)), 'needs a dev build (SW migration hook)');
  await installSettled(sw);
  await sw.evaluate(() => chrome.storage.sync.set({ 'dark-mode.mode': 'on', 'dark-mode.preset': 'warm' }));
  await migrate(sw);
  expect(await sw.evaluate(() => chrome.storage.sync.get(['palette.useDark', 'palette.dark']))).toEqual({ 'palette.useDark': 'always', 'palette.dark': 'warm' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-scheme', 'dark');
  expect(await bodyBg(page)).toBe('rgb(37, 31, 25)');

  await sw.evaluate(() => chrome.storage.sync.set({ 'dark-mode.mode': 'off' }));
  await migrate(sw);
  expect(await sw.evaluate(() => chrome.storage.sync.get('palette.useDark'))).toEqual({ 'palette.useDark': 'never' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-b2c-theme'))).toBeNull();
});
