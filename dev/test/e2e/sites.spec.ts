import { test, expect } from './fixtures.ts';

test('sites lists default and rejects non-origin input without requesting permission', async ({ context, sw }) => {
  const page = await context.newPage(); await page.goto(new URL('options.html#sites', sw.url()).href);
  await expect(page.locator('#sites')).toContainText('*.instructure.com');
  await page.getByLabel('Add another Canvas site').fill('https://example.edu/courses/1');
  await page.getByRole('button', { name: 'Add site…', exact: true }).click();
  await expect(page.getByText(/Use an exact HTTPS origin/)).toBeVisible();
  expect(await sw.evaluate(async () => chrome.scripting.getRegisteredContentScripts())).toEqual([]);
});

test('denied site permission leaves no registration or saved site', async ({ context, sw }) => {
  const page = await context.newPage(); await page.goto(new URL('options.html#sites', sw.url()).href);
  // Model the browser's denial without opening a permission surface.
  await page.evaluate(() => { chrome.permissions.request = async () => false; });
  await page.getByLabel('Add another Canvas site').fill('https://example.edu');
  await page.getByRole('button', { name: 'Add site…', exact: true }).click();
  await expect(page.getByText('Site access was not granted.')).toBeVisible();
  expect(await sw.evaluate(async () => chrome.scripting.getRegisteredContentScripts())).toEqual([]);
  expect(await sw.evaluate(async () => (await chrome.storage.local.get('b2c:sites'))['b2c:sites'])).toEqual([]);
});
