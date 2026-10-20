import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const NOW = '2026-10-21T10:00:00-07:00';
const CARD = '.ic-DashboardCard:has(a.ic-DashboardCard__link)';

async function open(page: Page) {
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + '/');
  await expect(page.locator(CARD).first()).toBeVisible();
}
const idOf = (page: Page, i: number) => page.locator(CARD).nth(i).locator('a.ic-DashboardCard__link').getAttribute('href').then(h => h!.split('/').pop()!);
const cardById = (page: Page, id: string) => page.locator(`.ic-DashboardCard:has(a.ic-DashboardCard__link[href$="/courses/${id}"])`);
const openMenu = async (page: Page, id: string) => {
  await cardById(page, id).locator('b2c-card-kebab').getByRole('button', { name: /^Card options for/ }).click();
  await expect(page.locator('b2c-card-menu [role=dialog]')).toBeVisible();
};
const menu = (page: Page) => page.locator('b2c-card-menu');

test.beforeEach(async ({ context }) => {
  const p = await context.newPage();
  await p.request.post(CANVAS + '/__mock/reset');
  await p.close();
});

test('one ⋮ menu replaces Canvas’s on decorated cards, live on and off without a trace', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': false, 'card-customization.cards': {} });
  const page = await context.newPage();
  await open(page);
  const n = await page.locator(CARD).count();
  const native = page.locator(`${CARD} .ic-DashboardCard__header-button`);
  await expect(page.locator('b2c-card-kebab')).toHaveCount(0);
  await expect(native.first()).toBeVisible();

  await setSettings({ 'card-customization.enabled': true });
  await expect(page.locator('b2c-card-kebab')).toHaveCount(n);
  await expect(page.locator(`${CARD}[data-b2c-card]`)).toHaveCount(n);
  // Canvas's own ⋮ is hidden only where ours is, and ours sits in its spot.
  await expect(native.first()).toBeHidden();
  const spot = await page.locator(CARD).first().evaluate(card => {
    const ours = card.querySelector('b2c-card-kebab')!.getBoundingClientRect();
    const hdr = card.querySelector('.ic-DashboardCard__header')!.getBoundingClientRect();
    return { top: Math.round(ours.top - hdr.top), right: Math.round(hdr.right - ours.right), w: Math.round(ours.width) };
  });
  expect(spot).toEqual({ top: 12, right: 12, w: 36 });
  // Square: our button, the card corner, and Canvas's unread badges.
  const radii = await page.locator(CARD).first().evaluate(card => ({
    btn: getComputedStyle(card.querySelector('b2c-card-kebab')!.shadowRoot!.querySelector('button')!).borderTopLeftRadius,
    card: getComputedStyle(card).borderTopLeftRadius,
  }));
  expect(radii).toEqual({ btn: '2px', card: '2px' });
  const badge = page.locator(`${CARD} .ic-DashboardCard__action-badge`).first();
  if (await badge.count()) await expect.poll(() => badge.evaluate(e => getComputedStyle(e).borderTopLeftRadius)).toBe('2px');

  await setSettings({ 'card-customization.enabled': false });
  await expect(page.locator('b2c-card-kebab')).toHaveCount(0);
  await expect(page.locator('[data-b2c-card]')).toHaveCount(0);
  await expect(native.first()).toBeVisible();
  await expect(page.locator('style#b2c-card-customization')).toHaveCount(0);
  await expect(page.locator('b2c-card-hidden')).toHaveCount(0);
});

test('menu order is Canvas’s items first, then b²c’s, then Dashboard settings…', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {}, 'card-customization.renameVia': 'canvas' });
  const page = await context.newPage();
  await open(page);
  await openMenu(page, await idOf(page, 1));
  const items = await menu(page).locator('[role=menu] > button[role=menuitem]').evaluateAll(b => b.map(x => x.textContent!.trim()));
  expect(items.slice(0, 4)).toEqual(['Color…', 'Rename…', 'Image…', 'Links…']);
  expect(items.slice(-3)).toEqual(['Hide card', 'Unfavorite', 'Dashboard settings…']);
  await expect(menu(page).getByRole('group', { name: 'Move card' }).getByRole('menuitem')).toHaveCount(4);
  await expect(menu(page)).toContainText('Color, name and order are saved to your Canvas account.');
});

test('Color writes Canvas’s colour and repaints at once', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true });
  const page = await context.newPage();
  await open(page);
  const id = await idOf(page, 1);
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Color…' }).click();
  await menu(page).getByRole('radio', { name: '#009688' }).click();
  await expect.poll(() => cardById(page, id).locator('.ic-DashboardCard__header_hero').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(0, 150, 136)');
  await expect.poll(async () => ((await page.evaluate(async () => (await fetch('/api/v1/users/self/colors')).json())) as { custom_colors: Record<string, string> }).custom_colors[`course_${id}`]?.toLowerCase()).toBe('#009688');
});

test('Rename writes the Canvas nickname (shows after reload), and Reset clears it', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.renameVia': 'canvas', 'card-customization.cards': {} });
  const page = await context.newPage();
  await open(page);
  const id = await idOf(page, 1);
  const title = cardById(page, id).locator('.ic-DashboardCard__header-title');
  const original = (await title.textContent())!.trim();
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Rename…' }).click();
  await menu(page).getByRole('textbox', { name: 'Card name' }).fill('Analysis');
  await menu(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(title).toHaveText('Analysis');
  await expect.poll(async () => ((await page.evaluate(async () => (await fetch('/api/v1/users/self/course_nicknames')).json())) as { course_id: number; nickname: string }[]).find(x => String(x.course_id) === id)?.nickname).toBe('Analysis');
  await page.reload();
  await expect(cardById(page, id).locator('.ic-DashboardCard__header-title')).toHaveText('Analysis');
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Rename…' }).click();
  await menu(page).getByRole('button', { name: 'Reset name to the course name' }).click();
  await expect(cardById(page, id).locator('.ic-DashboardCard__header-title')).toHaveText(original);
});

for (const view of ['cards', 'widget'] as const) {
  test(`Move (${view} dashboard): visual order stays ours through Canvas re-sorting its DOM, no card shift, survives reload`, async ({ context, setSettings, sw }) => {
    await context.addCookies([{ name: 'mock_dashboard_view', value: view, url: CANVAS + '/' }, { name: 'mock_dashboard_tab', value: 'courses', url: CANVAS + '/' }]);
    await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {}, 'card-customization.order': null });
    const page = await context.newPage();
    // Layout shifts of anything inside the card grid that weren't caused by input.
    await page.addInitScript(() => {
      const w = window as unknown as { __grid: number };
      w.__grid = 0;
      new PerformanceObserver(l => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources: { node?: Node }[] }[]) {
          if (e.hadRecentInput) continue;
          if (e.sources.some(x => { const n = x.node; const el = n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null; return !!el?.closest('.ic-DashboardCard__box__container'); })) w.__grid += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await open(page);
    // Visual order: by on-screen position (rows, then columns), not DOM order.
    const visual = () => page.locator(CARD).evaluateAll(els => els
      .filter(e => getComputedStyle(e).display !== 'none')
      .map(e => ({ id: e.querySelector('a.ic-DashboardCard__link')!.getAttribute('href')!.split('/').pop()!, r: e.getBoundingClientRect() }))
      .sort((a, b) => Math.round(a.r.top) - Math.round(b.r.top) || a.r.left - b.r.left)
      .map(x => x.id));
    const rects = () => page.locator(CARD).evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); }).sort());
    const before = await visual();
    const geometry = await rects();
    const domBefore = await page.locator(CARD).evaluateAll(els => els.map(e => e.querySelector('a.ic-DashboardCard__link')!.getAttribute('href')));

    await openMenu(page, before[0]!);
    await expect(menu(page).getByRole('menuitem', { name: 'Move left' })).toBeDisabled();
    await menu(page).getByRole('menuitem', { name: 'Move right' }).click();
    const expected = [before[1]!, before[0]!, ...before.slice(2)];
    await expect.poll(visual).toEqual(expected);
    // Canvas's DOM was not touched.
    expect(await page.locator(CARD).evaluateAll(els => els.map(e => e.querySelector('a.ic-DashboardCard__link')!.getAttribute('href')))).toEqual(domBefore);
    await expect.poll(async () => {
      const p = ((await page.evaluate(async () => (await fetch('/api/v1/users/self/dashboard_positions')).json())) as { dashboard_positions: Record<string, number> }).dashboard_positions;
      return p[`course_${before[0]}`];
    }).toBe(1);

    // Emulate React reconciling with its own (stale) state: put Canvas's card
    // nodes back in the original order, then shuffle them. Visual order holds.
    await page.waitForTimeout(600); // past the input window, so any shift would count
    await page.evaluate(() => {
      const box = document.querySelector('.ic-DashboardCard__box__container')!;
      const cards = Array.from(box.children);
      for (const c of [...cards].reverse()) box.appendChild(c);
      for (const c of cards) box.appendChild(c);
    });
    await page.waitForTimeout(300);
    expect(await visual()).toEqual(expected);
    expect(await page.evaluate(() => (window as unknown as { __grid: number }).__grid)).toBeLessThan(0.001);
    // And Canvas's real re-render (the mock's hook: refetch, new nodes in server order).
    const oldNode = await page.locator(CARD).first().elementHandle();
    await page.evaluate(() => (window as unknown as { __mockRerenderCards(): Promise<void> }).__mockRerenderCards());
    await expect.poll(() => oldNode!.evaluate(e => e.isConnected)).toBe(false);
    await expect.poll(visual).toEqual(expected);
    expect(await page.evaluate(() => (window as unknown as { __grid: number }).__grid)).toBeLessThan(0.001);

    // Same geometry as Canvas's own flow: moving back gives identical rects.
    await openMenu(page, before[0]!);
    await menu(page).getByRole('menuitem', { name: 'Move left' }).click();
    await expect.poll(visual).toEqual(before);
    await expect.poll(rects).toEqual(geometry); // once the 180 ms glide has settled

    // Move to the end, then reload: Canvas renders the saved order and b²c agrees.
    await openMenu(page, before[0]!);
    await menu(page).getByRole('menuitem', { name: 'Move to end' }).click();
    const last = [...before.slice(1), before[0]!];
    await expect.poll(visual).toEqual(last);
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.locator(CARD).first()).toBeVisible();
    await expect.poll(visual).toEqual(last);
    // The held order is dropped once Canvas confirmed it on this load.
    await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('card-customization.order'))['card-customization.order'] ?? null)).toBeNull();
  });
}

test('Unfavorite removes the card in Canvas, and Undo favorites it again', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {} });
  const page = await context.newPage();
  await open(page);
  const id = await idOf(page, 2);
  const favs = async () => ((await page.evaluate(async () => (await fetch('/api/v1/users/self/favorites/courses')).json())) as { id: number | string }[]).map(c => String(c.id));
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Unfavorite' }).click();
  await expect(cardById(page, id)).toBeHidden();
  await expect.poll(favs).not.toContain(id);
  await page.locator('b2c-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(cardById(page, id)).toBeVisible();
  await expect.poll(favs).toContain(id);
});

test('Dashboard settings… opens the settings page at Customize cards', async ({ context, setSettings, sw }) => {
  await setSettings({ 'card-customization.enabled': true });
  const page = await context.newPage();
  await open(page);
  await openMenu(page, await idOf(page, 0));
  await menu(page).getByRole('menuitem', { name: 'Dashboard settings…' }).click();
  // The SW opens (or focuses) the settings tab; Playwright doesn't see SW-created tabs as pages, so ask Chrome.
  await expect.poll(() => sw.evaluate(async () => (await chrome.tabs.query({})).map(t => t.url ?? ''))).toContainEqual(expect.stringMatching(/options\.html#card-customization$/));
  await expect(menu(page)).toHaveCount(0);
});

test('Set grade goal… opens the goal popover from the card menu, and the goal round-trips', async ({ context, setSettings, sw }) => {
  const hasGoals = await sw.evaluate(async () => 'grade-goals.enabled' in ((await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings));
  test.skip(!hasGoals, 'needs a build with grade-goals');
  await setSettings({ 'card-customization.enabled': true, 'grade-goals.enabled': true, 'grade-goals.goals': {} });
  const page = await context.newPage();
  await open(page);
  // A course with a current score.
  const id = await idOf(page, 1);
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Set grade goal…' }).click();
  const pop = page.locator('b2c-grade-goal-popover');
  await expect(pop).toBeVisible();
  const grade = pop.getByRole('combobox', { name: 'Goal grade' });
  if (await grade.count()) await grade.selectOption({ index: 1 });
  else {
    await pop.getByRole('spinbutton', { name: 'Goal percent' }).fill('90');
    await pop.getByRole('spinbutton', { name: 'Goal percent' }).press('Enter');
  }
  await expect.poll(() => sw.evaluate(async cid => ((await chrome.storage.local.get('grade-goals.goals'))['grade-goals.goals'] as Record<string, { pct: number }> | undefined)?.[cid]?.pct ?? null, id)).not.toBeNull();
  await expect(pop).toContainText(/need|secured|reach|remaining/i);
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  // Reopen after reload: the goal is still there.
  await page.reload();
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Set grade goal…' }).click();
  const again = page.locator('b2c-grade-goal-popover');
  const g2 = again.getByRole('combobox', { name: 'Goal grade' });
  if (await g2.count()) await expect(g2).not.toHaveValue('');
  else await expect(again.getByRole('spinbutton', { name: 'Goal percent' })).toHaveValue('90');
  // Hidden while grade-goals is off.
  await page.keyboard.press('Escape');
  await setSettings({ 'grade-goals.enabled': false });
  await page.waitForTimeout(200);
  await openMenu(page, id);
  await expect(menu(page).getByRole('menuitem', { name: 'Set grade goal…' })).toHaveCount(0);
});

test('hide a card from its menu, undo, and hidden cards never flash on load', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {} });
  const page = await context.newPage();
  await open(page);
  const id = await idOf(page, 1);
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Hide card' }).click();
  await expect(cardById(page, id)).toBeHidden();
  await page.locator('b2c-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(cardById(page, id)).toBeVisible();

  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Hide card' }).click();
  await expect(cardById(page, id)).toBeHidden();

  // Reload: record whether the hidden card was ever displayed when inserted.
  await page.addInitScript(cid => {
    const w = window as unknown as { __shown: boolean };
    w.__shown = false;
    new MutationObserver(() => {
      const c = document.querySelector(`.ic-DashboardCard:has(a.ic-DashboardCard__link[href$="/courses/${cid}"])`);
      if (c && getComputedStyle(c).display !== 'none') w.__shown = true;
    }).observe(document, { childList: true, subtree: true });
  }, id);
  await page.reload();
  await expect(page.locator(CARD).first()).toBeAttached();
  await expect(cardById(page, id)).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __shown: boolean }).__shown)).toBe(false);

  // Unhide from "Hidden cards (1)" at the end of the grid.
  const hidden = page.locator('b2c-card-hidden');
  await hidden.getByRole('button', { name: 'Hidden cards (1)' }).click();
  await hidden.getByRole('button', { name: /^Unhide/ }).click();
  await expect(cardById(page, id)).toBeVisible();
  await expect(hidden).toBeHidden();
});

test('image from a URL, then "No image", then back to Canvas image', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {} });
  const page = await context.newPage();
  await open(page);
  const id = await idOf(page, 0);
  await openMenu(page, id);
  const m = menu(page);
  await m.getByRole('menuitem', { name: 'Image…' }).click();
  await m.getByRole('textbox', { name: 'Image URL' }).fill('https://canvas.b2c-mock.test/images/b2c-test.png');
  await m.getByRole('button', { name: 'Use URL' }).click();
  await expect.poll(() => cardById(page, id).locator('.ic-DashboardCard__header').evaluate(e => getComputedStyle(e).backgroundImage)).toContain('b2c-test.png');

  await openMenu(page, id);
  await m.getByRole('menuitem', { name: 'Image…' }).click();
  await m.getByRole('button', { name: 'No image' }).click();
  await expect.poll(() => cardById(page, id).locator('.ic-DashboardCard__header').evaluate(e => getComputedStyle(e).backgroundImage)).toBe('none');

  await openMenu(page, id);
  await m.getByRole('menuitem', { name: 'Image…' }).click();
  await m.getByRole('button', { name: 'Canvas image' }).click();
  await expect.poll(() => page.locator('style#b2c-card-customization').evaluate(e => e.textContent)).toBe('');
});

test('quick links: a custom slot replaces Canvas’s link, None hides one, Esc closes the menu', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {} });
  const page = await context.newPage();
  await open(page);
  // A card with the full set of Canvas tab links.
  const id = await page.locator(CARD).evaluateAll(els => {
    const c = els.reduce((a, b) => (b.querySelectorAll('a.ic-DashboardCard__action').length > a.querySelectorAll('a.ic-DashboardCard__action').length ? b : a));
    return c.querySelector('a.ic-DashboardCard__link')!.getAttribute('href')!.split('/').pop()!;
  });
  const natives = cardById(page, id).locator('a.ic-DashboardCard__action');
  const nNative = await natives.count();
  expect(nNative).toBeGreaterThanOrEqual(2);
  await openMenu(page, id);
  const m = menu(page);
  await m.getByRole('menuitem', { name: 'Links…' }).click();
  await m.getByRole('combobox', { name: 'Link 1', exact: true }).selectOption('custom');
  await m.getByRole('textbox', { name: 'Link 1 address' }).fill('canvas.b2c-mock.test/courses');
  await m.getByRole('combobox', { name: 'Link 2', exact: true }).selectOption('none');
  await m.getByRole('button', { name: 'Save links' }).click();
  const nav = cardById(page, id).locator('.ic-DashboardCard__action-container');
  await expect(nav.locator('> b2c-card-link')).toHaveCount(1);
  const first = await nav.evaluate(n => n.firstElementChild!.tagName.toLowerCase());
  expect(first).toBe('b2c-card-link');
  expect(await nav.locator('> b2c-card-link').evaluate(h => h.shadowRoot!.querySelector('a')!.href)).toBe('https://canvas.b2c-mock.test/courses');
  await expect(natives.nth(0)).toBeHidden();
  await expect(natives.nth(1)).toBeHidden();
  if (nNative > 2) await expect(natives.nth(2)).toBeVisible();

  // Esc closes the popover and returns focus to the ⋮ button.
  await openMenu(page, id);
  await page.keyboard.press('Escape');
  await expect(page.locator('b2c-card-menu')).toHaveCount(0);

  // Turning the feature off restores Canvas's own links.
  await setSettings({ 'card-customization.enabled': false });
  await expect(nav.locator('> b2c-card-link')).toHaveCount(0);
  await expect(natives.nth(0)).toBeVisible();
  await expect(natives.nth(1)).toBeVisible();
});

test('rename in b2c mode sets a b²c-only label; back in Canvas mode the title is Canvas’s again', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {}, 'card-customization.renameVia': 'canvas' });
  const page = await context.newPage();
  await open(page);
  const id = await idOf(page, 0);
  const title = cardById(page, id).locator('.ic-DashboardCard__header-title');
  const original = (await title.textContent())!.trim();
  await setSettings({ 'card-customization.renameVia': 'b2c' });
  await openMenu(page, id);
  const m = menu(page);
  await m.getByRole('menuitem', { name: 'Rename…' }).click();
  await m.getByRole('textbox', { name: 'Card name' }).fill('Algebra!');
  await m.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(title).toHaveText('Algebra!');
  await setSettings({ 'card-customization.renameVia': 'canvas' });
  await expect(title).toHaveText(original);
});

test('card layout sliders apply live and default leaves Canvas geometry alone', async ({ context, setSettings }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.cardWidth': 262, 'card-customization.cardGap': 36, 'card-customization.cardRadius': 2 });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-card-layout', '');
  const width = () => page.locator(CARD).first().evaluate(e => e.getBoundingClientRect().width);
  expect(await width()).toBe(262);
  await setSettings({ 'card-customization.cardWidth': 300, 'card-customization.cardRadius': 12 });
  await expect.poll(width).toBe(300);
  expect(await page.locator(CARD).first().evaluate(e => getComputedStyle(e).borderTopLeftRadius)).toBe('12px');
  await setSettings({ 'card-customization.cardWidth': 262, 'card-customization.cardRadius': 2 });
  await expect.poll(width).toBe(262);
  // Default radius is the --b2c-corner token.
  await expect.poll(() => page.locator(CARD).first().evaluate(e => getComputedStyle(e).borderTopLeftRadius)).toBe('2px');
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-card-layout', '');
});

test('Rename: course-code override is b²c-only, shows on the card, and Reset restores Canvas’s', async ({ context, setSettings, sw }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {} });
  const page = await context.newPage();
  await open(page);
  const id = await idOf(page, 1);
  const sub = cardById(page, id).locator('.ic-DashboardCard__header-subtitle');
  const original = (await sub.textContent())!.trim();
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Rename…' }).click();
  await menu(page).getByRole('textbox', { name: 'Course code' }).fill('ALG');
  await menu(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sub).toHaveText('ALG');
  await expect.poll(() => sw.evaluate(async cid => ((await chrome.storage.local.get('card-customization.cards'))['card-customization.cards'] as Record<string, { code?: string }>)?.[cid]?.code, id)).toBe('ALG');
  // Not a Canvas write: no nickname appeared.
  const nicks = (await page.evaluate(async () => (await fetch('/api/v1/users/self/course_nicknames')).json())) as unknown[];
  expect(nicks).toEqual([]);
  await page.reload();
  await expect(cardById(page, id).locator('.ic-DashboardCard__header-subtitle')).toHaveText('ALG');
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Rename…' }).click();
  await menu(page).getByRole('button', { name: "Reset course code to Canvas's" }).click();
  await expect(cardById(page, id).locator('.ic-DashboardCard__header-subtitle')).toHaveText(original);
});

test('Image upload goes through a crop step (drag + zoom), stored at 2× hero size', async ({ context, setSettings, sw }) => {
  await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {} });
  const page = await context.newPage();
  await open(page);
  const id = await idOf(page, 1);
  // A 400×400 PNG: left half red, right half blue.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 400;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 200, 400);
    g.fillStyle = '#0000ff';
    g.fillRect(200, 0, 200, 400);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await openMenu(page, id);
  await menu(page).getByRole('menuitem', { name: 'Image…' }).click();
  await menu(page).locator('input[type=file]').setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const frame = menu(page).getByRole('application', { name: /Crop/ });
  await expect(frame).toBeVisible();
  // Zoom in, then drag the image fully right so its left (red) edge shows.
  await menu(page).getByRole('slider', { name: 'Zoom' }).fill('2');
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 600, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await menu(page).getByRole('button', { name: 'Use image' }).click();
  const stored = await sw.evaluate(async cid => ((await chrome.storage.local.get('card-customization.cards'))['card-customization.cards'] as Record<string, { image?: string }>)?.[cid]?.image ?? '', id);
  expect(stored.startsWith('data:image/jpeg;base64,')).toBe(true);
  const pix = await page.evaluate(async src => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const [r, , b] = g.getImageData(c.width - 4, c.height / 2, 1, 1).data;
    return { w: img.naturalWidth, h: img.naturalHeight, r, b };
  }, stored);
  expect([pix.w, pix.h]).toEqual([524, 292]);
  expect(pix.r).toBeGreaterThan(200); // dragged right at 2×: the whole frame is the red half
  expect(pix.b).toBeLessThan(60);
  await expect.poll(() => cardById(page, id).locator('.ic-DashboardCard__header').evaluate(e => getComputedStyle(e).backgroundImage)).toContain('data:image/jpeg');
});

for (const view of ['cards', 'widget'] as const) {
  test(`drag to reorder (${view} dashboard): cards make room, Canvas is written, survives Canvas's real re-render, no navigation`, async ({ context, setSettings }) => {
    await context.addCookies([{ name: 'mock_dashboard_view', value: view, url: CANVAS + '/' }, { name: 'mock_dashboard_tab', value: 'courses', url: CANVAS + '/' }]);
    await setSettings({ 'card-customization.enabled': true, 'card-customization.cards': {}, 'card-customization.order': null });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as { __grid: number };
      w.__grid = 0;
      new PerformanceObserver(l => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources: { node?: Node }[] }[]) {
          if (e.hadRecentInput) continue;
          if (e.sources.some(x => { const n = x.node; const el = n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null; return !!el?.closest('.ic-DashboardCard__box__container'); })) w.__grid += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await open(page);
    const visual = () => page.locator(CARD).evaluateAll(els => els
      .filter(e => getComputedStyle(e).display !== 'none')
      .map(e => ({ id: e.querySelector('a.ic-DashboardCard__link')!.getAttribute('href')!.split('/').pop()!, r: e.getBoundingClientRect() }))
      .sort((a, b) => Math.round(a.r.top) - Math.round(b.r.top) || a.r.left - b.r.left)
      .map(x => x.id));
    const before = await visual();
    const hero = (id: string) => cardById(page, id).locator('.ic-DashboardCard__header_hero');
    const src = (await hero(before[0]!).boundingBox())!;
    const dst = (await cardById(page, before[1]!).boundingBox())!; // same row

    // Esc cancels mid-drag.
    await page.mouse.move(src.x + 30, src.y + 40);
    await page.mouse.down();
    await page.mouse.move(dst.x + dst.width * 0.8, dst.y + 40, { steps: 8 });
    await expect(page.locator('b2c-card-drop-bar')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('b2c-card-drop-bar')).toHaveCount(0);
    await expect.poll(visual).toEqual(before);
    expect(new URL(page.url()).pathname).toBe('/');
    // Let the 180 ms glide back finish before the next gesture.
    await expect.poll(() => page.locator(CARD).evaluateAll(els => els.every(e => !(e as HTMLElement).style.transform))).toBe(true);
    await page.waitForTimeout(250);

    // Drag the first card onto the right half of the second: it lands after it.
    await page.mouse.move(src.x + 30, src.y + 40);
    await page.mouse.down();
    await page.mouse.move(dst.x + dst.width * 0.8, dst.y + 40, { steps: 8 });
    await page.mouse.up();
    const expected = [before[1]!, before[0]!, ...before.slice(2)];
    await expect.poll(visual).toEqual(expected);
    expect(new URL(page.url()).pathname).toBe('/'); // the hero's click didn't navigate
    await expect.poll(async () => {
      const p = ((await page.evaluate(async () => (await fetch('/api/v1/users/self/dashboard_positions')).json())) as { dashboard_positions: Record<string, number> }).dashboard_positions;
      return p[`course_${before[0]}`];
    }).toBe(1);

    // Canvas's real re-render (the mock's hook): new nodes, Canvas's order. Ours holds.
    await page.waitForTimeout(600);
    const n = await page.locator('b2c-card-kebab').count();
    const oldNode = await page.locator(CARD).first().elementHandle();
    await page.evaluate(() => (window as unknown as { __mockRerenderCards(): Promise<void> }).__mockRerenderCards());
    await expect.poll(() => oldNode!.evaluate(e => e.isConnected)).toBe(false);
    await expect(page.locator('b2c-card-kebab')).toHaveCount(n);
    await expect.poll(visual).toEqual(expected);
    expect(await page.evaluate(() => (window as unknown as { __grid: number }).__grid)).toBeLessThan(0.001);
  });
}
