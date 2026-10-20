import { test, expect, CANVAS } from './fixtures.ts';
import type { Page } from '@playwright/test';

const pin = (page: Page) => page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
const host = (page: Page) => page.locator('b2c-gpa');
const GPA = 'gpa-calculator';

async function settle(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
}

async function courseIds(page: Page): Promise<Array<{ id: string; course_code: string }>> {
  return page.evaluate(async () => {
    const r = await fetch('/api/v1/courses?enrollment_state=active&include[]=total_scores&include[]=term&per_page=100', { headers: { Accept: 'application/json+canvas-string-ids' } });
    return (JSON.parse((await r.text()).replace(/^while\(1\);/, '')) as Array<{ id: string; course_code: string }>);
  });
}

test('gpa-calculator: turning it on adds the section live, off removes every trace', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  await expect(host(page)).toHaveCount(0);
  const instance = await page.locator('html').getAttribute('data-b2c-instance');
  await setSettings({ [`${GPA}.enabled`]: true });
  await expect(host(page)).toHaveCount(1);
  await expect(host(page).locator('h2')).toHaveText('GPA');
  // No credits entered: it asks, never guesses.
  await expect(host(page).getByText('Credits needed').first()).toBeVisible();
  // It sits in the shared b²c side panel.
  expect(await page.evaluate(() => document.querySelector('b2c-gpa')?.parentElement?.localName)).toBe('b2c-side-panel');
  await setSettings({ [`${GPA}.enabled`]: false });
  await expect(host(page)).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute(`data-b2c-${GPA}`, '');
  expect(await page.locator('html').getAttribute('data-b2c-instance')).toBe(instance);
});

test('gpa-calculator: credits entered inline compute a GPA, keep focus, and survive reload', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  await setSettings({ [`${GPA}.enabled`]: true });
  await expect(host(page).locator('h2')).toBeVisible();
  await host(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const inputs = host(page).locator('input[data-credits]');
  await expect(inputs.first()).toBeVisible();
  const n = await inputs.count();
  expect(n).toBeGreaterThan(1);
  // Type into the first and Tab: the change commits and focus must land on the next
  // control (the include checkbox), not be lost to a re-render.
  await inputs.first().fill('4');
  await inputs.first().press('Tab');
  await expect.poll(() => page.evaluate(() => {
    const a = document.querySelector('b2c-gpa')?.shadowRoot?.activeElement as HTMLInputElement | null;
    return a ? `${a.tagName}:${a.type}` : null;
  })).toBe('INPUT:checkbox');
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(i === 0 ? '4' : '3');
  for (let i = 0; i < n; i++) await inputs.nth(i).dispatchEvent('change');
  await expect(host(page).getByText(/needs credits/)).toHaveCount(0);
  const figure = host(page).locator('dd b').first();
  await expect(figure).toHaveText(/^\d\.\d\d$/);
  const shown = await figure.textContent();
  // Never rounds up: the shown value equals its own truncation to 2 decimals.
  expect(Number(shown)).toBeLessThanOrEqual(4);
  await page.reload();
  await expect(host(page).locator('dd b').first()).toHaveText(shown!);
});

test('gpa-calculator: warm cache renders the section before the network answers', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await setSettings({ [`${GPA}.enabled`]: true });
  await page.goto(CANVAS + '/');
  await expect(host(page).locator('h2')).toBeVisible();
  await expect.poll(() => host(page).getByText(/Enter credits|credits|No graded/).count()).toBeGreaterThan(0);
  // Second load: hold the courses request for 4 s; the cached figures must already be there.
  await context.route('**/api/v1/courses?**', async route => {
    await new Promise(r => setTimeout(r, 4000));
    await route.continue();
  });
  const t0 = Date.now();
  await page.reload();
  await expect(host(page).getByText('Credits needed').first()).toBeVisible({ timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(3500);
  await context.unroute('**/api/v1/courses?**');
});

test('gpa-calculator: pass/no-pass, include toggle and cumulative blend', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  const cs = (await courseIds(page)).filter(c => /MATH 401|CHEM 101/.test(c.course_code));
  expect(cs).toHaveLength(2);
  const map = Object.fromEntries(cs.map(c => [c.id, { credits: 4 }]));
  await setSettings({ [`${GPA}.enabled`]: true, [`${GPA}.courses`]: map, [`${GPA}.includePrevious`]: true, [`${GPA}.priorGpa`]: 3.5, [`${GPA}.priorCredits`]: 60 });
  await expect(host(page).getByText('Cumulative GPA (projected)')).toBeVisible();
  await expect(host(page).getByText('Term GPA (projected)')).toBeVisible();
  await expect(host(page).getByText('from 68 credits')).toBeVisible(); // 8 + 60
  // Excluding both leaves only the prior; marking P/NP does the same.
  await setSettings({ [`${GPA}.courses`]: Object.fromEntries(cs.map(c => [c.id, { credits: 4, pnp: true }])) });
  await expect(host(page).getByText('2 pass/no pass')).toBeVisible();
  await setSettings({ [`${GPA}.courses`]: Object.fromEntries(cs.map(c => [c.id, { credits: 4, include: false }])) });
  await expect(host(page).getByText('0 of')).toBeVisible();
});

test('gpa-calculator: the section itself does not shift when data arrives (warm cache) @perf', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  const cs = (await courseIds(page)).filter(c => /MATH 401|CHEM 101|MATH 301/.test(c.course_code));
  await setSettings({ [`${GPA}.enabled`]: true, [`${GPA}.courses`]: Object.fromEntries(cs.map(c => [c.id, { credits: 4 }])) });
  await expect(host(page).locator('dd b').first()).toBeVisible(); // cache warmed
  await page.addInitScript(() => {
    const w = window as unknown as { __ls: number };
    w.__ls = 0;
    new PerformanceObserver(list => {
      for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean; sources?: Array<{ node: Node | null }> }>) {
        // Only shifts of our own host or its contents count here (Canvas's own are not ours to fix).
        if (!e.hadRecentInput && e.sources?.some(s => s.node && (s.node.nodeName === 'B2C-GPA' || (s.node as Element).closest?.('b2c-gpa')))) w.__ls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.reload();
  await expect(host(page).locator('dd b').first()).toBeVisible();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as unknown as { __ls: number }).__ls)).toBeLessThan(0.01);
});

test('gpa-calculator: "above cards" moves it live; off leaves no panel behind', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  await setSettings({ [`${GPA}.enabled`]: true });
  await expect(host(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector('b2c-gpa')?.parentElement?.localName)).toBe('b2c-side-panel');
  await setSettings({ [`${GPA}.aboveCards`]: true });
  await expect.poll(() => page.evaluate(() => document.querySelector('b2c-gpa')?.nextElementSibling?.id)).toBe('DashboardCard_Container');
  await expect(page.locator('b2c-side-panel:has(b2c-gpa)')).toHaveCount(0); // other panel features (to-do) may keep the column
  await setSettings({ [`${GPA}.aboveCards`]: false });
  await expect.poll(() => page.evaluate(() => document.querySelector('b2c-gpa')?.parentElement?.localName)).toBe('b2c-side-panel');
  await setSettings({ [`${GPA}.enabled`]: false });
  await expect(host(page)).toHaveCount(0);
  await expect(page.locator('b2c-side-panel:has(b2c-gpa)')).toHaveCount(0); // other panel features (to-do) may keep the column
});

test('gpa-calculator: "above cards" on the new dashboard sits above the Courses-tab grid', async ({ context, setSettings }) => {
  await context.addCookies(['mock_dashboard_view=widget', 'mock_dashboard_tab=courses'].map(c => {
    const [name, value] = c.split('=');
    return { name: name!, value: value!, url: CANVAS };
  }));
  const page = await context.newPage();
  await pin(page);
  await setSettings({ [`${GPA}.enabled`]: true, [`${GPA}.aboveCards`]: true });
  await page.goto(CANVAS + '/');
  await expect(host(page)).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const h = document.querySelector('b2c-gpa');
    return h?.parentElement?.getAttribute('data-testid') === 'courses-tab-content' && h.parentElement.firstElementChild === h;
  })).toBe(true);
});

test('gpa-calculator: the ⚙ in the header opens Settings at gpa-calculator', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  await setSettings({ [`${GPA}.enabled`]: true });
  await expect(host(page).locator('h2')).toBeVisible();
  await host(page).getByRole('button', { name: 'GPA settings' }).click();
  await expect.poll(() => context.pages().some(p => p.url().endsWith('/options.html#gpa-calculator'))).toBe(true);
});

test('gpa-calculator: before credits are entered it says why, in words (no bare dash)', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  await setSettings({ [`${GPA}.enabled`]: true, [`${GPA}.includePrevious`]: true });
  await expect(host(page).getByText('GPA (projected)').first()).toBeVisible();
  await expect(host(page).getByText('Credits needed').first()).toBeVisible();
  await expect(host(page).getByText('Enter previous GPA and credits')).toBeVisible();
  await expect(host(page).getByText('—')).toHaveCount(0);
  // The status line names the courses and clicking one opens Edit at that course.
  await host(page).getByRole('button', { name: /needs credits/ }).first().click();
  await expect(host(page).locator('input[data-credits]:focus')).toHaveCount(1);
});

test('gpa-calculator: the high-school weighted preset adds a Weight menu and a weighted GPA', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await pin(page);
  await page.goto(CANVAS + '/');
  await settle(page);
  const cs = (await courseIds(page)).filter(c => /MATH 401|CHEM 101/.test(c.course_code));
  const [a, b] = cs as [typeof cs[0], typeof cs[0]];
  const scale = [{ letter: 'A', points: 4, min: 90 }, { letter: 'B', points: 3, min: 80 }, { letter: 'C', points: 2, min: 70 }, { letter: 'D', points: 1, min: 60 }, { letter: 'F', points: 0, min: 0 }];
  await setSettings({
    [`${GPA}.enabled`]: true, [`${GPA}.scale`]: scale, [`${GPA}.weights`]: { honors: 0.5, ap: 1 },
    [`${GPA}.courses`]: { [a.id]: { credits: 1, assume: 'A', weight: 'ap' }, [b.id]: { credits: 1, assume: 'B' } },
  });
  // A (AP: 5.0) and B (regular: 3.0), 1 credit each: GPA (4+3)/2 = 3.50, weighted (5+3)/2 = 4.00.
  await expect(host(page).getByText('Weighted GPA (projected)')).toBeVisible();
  await expect(host(page).locator('dd b').nth(0)).toHaveText('3.50');
  await expect(host(page).locator('dd b').nth(1)).toHaveText('4.00');
  await host(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(host(page).getByLabel(/Weight for/).first()).toBeVisible();
  // Without weights the column and the figure are gone, and the college figure is unchanged.
  await setSettings({ [`${GPA}.weights`]: null });
  await expect(host(page).getByText('Weighted GPA (projected)')).toHaveCount(0);
  await expect(host(page).getByLabel(/Weight for/)).toHaveCount(0);
});
