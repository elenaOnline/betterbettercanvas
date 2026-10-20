import { test, expect, CANVAS } from './fixtures.ts';

test('condensed-cards: applies and fully reverts live without navigation', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  const target = page.locator('.ic-DashboardCard__header_hero').first();
  await expect(target).toBeAttached();
  const before = await target.evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), 'height');
  expect(before).not.toBe('64px');
  const instance = await page.locator('html').getAttribute('data-b2c-instance');
  await setSettings({ 'condensed-cards.enabled': true });
  await expect(target).toHaveCSS('height', '64px');
  await expect(page.locator('.ic-DashboardCard__header-subtitle').first()).toBeHidden();
  await expect(page.locator('.ic-DashboardCard__header-term').first()).toBeHidden();
  await setSettings({ 'condensed-cards.enabled': false });
  await expect(target).toHaveCSS('height', before);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-condensed-cards', '');
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('condensed-cards: mirror gates CSS before body and first paint at 6x CPU', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await setSettings({ 'condensed-cards.enabled': true });
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-condensed-cards', '');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('b2c:mirror') || '{}').attrs?.['data-b2c-condensed-cards'])).toBe('');
  await page.addInitScript(() => {
    const state = { at: null as number | null, body: null as boolean | null };
    (window as unknown as { lookPaint: typeof state }).lookPaint = state;
    const record = () => {
      if (state.at === null && document.documentElement?.hasAttribute('data-b2c-condensed-cards')) {
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
  await expect(page.locator('.ic-DashboardCard__header_hero').first()).toHaveCSS('height', '64px');
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

test('condensed-cards: image heroes and the title stay at the specified condensed dimensions', async ({ context, setSettings }) => {
  const page = await context.newPage(); await page.goto(CANVAS + '/');
  const cards = await page.evaluate(async () => (await fetch('/api/v1/dashboard/dashboard_cards')).json());
  cards[0].image = '/mock-assets/school/305-school_logo.png';
  await context.route('**/api/v1/dashboard/dashboard_cards', route => route.fulfill({ json: cards }));
  await page.reload();
  const image = page.locator('.ic-DashboardCard__header_image').first();
  await expect(image).toBeAttached();
  const before = await image.evaluate(el => getComputedStyle(el).height);
  await setSettings({ 'condensed-cards.enabled': true });
  await expect(image).toHaveCSS('height', '64px');
  await expect(image.locator('.ic-DashboardCard__header_hero')).toHaveCSS('height', '64px');
  const title = page.locator('.ic-DashboardCard__header-title').first();
  await expect(title).toHaveCSS('white-space', 'nowrap');
  await expect(title).toHaveCSS('text-overflow', 'ellipsis');
  await setSettings({ 'condensed-cards.enabled': false });
  await expect(image).toHaveCSS('height', before);
});
