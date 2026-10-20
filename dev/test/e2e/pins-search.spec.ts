// pins × ⌘K: "Pin this page" commands and pins as results. Needs a build with
// both features (B2C_FEATURES=pins,global-search); skips otherwise.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, CANVAS, DIST } from './fixtures.ts';

const schema = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIST, 'schema.json'), 'utf8')).settings as Record<string, unknown>;
  } catch {
    return {};
  }
})();
test.skip(!('global-search.enabled' in schema && 'pins.enabled' in schema), 'needs pins and global-search in the build');

const HOST = 'b2c-search';
const MATH401 = '118200';
const box = (page: Page) => page.locator(HOST).getByRole('combobox', { name: 'Search Canvas' });

async function open(page: Page, p: string) {
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + p);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-b2c-instance'));
}

test('⌘K: pin this week\'s module from a modules page, then find the pin as a result', async ({ context, setSettings, sw }) => {
  await context.addCookies(['mock_scenario=weeks', 'mock_delay=0'].map(c => ({ name: c.split('=')[0]!, value: c.split('=')[1]!, url: CANVAS + '/' })));
  await setSettings({ 'pins.enabled': true, 'pins.list': [], 'global-search.enabled': true });
  const page = await context.newPage();
  await open(page, `/courses/${MATH401}/modules`);

  await page.keyboard.press('ControlOrMeta+k');
  await expect(box(page)).toBeFocused();
  await box(page).fill('pin this week');
  const cmd = page.locator(HOST).getByRole('option', { name: /Pin this week's module in this course/ });
  await expect(cmd).toBeVisible();
  await cmd.click();
  await expect.poll(async () => (await sw.evaluate(async () => (await chrome.storage.sync.get('pins.list'))['pins.list'])) as unknown[]).toEqual([
    expect.objectContaining({ label: 'MATH 401 this week', target: { kind: 'module', course: MATH401, which: 'this-week' } }),
  ]);

  await page.keyboard.press('ControlOrMeta+k');
  // Query by the label minus its subject ('MATH 401 this week' → '441 this week').
  await box(page).fill('MATH 401 this week'.replace(/^[A-Z]+ /, ''));
  const pins = page.locator(HOST).getByRole('group', { name: 'Pins' });
  await expect(pins.getByRole('option').first()).toContainText('MATH 401 this week');
  await expect(pins.getByRole('option').first()).toContainText('by module name');
});
