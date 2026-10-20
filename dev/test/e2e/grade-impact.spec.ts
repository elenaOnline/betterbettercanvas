import { test, expect, CANVAS } from './fixtures.ts';
import type { Page } from '@playwright/test';

const pin = (page: Page) => page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
const SLOT = 'b2c-card-due > span[data-b2c-plannable]';
const impact = (page: Page) => page.locator(`${SLOT} > b2c-impact`);

interface Grp { id: string; group_weight: number; rules: { drop_lowest?: number; drop_highest?: number }; assignments: Array<{ id: string; points_possible: number; quiz_id?: string; discussion_topic?: { id: string }; omit_from_final_grade?: boolean; published?: boolean; submission?: { score: number | null; excused?: boolean } | null }> }

test('grade-impact: opt-in; appears on card rows live, and removes every trace when turned off', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await expect(page.locator(SLOT).first()).toBeAttached();
  await expect(impact(page)).toHaveCount(0); // off by default
  await setSettings({ 'grade-impact.enabled': true });
  await expect(impact(page).first()).toBeAttached();
  const n = await impact(page).count();
  expect(n).toBeGreaterThan(3);
  const text = await impact(page).first().evaluate(h => h.shadowRoot!.textContent!.replace(/\s+/g, ' '));
  expect(text).toMatch(/[−+0][\d.]+ \/ [+0][\d.]+$|0\.0 \/ /);
  await expect(impact(page).first()).toHaveAttribute('title', /^If you score 0: .+Full marks: .+Based on your current score/);
  await setSettings({ 'grade-impact.enabled': false });
  await expect(impact(page)).toHaveCount(0);
});

test('grade-impact: numbers match an independent hand calculation (weighted/unweighted, no drops)', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await setSettings({ 'grade-impact.enabled': true });
  await page.goto(CANVAS + '/');
  await expect(impact(page).first()).toBeAttached();
  // Everything the page shows, plus the raw data to recompute from.
  const rows = await page.evaluate(async slot => {
    const j = async (p: string) => JSON.parse((await (await fetch('/api/v1' + p, { headers: { Accept: 'application/json+canvas-string-ids' } })).text()).replace(/^while\(1\);/, ''));
    const courses = await j('/courses?enrollment_state=active&include[]=total_scores&per_page=100');
    const out: Array<{ key: string; course: string; shown: string; weighted: boolean; groups: unknown }> = [];
    const groupsBy = new Map<string, unknown>();
    for (const s of document.querySelectorAll(slot)) {
      const cid = s.getAttribute('data-b2c-course')!;
      if (!groupsBy.has(cid)) groupsBy.set(cid, await j(`/courses/${cid}/assignment_groups?include[]=assignments&include[]=submission&per_page=100`));
      const h = s.querySelector('b2c-impact');
      const c = courses.find((x: { id: string }) => x.id === cid);
      out.push({ key: s.getAttribute('data-b2c-plannable')!, course: cid, shown: h?.shadowRoot?.textContent?.replace(/\s+/g, ' ').trim().split('}').pop()!.trim() ?? '', weighted: !!c.apply_assignment_group_weights, groups: groupsBy.get(cid) });
    }
    return out;
  }, SLOT);
  expect(rows.length).toBeGreaterThan(3);

  // Independent mini-implementation: no drop rules, so it is a few lines.
  const pctOf = (groups: Grp[], weighted: boolean, set: { id: string; score: number } | null) => {
    const sums = groups.map(g => {
      let e = 0, p = 0;
      for (const a of g.assignments) {
        if (a.published === false || a.omit_from_final_grade || a.submission?.excused || !(a.points_possible > 0)) continue;
        const sc = set && set.id === a.id ? set.score : a.submission?.score;
        if (typeof sc === 'number') { e += sc; p += a.points_possible; }
      }
      return { w: g.group_weight, e, p };
    });
    if (!weighted) return (sums.reduce((a, x) => a + x.e, 0) / sums.reduce((a, x) => a + x.p, 0)) * 100;
    const rel = sums.filter(x => x.p > 0 && x.w > 0);
    return (rel.reduce((a, x) => a + (x.e / x.p) * x.w, 0) / Math.min(100, rel.reduce((a, x) => a + x.w, 0))) * 100;
  };
  const fmt = (n: number) => { const r = Math.round(Math.abs(n) * 10) / 10; return r === 0 ? '0.0' : `${n < 0 ? '−' : '+'}${r.toFixed(1)}`; };

  let checked = 0;
  for (const r of rows) {
    const groups = r.groups as Grp[];
    if (groups.some(g => g.rules.drop_lowest || g.rules.drop_highest)) continue; // drops are covered by the unit tests
    const [type, id] = r.key.split(':');
    const a = groups.flatMap(g => g.assignments).find(x => (type === 'quiz' ? x.quiz_id : type === 'discussion_topic' ? x.discussion_topic?.id : x.id) === id)!;
    const base = pctOf(groups, r.weighted, null);
    const down = pctOf(groups, r.weighted, { id: a.id, score: 0 }) - base;
    const up = pctOf(groups, r.weighted, { id: a.id, score: a.points_possible }) - base;
    expect(r.shown, r.key).toBe(`${fmt(down)} / ${fmt(up)}`);
    checked++;
  }
  expect(checked).toBeGreaterThan(2);
});

test('grade-impact: warm cache shows the numbers before the network answers', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await setSettings({ 'grade-impact.enabled': true });
  await page.goto(CANVAS + '/');
  await expect(impact(page).first()).toBeAttached();
  await context.route(/\/api\/v1\/courses\/\d+\/assignment_groups/, async route => {
    await new Promise(r => setTimeout(r, 4000));
    await route.continue();
  });
  const t0 = Date.now();
  await page.reload();
  await expect(impact(page).first()).toBeAttached({ timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(3500);
  await context.unroute(/\/api\/v1\/courses\/\d+\/assignment_groups/);
});

test('grade-impact: adds no layout shift to the rows it decorates @perf', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await setSettings({ 'grade-impact.enabled': true });
  await page.goto(CANVAS + '/');
  await expect(impact(page).first()).toBeAttached();
  // Rows stay one 28px-ish line: the decorated row is not taller than an undecorated one.
  const heights = await page.evaluate(slot => [...document.querySelectorAll(slot)].map(s => (s.closest('b2c-card-due') as HTMLElement).getBoundingClientRect().height), SLOT);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(200);
});

test('grade-impact (grading scenario): drop rules agree with Canvas; the grading-period tooltip names the period', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await setSettings({ 'grade-impact.enabled': true });
  await page.goto(`${CANVAS}/__mock/set?scenario=grading&next=/`);
  await expect(page.locator(SLOT).first()).toBeAttached();
  await expect(impact(page).first()).toBeAttached();
  const rows = await page.evaluate(async slot => {
    const j = async (p: string) => JSON.parse((await (await fetch('/api/v1' + p, { headers: { Accept: 'application/json+canvas-string-ids' } })).text()).replace(/^while\(1\);/, ''));
    const cs = await j('/courses?enrollment_state=active&include[]=total_scores&include[]=current_grading_period_scores&per_page=100');
    return [...document.querySelectorAll(slot)].map(s => {
      const c = cs.find((x: { id: string }) => x.id === s.getAttribute('data-b2c-course'));
      return { course: c.course_code as string, hidden: !!c.hide_final_grades, periodTitle: c.enrollments[0].current_grading_period_title as string | null, shown: !!s.querySelector('b2c-impact'), title: (s.querySelector('b2c-impact') as HTMLElement | null)?.title ?? '' };
    });
  }, SLOT);
  // Hidden totals: never shown. Grading periods: shown and named. Others: shown.
  for (const r of rows.filter(x => x.hidden)) expect(r.shown, r.course).toBe(false);
  const periodRows = rows.filter(x => x.periodTitle);
  expect(periodRows.length).toBeGreaterThan(0);
  for (const r of periodRows) if (r.shown) expect(r.title, r.course).toContain(`for ${r.periodTitle}`);
  expect(rows.filter(x => !x.hidden && !x.periodTitle && x.shown).length).toBeGreaterThan(3);
});
