import { test, expect, CANVAS } from './fixtures.ts';

test('type.family: bundled choices load locally, update live, preserve icons and yield to dyslexia', async ({ context, setSettings }) => {
  const page = await context.newPage();
  const thirdParty: string[] = [];
  page.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) thirdParty.push(r.url()); });
  await page.goto(CANVAS + '/');
  const body = page.locator('body');
  const before = await body.evaluate(el => getComputedStyle(el).fontFamily);
  await page.evaluate(() => {
    const icon = document.createElement('span'); icon.id = 'look-icon'; icon.style.fontFamily = 'InstructureIcons-Line'; document.body.append(icon);
  });
  const instance = await page.locator('html').getAttribute('data-b2c-instance');
  for (const family of ['Inter', 'Atkinson Hyperlegible', 'Source Serif 4', 'JetBrains Mono']) {
    await setSettings({ 'type.family': family });
    await expect(body).toHaveCSS('font-family', new RegExp(family));
    await expect(page.locator('#application')).toHaveCSS('font-family', new RegExp(family));
    const result = await page.evaluate(async family => {
      const loaded = await Promise.all(['400', '600', '700', 'italic 400'].map(weight => document.fonts.load(`${weight} 16px "b2c ${family}"`)));
      return loaded.flat().map(face => ({ family: face.family, status: face.status }));
    }, family);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(f => f.status === 'loaded')).toBe(true);
  }
  await expect(page.locator('#look-icon')).toHaveCSS('font-family', 'InstructureIcons-Line');
  await setSettings({ 'type.family': 'Installed', 'type.localFamily': 'Courier New' });
  await expect(body).toHaveCSS('font-family', /Courier New/);
  await setSettings({ 'type.family': 'System' });
  await expect(body).toHaveCSS('font-family', /^system-ui/);
  await setSettings({ 'type.family': 'Canvas default' });
  await expect(body).toHaveCSS('font-family', /Lato/);
  await setSettings({ 'type.family': 'Inter' });
  await page.evaluate(() => { const link = document.createElement('link'); link.href = '/mock-dyslexic.css'; link.id = 'look-dyslexia'; document.head.append(link); });
  await expect(body).toHaveCSS('font-family', before);
  await page.locator('#look-dyslexia').evaluate(el => el.remove());
  await expect(body).toHaveCSS('font-family', /Inter/);
  await setSettings({ 'type.family': 'Canvas default' });
  await expect(body).toHaveCSS('font-family', before);
  await expect(page.locator('link[data-b2c-font], style[data-b2c-bundled-fonts]')).toHaveCount(0);
  expect(thirdParty).toEqual([]);
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('type.family: mirrors the family and gate before body on the next load', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await setSettings({ 'type.family': 'Inter' });
  await page.goto(CANVAS + '/');
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('b2c:mirror') || '{}').vars?.['--b2c-font'])).toContain('Inter');
  await page.addInitScript(() => {
    const record = () => {
      if (document.documentElement?.hasAttribute('data-b2c-font') && document.querySelector('style[data-b2c-bundled-fonts]')) {
        (window as unknown as { lookFont: unknown }).lookFont = { body: !!document.body, stack: getComputedStyle(document.documentElement).getPropertyValue('--b2c-font'), dynamic: /chrome-extension:\/\/[a-f0-9-]{36}\//.test(document.querySelector('style[data-b2c-bundled-fonts]')!.textContent ?? '') };
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(record);
    observer.observe(document, { attributes: true, childList: true, subtree: true });
    record();
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.reload();
  expect(await page.evaluate(() => (window as unknown as { lookFont: { body: boolean; stack: string } }).lookFont)).toMatchObject({ body: false, dynamic: true, stack: expect.stringContaining('Inter') });
});

test('type.family: a stale mirror leaves no face sheet when the stored family is Canvas default', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await setSettings({ 'type.family': 'Inter' });
  await page.goto(CANVAS + '/');
  await expect(page.locator('style[data-b2c-bundled-fonts]')).toHaveCount(1);
  await page.close();
  await setSettings({ 'type.family': 'Canvas default' });
  const next = await context.newPage(); await next.goto(CANVAS + '/');
  await expect(next.locator('html')).not.toHaveAttribute('data-b2c-font', '');
  await expect(next.locator('style[data-b2c-bundled-fonts]')).toHaveCount(0);
});

test('type.family reaches InstUI components and form controls, not code (parity audit #7)', async ({ context, setSettings }) => {
  await setSettings({ 'type.family': 'Atkinson Hyperlegible' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-font', '');
  const fonts = await page.evaluate(() => {
    const mk = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); return d.firstElementChild as HTMLElement; };
    const instui = mk('<span class="css-1abc23-text" style="font-family: LatoWeb, sans-serif">x</span>');
    const button = mk('<button>x</button>');
    const code = mk('<code>x</code>');
    return { instui: getComputedStyle(instui).fontFamily, button: getComputedStyle(button).fontFamily, code: getComputedStyle(code).fontFamily };
  });
  expect(fonts.instui).toMatch(/Atkinson/);
  expect(fonts.button).toMatch(/Atkinson/);
  expect(fonts.code).not.toMatch(/Atkinson/);
});

test('type.scale and type.density restyle Canvas live, and Canvas default size is the identity', async ({ context, setSettings }) => {
  await context.addCookies([{ name: 'mock_delay', value: '0', domain: new URL(CANVAS).hostname, path: '/' }]);
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  const size = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  const td = page.locator('.ic-Table td').first();
  expect(await size()).toBe('16px');
  await setSettings({ 'type.scale': 1.125, 'type.density': 'compact' });
  await expect.poll(size).toBe('18px');
  await expect.poll(() => td.evaluate(t => getComputedStyle(t).paddingTop)).toBe('7px');
  await setSettings({ 'type.scale': 1, 'type.density': 'comfortable' });
  await expect.poll(size).toBe('16px');
  await expect.poll(() => td.evaluate(t => getComputedStyle(t).paddingTop)).toBe('14px');
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-type-scale', /.*/);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-density', /.*/);
});
