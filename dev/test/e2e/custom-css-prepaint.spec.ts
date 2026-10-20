import { test, expect, CANVAS } from './fixtures.ts';

// This acceptance test is intentionally red until the core mirror supports
// CSS text. See .scratch/look2/REQUESTS.md request 1; do not weaken this oracle.
test('custom-css: warm mirror inserts the scoped sheet before body at 6x CPU', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await setSettings({ 'custom-css.enabled': true, 'custom-css.css': 'body { border-top: 7px solid red !important }' });
  await page.goto(CANVAS + '/');
  await expect(page.locator('body')).toHaveCSS('border-top-width', '7px');
  await page.addInitScript(() => {
    const record = () => {
      if (document.querySelector('style[data-b2c-custom-css]')) {
        (window as unknown as { cssBeforeBody: boolean }).cssBeforeBody = !document.body;
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(record);
    observer.observe(document, { childList: true, subtree: true }); record();
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.reload();
  await expect(page.locator('body')).toHaveCSS('border-top-width', '7px');
  expect(await page.evaluate(() => (window as unknown as { cssBeforeBody: boolean }).cssBeforeBody)).toBe(true);
});
