import { test, expect, CANVAS } from './fixtures.ts';

test('backup import and reset change open Canvas live; Undo restores it without navigation', async ({ context, sw }) => {
  const canvas = await context.newPage();
  await canvas.goto(CANVAS);
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  const instance = await canvas.locator('html').getAttribute('data-b2c-instance');
  const options = await context.newPage();
  await options.goto(new URL('options.html#backup', sw.url()).href);
  await options.getByLabel('Paste settings JSON').fill(JSON.stringify({ format: 'b2c-settings', version: 1, settings: { 'palette.useDark': 'always', unknownKey: 12 } }));
  await options.getByRole('button', { name: 'Preview import' }).click();
  await expect(options.getByText('Unknown keys: unknownKey')).toBeVisible();
  await expect(canvas.locator('html')).not.toHaveAttribute('data-b2c-dark', 'on');
  await options.getByRole('button', { name: 'Apply import' }).click();
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  await options.getByLabel('Feature', { exact: true }).selectOption('palette');
  await options.getByRole('button', { name: 'Reset feature', exact: true }).click();
  await expect(canvas.locator('html')).not.toHaveAttribute('data-b2c-dark', 'on');
  await options.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  await options.getByRole('button', { name: 'Reset all settings', exact: true }).click();
  await expect(canvas.locator('html')).not.toHaveAttribute('data-b2c-dark', 'on');
  expect(await canvas.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('full JSON file export, reset and import round trips settings', async ({ context, sw, setSettings }) => {
  await setSettings({ 'palette.useDark': 'schedule', 'palette.start': '19:15' });
  const options = await context.newPage(); await options.goto(new URL('options.html#backup', sw.url()).href);
  const downloadEvent = options.waitForEvent('download');
  await options.getByRole('button', { name: 'Export all settings', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('b2c-settings.json');
  const file = await download.path(); expect(file).toBeTruthy();
  await options.getByRole('button', { name: 'Reset all settings', exact: true }).click();
  await options.getByLabel('Choose a JSON file').setInputFiles(file!);
  await expect(options.getByLabel('Paste settings JSON')).toHaveValue(/b2c-settings/);
  await options.getByRole('button', { name: 'Preview import' }).click();
  await options.getByRole('button', { name: 'Apply import' }).click();
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.sync.get('palette.start'))['palette.start'])).toBe('19:15');
  expect(await sw.evaluate(async () => (await chrome.storage.sync.get('palette.useDark'))['palette.useDark'])).toBe('schedule');
});

test('Better Canvas paste maps toggles and reports unsupported keys before applying', async ({ context, sw }) => {
  const options = await context.newPage(); await options.goto(new URL('options.html#backup', sw.url()).href);
  await options.getByLabel('Import from').selectOption('bc');
  await expect(options.getByText(/Storage Dump → Go/)).toBeVisible();
  await options.getByLabel('Paste settings JSON').fill('{"dark_mode":true,"custom_domain":"https://example.edu","unknown_bc":true}');
  await options.getByRole('button', { name: 'Preview import' }).click();
  await expect(options.getByText('Unknown keys: unknown_bc')).toBeVisible();
  await expect(options.getByLabel('Unsupported settings')).toContainText('Add these addresses under Sites');
  await options.getByRole('button', { name: 'Apply import' }).click();
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.sync.get('palette.useDark'))['palette.useDark'])).toBe('always');
});

test('platform settings remain usable at a narrow width and provide keyboard import controls', async ({ context, sw }, info) => {
  const page = await context.newPage(); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL('options.html#backup', sw.url()).href);
  await page.getByLabel('Paste settings JSON').fill('{"format":"b2c-settings","version":1,"settings":{"palette.useDark":"wrong"}}');
  await page.getByLabel('Paste settings JSON').press('Tab');
  await expect(page.getByRole('button', { name: 'Preview import' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Invalid values (not imported): palette.useDark')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply import' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('platform-narrow.png'), fullPage: true });
});
