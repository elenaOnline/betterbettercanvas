// The Studio's Features mode (options.html): the settings rows from layout.ts,
// live in an open Canvas tab, dimmed nested rows, reset with Undo, hidden
// cards, and first run.
import { test, expect, CANVAS } from './fixtures.ts';
import type { BrowserContext, Page, Worker } from '@playwright/test';

const stored = (sw: Worker, key: string) => sw.evaluate(async k => {
  const [s, l] = await Promise.all([chrome.storage.sync.get(k), chrome.storage.local.get(k)]);
  return s[k] ?? l[k];
}, key);
const row = (p: Page, id: string) => p.locator(`#features [data-row="${id}"]`);
async function features(context: BrowserContext, sw: Worker, hash: string) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(new URL('options.html' + hash, sw.url()).href);
  await expect(p.locator('#features')).toBeVisible();
  return p;
}

test('every Features section renders; nested rows dim while their feature is off', async ({ context, sw }, info) => {
  const p = await features(context, sw, '#card-assignments');
  for (const s of ['Dashboard', 'To-do', 'Grades', 'Pages', 'Dates and time', 'Custom CSS', 'Backup', 'Sites', 'About', 'Toolbar popup'])
    await expect(p.locator('#features').getByRole('heading', { level: 2, name: s, exact: true })).toBeAttached();
  for (const id of ['sites', 'backup', 'diagnostics']) await expect(p.locator('#' + id)).toBeAttached();
  const count = row(p, 'card-assignments-count');
  await expect(count).not.toHaveClass(/is-disabled/);
  await row(p, 'card-assignments').getByRole('switch').click();
  await expect(count).toHaveClass(/is-disabled/);
  await expect(count.getByRole('spinbutton')).toBeDisabled();
  await expect(count).toBeVisible();
  expect(await stored(sw, 'card-assignments.enabled')).toBe(false);
  await p.screenshot({ path: info.outputPath('features.png') });
});

test('a row reaches an open Canvas tab live, with no reload', async ({ context, sw }) => {
  const canvas = await context.newPage();
  await canvas.goto(CANVAS + '/');
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  const instance = await canvas.locator('html').getAttribute('data-b2c-instance');
  const p = await features(context, sw, '#hide-logo');
  await row(p, 'hide-logo').click(); // the whole row is the switch's hit target
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-hide-logo', /.*/);
  await row(p, 'hide-logo').getByRole('switch').click();
  await expect(canvas.locator('html')).not.toHaveAttribute('data-b2c-hide-logo', /.*/);
  expect(await canvas.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('per-row reset offers Undo, and Undo restores the value', async ({ context, sw }) => {
  const p = await features(context, sw, '#card-assignments-count');
  const r = row(p, 'card-assignments-count');
  const spin = r.getByRole('spinbutton');
  await spin.focus();
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp');
  await expect.poll(() => stored(sw, 'card-assignments.count')).toBe(6);
  await expect(r).toHaveClass(/nondefault/);
  await r.getByRole('button', { name: 'Reset number shown' }).click();
  await expect.poll(() => stored(sw, 'card-assignments.count')).toBe(4);
  const toast = p.locator('#features .toast');
  await expect(toast).toContainText('Reset number shown');
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => stored(sw, 'card-assignments.count')).toBe(6);
});

test('Hidden cards: Unhide drops hidden and offers Undo', async ({ context, sw, setSettings }) => {
  await setSettings({ 'card-customization.cards': { '101': { hidden: true, label: 'BIO 101' }, '102': { label: 'Shown' } } });
  const p = await features(context, sw, '#hidden-cards');
  const list = row(p, 'hidden-cards');
  await expect(list.getByText('BIO 101')).toBeVisible();
  await list.getByRole('button', { name: 'Unhide BIO 101' }).click();
  await expect.poll(() => stored(sw, 'card-customization.cards')).toEqual({ '101': { label: 'BIO 101' }, '102': { label: 'Shown' } });
  await p.locator('#features .toast').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => stored(sw, 'card-customization.cards')).toEqual({ '101': { hidden: true, label: 'BIO 101' }, '102': { label: 'Shown' } });
});

test('first run: one field, built-in hosts, a denied prompt, the headline switches, Done', async ({ context, sw }, info) => {
  await expect.poll(() => context.pages().filter(p => p.url().endsWith('options.html#start-here')).length).toBe(1);
  const page = context.pages().find(p => p.url().endsWith('options.html#start-here'))!;
  await page.setViewportSize({ width: 1440, height: 900 });
  const block = page.locator('#start-here');
  await expect(block).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Where is your school’s Canvas?' })).toBeVisible();
  const field = page.getByRole('textbox', { name: 'Your school’s Canvas address' });
  await field.fill('https://myschool.instructure.com/courses/12');
  await page.getByRole('button', { name: 'Allow access' }).click();
  await expect(page.getByText('You’re set: b²c already works on myschool.instructure.com.')).toBeVisible();
  await page.evaluate(() => { const w = window as unknown as { asked: unknown[] }; w.asked = []; chrome.permissions.request = (async (p: unknown) => { w.asked.push(p); return false; }) as never; });
  await field.fill('canvas.example.edu/courses/1');
  await field.press('Enter');
  await expect(page.getByText('Permission not granted · Try again')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { asked: unknown[] }).asked)).toEqual([{ origins: ['https://canvas.example.edu/*'] }]);
  const what = page.getByRole('group', { name: 'What b²c can do' });
  await what.locator('[data-row="fr-gpa"]').getByRole('switch').click();
  await expect.poll(() => stored(sw, 'gpa-calculator.enabled')).toBe(true);
  await what.getByRole('radio', { name: 'Always', exact: true }).click();
  await expect.poll(() => stored(sw, 'palette.useDark')).toBe('always');
  await page.screenshot({ path: info.outputPath('first-run.png') });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(block).toHaveCount(0);
  await page.goto(new URL('options.html#card-assignments', sw.url()).href);
  await expect(page.locator('#features')).toBeVisible();
  await expect(page.locator('#start-here')).toHaveCount(0);
});
