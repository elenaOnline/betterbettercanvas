// Screenshots of the pins dock for review (Design / hand-feel). Opt-in:
// B2C_SHOTS=1. Headless, written to .scratch/pins/shots.
import path from 'node:path';
import { test, expect, CANVAS } from './fixtures.ts';

const OUT = path.resolve(import.meta.dirname, '../../.scratch/pins/shots');
test.skip(!process.env.B2C_SHOTS, 'opt-in screenshots');

const PINS = [
  { id: 'a', label: 'Algebra this week', target: { kind: 'module', course: '118200', which: 'this-week' } },
  { id: 'c', label: 'Chem this week', target: { kind: 'module', course: '118214', which: 'this-week' } },
  { id: 'w', label: 'Writing this week', target: { kind: 'module', course: '118228', which: 'this-week' } },
  { id: 'f', label: 'Algebra lecture', target: { kind: 'latest-file', course: '118200', match: 'lecture' } },
  { id: 'n', label: 'Next due', target: { kind: 'next-due' } },
];

for (const view of ['cards', 'widget'] as const) {
  test(`dock on the ${view} dashboard and a course page`, async ({ context, setSettings }) => {
    await context.addCookies(Object.entries({ mock_scenario: 'weeks', mock_delay: '0', mock_dashboard_view: view, mock_dashboard_tab: 'courses' }).map(([name, value]) => ({ name, value, url: CANVAS + '/' })));
    await setSettings({ 'pins.enabled': true, 'pins.list': PINS });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => localStorage.setItem('b2c_now', '2026-10-21T10:00:00-07:00'));
    await page.goto(CANVAS + '/');
    await expect(page.locator('b2c-pins-dock a.pin').first()).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/dashboard-${view}.png` });
    await page.locator('b2c-pins-dock').getByRole('button', { name: 'Edit pins' }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/dashboard-${view}-editor.png` });
    if (view === 'cards') {
      await page.goto(CANVAS + '/courses/118200/modules');
      await expect(page.locator('b2c-pins-dock a.pin').first()).toBeVisible();
      await page.screenshot({ path: `${OUT}/course-nav.png` });
      await page.locator('b2c-pins-dock').getByRole('button', { name: 'Edit pins' }).click();
      await page.locator('b2c-pins-dock').getByRole('button', { name: 'New pin…' }).click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/course-nav-editor.png` });
    }
  });
}
