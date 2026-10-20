import { test, expect } from './fixtures.ts';

test('diagnostics update live, keep private fields out, and clear every visible entry', async ({ context, sw }) => {
  const page = await context.newPage(); await page.goto(new URL('options.html#diagnostics', sw.url()).href);
  await expect(page.getByText('No errors recorded.')).toBeVisible();
  const height = await page.locator('.diagnostics-log').evaluate(el => el.getBoundingClientRect().height);
  await page.evaluate(async () => {
    for (let i = 0; i < 55; i++) await chrome.runtime.sendMessage({ type: 'b2c:diagnostics:record', event: { feature: 'core', page: 'dashboard', phase: 'start', name: 'TypeError', time: 1000 + i, message: 'Alice https://private.example', stack: 'private' } });
  });
  await expect(page.locator('#diagnostics li')).toHaveCount(50);
  expect(await page.locator('.diagnostics-log').evaluate(el => el.getBoundingClientRect().height)).toBe(height);
  await expect(page.locator('#diagnostics')).not.toContainText('Alice');
  await expect(page.locator('#diagnostics')).not.toContainText('private.example');
  await expect(page.locator('#diagnostics li').first()).toContainText('start failed (TypeError).');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('#diagnostics li')).toHaveCount(0);
  expect(await sw.evaluate(async () => (await chrome.storage.local.get('b2c:diagnostics'))['b2c:diagnostics'])).toBeUndefined();
});

test('Copy report copies a bounded diagnostic report and handles clipboard failure', async ({ context, sw }) => {
  const page = await context.newPage(); await page.goto(new URL('options.html#diagnostics', sw.url()).href);
  // Clipboard is controlled in this harness; native permission UX is separate.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
  });
  await page.getByRole('button', { name: 'Copy report', exact: true }).click();
  const report = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(JSON.parse(report)).toMatchObject({ extension: 'b2c', errors: [] });
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied'); } } }));
  await page.getByRole('button', { name: 'Copy report', exact: true }).click();
  await expect(page.getByText('The report could not be copied. Try again.')).toBeVisible();
});
