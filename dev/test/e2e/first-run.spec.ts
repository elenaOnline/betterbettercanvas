import { test, expect } from './fixtures.ts';

test('install opens a single Start here page and focuses its accessible section', async ({ context, sw }) => {
  await expect.poll(() => context.pages().filter(p => p.url().endsWith('options.html#start-here')).length).toBe(1);
  const page = context.pages().find(p => p.url().endsWith('options.html#start-here'))!;
  await expect(page.locator('#start-here')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Where is your school’s Canvas?', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#start-here')).toBeFocused();
  expect(context.pages().filter(p => p.url().endsWith('options.html#start-here'))).toHaveLength(1);
  expect(await sw.evaluate(async () => (await chrome.storage.local.get('b2c:first-run-opened'))['b2c:first-run-opened'])).toBe(true);
});
