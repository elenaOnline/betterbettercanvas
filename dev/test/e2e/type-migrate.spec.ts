// type migration (dev builds only: the SW hook globalThis.__b2cMigrate; ship
// runs *migrate* specs in its test-build pass). A real-shaped v1 install:
// custom-font on with a bundled face, dark mode on a schedule, and a v2-lane
// density, all migrated together the way the SW does on update.
import type { Worker } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const migrate = (sw: Worker) => sw.evaluate(() => (globalThis as unknown as { __b2cMigrate: () => Promise<string[]> }).__b2cMigrate());
const hasHook = (sw: Worker) => sw.evaluate(() => typeof (globalThis as { __b2cMigrate?: unknown }).__b2cMigrate === 'function');
async function installSettled(sw: Worker) {
  await expect.poll(() => sw.evaluate(async () => ((await chrome.storage.local.get('b2c:migrations'))['b2c:migrations'] as string[] | undefined) ?? []), { timeout: 10_000 })
    .toContain('2026-10-20-type');
}

test('v1 custom-font (on, Atkinson) + dark-mode schedule + shape.density → type.* and palette.*, same look', async ({ context, sw }) => {
  test.skip(!(await hasHook(sw)), 'needs a dev build (SW migration hook)');
  await installSettled(sw);
  await sw.evaluate(() => chrome.storage.sync.set({
    'custom-font.enabled': true, 'custom-font.family': 'Atkinson Hyperlegible', 'custom-font.localFamily': '',
    'dark-mode.mode': 'schedule', 'dark-mode.start': '00:00', 'dark-mode.end': '23:59', 'dark-mode.preset': 'gray',
    'shape.density': 'compact',
  }));
  const done = await migrate(sw);
  expect(done).toEqual(expect.arrayContaining(['2026-10-20-palette', '2026-10-20-type']));
  const stored = await sw.evaluate(() => chrome.storage.sync.get(null));
  expect(stored).toMatchObject({ 'type.family': 'Atkinson Hyperlegible', 'type.localFamily': '', 'type.density': 'compact', 'palette.useDark': 'schedule', 'palette.dark': 'gray' });
  expect(Object.keys(stored).filter(k => k.startsWith('custom-font.') || k.startsWith('dark-mode.') || k === 'shape.density')).toEqual([]);
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-font', '');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-density', 'compact');
  await expect(page.locator('body')).toHaveCSS('font-family', /Atkinson Hyperlegible/);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-scheme', 'dark');
});

test('v1 custom-font switched off keeps Canvas\'s own font', async ({ context, sw }) => {
  test.skip(!(await hasHook(sw)), 'needs a dev build (SW migration hook)');
  await installSettled(sw);
  await sw.evaluate(() => chrome.storage.sync.set({ 'custom-font.enabled': false, 'custom-font.family': 'Inter' }));
  await migrate(sw);
  expect(await sw.evaluate(() => chrome.storage.sync.get(['type.family', 'custom-font.family']))).toEqual({ 'type.family': 'Canvas default' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-font', /.*/);
});
