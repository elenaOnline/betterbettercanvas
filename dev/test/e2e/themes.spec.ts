// themes e2e: the settings UI previews a look in the open Canvas tab without
// writing settings, and ends the preview cleanly.
import { test, expect, CANVAS } from './fixtures.ts';

test('preview paints a look live without writing settings, and ends cleanly', async ({ context, setSettings, sw }) => {
  await setSettings({ 'palette.useDark': 'always' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bg()).toBe('rgb(24, 33, 45)');
  const send = (values: Record<string, unknown> | null) =>
    sw.evaluate(async values => {
      const [tab] = await chrome.tabs.query({ url: 'https://b2c-mock-school.instructure.com/*' });
      return chrome.tabs.sendMessage(tab!.id!, { type: 'b2c:themes:preview', values });
    }, values);
  expect(await send({ 'palette.dark': 'warm', 'palette.navStyle': 'theme' })).toEqual({ previewing: true });
  expect(await bg()).toBe('rgb(37, 31, 25)');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-nav-style', 'theme');
  // nothing was written
  const stored = await sw.evaluate(() => chrome.storage.sync.get(['palette.dark', 'palette.navStyle']));
  expect(stored).toEqual({});
  expect(await send(null)).toEqual({ previewing: false });
  expect(await bg()).toBe('rgb(24, 33, 45)');
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-nav-style', /.*/);
});
