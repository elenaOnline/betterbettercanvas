// agentkit/CONTRACT.md §3 on the card due rows: anchors match describe(),
// controls are labelled as state-changing, and nothing is there with the
// contract off.
import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const DUE = 'b2c-card-due';

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
  await page.goto(CANVAS + '/');
  await expect(page.locator(`${DUE} li[data-key]`).first()).toBeVisible();
}

type Row = { id: string; course: string | null; due: string | null; state: string | null; action: string | null; name: string | null; marksRead: string | null };
const anchoredRows = (page: Page) =>
  page.locator(DUE).evaluateAll(hosts => ({
    regions: hosts.map(h => h.getAttribute('data-b2c-region')),
    rows: hosts.flatMap(h => Array.from(h.shadowRoot!.querySelectorAll('li[data-key]')).map(li => ({
      id: li.getAttribute('data-b2c-id'),
      course: li.getAttribute('data-b2c-course-id'),
      due: li.getAttribute('data-b2c-due'),
      state: li.getAttribute('data-b2c-state'),
      action: li.querySelector('input[type=checkbox]')!.getAttribute('data-b2c-action'),
      name: li.getAttribute('aria-label'),
      marksRead: li.querySelector('a.t')?.getAttribute('data-b2c-marks-read') ?? null,
    }))),
  })) as Promise<{ regions: (string | null)[]; rows: Row[] }>;

const describe = (page: Page) =>
  page.evaluate(async () => {
    const id = 'cards-' + Math.random();
    return new Promise<any>((ok, no) => {
      const t = setTimeout(() => no(new Error('no answer')), 4000);
      document.addEventListener('b2c:described', e => {
        const d = JSON.parse((e as CustomEvent<string>).detail);
        if (d.id === id) (clearTimeout(t), ok(d));
      });
      document.dispatchEvent(new CustomEvent('b2c:describe', { detail: JSON.stringify({ v: 1, id }) }));
    });
  });

test('due rows carry §3 anchors that match describe(), and drop them live when the contract goes off', async ({ context, setSettings }) => {
  await setSettings({ 'core.agentContract': true, 'card-assignments.enabled': true, 'card-assignments.view': 'rows', 'card-assignments.count': 8, 'core.todoMarks': {} });
  const page = await context.newPage();
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-agent', /.+/);
  const { regions, rows } = await anchoredRows(page);
  expect(regions.every(r => r === 'card-due')).toBe(true);
  expect(rows.length).toBeGreaterThan(0);

  const d = await describe(page);
  const due = new Map<string, { courseId: string; due: string | null; state: string; marksRead: boolean }>(d.due.map((x: any) => [x.id, x]));
  const onPage = new Map<string, any>(d.onPage.filter((x: any) => x.shadowHost === 'b2c-card-due').map((x: any) => [x.id, x]));
  for (const r of rows) {
    // Every anchored row is in describe's onPage, under the card-due host, with a working selector.
    expect(onPage.has(r.id), `onPage has ${r.id}`).toBe(true);
    expect(onPage.get(r.id).selector).toBe(`[data-b2c-id="${r.id}"]`);
    // Its facts are describe's facts.
    const x = due.get(r.id);
    expect(x, `describe.due has ${r.id}`).toBeTruthy();
    expect(r.course).toBe(x!.courseId);
    expect(r.due).toBe(x!.due);
    expect(r.state).toBe(x!.state);
    expect(r.action).toBe('mark-done');
    // Accessible name: title, course and due.
    expect(r.name).toMatch(/, .+, due (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2} \d{1,2}:\d{2}( [ap]m)?/);
  }
  // marks-read on each title link equals describe's marksRead for that item.
  for (const r of rows) expect(r.marksRead === 'true', r.id).toBe((due.get(r.id) as any).marksRead === true);
  // And describe's onPage for card-due lists nothing the cards don't show.
  expect([...onPage.keys()].sort()).toEqual([...new Set(rows.map(r => r.id))].sort());

  // Ticking flips the action verb to mark-undone on the crossed row.
  const first = rows[0]!.id;
  await page.locator(`${DUE} li[data-b2c-id="${first}"] input[type=checkbox]`).click();
  await expect(page.locator(`${DUE} li[data-b2c-id="${first}"] input[type=checkbox]`)).toHaveAttribute('data-b2c-action', 'mark-undone');

  // Contract off: every anchor goes, live.
  await setSettings({ 'core.agentContract': false });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-agent', /.*/);
  await expect.poll(async () => {
    const a = await anchoredRows(page);
    return a.regions.every(r => r === null) && a.rows.every(r => !r.id && !r.course && !r.due && !r.state && !r.action && !r.marksRead);
  }).toBe(true);
  // The accessible names stay (they're for every screen reader, not just agents).
  expect((await anchoredRows(page)).rows[0]!.name).toMatch(/, due /);
});

test('card menu: state-changing controls carry data-b2c-action only while the contract is on', async ({ context, setSettings }) => {
  await setSettings({ 'core.agentContract': true, 'card-customization.enabled': true, 'card-customization.renameVia': 'canvas' });
  const page = await context.newPage();
  await open(page);
  const card = page.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)').nth(1);
  const menu = page.locator('b2c-card-menu');
  const verbs = () => menu.evaluate(h => Array.from(h.shadowRoot!.querySelectorAll('[data-b2c-action]')).map(e => e.getAttribute('data-b2c-action')));
  await card.locator('b2c-card-kebab').getByRole('button').click();
  const root = await verbs();
  expect(root.filter(v => v === 'move-card')).toHaveLength(4);
  expect(root).toEqual(expect.arrayContaining(['hide-card', 'unfavorite']));
  await menu.getByRole('menuitem', { name: 'Color…' }).click();
  expect((await verbs()).filter(v => v === 'set-color').length).toBeGreaterThan(10);
  await menu.getByRole('button', { name: 'Back' }).click();
  await menu.getByRole('menuitem', { name: 'Rename…' }).click();
  expect(await verbs()).toContain('set-nickname');
  await page.keyboard.press('Escape');

  await setSettings({ 'core.agentContract': false });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-agent', /.*/);
  await card.locator('b2c-card-kebab').getByRole('button').click();
  expect(await verbs()).toEqual([]);
});

test('an unread discussion row is marked as marking read, matching describe', async ({ context, setSettings, sw }) => {
  await setSettings({ 'core.agentContract': true, 'card-assignments.enabled': true, 'card-assignments.view': 'rows', 'card-assignments.count': 8, 'core.todoMarks': {} });
  const page = await context.newPage();
  await open(page);
  // Make the cached planner say the discussions have new activity (unread
  // posts), and fresh, so the next load renders from it without a refetch.
  // (route.fetch can't reach the mock: it bypasses the browser's host mapping.)
  await sw.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(all)) {
      if (!k.startsWith('b2c:cache:') || !k.includes('/planner/items')) continue;
      const e = v as { t: number; data: { plannable_type: string; new_activity: boolean }[] };
      for (const i of e.data) if (i.plannable_type === 'discussion_topic') i.new_activity = true;
      out[k] = { ...e, t: Date.now() + 30 * 86_400_000 }; // fresh under the pinned clock too
    }
    await chrome.storage.local.set(out);
  });
  await page.reload();
  await expect(page.locator(`${DUE} li[data-key]`).first()).toBeVisible();
  const { rows } = await anchoredRows(page);
  const d = await describe(page);
  const due = new Map<string, { marksRead: boolean }>(d.due.map((x: any) => [x.id, x]));
  const disc = rows.filter(r => r.id.startsWith('discussion_topic:'));
  expect(disc.length).toBeGreaterThan(0);
  for (const r of disc) {
    expect(r.marksRead, r.id).toBe('true');
    expect(due.get(r.id)!.marksRead, r.id).toBe(true);
  }
  for (const r of rows) expect(r.marksRead === 'true', r.id).toBe(due.get(r.id)!.marksRead === true);
});
