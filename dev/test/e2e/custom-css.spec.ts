import { test, expect, CANVAS } from './fixtures.ts';

test('custom-css: updates local CSS live and completely removes its sheet on disable', async ({ context, setSettings, sw }) => {
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  const before = await page.locator('body').evaluate(el => getComputedStyle(el).borderTopWidth);
  const instance = await page.locator('html').getAttribute('data-b2c-instance');
  await setSettings({ 'custom-css.enabled': true, 'custom-css.css': 'body { border-top: 7px solid red !important; }' });
  await expect(page.locator('body')).toHaveCSS('border-top-width', '7px');
  await expect(page.locator('style[data-b2c-custom-css]')).toHaveCount(1);
  await setSettings({ 'custom-css.css': 'body { border-top: 9px solid blue !important; }' });
  await expect(page.locator('body')).toHaveCSS('border-top-width', '9px');
  const area = await sw.evaluate(async () => ({ local: await chrome.storage.local.get('custom-css.css'), sync: await chrome.storage.sync.get('custom-css.css') }));
  expect(area.local['custom-css.css']).toContain('9px');
  expect(area.sync['custom-css.css']).toBeUndefined();
  await setSettings({ 'custom-css.enabled': false });
  await expect(page.locator('style[data-b2c-custom-css]')).toHaveCount(0);
  await expect(page.locator('body')).toHaveCSS('border-top-width', before);
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('custom-css: scope includes root rules and the live gate controls its effects', async ({ context, setSettings }) => {
  const page = await context.newPage(); await page.goto(CANVAS + '/');
  await setSettings({ 'custom-css.enabled': true, 'custom-css.css': ':root { --look-css: 11px } @media (min-width: 1px) { body { border-top: var(--look-css) solid red !important } }' });
  await expect(page.locator('body')).toHaveCSS('border-top-width', '11px');
  await page.locator('html').evaluate(el => el.removeAttribute('data-b2c-custom-css'));
  await expect(page.locator('body')).not.toHaveCSS('border-top-width', '11px');
  await setSettings({ 'custom-css.enabled': false });
  await expect(page.locator('style[data-b2c-custom-css]')).toHaveCount(0);
});

test('custom-css keeps @font-face, @keyframes and @import (parity audit)', async ({ context, setSettings }) => {
  const css = `@import url("data:text/css,.imported-rule{--b2c-imported:1}");
@font-face { font-family: "MyFace"; src: local("Arial"); }
@keyframes b2c-spin { from { opacity: 0 } to { opacity: 1 } }
body { animation-name: b2c-spin; }`;
  await setSettings({ 'custom-css.enabled': true, 'custom-css.css': css });
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect(page.locator('body')).toHaveCSS('animation-name', 'b2c-spin');
  const sheet = await page.evaluate(() => (document.querySelector('style[data-b2c-custom-css]') as HTMLStyleElement).textContent ?? '');
  expect(sheet).toMatch(/^@import/);
  expect(sheet).toContain('@font-face');
  expect(sheet).toMatch(/@keyframes b2c-spin/);
});
