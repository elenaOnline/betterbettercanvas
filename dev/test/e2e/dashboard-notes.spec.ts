import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const NOTES = 'b2c-dashboard-notes';

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  await expect(page.locator('#right-side-wrapper, [data-testid="courses-tab-content"]').first()).toBeAttached();
}

test('notes turn on live, autosave without a button, survive reload, and turn off cleanly', async ({ context, setSettings, sw }) => {
  await setSettings({ 'dashboard-notes.enabled': false, 'dashboard-notes.text': '', 'dashboard-notes.at': 0, 'dashboard-notes.collapsed': false });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator(NOTES)).toHaveCount(0);

  await setSettings({ 'dashboard-notes.enabled': true });
  const box = page.locator(NOTES).getByRole('textbox', { name: 'Notes' });
  await expect(box).toBeVisible();
  // Lives in the shared side panel.
  expect(await page.locator(NOTES).evaluate(e => e.parentElement!.tagName.toLowerCase())).toBe('b2c-side-panel');

  await box.click();
  await box.pressSequentially('Office hours moved to Thu\nProblem set 6 typo', { delay: 5 });
  await expect(page.locator(NOTES)).toContainText('Saved');
  const stored = await sw.evaluate(async () => (await chrome.storage.local.get('dashboard-notes.text'))['dashboard-notes.text']);
  expect(stored).toBe('Office hours moved to Thu\nProblem set 6 typo');
  // Mirrored to sync for other devices.
  const synced = await sw.evaluate(async () => {
    const meta = (await chrome.storage.sync.get('b2c:notes'))['b2c:notes'] as { n: number };
    const parts = await chrome.storage.sync.get(Array.from({ length: meta.n }, (_, i) => `b2c:notes:${i}`));
    return Array.from({ length: meta.n }, (_, i) => parts[`b2c:notes:${i}`]).join('');
  });
  expect(synced).toBe(stored);

  await page.reload();
  await expect(page.locator(NOTES).getByRole('textbox', { name: 'Notes' })).toHaveValue('Office hours moved to Thu\nProblem set 6 typo');

  await setSettings({ 'dashboard-notes.enabled': false });
  await expect(page.locator(NOTES)).toHaveCount(0);
});

test('typing is saved on blur even before the debounce, and the box grows then scrolls', async ({ context, setSettings, sw }) => {
  await setSettings({ 'dashboard-notes.enabled': true, 'dashboard-notes.text': '', 'dashboard-notes.at': 0 });
  const page = await context.newPage();
  await open(page);
  const box = page.locator(NOTES).getByRole('textbox', { name: 'Notes' });
  const h0 = await box.evaluate(e => e.getBoundingClientRect().height);
  await box.fill('one\ntwo\nthree\nfour\nfive');
  await box.blur();
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('dashboard-notes.text'))['dashboard-notes.text'])).toBe('one\ntwo\nthree\nfour\nfive');
  await box.press('End').catch(() => {});
  await box.type('\nsix');
  const h1 = await box.evaluate(e => e.getBoundingClientRect().height);
  expect(h1).toBeGreaterThan(h0);
  await box.fill(Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'));
  await box.type(' ');
  const r = await box.evaluate(e => ({ h: e.getBoundingClientRect().height, overflow: getComputedStyle(e).overflowY }));
  expect(r.h).toBeLessThanOrEqual(12 * 20 + 20);
  expect(r.overflow).toBe('auto');
});

test('collapses to its header with a first-line preview, remembered across loads', async ({ context, setSettings }) => {
  await setSettings({ 'dashboard-notes.enabled': true, 'dashboard-notes.text': '\nOffice hrs moved to Thu\nmore', 'dashboard-notes.at': 1, 'dashboard-notes.collapsed': false });
  const page = await context.newPage();
  await open(page);
  const toggle = page.locator(NOTES).getByRole('button', { name: /^Notes(?! settings)/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(NOTES)).toContainText('Notes· Office hrs moved to Thu');
  await expect(page.locator(NOTES).getByRole('textbox')).toBeHidden();
  await page.reload();
  await expect(page.locator(NOTES).getByRole('button', { name: /^Notes(?! settings)/ })).toHaveAttribute('aria-expanded', 'false');
});

test('⚙ in the Notes header opens the settings page at Notes', async ({ context, setSettings, sw }) => {
  await setSettings({ 'dashboard-notes.enabled': true, 'dashboard-notes.collapsed': false });
  const page = await context.newPage();
  await open(page);
  const gear = page.locator(NOTES).getByRole('button', { name: 'Notes settings' });
  expect(await gear.evaluate(b => getComputedStyle(b).borderTopLeftRadius)).toBe('2px');
  await gear.click();
  // The SW opens (or focuses) the settings tab; Playwright doesn't see SW-created tabs as pages, so ask Chrome.
  await expect.poll(() => sw.evaluate(async () => (await chrome.tabs.query({})).map(t => t.url ?? ''))).toContainEqual(expect.stringMatching(/options\.html#dashboard-notes$/));
});
