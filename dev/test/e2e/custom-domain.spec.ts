// A school on its own domain (canvas.b2c-mock.test): b²c stays off until the site is
// added, then runs there exactly as on *.instructure.com. Needs a test build
// with B2C_TEST_GRANT=https://canvas.b2c-mock.test (stands in for the user clicking
// Allow on the permission prompt, which headless can't do).
import { test, expect, CUSTOM_CANVAS } from './fixtures.ts';

test('custom school domain: off until added, then on', async ({ context, sw }) => {
  test.skip(!process.env.B2C_TEST_GRANT, 'needs a build with B2C_TEST_GRANT=https://canvas.b2c-mock.test');
  const page = await context.newPage();
  await page.goto(CUSTOM_CANVAS + '/');
  await page.waitForTimeout(300);
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBeNull();

  const options = await context.newPage();
  await options.goto(new URL('options.html', sw.url()).href);
  const added = await options.evaluate(o => chrome.runtime.sendMessage({ type: 'b2c:sites:add', origin: o }), CUSTOM_CANVAS);
  expect(added.origins).toContain(CUSTOM_CANVAS);

  await page.goto(CUSTOM_CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-env', /current_user_id/);

  // Removal isn't exercised here: in this test build the host is a *required*
  // permission (pre-granted), which Chrome won't remove. Real installs grant
  // it as optional; test/unit/sites.test.ts covers the remove path.
});
