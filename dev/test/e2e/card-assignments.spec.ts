import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const NOW = '2026-10-21T10:00:00-07:00';
const DUE = 'b2c-card-due';

async function open(page: Page, path = '/') {
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + path);
}

const realCards = (page: Page) => page.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)');
const rowsIn = (page: Page) => page.locator(`${DUE} li[data-key]`);

test.beforeEach(async ({ context }) => {
  const p = await context.newPage();
  await p.request.post(CANVAS + '/__mock/reset');
  await p.close();
});

test('turns on live, lists items with links, and turning off removes every trace', async ({ context, setSettings }) => {
  await setSettings({ 'card-assignments.enabled': false });
  const page = await context.newPage();
  await open(page);
  await expect(realCards(page).first()).toBeVisible();
  const n = await realCards(page).count();
  expect(n).toBeGreaterThan(2);
  const plainHeight = await realCards(page).first().evaluate(e => e.getBoundingClientRect().height);
  await expect(page.locator(DUE)).toHaveCount(0);

  await setSettings({ 'card-assignments.enabled': true });
  await expect(page.locator(DUE)).toHaveCount(n);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-card-assignments', '');
  // Some card has rows, each a link to the item.
  const firstRow = page.locator(`${DUE} li[data-key] a.t`).first();
  await expect(firstRow).toHaveAttribute('href', /\/courses\/\d+\/(assignments|quizzes|discussion_topics)\/\d+/);
  // Every card is the same height (rows reserved).
  const heights = await realCards(page).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);

  await setSettings({ 'card-assignments.count': 2 });
  await expect
    .poll(() => page.evaluate(() => Math.max(...Array.from(document.querySelectorAll('b2c-card-due')).map(h => h.shadowRoot!.querySelectorAll('li').length))))
    .toBeLessThanOrEqual(2);

  await setSettings({ 'card-assignments.enabled': false });
  await expect(page.locator(DUE)).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-card-assignments', '');
  await expect(page.locator('span[data-b2c-plannable]')).toHaveCount(0);
  const after = await realCards(page).first().evaluate(e => e.getBoundingClientRect().height);
  expect(after).toBe(plainHeight);
});

test('clicking an item goes to it', async ({ context, setSettings }) => {
  await setSettings({ 'card-assignments.enabled': true });
  const page = await context.newPage();
  await open(page);
  const link = page.locator(`${DUE} li[data-key] a.t`).first();
  const href = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(CANVAS + href);
});

test('warm cache: second load renders rows before the network answers', async ({ context, setSettings }) => {
  await setSettings({ 'card-assignments.enabled': true });
  const page = await context.newPage();
  await open(page);
  await expect(rowsIn(page).first()).toBeVisible();
  const first = await page.locator(DUE).first().evaluate(h => h.shadowRoot!.querySelector('ul')!.textContent);

  // Hold every planner request for 5 s on the next load.
  await page.route('**/api/v1/planner/items**', async r => {
    await new Promise(res => setTimeout(res, 5000));
    await r.continue().catch(() => {});
  });
  const t0 = Date.now();
  await page.reload();
  await expect(rowsIn(page).first()).toBeVisible({ timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(3000);
  const again = await page.locator(DUE).first().evaluate(h => h.shadowRoot!.querySelector('ul')!.textContent);
  expect(again).toBe(first);
  // No skeleton on a warm load.
  expect(await page.locator(DUE).first().evaluate(h => h.shadowRoot!.querySelectorAll('.sk').length)).toBe(0);
});

test('no layout shift from the Due list (CLS budget 0.01), warm and cold @perf', async ({ context, setSettings }) => {
  type Shift = { value: number; at: number; sources: string[] };
  const measure = async (page: Page) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: Shift[]; __ev: string[] };
      w.__cls = [];
      w.__ev = [];
      // Debug trail: when the gate attribute and the real cards appear.
      let had = false, cards = false;
      new MutationObserver(() => {
        const h = !!document.documentElement?.hasAttribute('data-b2c-card-assignments');
        if (h !== had) w.__ev.push(`${Math.round(performance.now())} attr=${h}`);
        had = h;
        const c = !!document.querySelector('.ic-DashboardCard a.ic-DashboardCard__link');
        if (c && !cards) w.__ev.push(`${Math.round(performance.now())} cards`);
        cards = c;
      }).observe(document, { attributes: true, childList: true, subtree: true });
      new PerformanceObserver(l => {
        for (const e of l.getEntries() as unknown as { value: number; startTime: number; hadRecentInput: boolean; sources: { node?: Node; previousRect: DOMRect; currentRect: DOMRect }[] }[]) {
          if (e.hadRecentInput) continue;
          w.__cls.push({
            value: e.value,
            at: Math.round(e.startTime),
            sources: e.sources.map(s => {
              const n = s.node;
              if (!n) return '?';
              // G = inside the course-card grid (this feature's area); O = elsewhere.
              const el = n.nodeType === 1 ? (n as Element) : n.parentElement;
              const grid = !!el?.closest('.ic-DashboardCard__box, [data-testid=courses-tab-content] .ic-DashboardCard');
              const name = n.nodeType === 1 ? `${n.nodeName}#${(n as Element).id}.${String((n as Element).className).slice(0, 40)}` : n.nodeName;
              return `${grid ? 'G' : 'O'}:${name} ${JSON.stringify(s.previousRect)}->${JSON.stringify(s.currentRect)}`;
            }),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
  };
  const run = async (enabled: boolean) => {
    await setSettings({ 'card-assignments.enabled': enabled });
    const page = await context.newPage();
    await measure(page);
    await open(page);
    await expect(realCards(page).first()).toBeVisible();
    if (enabled) await expect(rowsIn(page).first()).toBeVisible();
    // Record the widget heights now and after the fresh data has landed.
    const h0 = enabled ? await page.locator(DUE).evaluateAll(els => els.map(e => e.getBoundingClientRect().height)) : [];
    await page.waitForTimeout(1500);
    const h1 = enabled ? await page.locator(DUE).evaluateAll(els => els.map(e => e.getBoundingClientRect().height)) : [];
    expect(h1).toEqual(h0);
    const { cls, ev } = await page.evaluate(() => { const w = window as unknown as { __cls: Shift[]; __ev: string[] }; return { cls: w.__cls, ev: w.__ev }; });
    if (process.env.B2C_DEBUG) console.log(enabled, JSON.stringify(cls), JSON.stringify(ev));
    await page.close();
    return cls;
  };
  // Only shifts of nodes inside the course-card grid are this feature's to
  // answer for. Shifts elsewhere (the mock's header insert, the side panel
  // taking over #right-side) and shifts of nodes that have since left the DOM
  // ('?': the mock's skeleton being replaced) vary with timing and belong to
  // other features or to Canvas.
  const ours = (list: Shift[]) => list.filter(e => e.sources.some(x => x.startsWith('G:'))).reduce((a, e) => a + e.value, 0);
  // Baseline first: it also leaves the localStorage mirror stale (feature
  // off), so the cold run below is the "switched on with no Canvas tab open"
  // case, where the gate attribute arrives from main.js just after first paint.
  const base = ours([...(await run(false)), ...(await run(false))]);
  const cold = await run(true); // stale mirror, empty planner cache
  const warm = await run(true);
  expect(ours(cold) - base).toBeLessThan(0.01);
  expect(ours(warm) - base).toBeLessThan(0.01);
});

const rowByKey = (page: Page, key: string) => page.locator(`${DUE} li[data-key="${key}"]`);
const overrideFor = async (page: Page, type: string, id: string) => {
  const o = (await page.evaluate(async () => (await fetch('/api/v1/planner/overrides')).json())) as { plannable_type: string; plannable_id: string | number; marked_complete: boolean }[];
  return o.find(x => x.plannable_type === type && String(x.plannable_id) === id)?.marked_complete;
};

test('ticking with planner sync: the row stays crossed off this session, Canvas is written, Undo reverts', async ({ context, setSettings }) => {
  await setSettings({ 'card-assignments.enabled': true, 'core.plannerSync': true, 'core.todoMarks': {} });
  const page = await context.newPage();
  await open(page);
  const row = page.locator(`${DUE} li[data-key]`).first();
  await expect(row).toBeVisible();
  const key = (await row.getAttribute('data-key'))!;
  const [type, id] = key.split(':') as [string, string];
  await rowByKey(page, key).locator('input[type=checkbox]').click();
  // Crossed off in place: same row, struck through, box ticked.
  await expect(rowByKey(page, key)).toHaveClass(/\bdone\b/);
  await expect(rowByKey(page, key).locator('input[type=checkbox]')).toBeChecked();
  expect(await rowByKey(page, key).locator('.t').evaluate(e => getComputedStyle(e).textDecorationLine)).toBe('line-through');
  await expect(page.locator('b2c-toast')).toContainText('Marked done in Canvas');
  await expect.poll(() => overrideFor(page, type, id)).toBe(true);
  // Still there a while later (no collapse).
  await page.waitForTimeout(600);
  await expect(rowByKey(page, key)).toHaveClass(/\bdone\b/);

  await page.locator('b2c-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(rowByKey(page, key)).not.toHaveClass(/\bdone\b/);
  await expect(rowByKey(page, key).locator('input[type=checkbox]')).not.toBeChecked();
  await expect.poll(() => overrideFor(page, type, id)).toBe(false);

  // Tick again, then reload: done items drop off the cards.
  await rowByKey(page, key).locator('input[type=checkbox]').click();
  await expect.poll(() => overrideFor(page, type, id)).toBe(true);
  await page.reload();
  await expect(page.locator(`${DUE} li[data-key]`).first()).toBeVisible();
  await expect(rowByKey(page, key)).toHaveCount(0);
});

test('ticking without sync stays b²c-local, unticking the crossed row undoes, ⌘Z undoes, done drops on reload', async ({ context, setSettings, sw }) => {
  await setSettings({ 'card-assignments.enabled': true, 'core.plannerSync': false, 'core.todoMarks': {} });
  const page = await context.newPage();
  await open(page);
  const row = page.locator(`${DUE} li[data-key]`).first();
  await expect(row).toBeVisible();
  const key = (await row.getAttribute('data-key'))!;
  await rowByKey(page, key).locator('input[type=checkbox]').click();
  await expect(rowByKey(page, key)).toHaveClass(/\bdone\b/);
  await expect(page.locator('b2c-toast')).toContainText('Marked done');
  await expect.poll(() => sw.evaluate(async k => ((await chrome.storage.local.get('core.todoMarks'))['core.todoMarks'] as Record<string, { done?: boolean }> | undefined)?.[k]?.done ?? null, key)).toBe(true);
  expect(await page.evaluate(async () => (await fetch('/api/v1/planner/overrides')).json())).toEqual([]);
  // Unticking the crossed row is an undo.
  await rowByKey(page, key).locator('input[type=checkbox]').click();
  await expect(rowByKey(page, key)).not.toHaveClass(/\bdone\b/);
  await expect.poll(() => sw.evaluate(async k => ((await chrome.storage.local.get('core.todoMarks'))['core.todoMarks'] as Record<string, { done?: boolean }> | undefined)?.[k]?.done ?? null, key)).toBeNull();
  // ⌘Z / Ctrl+Z undoes a tick.
  await rowByKey(page, key).locator('input[type=checkbox]').click();
  await expect(rowByKey(page, key)).toHaveClass(/\bdone\b/);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(rowByKey(page, key)).not.toHaveClass(/\bdone\b/);
  // Tick, reload: gone from the card.
  await rowByKey(page, key).locator('input[type=checkbox]').click();
  await expect.poll(() => sw.evaluate(async k => ((await chrome.storage.local.get('core.todoMarks'))['core.todoMarks'] as Record<string, { done?: boolean }> | undefined)?.[k]?.done ?? null, key)).toBe(true);
  await page.reload();
  await expect(page.locator(`${DUE} li[data-key]`).first()).toBeVisible();
  await expect(rowByKey(page, key)).toHaveCount(0);
});

test('due soon is emphasised (bold, no colour); overdue keeps the only colour', async ({ context, setSettings }) => {
  await setSettings({ 'card-assignments.enabled': true, 'card-assignments.count': 8, 'core.todoMarks': {} });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator(`${DUE} li[data-key]`).first()).toBeVisible();
  const styles = await page.locator(DUE).evaluateAll(hosts => hosts.flatMap(h => Array.from(h.shadowRoot!.querySelectorAll('li[data-key] .d')).map(d => ({
    text: d.textContent!, soon: d.classList.contains('soon'), weight: getComputedStyle(d).fontWeight, color: getComputedStyle(d).color,
  }))));
  const soon = styles.filter(x => x.soon);
  expect(soon.length).toBeGreaterThan(0);
  for (const x of soon) {
    expect(x.weight).toBe('600');
    expect(x.text).toMatch(/^(Today|Tomorrow|Due in)/);
  }
  const overdue = styles.filter(x => x.text.startsWith('Overdue'));
  expect(overdue.length).toBeGreaterThan(0);
  expect(new Set(overdue.map(x => x.color)).size).toBe(1);
  expect(soon.every(x => x.color !== overdue[0]!.color)).toBe(true);
});

test('date order: day/month applies live', async ({ context, setSettings }) => {
  await setSettings({ 'card-assignments.enabled': true, 'card-assignments.count': 8, 'core.dates': 'absolute', 'core.dateOrder': 'md' });
  const page = await context.newPage();
  await open(page);
  const dates = () => page.locator(DUE).evaluateAll(hosts => hosts.flatMap(h => Array.from(h.shadowRoot!.querySelectorAll('li[data-key] .d:not(.soon)')).map(d => d.textContent!)).filter(t => !t.startsWith('Overdue')));
  await expect.poll(async () => (await dates()).some(t => /^[A-Z][a-z]{2} \d{1,2} /.test(t))).toBe(true);
  await setSettings({ 'core.dateOrder': 'dm' });
  await expect.poll(async () => (await dates()).some(t => /^\d{1,2} [A-Z][a-z]{2} /.test(t))).toBe(true);
  await setSettings({ 'core.dates': 'relative', 'core.dateOrder': 'auto' });
});

test('card views: rows, next only, count, switched live, each with its reserved height', async ({ context, setSettings }) => {
  await setSettings({ 'card-assignments.enabled': true, 'card-assignments.view': 'rows', 'card-assignments.count': 4, 'core.todoMarks': {} });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator(`${DUE} li[data-key]`).first()).toBeVisible();
  const card = realCards(page).nth(1);
  const h = () => card.evaluate(e => Math.round(e.getBoundingClientRect().height));
  const rowsH = await h();
  const lis = () => card.locator(DUE).evaluate(host => Array.from(host.shadowRoot!.querySelectorAll('li')).map(l => l.className));

  await setSettings({ 'card-assignments.view': 'next' });
  await expect.poll(async () => (await lis()).length).toBe(1);
  expect((await lis())[0]).toMatch(/\bnext\b/);
  expect(await card.locator(DUE).evaluate(host => host.shadowRoot!.querySelector('li.next .t')!.textContent!.length)).toBeGreaterThan(0);
  await expect.poll(h).toBe(rowsH - 2 * 28);

  await setSettings({ 'card-assignments.view': 'count' });
  await expect.poll(lis).toEqual(['count']);
  await expect.poll(() => card.locator(DUE).evaluate(host => host.shadowRoot!.querySelector('li.count')!.textContent)).toMatch(/\d+ overdue·\d+ this week·\d+ total/);
  await expect.poll(h).toBe(rowsH - 3 * 28);

  await setSettings({ 'card-assignments.view': 'rows' });
  await expect.poll(h).toBe(rowsH);
  // Pre-paint: the reservation for "count" is in place on a fresh load too.
  await setSettings({ 'card-assignments.view': 'count' });
  await page.reload();
  await expect(card).toBeVisible();
  expect(await h()).toBe(rowsH - 3 * 28);
  await setSettings({ 'card-assignments.view': 'rows' });
});

test('custom to-do items show on their course card: planner notes and b²c-local items', async ({ context, setSettings, sw }) => {
  await setSettings({ 'card-assignments.enabled': true, 'card-assignments.count': 8, 'core.todoMarks': {} });
  const page = await context.newPage();
  // Create the note before the dashboard's planner cache exists (a note made
  // in the to-do panel is patched into that cache by better-todo instead).
  await page.goto(CANVAS + '/courses');
  const cid = ((await page.evaluate(async () => (await fetch('/api/v1/dashboard/dashboard_cards')).json())) as { id: string | number }[])[1]!.id.toString();
  // A planner note (what better-todo's "+ Add" creates with sync on), due in 2 days.
  await page.evaluate(async c => {
    const csrf = decodeURIComponent(document.cookie.match(/_csrf_token=([^;]+)/)![1]!);
    await fetch('/api/v1/planner_notes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ title: 'Ask about PS6', todo_date: '2026-10-23T17:00:00-07:00', course_id: c }) });
  }, cid);
  await open(page);
  const card = page.locator(`.ic-DashboardCard:has(a.ic-DashboardCard__link[href$="/courses/${cid}"]) ${DUE}`);
  await expect.poll(() => card.evaluate(h => Array.from(h.shadowRoot!.querySelectorAll('li[data-key^="planner_note:"] .t')).map(t => [t.tagName, t.textContent]))).toContainEqual(['SPAN', 'Ask about PS6']);
  // A b²c-local custom item (sync off) appears live.
  await sw.evaluate(async c => chrome.storage.local.set({ 'better-todo.custom': [{ id: 'x1', title: 'Print notes', courseId: c, due: '2026-10-22T08:00:00-07:00', at: 1 }] }), cid);
  await expect.poll(() => card.evaluate(h => !!h.shadowRoot!.querySelector('li[data-key="local:x1"]'))).toBe(true);
  // Ticking it marks it in core.todoMarks under better-todo's key.
  await card.evaluate(h => (h.shadowRoot!.querySelector('li[data-key="local:x1"] input') as HTMLInputElement).click());
  await expect.poll(() => sw.evaluate(async () => ((await chrome.storage.local.get('core.todoMarks'))['core.todoMarks'] as Record<string, { done?: boolean }> | undefined)?.['local:x1']?.done ?? null)).toBe(true);
  await sw.evaluate(async () => chrome.storage.local.remove('better-todo.custom'));
});

test('light-DOM hook per row for other features', async ({ context, setSettings }) => {
  await setSettings({ 'card-assignments.enabled': true });
  const page = await context.newPage();
  await open(page);
  await expect(rowsIn(page).first()).toBeVisible();
  const hooks = page.locator('b2c-card-due > span[data-b2c-plannable][data-b2c-course]');
  expect(await hooks.count()).toBeGreaterThan(0);
  // Content appended to a hook is projected into its row.
  const ok = await page.evaluate(() => {
    const span = document.querySelector('b2c-card-due > span[data-b2c-plannable]') as HTMLElement;
    const x = document.createElement('i');
    x.textContent = '+1.8';
    span.appendChild(x);
    const slot = span.assignedSlot;
    return !!slot && slot.closest('li')?.getAttribute('data-key') === span.getAttribute('data-b2c-plannable') && x.getBoundingClientRect().width > 0;
  });
  expect(ok).toBe(true);
});
