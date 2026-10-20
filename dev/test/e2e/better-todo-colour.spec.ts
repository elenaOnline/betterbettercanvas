// Colour budget for the to-do views (design/spec/rice.md "Colour budget";
// design/v2/COLOUR-PASS.md): at rest, each view shows at most the course
// colours, one accent and danger, and danger only once per item.
import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';
import { budgetFor, checkBudget, measureColours } from './colour-budget.ts';

const NOW = '2026-10-21T10:00:00-07:00';
const PANEL = 'b2c-todo';

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 2400 }); // the whole panel on screen
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + '/');
  await expect(page.locator(`${PANEL} li[data-key]`).first()).toBeVisible();
}

const atRest = async (page: Page) => {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(350); // transitions settle
};

test.beforeEach(async ({ context, setSettings }) => {
  const p = await context.newPage();
  await p.request.post(CANVAS + '/__mock/reset');
  await p.close();
  await setSettings({ 'better-todo.count': 20 });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`every view at rest (${scheme}): ≤ course colours + 1 accent + danger; danger once per item`, async ({ context, setSettings }) => {
    if (scheme === 'dark') await setSettings({ 'palette.useDark': 'always' });
    const page = await context.newPage();
    await open(page);
    const budget = await budgetFor(page, PANEL);
    for (const view of ['List', 'Progress ring', 'Week', 'By course']) {
      await page.locator(`${PANEL} .vb-seg [role=radio][aria-label="${view}"]`).click();
      await atRest(page);
      // Tick one item so the tick's own colour is measured too.
      if (view === 'List') {
        await page.locator(`${PANEL} li[data-key] input[type=checkbox]:not(:checked):not(:disabled)`).first().click({ force: true });
        await atRest(page);
      }
      const paints = await measureColours(page, PANEL);
      const r = checkBudget(paints, budget);
      const coursesInView = Object.keys(r.byFamily).filter(k => k.startsWith('course:')).length;
      expect(r.extra.map(p => `${p.where} ${p.hex}`), `${view} (${scheme}): off-budget colour`).toEqual([]);
      expect(r.dangerTwice.map(k => `${k}: ${paints.filter(p => p.item === k).map(p => p.where + ' ' + p.hex).join(', ')}`), `${view} (${scheme}): danger in more than one place on a row`).toEqual([]);
      expect(r.families, `${view} (${scheme})`).toBeLessThanOrEqual(coursesInView + 2);
      // Danger lives on due text only.
      const dangerElsewhere = paints.filter(p => checkBudget([p], budget).byFamily.danger && !p.where.startsWith('span.due')).map(p => p.where);
      expect(dangerElsewhere, `${view} (${scheme}): danger outside due text`).toEqual([]);
      if (view === 'Week') {
        // Squares are tonal: no chromatic paint on any square.
        expect(paints.filter(p => p.where.startsWith('span.sq')), 'week squares').toEqual([]);
      }
      if (view === 'List') {
        // The tick is tonal, and course chips are tonal (surface + secondary text).
        expect(paints.filter(p => p.where.startsWith('span.box')), 'ticked box').toEqual([]);
        expect(paints.filter(p => p.where.startsWith('span.chip')), 'course chips').toEqual([]);
        const chipBg = await page.locator(`${PANEL} .chip.course`).first().evaluate(e => getComputedStyle(e).backgroundColor);
        expect(chipBg).not.toBe('rgba(0, 0, 0, 0)');
      }
      if (view === 'Progress ring') {
        // The ring's arcs are course colours only (no accent on the ring).
        expect(paints.filter(p => p.where.startsWith('rect') && !p.where.includes('trk')).length).toBe(0);
        const ringFamilies = new Set(paints.filter(p => p.where.startsWith('rect.trk')).map(p => checkBudget([p], budget).byFamily));
        for (const f of ringFamilies) for (const k of Object.keys(f)) expect(k.startsWith('course:'), `ring arc family ${k}`).toBe(true);
      }
    }
  });
}
