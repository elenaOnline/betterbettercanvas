import { test, expect, CANVAS } from './fixtures.ts';

test('hide-recent-feedback: applies and fully reverts live without navigation', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  const target = page.locator('.recent_feedback').first();
  await expect(target).toBeAttached();
  const before = await target.evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), 'display');
  expect(before).not.toBe('none');
  const instance = await page.locator('html').getAttribute('data-b2c-instance');
  await setSettings({ 'hide-recent-feedback.enabled': true });
  await expect(target).toHaveCSS('display', 'none');
  await setSettings({ 'hide-recent-feedback.enabled': false });
  await expect(target).toHaveCSS('display', before);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-hide-recent-feedback', '');
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('hide-recent-feedback: mirror gates CSS before body and first paint at 6x CPU', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await setSettings({ 'hide-recent-feedback.enabled': true });
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-hide-recent-feedback', '');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('b2c:mirror') || '{}').attrs?.['data-b2c-hide-recent-feedback'])).toBe('');
  await page.addInitScript(() => {
    const state = { at: null as number | null, body: null as boolean | null };
    (window as unknown as { lookPaint: typeof state }).lookPaint = state;
    const record = () => {
      if (state.at === null && document.documentElement?.hasAttribute('data-b2c-hide-recent-feedback')) {
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
  await expect(page.locator('.recent_feedback').first()).toHaveCSS('display', 'none');
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

test('hide-recent-feedback: follows the block when a side panel rehosts or replaces it', async ({ context, setSettings }) => {
  const page = await context.newPage(); await page.goto(CANVAS + '/');
  await expect(page.locator('.recent_feedback')).toBeAttached();
  await setSettings({ 'hide-recent-feedback.enabled': true });
  await page.evaluate(() => { const panel = document.createElement('aside'); panel.id = 'look-side-panel'; document.body.append(panel); panel.append(document.querySelector('.recent_feedback')!); });
  await expect(page.locator('#look-side-panel .recent_feedback')).toBeHidden();
  await page.locator('#look-side-panel').evaluate(el => { el.innerHTML = '<div class="recent_feedback">Replacement feedback</div>'; });
  await expect(page.locator('#look-side-panel .recent_feedback')).toBeHidden();
  await setSettings({ 'hide-recent-feedback.enabled': false });
  await expect(page.locator('#look-side-panel .recent_feedback')).toBeVisible();
});
