import { test, expect, CANVAS } from './fixtures.ts';

test('tab-icons: live coloured favicon restores original link attributes on disable', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses/118200');
  const icon = page.locator('link[rel="icon"]').first();
  const original = await icon.evaluate(el => el.outerHTML);
  const instance = await page.locator('html').getAttribute('data-b2c-instance');
  await setSettings({ 'tab-icons.enabled': true });
  await expect(icon).toHaveAttribute('href', /^data:image\/svg\+xml,/);
  await expect(icon).toHaveAttribute('type', 'image/svg+xml');
  const pixel = await icon.evaluate(async el => {
    const image = new Image();
    image.src = (el as HTMLLinkElement).href;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const pen = canvas.getContext('2d')!;
    pen.drawImage(image, 0, 0);
    return { background: [...pen.getImageData(2, 2, 1, 1).data], center: [...pen.getImageData(8, 8, 1, 1).data], corner: [...pen.getImageData(0, 0, 1, 1).data] };
  });
  expect(pixel.background).toEqual([0, 132, 0, 255]);
  expect(pixel.center).toEqual([255, 255, 255, 255]);
  expect(pixel.corner[3]).toBeLessThan(255);
  await expect(icon).toHaveAttribute('sizes', '16x16');
  // An icon introduced by Canvas after activation is decorated too.
  await page.evaluate(() => { const link = document.createElement('link'); link.rel = 'shortcut icon'; link.href = '/late.ico'; link.id = 'look-late-icon'; document.head.append(link); });
  await expect(page.locator('#look-late-icon')).toHaveAttribute('href', /^data:image\/svg\+xml,/);
  await setSettings({ 'tab-icons.enabled': false });
  // The storage write returns before the page has applied it: wait for it.
  await expect.poll(() => icon.evaluate(el => el.outerHTML)).toBe(original);
  await expect(page.locator('#look-late-icon')).toHaveAttribute('href', '/late.ico');
  await expect(page.locator('[data-b2c-tab-icon]')).toHaveCount(0);
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('tab-icons: warm cache paints before blocked revalidation and updates from fresh colours', async ({ context, setSettings, sw }) => {
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await setSettings({ 'tab-icons.enabled': true });
  await page.goto(CANVAS + '/courses/118200');
  const icon = page.locator('link[rel="icon"]').first();
  await expect(icon).toHaveAttribute('href', /^data:image\/svg\+xml,/);
  const warm = await icon.getAttribute('href');
  // Expire the real first-load cache so this is stale-while-revalidate evidence.
  await sw.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const key = Object.keys(all).find(k => k.startsWith('b2c:cache:') && k.endsWith('/users/self/colors'))!;
    if (!key) throw new Error('No colours cache populated by first load');
    const entry = all[key] as { t: number; data: unknown };
    await chrome.storage.local.set({ [key]: { ...entry, t: 0 } });
  });
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await context.route('**/api/v1/users/self/colors', async route => {
    requested = true;
    await blocked;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ custom_colors: { course_118200: '#12ab34' } }) });
  });
  try {
    await page.reload();
    await expect.poll(() => requested).toBe(true);
    await expect(icon).toHaveAttribute('href', warm!);
  } finally {
    release();
  }
  await expect(icon).not.toHaveAttribute('href', warm!);
  await expect(icon).toHaveAttribute('href', /^data:image\/svg\+xml,/);
});

test('tab-icons: non-course pages keep their favicon and do not request colours', async ({ context, setSettings }) => {
  const page = await context.newPage();
  let requests = 0;
  page.on('request', r => { if (r.url().endsWith('/api/v1/users/self/colors')) requests++; });
  await setSettings({ 'tab-icons.enabled': true });
  // A non-course page with no other colour-using feature (the dashboard's
  // to-do panel legitimately loads course colours).
  await page.goto(CANVAS + '/calendar');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-tab-icons', '');
  await expect(page.locator('link[rel="icon"]')).not.toHaveAttribute('href', /^data:/);
  expect(requests).toBe(0);
});
