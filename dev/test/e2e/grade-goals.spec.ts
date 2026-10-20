import { test, expect, CANVAS } from './fixtures.ts';
import type { Page } from '@playwright/test';

const pin = (page: Page) => page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
const host = (page: Page) => page.locator('b2c-grade-goals');
const G = 'grade-goals';

async function settle(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
}

interface Group { id: string; group_weight: number; rules: object; assignments: Array<{ points_possible: number; submission?: { score: number | null; excused?: boolean } | null }> }
async function find(page: Page, code: RegExp) {
  return page.evaluate(async src => {
    const j = async (p: string) => JSON.parse((await (await fetch('/api/v1' + p, { headers: { Accept: 'application/json+canvas-string-ids' } })).text()).replace(/^while\(1\);/, ''));
    const c = (await j('/courses?enrollment_state=active&include[]=total_scores&per_page=100')).find((x: { course_code: string }) => new RegExp(src).test(x.course_code));
    const groups: Group[] = await j(`/courses/${c.id}/assignment_groups?include[]=assignments&include[]=submission&per_page=100`);
    return { id: c.id as string, weighted: !!c.apply_assignment_group_weights, score: c.enrollments[0].computed_current_score as number, groups };
  }, code.source);
}

test('grade-goals: on by default, box appears on the Grades page and goes away live', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  const { id } = await find(page, /CHEM 101/);
  await page.goto(`${CANVAS}/courses/${id}/grades`);
  await expect(host(page)).toHaveCount(1);
  await expect(host(page).locator('h2')).toHaveText('Goal');
  await expect(host(page).getByText('Pick a grade to see what you need on the rest.')).toBeVisible();
  await setSettings({ [`${G}.enabled`]: false });
  await expect(host(page)).toHaveCount(0);
  await setSettings({ [`${G}.enabled`]: true });
  await expect(host(page)).toHaveCount(1);
});

test('grade-goals: the number matches a hand calculation (unweighted course, no drop rules)', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  const d = await find(page, /CHEM 107/);
  expect(d.weighted).toBe(false);
  // Hand calculation: pooled points; remaining = posted work with no score.
  let earned = 0, possible = 0, remaining = 0;
  for (const g of d.groups) for (const a of g.assignments) {
    if (!(a.points_possible > 0) || a.submission?.excused) continue;
    const sc = a.submission?.score;
    if (typeof sc === 'number') { earned += sc; possible += a.points_possible; } else remaining += a.points_possible;
  }
  const current = (earned / possible) * 100;
  expect(Math.abs(current - d.score)).toBeLessThan(0.05); // our hand maths agrees with Canvas's own total
  const target = Math.round(current + 3);
  const need = ((target / 100) * (possible + remaining) - earned) / remaining * 100;
  await setSettings({ [`${G}.goals`]: { [d.id]: { pct: target } } });
  await page.goto(`${CANVAS}/courses/${d.id}/grades`);
  const answer = host(page).locator('.answer');
  await expect(answer).toBeVisible();
  if (need > 100) {
    await expect(answer).toContainText('Out of reach');
  } else {
    const text = (await answer.textContent())!;
    const shown = Number(/average of ([\d.]+)%/.exec(text)![1]);
    expect(shown).toBeGreaterThanOrEqual(need - 1e-9);
    expect(shown - need).toBeLessThan(0.011); // rounded up to 0.01, never down
    expect(text).toContain(`${Math.round(remaining * 100) / 100} point`);
  }
});

test('grade-goals: picking a letter from the course scheme sets the goal live', async ({ context }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  const { id } = await find(page, /CHEM 101/);
  await page.goto(`${CANVAS}/courses/${id}/grades`);
  const select = host(page).getByLabel('Goal grade');
  await expect(select).toBeVisible();
  await select.selectOption('B');
  await expect(host(page).locator('.answer')).toBeVisible();
  await expect(select.locator('option:checked')).toHaveText('B (84%)');
  // The goal is remembered per course.
  await page.reload();
  await expect(host(page).getByLabel('Goal grade')).toHaveValue('B');
});

test('grade-goals: warm cache renders the answer before the network answers', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  const { id } = await find(page, /CHEM 101/);
  await setSettings({ [`${G}.goals`]: { [id]: { pct: 80 } } });
  await page.goto(`${CANVAS}/courses/${id}/grades`);
  await expect(host(page).locator('.answer')).toBeVisible();
  await context.route(/\/api\/v1\/courses\/\d+\/assignment_groups|\/api\/v1\/courses\?/, async route => {
    await new Promise(r => setTimeout(r, 4000));
    await route.continue();
  });
  const t0 = Date.now();
  await page.reload();
  await expect(host(page).locator('.answer')).toBeVisible({ timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(3500);
  await context.unroute(/\/api\/v1\/courses\/\d+\/assignment_groups|\/api\/v1\/courses\?/);
});

test('grade-goals: not drawn on other pages', async ({ context }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  await expect(host(page)).toHaveCount(0);
});

test('grade-goals: b2c agrees with Canvas on every graded course in the mock (weights, drops)', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  const ids = await page.evaluate(async () => {
    const r = JSON.parse((await (await fetch('/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=100', { headers: { Accept: 'application/json+canvas-string-ids' } })).text()).replace(/^while\(1\);/, ''));
    return r.filter((c: { enrollments?: Array<{ computed_current_score?: number | null }> }) => typeof c.enrollments?.[0]?.computed_current_score === 'number').map((c: { id: string; course_code: string }) => [c.id, c.course_code]);
  }) as Array<[string, string]>;
  expect(ids.length).toBeGreaterThanOrEqual(4);
  await setSettings({ [`${G}.goals`]: Object.fromEntries(ids.map(([id]) => [id, { pct: 90 }])) });
  for (const [id, code] of ids) {
    await page.goto(`${CANVAS}/courses/${id}/grades`);
    await expect(host(page).locator('.answer'), code).toBeVisible();
    await expect(host(page).getByText('doesn’t match'), code).toHaveCount(0);
  }
});

test('grade-goals: the ⚙ on the Goal box opens Settings at grade-goals', async ({ context }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  const { id } = await find(page, /CHEM 101/);
  await page.goto(`${CANVAS}/courses/${id}/grades`);
  await expect(host(page).locator('h2')).toBeVisible();
  await host(page).getByRole('button', { name: 'Grade goal settings' }).click();
  await expect.poll(() => context.pages().some(p => p.url().endsWith('/options.html#grade-goals'))).toBe(true);
});

// ── grading scenario: custom scale, drop rules, grading periods, hidden totals ──
async function grading(page: Page) {
  await page.goto(`${CANVAS}/__mock/set?scenario=grading&next=/`);
  await settle(page);
}
async function listing(page: Page) {
  return page.evaluate(async () => {
    const r = JSON.parse((await (await fetch('/api/v1/courses?enrollment_state=active&include[]=total_scores&include[]=current_grading_period_scores&per_page=100', { headers: { Accept: 'application/json+canvas-string-ids' } })).text()).replace(/^while\(1\);/, ''));
    return r.map((c: { id: string; course_code: string; hide_final_grades?: boolean; enrollments: Array<{ computed_current_score?: number | null; current_grading_period_title?: string | null }> }) => ({ id: c.id, code: c.course_code, hidden: !!c.hide_final_grades, score: c.enrollments[0]?.computed_current_score ?? null, period: c.enrollments[0]?.current_grading_period_title ?? null })) as Array<{ id: string; code: string; hidden: boolean; score: number | null; period: string | null }>;
  });
}

test('grade-goals (grading scenario): drop rules and a custom scale agree with Canvas on every graded course', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await grading(page);
  const cs = (await listing(page)).filter(c => c.score !== null && !c.hidden && c.period === null);
  expect(cs.map(c => c.code).join()).toMatch(/MATH 401/); // custom scale + drop-lowest homework
  expect(cs.map(c => c.code).join()).toMatch(/CHEM 101/); // drop-lowest 2 and lowest+highest groups
  await setSettings({ [`${G}.goals`]: Object.fromEntries(cs.map(c => [c.id, { pct: 90 }])) });
  for (const c of cs) {
    await page.goto(`${CANVAS}/courses/${c.id}/grades`);
    await expect(host(page).locator('.answer'), c.code).toBeVisible();
    await expect(host(page).getByText('doesn’t match'), c.code).toHaveCount(0);
  }
});

test('grade-goals (grading scenario): a course with grading periods names the current period', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await grading(page);
  const ana = (await listing(page)).find(c => c.period)!;
  expect(ana.code).toMatch(/MATH 301/);
  await setSettings({ [`${G}.goals`]: { [ana.id]: { pct: 85 } } });
  const asked: string[] = [];
  page.on('request', r => { if (r.url().includes('assignment_groups')) asked.push(r.url()); });
  await page.goto(`${CANVAS}/courses/${ana.id}/grades`);
  await expect(host(page).locator('.answer')).toBeVisible();
  await expect(host(page).locator('.period')).toHaveText(`Current grading period (${ana.period})`);
  // Only the current period's work is "remaining".
  expect(asked.some(n => n.includes('grading_period_id='))).toBe(true);
});

test('grade-goals (grading scenario): a course that hides final grades draws no box', async ({ context }) => {
  const page = await context.newPage();
  await pin(page);
  await grading(page);
  const wr = (await listing(page)).find(c => c.hidden)!;
  expect(wr.code).toMatch(/WRIT 202/);
  await page.goto(`${CANVAS}/courses/${wr.id}/grades`);
  await expect(page.locator('#grades_summary, #student-grades-right-content').first()).toBeAttached();
  await page.waitForTimeout(800);
  await expect(host(page)).toBeHidden(); // nothing drawn, and no empty gap left behind
  await expect(host(page).locator('.goal')).toHaveCount(0);
});
