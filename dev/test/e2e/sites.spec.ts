import { test, expect } from './fixtures.ts';

// Site registrations only: feature stylesheets (b2c-css-*, css-split) are registered for every school.
const siteScripts = () => chrome.scripting.getRegisteredContentScripts().then(s => s.filter(x => !x.id.startsWith('b2c-css-')));

test('sites lists default and rejects non-origin input without requesting permission', async ({ context, sw }) => {
  const page = await context.newPage(); await page.goto(new URL('options.html#sites', sw.url()).href);
  await expect(page.locator('#sites')).toContainText('*.instructure.com');
  await page.getByLabel('Add another Canvas site').fill('https://example.edu/courses/1');
  await page.getByRole('button', { name: 'Add site…', exact: true }).click();
  await expect(page.getByText(/Use an exact HTTPS origin/)).toBeVisible();
  expect(await sw.evaluate(siteScripts)).toEqual([]);
});

test('denied site permission leaves no registration or saved site', async ({ context, sw }) => {
  const page = await context.newPage(); await page.goto(new URL('options.html#sites', sw.url()).href);
  // Model the browser's denial without opening a permission surface.
  await page.evaluate(() => { chrome.permissions.request = async () => false; });
  await page.getByLabel('Add another Canvas site').fill('https://example.edu');
  await page.getByRole('button', { name: 'Add site…', exact: true }).click();
  await expect(page.getByText('Site access was not granted.')).toBeVisible();
  expect(await sw.evaluate(siteScripts)).toEqual([]);
  expect(await sw.evaluate(async () => (await chrome.storage.local.get('b2c:sites'))['b2c:sites'])).toEqual([]);
});
