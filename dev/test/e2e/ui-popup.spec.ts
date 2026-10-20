// Popup (popup.html): the remote control. Targets a tab with ?tab=<id>,
// because a popup opened as a page has no "active tab" of its own.
import { test, expect, CANVAS, CUSTOM_CANVAS } from './fixtures.ts';
import type { BrowserContext, Page, Worker } from '@playwright/test';

/** The tab showing `url`. b²c can't read URLs of tabs it has no access to,
 *  so for those take the newest tab (call right after opening it). */
async function tabIdOf(sw: Worker, url: string): Promise<number> {
  return sw.evaluate(async u => {
    const tabs = await chrome.tabs.query({});
    return (tabs.find(t => t.url?.startsWith(u)) ?? tabs.reduce((a, b) => ((a.id ?? 0) > (b.id ?? 0) ? a : b))).id!;
  }, url);
}
async function openPopup(context: BrowserContext, sw: Worker, tabId?: number): Promise<Page> {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(new URL(`popup.html${tabId === undefined ? '' : `?tab=${tabId}`}`, sw.url()).href);
  return popup;
}

test('on a Canvas tab: health line, quick switches and dark mode apply live; it never scrolls', async ({ context, sw }, info) => {
  const canvas = await context.newPage();
  await canvas.goto(CANVAS + '/');
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  const popup = await openPopup(context, sw, await tabIdOf(sw, CANVAS));
  await expect(popup.locator('.host')).toHaveText('b2c-mock-school.instructure.com');
  await expect(popup.getByText(/Dashboard.*running/)).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Copy report' })).toBeVisible();

  await popup.getByRole('radio', { name: 'Always', exact: true }).click();
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  await popup.getByRole('radio', { name: 'Scheduled', exact: true }).click();
  await expect(popup.getByRole('group', { name: 'Schedule' })).toBeVisible();
  await popup.getByRole('radio', { name: 'Never', exact: true }).click();
  await expect(canvas.locator('html')).not.toHaveAttribute('data-b2c-dark', 'on');

  const assignments = popup.locator('[data-row="q-card-assignments"]').getByRole('switch');
  const was = await assignments.getAttribute('aria-checked');
  await assignments.click();
  await expect(assignments).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.sync.get('card-assignments.enabled'))['card-assignments.enabled'])).toBe(was !== 'true');

  const h = await popup.evaluate(() => ({ scroll: document.documentElement.scrollHeight, client: innerHeight, w: document.body.scrollWidth }));
  expect(h.scroll).toBeLessThanOrEqual(h.client);
  expect(h.w).toBeLessThanOrEqual(360);
  await popup.screenshot({ path: info.outputPath('popup-canvas.png') });
});

test('Show original on this page turns dark mode off in that tab only', async ({ context, sw, setSettings }) => {
  await setSettings({ 'palette.useDark': 'always' });
  const canvas = await context.newPage();
  await canvas.goto(CANVAS + '/');
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  const popup = await openPopup(context, sw, await tabIdOf(sw, CANVAS));
  const original = popup.locator('[data-row="original"]');
  await expect(original).toBeVisible();
  await original.getByRole('switch', { name: 'Show original on this page' }).click();
  await expect(canvas.locator('html')).not.toHaveAttribute('data-b2c-dark', 'on');
  await original.getByRole('switch').click();
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
});

test('pause switch, update-free footer, keyboard: Tab reaches every control with a visible focus', async ({ context, sw }) => {
  const canvas = await context.newPage();
  await canvas.goto(CANVAS + '/');
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  const popup = await openPopup(context, sw, await tabIdOf(sw, CANVAS));
  await expect(popup.getByRole('switch', { name: 'Pause b²c on all sites' })).toBeVisible();
  const names: string[] = [];
  for (let i = 0; i < 14; i++) {
    await popup.keyboard.press('Tab');
    const d = await popup.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      // Style chips draw their ring on the inner preview.
      const ring = el.querySelector('.mini') ?? el;
      return { name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '', outline: getComputedStyle(ring).outlineStyle, tag: el.tagName };
    });
    if (d.tag === 'BODY') break;
    expect(d.outline, d.name).not.toBe('none');
    names.push(d.name);
  }
  expect(names).toContain('Pause b²c on all sites');
  expect(names.some(n => n.startsWith('All settings'))).toBe(true);
  // Space on the focused pause switch pauses b²c everywhere.
  await popup.getByRole('switch', { name: 'Pause b²c on all sites' }).focus();
  await popup.keyboard.press('Space');
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.sync.get('core.paused'))['core.paused'])).toBe(true);
});

test('not a Canvas page: says so plainly', async ({ context, sw }) => {
  const blank = await context.newPage();
  await blank.goto('about:blank');
  const popup = await openPopup(context, sw, await tabIdOf(sw, 'about:blank'));
  await expect(popup.getByText('b²c runs on Canvas pages only.')).toBeVisible();
  await expect(popup.getByRole('radio', { name: 'Always', exact: true })).toBeDisabled();
  await expect(popup.getByRole('button', { name: /All settings/ })).toBeEnabled();
  await expect(popup.getByText('On this page')).toHaveCount(0);
  await expect(popup.locator('[data-row="original"]')).toHaveCount(0);
});

test('Canvas on a site b²c is not on yet: offers to turn it on and asks for that one site', async ({ context, sw }, info) => {
  const school = await context.newPage();
  await school.goto(CUSTOM_CANVAS + '/');
  const tabId = await tabIdOf(sw, CUSTOM_CANVAS);
  const popup = await context.newPage();
  // A popup opened as a page has no activeTab grant, and permission prompts
  // can't be answered headlessly: stand in for both, record what was asked.
  await popup.addInitScript(() => {
    const w = window as unknown as { asked: unknown[]; sent: unknown[] };
    w.asked = []; w.sent = [];
    chrome.scripting.executeScript = (async () => [{ result: { canvas: true, origin: 'https://canvas.b2c-mock.test' } }]) as never;
    chrome.permissions.request = (async (p: unknown) => { w.asked.push(p); return false; }) as never;
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((m: { type?: string }) => { if (m?.type === 'b2c:sites:offer') { w.sent.push(m); return Promise.resolve(null); } return send(m as never); }) as never;
  });
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(new URL(`popup.html?tab=${tabId}`, sw.url()).href);
  await expect(popup.getByText('Allow b²c on canvas.b2c-mock.test')).toBeVisible();
  await expect(popup.getByText('Your settings are safe; b²c just can’t reach this site yet.')).toBeVisible();
  const button = popup.getByRole('button', { name: 'Allow', exact: true });
  await expect(button).toBeVisible();
  await expect(popup.getByRole('radiogroup')).toHaveCount(0); // one card, nothing else
  await popup.screenshot({ path: info.outputPath('popup-offer.png') });
  await button.click();
  await expect(popup.getByText('Permission not granted · Try again')).toBeVisible();
  await expect(button).toBeEnabled();
  const w = await popup.evaluate(() => { const x = window as unknown as { asked: unknown[]; sent: unknown[] }; return { asked: x.asked, sent: x.sent }; });
  expect(w.asked).toEqual([{ origins: ['https://canvas.b2c-mock.test/*'] }]);
  expect(w.sent).toEqual([{ type: 'b2c:sites:offer', origin: 'https://canvas.b2c-mock.test', tabId }]);
});

test('On this page follows the page kind; the first-open line shows once', async ({ context, sw }) => {
  const canvas = await context.newPage();
  await canvas.goto(CANVAS + '/');
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  const id = await tabIdOf(sw, CANVAS);
  let popup = await openPopup(context, sw, id);
  await expect(popup.getByText('Everything here applies instantly. All settings… has the rest.')).toBeVisible();
  const onPage = popup.getByRole('region', { name: 'On this page' });
  await expect(onPage.getByRole('switch')).toHaveCount(4);
  await expect(onPage.getByText('Assignments on cards')).toBeVisible();
  await popup.close();

  const course = await canvas.evaluate(async () => ((await (await fetch('/api/v1/courses?per_page=50')).json()) as { id: string }[])[0]!.id);
  await canvas.goto(`${CANVAS}/courses/${course}/grades`);
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  popup = await openPopup(context, sw, id);
  await expect(popup.getByText(/Grades ·/)).toBeVisible();
  await expect(popup.getByText('Everything here applies instantly. All settings… has the rest.')).toHaveCount(0);
  const labels = await popup.getByRole('region', { name: 'On this page' }).locator('.row-label').allTextContents();
  expect(labels).toEqual(['Grade goals', 'GPA calculator']);

  // All settings… opens the settings page at this page's section (the SW
  // reuses the settings tab install opened).
  await popup.getByRole('button', { name: /All settings/ }).click();
  await expect.poll(() => context.pages().filter(p => /options\.html#grades$/.test(p.url())).length).toBe(1);
  const settings = context.pages().find(p => /options\.html#grades$/.test(p.url()))!;
  await expect(settings.locator('#insp .i-crumbs')).toContainText('Grades table'); // the Studio opens on the Grades page
});

test('another Canvas extension on the page gets one quiet line', async ({ context, sw }) => {
  const canvas = await context.newPage();
  await canvas.goto(CANVAS + '/');
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  await canvas.evaluate(() => document.body.append(document.createElement('bettercampus-components')));
  const popup = await openPopup(context, sw, await tabIdOf(sw, CANVAS));
  await expect(popup.getByText('BetterCampus is also changing this page. Turn it off to see b²c on its own.')).toBeVisible();
  expect(await sw.evaluate(async () => (await chrome.storage.sync.get('core.paused'))['core.paused'])).not.toBe(true);
});

test('Canvas’s own widget-dashboard dark mode: the popup and the Studio say so in one line', async ({ context, sw, setSettings }) => {
  const host = new URL(CANVAS).hostname;
  await context.addCookies(Object.entries({ mock_delay: '0', mock_dashboard_view: 'widget', mock_dashboard_tab: 'dashboard', mock_widget_dark: '2' }).map(([name, value]) => ({ name, value, domain: host, path: '/' })));
  await setSettings({ 'palette.useDark': 'never', 'palette.light': 'sepia' });
  const canvas = await context.newPage();
  await canvas.goto(CANVAS + '/');
  await canvas.waitForFunction(() => !!document.getElementById('widget-dashboard-dark-mode'));
  const line = 'Canvas’s own dark mode is on for the new dashboard. Turn it off there to use a light theme on it.';
  const popup = await openPopup(context, sw, await tabIdOf(sw, CANVAS));
  await expect(popup.getByText(line)).toBeVisible();
  const studio = await context.newPage();
  await studio.setViewportSize({ width: 1440, height: 900 });
  await studio.goto(new URL('options.html', sw.url()).href);
  await expect(studio.locator('#tabsline')).toContainText(line);
});
