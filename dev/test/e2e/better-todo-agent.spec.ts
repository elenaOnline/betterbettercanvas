// Agent anchors on the to-do panel (agentkit/CONTRACT.md §3): every row in
// every view carries the same facts describe() reports; state-changing
// controls carry a verb; all of it goes live when the contract is turned off.
import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const NOW = '2026-10-21T10:00:00-07:00';
const PANEL = 'b2c-todo';

type Due = { id: string; courseId: string | null; due: string | null; state: string; url: string | null; marksRead: boolean };
type Described = { due: Due[]; courses: { id: string }[]; onPage: { id: string; shadowHost: string | null }[] };

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + '/');
  await expect(page.locator(`${PANEL} li[data-key]`).first()).toBeVisible();
}

const describe = (page: Page) =>
  page.evaluate(() => (window as unknown as { b2cAgent: { describe(r: object): Promise<unknown> } }).b2cAgent.describe({ from: '2026-10-01', to: '2026-11-30' })) as Promise<Described>;

const anchoredRows = (page: Page) =>
  page.locator(PANEL).evaluate(h =>
    [...h.shadowRoot!.querySelectorAll('li[data-b2c-id]')].map(e => ({
      id: e.getAttribute('data-b2c-id')!,
      courseId: e.getAttribute('data-b2c-course-id'),
      due: e.getAttribute('data-b2c-due'),
      state: e.getAttribute('data-b2c-state'),
      name: e.getAttribute('aria-label') ?? '',
      marksRead: !!e.querySelector('a[data-b2c-marks-read="true"]'),
    })),
  );

test.beforeEach(async ({ context, setSettings }) => {
  const p = await context.newPage();
  await p.request.post(CANVAS + '/__mock/reset');
  await p.close();
  await setSettings({ 'better-todo.count': 20, 'core.agentContract': true });
});

test('anchors match describe() in every view, and disappear live when the contract is off', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-agent', '1');
  await expect(page.locator(PANEL)).toHaveAttribute('data-b2c-region', 'todo');
  const d = await describe(page);
  const byId = new Map(d.due.map(x => [x.id, x]));
  // describe() finds the panel's rows in its shadow root.
  expect(d.onPage.some(o => o.shadowHost === 'b2c-todo')).toBe(true);

  for (const view of ['List', 'Progress ring', 'Week', 'By course']) {
    await page.locator(`${PANEL} .vb-seg [role=radio][aria-label="${view}"]`).click();
    await expect(page.locator(`${PANEL} li[data-b2c-id]`).first()).toBeVisible();
    const rows = await anchoredRows(page);
    expect(rows.length, view).toBeGreaterThan(3);
    let matched = 0;
    for (const r of rows) {
      const x = byId.get(r.id);
      if (!x) continue; // outside describe's window
      matched++;
      expect(r.courseId, `${view} ${r.id}`).toBe(x.courseId);
      expect(r.due, `${view} ${r.id}`).toBe(x.due);
      expect(r.state, `${view} ${r.id}`).toBe(x.state);
      expect(r.marksRead, `${view} ${r.id}`).toBe(x.marksRead && !!x.url);
      // Accessible name: title, course, due.
      expect(r.name, `${view} ${r.id}`).toMatch(/^.+, .+, (due|posted) \w{3} /);
    }
    expect(matched, view).toBeGreaterThan(3);
    if (view === 'Progress ring') {
      const legend = await page.locator(`${PANEL} .legend button[data-b2c-id]`).evaluateAll(els => els.map(e => e.getAttribute('data-b2c-id')));
      const courseIds = new Set(d.courses.map(c => c.id));
      expect(legend.length).toBeGreaterThan(0);
      for (const id of legend) expect(courseIds.has(id!)).toBe(true);
    }
  }

  // The mock's zero-for-missing items read as describe() says: Missing.
  for (const title of ['Lab Report 3', 'Peer Review 2']) {
    const row = page.locator(`${PANEL} li[data-key]`, { has: page.locator('.title', { hasText: title }) }).first();
    const id = (await row.getAttribute('data-key'))!;
    expect(byId.get(id)?.state, title).toBe('missing');
    await expect(row).toHaveAttribute('data-b2c-state', 'missing');
    await expect(row.locator('.due')).toHaveText(/^Missing · \d+d$/);
    await expect(row).toHaveAttribute('aria-label', /, missing/);
  }

  // Controls that change state carry a verb.
  await page.locator(`${PANEL} .vb-seg [role=radio][aria-label="List"]`).click();
  const first = page.locator(`${PANEL} li[data-key]`).first();
  await expect(first.locator('input[type=checkbox]')).toHaveAttribute('data-b2c-action', /^mark-(done|undone)$/);
  await first.hover();
  await first.locator('.more').click();
  await expect(page.locator(`${PANEL} [role=menuitem]`, { hasText: 'Remove from list' })).toHaveAttribute('data-b2c-action', 'dismiss');
  await page.keyboard.press('Escape');
  // Announcement links open topics, which marks them read.
  await expect(page.locator(`${PANEL} li.ann a.title`).first()).toHaveAttribute('data-b2c-marks-read', 'true');

  // Contract off: every anchor goes, live.
  await setSettings({ 'core.agentContract': false });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-agent', /./);
  await expect(page.locator(PANEL)).not.toHaveAttribute('data-b2c-region', /./);
  const left = await page.locator(PANEL).evaluate(h => h.shadowRoot!.querySelectorAll('[data-b2c-id],[data-b2c-action],[data-b2c-marks-read],[data-b2c-state]').length);
  expect(left).toBe(0);
  // …and rows still work.
  await expect(page.locator(`${PANEL} li[data-key]`).first()).toBeVisible();
});
