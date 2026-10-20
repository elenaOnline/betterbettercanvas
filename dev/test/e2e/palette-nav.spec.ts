// The global nav's active item takes Design's pill (palette.css: nav-active,
// a 14% white mix into the nav) under any theme, over the generated layer's
// copy of Canvas's white active-link rule.
import { test, expect, CANVAS } from './fixtures.ts';

for (const [name, settings] of [
  ['dark', { 'palette.useDark': 'always', 'palette.dark': 'dark' }],
  ['sepia', { 'palette.useDark': 'never', 'palette.light': 'sepia' }],
] as const) {
  test(`active nav item is Design's pill, not a white box (${name})`, async ({ context, setSettings }) => {
    await setSettings(settings);
    const page = await context.newPage();
    await page.goto(CANVAS + '/courses');
    await page.goto(CANVAS + '/courses');
    await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
    const r = await page.evaluate(() => {
      const link = document.querySelector('.ic-app-header__menu-list-item--active .ic-app-header__menu-list-link')!;
      const probe = document.createElement('div');
      probe.style.background = 'var(--b2c-dm-nav-active)';
      document.querySelector('#header')!.appendChild(probe);
      const want = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { got: getComputedStyle(link).backgroundColor, want };
    });
    expect(r.got).toBe(r.want);
    expect(r.got).not.toBe('rgb(255, 255, 255)');
    await page.locator('#header').screenshot({ path: `.scratch/dark/shots/nav-active-${name}.png` });
  });
}

// Colour budget (Design, COLOUR-PASS): the hero is the course-colour channel,
// so dashboard card titles are the text role under any theme (no lift).
for (const [name, settings] of [
  ['dark', { 'palette.useDark': 'always', 'palette.dark': 'dark' }],
  ['sepia', { 'palette.useDark': 'never', 'palette.light': 'sepia' }],
] as const) {
  test(`card titles are --b2c-dm-text, not the course colour (${name})`, async ({ context, setSettings }) => {
    await context.addCookies([{ name: 'mock_delay', value: '0', domain: new URL(CANVAS).hostname, path: '/' }, { name: 'mock_dashboard_view', value: 'cards', domain: new URL(CANVAS).hostname, path: '/' }]);
    await setSettings(settings);
    const page = await context.newPage();
    await page.goto(CANVAS + '/');
    await page.goto(CANVAS + '/');
    const title = page.locator('.ic-DashboardCard__header-title').first();
    await title.waitFor();
    const r = await title.evaluate(t => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--b2c-dm-text)';
      t.parentElement!.appendChild(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return { got: getComputedStyle(t).color, want, inked: t.hasAttribute('data-b2c-ink') || !!t.querySelector('[data-b2c-ink]') };
    });
    expect(r.got).toBe(r.want);
    expect(r.inked).toBe(false);
  });
}
