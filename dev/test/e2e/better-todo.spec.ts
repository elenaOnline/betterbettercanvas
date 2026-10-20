import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const NOW = '2026-10-21T10:00:00-07:00';
const PANEL = 'b2c-todo';
const rows = (page: Page) => page.locator(`${PANEL} li[data-key]`);
const row = (page: Page, title: string) => page.locator(`${PANEL} li[data-key]`, { has: page.locator('.title', { hasText: title }) }).first();
const toast = (page: Page) => page.locator('b2c-toast .t.on');

async function open(page: Page, path = '/') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + path);
}

async function api<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async p => (await fetch('/api/v1' + p, { headers: { Accept: 'application/json' } })).json(), path) as Promise<T>;
}
type Override = { plannable_type: string; plannable_id: number | string; marked_complete: boolean; dismissed: boolean };
const overrideFor = async (page: Page, key: string) => {
  const [type, id] = key.split(':');
  return (await api<Override[]>(page, '/planner/overrides')).find(o => o.plannable_type === type && String(o.plannable_id) === id) ?? null;
};

test.beforeEach(async ({ context, setSettings }) => {
  const p = await context.newPage();
  await p.request.post(CANVAS + '/__mock/reset');
  await p.close();
  // The mock has many overdue items; show them all so tests can find rows by title.
  await setSettings({ 'better-todo.count': 20 });
});

test('turns on live, replaces Canvas To Do, and turning off removes every trace', async ({ context, setSettings }) => {
  await setSettings({ 'better-todo.enabled': false });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator('[data-testid="ToDoSidebar"] .ToDoSidebarItem').first()).toBeVisible();
  await expect(page.locator(PANEL)).toHaveCount(0);

  await setSettings({ 'better-todo.enabled': true });
  await expect(rows(page).first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-b2c-better-todo', '');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-side', '');
  await expect(page.locator('[data-testid="ToDoSidebar"]')).toBeHidden();
  // Panel sits in the right column, above Recent Feedback.
  await expect(page.locator('#right-side-wrapper > b2c-side-panel > b2c-todo')).toHaveCount(1);
  await expect(page.locator('#right-side .recent_feedback')).toBeVisible();
  // Grouped by day, in Design's order.
  const groups = await page.locator(`${PANEL} .gl`).allTextContents();
  expect(groups.map(g => g.replace(/ · \d+$/, ''))).toEqual(expect.arrayContaining(['Overdue', 'Today']));
  expect(groups[0]).toMatch(/^Overdue/);
  await expect(page.locator(`${PANEL} #h-ann`)).toHaveText('Announcements');

  // Live setting change: count.
  await setSettings({ 'better-todo.count': 3 });
  await expect(rows(page).filter({ hasNot: page.locator('.dot') })).toHaveCount(3);

  await setSettings({ 'better-todo.enabled': false });
  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(page.locator('b2c-side-panel')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-better-todo', '');
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-side', '');
  await expect(page.locator('[data-testid="ToDoSidebar"]')).toBeVisible();
});

test('warm cache: the second load renders before the network answers', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await expect(rows(page).first()).toBeVisible();
  const first = await rows(page).evaluateAll(els => els.map(e => e.getAttribute('data-key')));

  // Hold every planner request for 5 s on the next load.
  await context.route('**/api/v1/planner/items**', async r => {
    await new Promise(res => setTimeout(res, 5000));
    await r.continue().catch(() => {});
  });
  const t0 = Date.now();
  await page.reload();
  await expect(rows(page).first()).toBeVisible({ timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(2500);
  await expect(page.locator(`${PANEL} .skeleton`)).toHaveCount(0);
  // Nothing in the panel moved once it painted (Design: CLS 0 for b²c regions).
  const shift = await page.evaluate(
    () =>
      new Promise<number>(res => {
        let sum = 0;
        new PerformanceObserver(l => {
          for (const e of l.getEntries() as unknown as { value: number; sources?: { node?: Node }[] }[])
            if (e.sources?.some(s => s.node && (s.node as Element).closest?.('b2c-side-panel'))) sum += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => res(sum), 800);
      }),
  );
  expect(shift).toBeLessThan(0.01);
  expect(await rows(page).evaluateAll(els => els.map(e => e.getAttribute('data-key')))).toEqual(first);
});

test('mark done writes Canvas planner (sync on), stays crossed off in place, moves to "Done today" on reload, and Undo reverts it', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  const r = row(page, 'Problem Set 4');
  await expect(r).toBeVisible();
  const key = (await r.getAttribute('data-key'))!;
  await r.locator('input[type=checkbox]').click({ force: true });
  await expect(toast(page)).toContainText('Marked done in Canvas');
  await expect(toast(page)).toContainText('Change this in Settings');
  await expect.poll(async () => (await overrideFor(page, key))?.marked_complete).toBe(true);
  // Polish B: it stays where it was, crossed off, for the session.
  await page.waitForTimeout(400);
  await expect(page.locator(`${PANEL} .group li[data-key="${key}"]`)).toHaveClass(/complete/);
  // Done view lists it.
  await page.locator(`${PANEL} .seg button`, { hasText: 'Done' }).click();
  await expect(page.locator(`${PANEL} li[data-key="${key}"]`)).toHaveClass(/complete/);
  // Undo through the toast.
  await toast(page).locator('button', { hasText: 'Undo' }).click();
  await expect.poll(async () => (await overrideFor(page, key))?.marked_complete).toBe(false);
  await page.locator(`${PANEL} .seg button`, { hasText: 'To do' }).click();
  await expect(page.locator(`${PANEL} li[data-key="${key}"]`)).not.toHaveClass(/complete/);
  // Reload: Canvas's state, not a stale cache.
  await page.reload();
  await expect(page.locator(`${PANEL} li[data-key="${key}"]`)).toBeVisible();
  // Tick again, reload: it has left To do for the collapsed "Done today · 1" at the foot.
  await page.locator(`${PANEL} li[data-key="${key}"] input[type=checkbox]`).click({ force: true });
  await expect.poll(async () => (await overrideFor(page, key))?.marked_complete).toBe(true);
  await page.reload();
  await expect(rows(page).first()).toBeVisible();
  const dg = page.locator(`${PANEL} .done-group[data-group="today"]`);
  await expect(dg.locator('.dg-toggle')).toHaveText(/Done today · 1/i);
  await expect(page.locator(`${PANEL} li[data-key="${key}"]`)).toHaveCount(0); // collapsed
  await dg.locator('.dg-toggle').click();
  await expect(dg.locator(`li[data-key="${key}"]`)).toHaveClass(/complete/);
});

test('sync off: done stays b²c-local and survives reload', async ({ context, setSettings }) => {
  await setSettings({ 'core.plannerSync': false });
  const page = await context.newPage();
  await open(page);
  const r = row(page, 'Homework 4');
  await expect(r).toBeVisible();
  const key = (await r.getAttribute('data-key'))!;
  await r.locator('input[type=checkbox]').click({ force: true });
  await expect(toast(page)).toContainText(/^Marked done/);
  await expect(toast(page)).not.toContainText('in Canvas');
  await expect(page.locator(`${PANEL} li[data-key="${key}"]`)).toHaveClass(/complete/);
  expect(await overrideFor(page, key)).toBeNull();
  await page.reload();
  await expect(rows(page).first()).toBeVisible();
  await expect(page.locator(`${PANEL} .group li[data-key="${key}"]`)).toHaveCount(0);
  await expect(page.locator(`${PANEL} .done-group[data-group="today"] .dg-toggle`)).toHaveText(/Done today · 1/i);
});

test('row menu: remove from list (dismissed in Canvas), restore, label', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  const r = row(page, 'Mastering Chemistry 4');
  const key = (await r.getAttribute('data-key'))!;
  await r.hover();
  await r.locator('.more').click();
  await page.locator(`${PANEL} [role=menuitem]`, { hasText: 'Label…' }).click();
  await expect(page.locator(`${PANEL} .label-input`)).toBeFocused();
  await page.keyboard.type('exam');
  await page.keyboard.press('Enter');
  await expect(r.locator('.chip.label')).toHaveText('exam');

  await r.locator('.more').click();
  await page.locator(`${PANEL} [role=menuitem]`, { hasText: 'Remove from list' }).click();
  await expect(page.locator(`${PANEL} li[data-key="${key}"]`)).toHaveCount(0);
  await expect.poll(async () => (await overrideFor(page, key))?.dismissed).toBe(true);

  await page.locator(`${PANEL} .seg button`, { hasText: 'Done' }).click();
  const d = page.locator(`${PANEL} li[data-key="${key}"]`);
  await expect(d.locator('.due')).toHaveText('Removed');
  await d.hover();
  await d.locator('.more').click();
  await page.locator(`${PANEL} [role=menuitem]`, { hasText: 'Restore' }).click();
  await expect.poll(async () => (await overrideFor(page, key))?.dismissed).toBe(false);
  await page.locator(`${PANEL} .seg button`, { hasText: 'To do' }).click();
  await page.reload();
  await expect(page.locator(`${PANEL} li[data-key="${key}"] .chip.label`)).toHaveText('exam');
});

test('add your own: a Canvas planner note, shown at once and after reload', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await expect(rows(page).first()).toBeVisible();
  await page.locator(`${PANEL} button[aria-label="Add to-do"]`).click();
  await page.locator(`${PANEL} .add-title`).fill('Return library books');
  await page.locator(`${PANEL} .add input[type=time]`).fill('15:00');
  await page.keyboard.press('Enter');
  const r = row(page, 'Return library books');
  await expect(r).toBeVisible();
  await expect(r.locator('.chip.course')).toHaveText('Personal');
  await expect(r.locator('.due')).toHaveText(/in 5h|3:00 PM/);
  const notes = await api<{ title: string; todo_date: string }[]>(page, '/planner_notes');
  const n = notes.find(x => x.title === 'Return library books');
  expect(n?.todo_date).toBe('2026-10-21T22:00:00Z'.replace('Z', '') + 'Z');
  await page.reload();
  await expect(row(page, 'Return library books')).toBeVisible();
});

test('keyboard: J/K move, X ticks, Z undoes, . opens the menu, D shows done', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await expect(rows(page).first()).toBeVisible();
  const focusedKey = () => page.evaluate(() => (document.querySelector('b2c-todo')!.shadowRoot!.activeElement as HTMLElement | null)?.getAttribute('data-key') ?? null);
  const keys = await rows(page).evaluateAll(els => els.map(e => e.getAttribute('data-key')));
  // One tab stop for the list.
  expect(await rows(page).evaluateAll(els => els.filter(e => (e as HTMLElement).tabIndex === 0).length)).toBe(1);
  await rows(page).first().focus();
  await page.keyboard.press('j');
  expect(await focusedKey()).toBe(keys[1]);
  await page.keyboard.press('k');
  expect(await focusedKey()).toBe(keys[0]);
  await page.keyboard.press('j');
  await page.keyboard.press('x');
  await expect(toast(page)).toContainText('Marked done');
  // Stays in place, crossed off, and keeps focus.
  await expect(page.locator(`${PANEL} li[data-key="${keys[1]}"]`)).toHaveClass(/complete/);
  expect(await focusedKey()).toBe(keys[1]);
  await page.keyboard.press('z');
  await expect(page.locator(`${PANEL} li[data-key="${keys[1]}"]`)).not.toHaveClass(/complete/);
  await page.keyboard.press('.');
  await expect(page.locator(`${PANEL} .menu`)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(`${PANEL} .menu`)).toHaveCount(0);
  expect(await focusedKey()).not.toBeNull();
  await page.keyboard.press('d');
  await expect(page.locator(`${PANEL} .seg button`, { hasText: 'Done' })).toHaveAttribute('aria-pressed', 'true');
});

test('hover preview: intent delay, instant switch, read-safe fetch, closes on leave', async ({ context }) => {
  const page = await context.newPage();
  const fetched: string[] = [];
  page.on('request', r => {
    if (r.url().includes('/api/v1/')) fetched.push(new URL(r.url()).pathname + new URL(r.url()).search);
  });
  await open(page);
  const a = row(page, 'Problem Set 4');
  const b = row(page, 'Homework 4');
  await expect(a).toBeVisible();
  const pop = page.locator(`${PANEL} .preview`);
  await a.locator('.title').hover();
  await page.waitForTimeout(120);
  await expect(pop).toBeHidden(); // still inside the intent delay
  await expect(pop).toBeVisible();
  await expect(pop.locator('.pv-body')).toContainText('Complete problem set 4');
  await expect(pop.locator('.pv-open')).toHaveAttribute('href', /\/courses\/118200\/assignments\/11820010/);
  // Switch: no close/open, the content follows.
  const t0 = Date.now();
  await b.locator('.title').hover();
  await expect(pop.locator('.pv-title')).toHaveText('Homework 4');
  expect(Date.now() - t0).toBeLessThan(300);
  await page.mouse.move(5, 5);
  await expect(pop).toBeHidden();
  // Read-safety: list endpoints only, never a show endpoint that marks read
  // or completes a module "view" requirement.
  expect(fetched.filter(u => /\/(assignments|discussion_topics|pages)\/\d+/.test(u))).toEqual([]);
  expect(fetched.some(u => u.includes('/assignments?assignment_ids[]=') || u.includes('/assignments?assignment_ids%5B%5D='))).toBe(true);

  // Space on a focused row toggles it.
  await a.focus();
  await page.keyboard.press(' ');
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
});

test('announcements: newest first with unread dots; preview reads /announcements only', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  const ann = page.locator(`${PANEL} li.ann`);
  await expect(ann.first()).toBeVisible();
  await expect(ann.first()).toHaveClass(/unread/);
  const req = page.waitForRequest(r => r.url().includes('/api/v1/announcements?'));
  await ann.first().locator('.title').hover();
  await req;
  await expect(page.locator(`${PANEL} .preview .pv-body`)).toContainText('Prof.');
});

for (const sync of [true, false]) {
  test(`one state: a tick in the panel also ticks the card row (planner sync ${sync ? 'on' : 'off'})`, async ({ context, setSettings }) => {
    await setSettings({ 'core.plannerSync': sync, 'card-assignments.enabled': true });
    const page = await context.newPage();
    await open(page);
    await expect(rows(page).first()).toBeVisible();
    const has = await page.locator('b2c-card-due li[data-key]').first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    test.skip(!has, 'card-assignments not in this build');
    // An item that is both on a card and in the panel.
    const cardKeys = await page.locator('b2c-card-due li[data-key]').evaluateAll(els => els.map(e => e.getAttribute('data-key')!));
    const panelKeys = new Set(await rows(page).evaluateAll(els => els.map(e => e.getAttribute('data-key')!)));
    const key = cardKeys.find(k => panelKeys.has(k))!;
    expect(key).toBeTruthy();
    const r = page.locator(`${PANEL} li[data-key="${key}"]`);
    const cardRow = page.locator(`b2c-card-due li[data-key="${key}"]`);
    await expect(cardRow).toBeVisible();
    await r.locator('input[type=checkbox]').click({ force: true });
    // The card row ticks too (crossed off in place for the session, or gone).
    await expect.poll(async () => (await cardRow.count()) === 0 || (await cardRow.evaluate(e => e.classList.contains('done')))).toBe(true);
    await page.reload();
    await expect(rows(page).first()).toBeVisible();
    await expect(page.locator('b2c-card-due').first()).toBeVisible();
    await expect(cardRow).toHaveCount(0);
  });
}

test('the ⚙ in the section header opens Settings → To-do', async ({ context, sw }) => {
  void sw; // the service worker opens the tab
  const page = await context.newPage();
  await open(page);
  await expect(rows(page).first()).toBeVisible();
  await page.locator(`${PANEL} button[aria-label="To-do settings"]`).click();
  await expect.poll(() => context.pages().some(p => /\/options\.html#better-todo$/.test(p.url()))).toBe(true);
});

test('square styling: nothing in the panel is round', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await expect(page.locator(`${PANEL} li.ann.unread`).first()).toBeVisible();
  const round = await page.locator(PANEL).evaluate(host => {
    const out: string[] = [];
    const corner = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--b2c-corner')) || 2;
    const check = (el: Element, pseudo?: string) => {
      const cs = getComputedStyle(el, pseudo);
      for (const p of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'] as const) {
        const v = cs[p];
        if (v.includes('%') || parseFloat(v) > corner * 1.5 + 0.01) out.push(`${el.className || el.tagName}${pseudo ?? ''}: ${p}=${v}`);
      }
    };
    for (const el of host.shadowRoot!.querySelectorAll('*')) {
      check(el);
      check(el, '::after');
      check(el, '::before');
    }
    return out;
  });
  expect(round).toEqual([]);
  // The unread mark is a small square.
  const dot = await page.locator(`${PANEL} li.ann.unread .dot`).first().evaluate(e => {
    const cs = getComputedStyle(e, '::after');
    return { w: cs.width, h: cs.height, r: cs.borderTopLeftRadius };
  });
  expect(dot.w).toBe(dot.h);
  expect(parseFloat(dot.r)).toBe(0);
});

test('honest states: a failed fetch never claims the list is empty, and Retry recovers', async ({ context }) => {
  let fail = true;
  await context.route('**/api/v1/planner/items**', r => (fail ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
  const page = await context.newPage();
  await open(page);
  await expect(page.locator(`${PANEL} .empty`).first()).toContainText("Couldn't load your to-do list");
  await expect(page.locator(PANEL)).not.toContainText('Nothing due');
  fail = false;
  await page.locator(`${PANEL} .empty button`, { hasText: 'Retry' }).click();
  await expect(rows(page).first()).toBeVisible();
});

test('two-line 44 px rows with "course · due" (flow A, every width), height known before data', async ({ context }) => {
  // Cold load (fresh profile, empty cache) with the planner held back: the
  // skeleton rows already have the final row height.
  let hold = true;
  await context.route('**/api/v1/planner/items**', async rt => {
    while (hold) await new Promise(res => setTimeout(res, 50));
    await rt.continue().catch(() => {});
  });
  const page = await context.newPage();
  await open(page);
  const skel = page.locator(`${PANEL} .skeleton li.row`).first();
  await expect(skel).toBeVisible();
  expect(Math.round((await skel.boundingBox())!.height)).toBe(44);
  hold = false;
  await expect(rows(page).first()).toBeVisible();

  const width = await page.locator('b2c-todo').evaluate(e => e.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(240);
  const r = row(page, 'Exam 3');
  expect(Math.round((await r.boundingBox())!.height)).toBe(44);
  await expect(r.locator('.chip.course')).toBeVisible();
  await expect(r.locator('.sep')).toBeVisible();
  // Course and due share line 2, below the title.
  const [t, c, d] = await Promise.all([r.locator('.title').boundingBox(), r.locator('.chip.course').boundingBox(), r.locator('.due').boundingBox()]);
  expect(c!.y).toBeGreaterThan(t!.y + 10);
  expect(Math.abs(c!.y - d!.y)).toBeLessThan(4);
  // The course reads in full, not as an ellipsis stub.
  expect(await r.locator('.chip.course').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.locator('b2c-side-panel').screenshot({ path: '.scratch/todo/shots/panel-240.png' });
});

test('review shots (classic dashboard, light and dark)', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(rows(page).first()).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '.scratch/todo/shots/classic-light.png' });
  await row(page, 'Lab Report 4').locator('.title').hover();
  await expect(page.locator(`${PANEL} .preview`)).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: '.scratch/todo/shots/classic-preview.png' });
});

test('new dashboard, Courses tab: the panel is a right-hand column beside the cards', async ({ context }) => {
  await context.addCookies([
    { name: 'mock_dashboard_view', value: 'widget', url: CANVAS + '/' },
    { name: 'mock_dashboard_tab', value: 'courses', url: CANVAS + '/' },
  ]);
  const page = await context.newPage();
  await open(page);
  const card = page.locator('[data-testid="courses-tab-content"] .ic-DashboardCard:has(a.ic-DashboardCard__link)').first();
  await expect(card).toBeVisible();
  await expect(page.locator('[data-testid="courses-tab-content"] > b2c-side-panel > b2c-todo')).toHaveCount(1);
  await expect(rows(page).first()).toBeVisible();
  const [c, p] = await Promise.all([card.boundingBox(), page.locator('b2c-side-panel').boundingBox()]);
  expect(p!.x).toBeGreaterThan(c!.x + c!.width);
  expect(Math.round(p!.width)).toBe(288);
  expect(Math.round((await rows(page).first().boundingBox())!.height)).toBe(44);
  await page.screenshot({ path: '.scratch/todo/shots/new-dashboard-courses.png' });

  // Narrow window: stacked above the cards, collapsed to its header and count.
  // (A fresh load at that width: the mock's widget page drops its Courses tab
  // content when it re-renders on resize, which is a mock gap, reported.)
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.reload();
  await expect(card).toBeVisible();
  await expect(page.locator(`${PANEL} #h-todo`)).toBeVisible();
  await expect(page.locator(`${PANEL} #b-todo`)).toBeHidden();
  await expect(page.locator(`${PANEL} .count`).first()).toContainText(/\d+ \(\d+ overdue\)/);
  const [c2, p2] = await Promise.all([card.boundingBox(), page.locator('b2c-side-panel').boundingBox()]);
  expect(p2!.y + p2!.height).toBeLessThanOrEqual(c2!.y + 1);
  await page.locator(`${PANEL} .collapse`).first().click();
  await expect(rows(page).first()).toBeVisible();
  expect(Math.round((await rows(page).first().boundingBox())!.height)).toBe(44); // flow A: two lines at every width
  await page.screenshot({ path: '.scratch/todo/shots/new-dashboard-narrow.png' });
});
