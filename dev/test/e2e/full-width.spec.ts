import { test, expect, CANVAS } from './fixtures.ts';

test('full-width: applies and fully reverts live without navigation', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  const target = page.locator('.ic-Layout-wrapper').first();
  await expect(target).toBeAttached();
  const before = await target.evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), 'max-width');
  // Standard is Canvas exactly: b²c imposes no max-width of its own.
  const instance = await page.locator('html').getAttribute('data-b2c-instance');
  await setSettings({ 'full-width.width': 'wide' });
  await expect(target).toHaveCSS('max-width', '1680px');
  await setSettings({ 'full-width.width': 'full' });
  await expect(target).toHaveCSS('max-width', 'none');
  await setSettings({ 'full-width.width': 'standard' });
  await expect(target).toHaveCSS('max-width', before);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-full-width', 'standard');
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('full-width: mirror gates CSS before body and first paint at 6x CPU', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await setSettings({ 'full-width.width': 'full' });
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-full-width', 'full');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('b2c:mirror') || '{}').attrs?.['data-b2c-full-width'])).toBe('full');
  await page.addInitScript(() => {
    const state = { at: null as number | null, body: null as boolean | null };
    (window as unknown as { lookPaint: typeof state }).lookPaint = state;
    const record = () => {
      if (state.at === null && document.documentElement?.getAttribute('data-b2c-full-width') === 'full') {
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
  await expect(page.locator('.ic-Layout-wrapper').first()).toHaveCSS('max-width', 'none');
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

test('full-width: Wide and Full work on course pages while prose stays at 80ch and media may exceed it', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 2400, height: 1000 });
  await page.goto(CANVAS + '/courses/118200');
  await page.evaluate(() => {
    const prose = document.createElement('div'); prose.className = 'user_content'; prose.id = 'look-prose';
    prose.innerHTML = '<p>Readable content</p><table style="width:1500px"><tr><td>Wide table</td></tr></table><img src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%271500%27 height=%2710%27/%3E" alt="Wide diagram" style="width:1500px" width="1500" height="10">';
    document.querySelector('#content')!.append(prose);
  });
  await setSettings({ 'full-width.width': 'wide' });
  await expect(page.locator('.ic-Layout-wrapper')).toHaveCSS('max-width', '1680px');
  await setSettings({ 'full-width.width': 'full' });
  await expect(page.locator('.ic-Layout-wrapper')).toHaveCSS('max-width', 'none');
  const measures = await page.locator('#look-prose').evaluate(el => ({ prose: el.getBoundingClientRect().width, table: el.querySelector('table')!.getBoundingClientRect().width, image: el.querySelector('img')!.getBoundingClientRect().width, max: getComputedStyle(el).maxWidth }));
  expect(measures.prose).toBeLessThan(1000);
  expect(measures.prose).toBeCloseTo(parseFloat(measures.max), 0);
  expect(measures.table).toBeGreaterThan(measures.prose);
  expect(measures.image).toBeGreaterThan(measures.prose);
  await setSettings({ 'full-width.width': 'standard' });
  await expect(page.locator('.ic-Layout-wrapper')).not.toHaveCSS('max-width', '1680px');
  await expect(page.locator('#look-prose')).not.toHaveCSS('max-width', /ch$|^\d+px$/);
});

test('full-width: Standard applies nothing; prose is exactly as wide as on stock Canvas (parity audit #4)', async ({ context, setSettings }) => {
  await setSettings({ 'full-width.width': 'standard' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses/118200');
  await page.evaluate(() => {
    const prose = document.createElement('div'); prose.className = 'user_content'; prose.id = 'std-prose';
    prose.textContent = 'x '.repeat(2000);
    (document.querySelector('#content') ?? document.body).appendChild(prose);
  });
  // Same as stock Canvas: compare with b²c paused on the same page.
  const withB2c = await page.evaluate(() => getComputedStyle(document.getElementById('std-prose')!).maxWidth);
  await setSettings({ 'core.paused': true });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-full-width', /.*/);
  const stock = await page.evaluate(() => getComputedStyle(document.getElementById('std-prose')!).maxWidth);
  expect(withB2c).toBe(stock);
});
