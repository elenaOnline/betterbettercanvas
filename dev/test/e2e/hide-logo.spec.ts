import { test, expect, CANVAS } from './fixtures.ts';

test('hide-logo: applies and fully reverts live without navigation', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  const target = page.locator('.ic-app-header__logomark-container').first();
  await expect(target).toBeAttached();
  const before = await target.evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), 'display');
  expect(before).not.toBe('none');
  const instance = await page.locator('html').getAttribute('data-b2c-instance');
  await setSettings({ 'hide-logo.enabled': true });
  await expect(target).toHaveCSS('display', 'none');
  await setSettings({ 'hide-logo.enabled': false });
  await expect(target).toHaveCSS('display', before);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-hide-logo', '');
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('hide-logo: mirror gates CSS before body and first paint at 6x CPU', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await setSettings({ 'hide-logo.enabled': true });
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-hide-logo', '');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('b2c:mirror') || '{}').attrs?.['data-b2c-hide-logo'])).toBe('');
  await page.addInitScript(() => {
    const state = { at: null as number | null, body: null as boolean | null };
    (window as unknown as { lookPaint: typeof state }).lookPaint = state;
    const record = () => {
      if (state.at === null && document.documentElement?.hasAttribute('data-b2c-hide-logo')) {
        state.at = performance.now();
        state.body = !!document.body;
      }
    };
    record();
    new MutationObserver(record).observe(document, { attributes: true, childList: true, subtree: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.reload();
  await expect(page.locator('.ic-app-header__logomark-container').first()).toHaveCSS('display', 'none');
  const result = await page.evaluate(async () => {
    const firstPaint = await new Promise<number>(resolve => {
      new PerformanceObserver(list => {
        const entry = list.getEntries().find(x => x.name === 'first-paint');
        if (entry) resolve(entry.startTime);
      }).observe({ type: 'paint', buffered: true });
    });
    return { ...(window as unknown as { lookPaint: { at: number | null; body: boolean | null } }).lookPaint, firstPaint };
  });
  expect(result.at).not.toBeNull();
  expect(result.body).toBe(false);
  expect(result.at!).toBeLessThan(result.firstPaint);
});

test('hide-logo: sidebar logo hides too and the first nav item moves up by the removed logo height', async ({ context, setSettings }) => {
  const page = await context.newPage(); await page.goto(CANVAS + '/');
  await expect(page.locator('.recent_feedback')).toBeAttached(); // Sidebar XHR has finished replacing its contents.
  await page.evaluate(() => { const logo = document.createElement('div'); logo.className = 'ic-sidebar-logo'; logo.textContent = 'School'; document.querySelector('#right-side')!.append(logo); });
  const first = page.locator('#menu > li').first();
  const before = await first.boundingBox();
  const logoHeight = (await page.locator('.ic-app-header__logomark-container').boundingBox())!.height;
  const sidebar = page.locator('.ic-sidebar-logo');
  await setSettings({ 'hide-logo.enabled': true });
  await expect(sidebar).toBeHidden();
  await expect.poll(async () => (await first.boundingBox())!.y).toBeCloseTo(before!.y - logoHeight, 0);
  await setSettings({ 'hide-logo.enabled': false });
  await expect(sidebar).toBeVisible();
  expect((await first.boundingBox())!.y).toBeCloseTo(before!.y, 0);
});
