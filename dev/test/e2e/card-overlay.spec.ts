import { test, expect, CANVAS } from './fixtures.ts';

test('card-overlay: applies and fully reverts live without navigation', async ({ context, setSettings }) => {
  const page = await context.newPage();
  // Fetch through the mapped browser origin. The mock's default has no images;
  // return the same courses with one image and let Canvas's renderer build it.
  await page.goto(CANVAS + '/');
  const cards = await page.evaluate(async () => (await fetch('/api/v1/dashboard/dashboard_cards')).json());
  expect(cards.length).toBeGreaterThan(0);
  cards[0].image = '/mock-assets/school/305-school_logo.png';
  await context.route('**/api/v1/dashboard/dashboard_cards', route => route.fulfill({ json: cards }));
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  const target = page.locator('.ic-DashboardCard__header_image .ic-DashboardCard__header_hero').first();
  await expect(target).toBeAttached();
  const before = await target.evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), 'opacity');
  expect(before).not.toBe('0');
  await page.screenshot({ path: '.scratch/look2/card-overlay-before.png' });
  const instance = await page.locator('html').getAttribute('data-b2c-instance');
  await setSettings({ 'card-overlay.overlay': false });
  await expect(target).toHaveCSS('opacity', '0');
  await page.screenshot({ path: '.scratch/look2/card-overlay-after.png' });
  // Solid-colour cards must remain visible when removing an image wash.
  const solid = page.locator('.ic-DashboardCard__header > .ic-DashboardCard__header_hero').first();
  if (await solid.count()) await expect(solid).not.toHaveCSS('opacity', '0');
  await setSettings({ 'card-overlay.overlay': true });
  await expect(target).toHaveCSS('opacity', before);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-card-overlay', 'on');
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('card-overlay: mirror gates CSS before body and first paint at 6x CPU', async ({ context, setSettings }) => {
  const page = await context.newPage();
  // Fetch through the mapped browser origin. The mock's default has no images;
  // return the same courses with one image and let Canvas's renderer build it.
  await page.goto(CANVAS + '/');
  const cards = await page.evaluate(async () => (await fetch('/api/v1/dashboard/dashboard_cards')).json());
  expect(cards.length).toBeGreaterThan(0);
  cards[0].image = '/mock-assets/school/305-school_logo.png';
  await context.route('**/api/v1/dashboard/dashboard_cards', route => route.fulfill({ json: cards }));
  await setSettings({ 'card-overlay.overlay': false });
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-card-overlay', 'off');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('b2c:mirror') || '{}').attrs?.['data-b2c-card-overlay'])).toBe('off');
  await page.addInitScript(() => {
    const state = { at: null as number | null, body: null as boolean | null };
    (window as unknown as { lookPaint: typeof state }).lookPaint = state;
    const record = () => {
      if (state.at === null && document.documentElement?.getAttribute('data-b2c-card-overlay') === 'off') {
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
  await expect(page.locator('.ic-DashboardCard__header_image .ic-DashboardCard__header_hero').first()).toHaveCSS('opacity', '0');
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
