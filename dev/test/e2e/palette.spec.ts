// dark-mode e2e: live toggling, pre-paint, Show original, Match system,
// Scheduled boundaries, frames (RCE), authored colours, InstUI (layer c).
// Specimen screenshots with a light-island audit are in dark-mode-specimens.spec.ts.
import type { Page, Worker } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const BRAND = '/dist/brandable_css/0e0c27faeac181dbf0ed272302a09aa7/variables-9dec371ad57e3dd0396f0b2eddb63479.css';
const COMMON = '/dist/brandable_css/new_styles_normal_contrast/bundles/common-701cbe13bb.css';
const RCE_CSS = '/dist/brandable_css/new_styles_normal_contrast/bundles/what_gets_loaded_inside_the_tinymce_editor-58f3523d19.css';

const DARK = 'rgb(24, 33, 45)'; // Design's dark preset bg #18212d
const attr = (p: Page) => p.evaluate(() => document.documentElement.getAttribute('data-b2c-dark'));
const bodyBg = (p: Page) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const css = (p: Page, sel: string, prop: string) =>
  p.evaluate(([s, k]) => getComputedStyle(document.querySelector(s!)!).getPropertyValue(k!), [sel, prop]);

const EQ = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20"><text x="0" y="15" font-size="14" fill="#000">x²+1</text></svg>');
const DIAGRAM = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M2 38L38 2" stroke="#000" stroke-width="2"/></svg>');

/** A Canvas-shaped page full of teacher-authored HTML, plus two RCE-style frames. */
const USER_CONTENT_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title>
<link rel="stylesheet" href="${BRAND}"><link rel="stylesheet" href="${COMMON}">
</head><body class="with-left-side"><div id="application" class="ic-app"><div id="wrapper" class="ic-Layout-wrapper">
<div id="main" class="ic-Layout-columns"><div id="not_right_side" class="ic-app-main-content"><div id="content-wrapper"><div id="content">
<div class="user_content" id="uc">
  <p id="plain">Plain text</p>
  <p><span id="red" style="color: #e03e2d;">TinyMCE red</span>
     <span id="oddred" style="color: rgb(200, 30, 60);">odd red</span>
     <span id="nearblack" style="color: #1a1a1a;">near black</span>
     <span id="grey" style="color: #777;">grey</span>
     <font id="font" color="#0000cc">font tag</font></p>
  <p><span id="hl" style="background-color: #fbeeb8;">highlight <span id="hlred" style="color: #e03e2d;">red on highlight</span></span></p>
  <div id="whitebox" style="background-color: #fff; padding: 8px">white box <a id="wblink" href="#">link</a></div>
  <div id="white2" style="background-color: #ffffff;">white2</div>
  <div id="tint" style="background-color: #fff8dc;">near-white but tinted</div>
  <table border="1"><tr><th id="th">Head</th><td id="tdbg" bgcolor="#c2e0f4">blue cell</td><td id="td">plain</td></tr></table>
  <img id="eq" class="equation_image" alt="x squared" src="data:image/svg+xml,${EQ}">
  <img id="diagram" alt="line" src="data:image/svg+xml,${DIAGRAM}">
  <iframe id="rce1" class="tox-edit-area__iframe" srcdoc="<!doctype html><html><head><link rel=stylesheet href=${RCE_CSS}></head><body id=tinymce class=mce-content-body><p>Editor text</p></body></html>"></iframe>
  <iframe id="rce2" class="tox-edit-area__iframe"></iframe>
</div></div></div></div></div></div></div>
<script>
  // TinyMCE-style: an about:blank frame written by script.
  const d = document.getElementById('rce2').contentDocument;
  d.open(); d.write('<!doctype html><html><head><link rel=stylesheet href=${RCE_CSS}></head><body id=tinymce class=mce-content-body><p>Written</p></body></html>'); d.close();
</script></body></html>`;

/** emotion-style runtime CSS (production InstUI inserts rules via CSSOM). */
const INSTUI_PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${BRAND}"><link rel="stylesheet" href="${COMMON}">
<style data-emotion="css"></style></head><body><div id="panel" class="css-abc123-view">InstUI panel <span id="ink" class="css-def456-text">text</span></div>
<script>
  const s = document.querySelector('style[data-emotion]').sheet;
  s.insertRule('.css-abc123-view{background:#FFFFFF;border:1px solid #C7CDD1;padding:12px}', 0);
  s.insertRule('.css-def456-text{color:#273540}', 1);
</script></body></html>`;

// (Playwright's trace recorder wraps insertRule itself, so check our marker, not toString.)
const patched = (p: Page) => p.evaluate(() => Symbol.for('b2c.instui') in CSSStyleSheet.prototype);

async function fixture(page: Page, path: string, html: string) {
  await page.route(CANVAS + path, r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
}

async function original(sw: Worker, op: 'on' | 'off' | 'query') {
  return sw.evaluate(async op => {
    const [tab] = await chrome.tabs.query({ url: 'https://b2c-mock-school.instructure.com/*' });
    return chrome.tabs.sendMessage(tab!.id!, { type: 'b2c:dark:original', op });
  }, op);
}

test('turns on and off live, with no reload, and off removes every trace', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'never' });
  const page = await context.newPage();
  await fixture(page, '/b2c-fixture/uc', USER_CONTENT_PAGE);
  await page.goto(CANVAS + '/b2c-fixture/uc');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  const lightBg = await bodyBg(page);
  const marker = await page.evaluate(() => ((window as unknown as { __mark: number }).__mark = 1));

  await setSettings({ 'palette.useDark': 'always', 'palette.dimImages': true });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  expect(await bodyBg(page)).toBe(DARK);
  await expect(page.locator('#oddred')).toHaveAttribute('data-b2c-ink', 'lift');

  await setSettings({ 'palette.useDark': 'never' });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-dark', /.*/);
  expect(await bodyBg(page)).toBe(lightBg);
  const traces = await page.evaluate(() => ({
    attrs: [...document.documentElement.attributes].map(a => a.name).filter(n => /^data-b2c-(dark|theme|scheme|slot|nav-style|dim-images)/.test(n)),
    ink: document.querySelectorAll('[data-b2c-ink], [data-b2c-ink-bg]').length,
    inline: document.documentElement.style.cssText,
    inkVar: document.querySelector<HTMLElement>('#oddred')!.style.getPropertyValue('--b2c-ink'),
  }));
  expect(traces).toEqual({ attrs: [], ink: 0, inline: '', inkVar: '' });
  expect(await page.evaluate(() => (window as unknown as { __mark: number }).__mark)).toBe(marker); // no reload
});

test('hand-feel: a popup toggle reaches the page fast, with transitions suppressed for the flip', async ({ context, setSettings, sw }) => {
  await setSettings({ 'palette.useDark': 'never' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  await page.evaluate(() => {
    const w = window as unknown as { __flip: { at: number; switching: boolean } | null };
    w.__flip = null;
    new MutationObserver(() => {
      const r = document.documentElement;
      if (!w.__flip && r.getAttribute('data-b2c-dark') === 'on') w.__flip = { at: Date.now(), switching: false };
      if (w.__flip && r.hasAttribute('data-b2c-switching')) w.__flip.switching = true;
    }).observe(document.documentElement, { attributes: true });
  });
  const t0 = await sw.evaluate(async () => {
    const t = Date.now();
    await chrome.storage.sync.set({ 'palette.useDark': 'always' });
    return t;
  });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  const flip = await page.evaluate(() => (window as unknown as { __flip: { at: number; switching: boolean } }).__flip);
  const ms = flip.at - t0;
  console.log(`[hand-feel] storage write → dark attribute: ${ms} ms`);
  expect(ms).toBeLessThan(100);
  expect(flip.switching).toBe(true);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-switching', /.*/);
});

test('presets and a custom palette apply live', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'always' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  expect(await bodyBg(page)).toBe(DARK);
  await setSettings({ 'palette.dark': 'black' });
  await expect.poll(() => bodyBg(page)).toBe('rgb(0, 0, 0)');
  await setSettings({ 'palette.dark': 'custom', 'palette.darkRoles': { bg: '#102030', link: '#ff00ff' } });
  await expect.poll(() => bodyBg(page)).toBe('rgb(16, 32, 48)');
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--ic-link-color').trim())).toBe('#ff00ff');
});

test('pre-paint: no light frame on new tab, navigation and hard reload under 6x throttle', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'always' });
  const warm = await context.newPage();
  await warm.goto(CANVAS + '/'); // writes the mirror
  await expect(warm.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  await warm.close();

  const page = await context.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __b2c: { attrAt: number | null; bodyAtAttr: boolean | null } };
    const on = () => document.documentElement?.getAttribute('data-b2c-dark') === 'on';
    w.__b2c = { attrAt: on() ? 0 : null, bodyAtAttr: on() ? !!document.body : null };
    new MutationObserver(() => {
      if (w.__b2c.attrAt === null && on()) {
        w.__b2c.attrAt = performance.now();
        w.__b2c.bodyAtAttr = !!document.body;
      }
    }).observe(document, { attributes: true, childList: true, subtree: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const probe = () =>
    page.evaluate(async () => {
      const fp = await new Promise<number>(res => {
        new PerformanceObserver(l => {
          const e = l.getEntries().find(x => x.name === 'first-paint');
          if (e) res(e.startTime);
        }).observe({ type: 'paint', buffered: true });
      });
      const w = window as unknown as { __b2c: { attrAt: number | null; bodyAtAttr: boolean | null } };
      return { ...w.__b2c, fp, html: getComputedStyle(document.documentElement).backgroundColor };
    });
  for (const step of ['new tab', 'navigation', 'hard reload'] as const) {
    if (step === 'new tab') await page.goto(CANVAS + '/courses');
    else if (step === 'navigation') await page.goto(CANVAS + '/calendar');
    else await page.reload();
    const r = await probe();
    expect(r.attrAt, step).not.toBeNull();
    expect(r.bodyAtAttr, step).toBe(false);
    expect(r.attrAt!, step).toBeLessThan(r.fp);
    expect(r.html, step).toBe(DARK);
  }
});

test('Show original: per tab, before first paint on reload, lapses on navigation', async ({ context, setSettings, sw }) => {
  await setSettings({ 'palette.useDark': 'always' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  expect(await original(sw, 'query')).toMatchObject({ original: false, dark: true });
  expect(await original(sw, 'on')).toMatchObject({ original: true, dark: true });
  expect(await attr(page)).toBeNull();
  // a settings change re-applies the mirror; the override holds
  await setSettings({ 'palette.dark': 'gray' });
  await page.waitForTimeout(300);
  expect(await attr(page)).toBeNull();
  // reload: boot honours it before first paint
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-b2c-dark'))).toBeNull();
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  expect(await original(sw, 'query')).toMatchObject({ original: true, dark: true });
  // off restores dark live
  expect(await original(sw, 'off')).toMatchObject({ original: false, dark: true });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  // on again, then navigate: it lapses
  await original(sw, 'on');
  await page.goto(CANVAS + '/calendar');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  expect(await original(sw, 'query')).toMatchObject({ original: false, dark: true });
  // with dark mode off the reply says so
  await setSettings({ 'palette.useDark': 'never' });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-dark', /.*/);
  expect(await original(sw, 'query')).toMatchObject({ original: false, dark: false });
});

test('Match system follows the OS appearance live', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'system' });
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  expect(await attr(page)).toBeNull();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-dark', /.*/);
  // and pre-paint on the next load
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-b2c-dark'))).toBe('on');
});

test('Scheduled flips exactly at the boundary, no reload', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'schedule', 'palette.start': '20:00', 'palette.end': '08:00' });
  const page = await context.newPage();
  // Pin "now" (ctx.now) 2.5 s before 20:00 local.
  await page.addInitScript(() => {
    if (!localStorage.getItem('b2c_now')) {
      const d = new Date();
      d.setHours(19, 59, 57, 500);
      localStorage.setItem('b2c_now', d.toISOString());
    }
  });
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  await expect.poll(() => attr(page), { timeout: 1500 }).toBeNull();
  const t0 = Date.now();
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on', { timeout: 6000 });
  expect(Date.now() - t0).toBeLessThan(5000);
});

test('frames: the RCE editor (srcdoc and written about:blank) is dark and follows toggles', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'always' });
  const page = await context.newPage();
  await fixture(page, '/b2c-fixture/uc', USER_CONTENT_PAGE);
  await page.goto(CANVAS + '/b2c-fixture/uc');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  for (const id of ['#rce1', '#rce2']) {
    const f = page.frameLocator(id);
    await expect(f.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
    await expect.poll(() => f.locator('body').evaluate(b => getComputedStyle(b).backgroundColor)).toBe(DARK);
  }
  await setSettings({ 'palette.useDark': 'never' });
  for (const id of ['#rce1', '#rce2']) await expect(page.frameLocator(id).locator('html')).not.toHaveAttribute('data-b2c-dark', /.*/);
  await setSettings({ 'palette.useDark': 'always' });
  for (const id of ['#rce1', '#rce2']) await expect(page.frameLocator(id).locator('html')).toHaveAttribute('data-b2c-dark', 'on');
});

test('authored colours stay readable and keep their meaning', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'always' });
  const page = await context.newPage();
  await fixture(page, '/b2c-fixture/uc', USER_CONTENT_PAGE);
  await page.goto(CANVAS + '/b2c-fixture/uc');
  await expect(page.locator('#oddred')).toHaveAttribute('data-b2c-ink', 'lift');
  const c = (s: string, p = 'color') => css(page, s, p);
  expect(await c('#plain')).toBe('rgb(232, 237, 244)'); // text role
  expect(await c('#nearblack')).toBe('rgb(232, 237, 244)');
  expect(await c('#grey')).toBe('rgb(190, 195, 201)'); // text-secondary
  // saturated: lifted, still red (pre-paint rule for the RCE palette, runtime for the rest)
  for (const s of ['#red', '#oddred', '#font']) {
    const [r, g, b] = (await c(s)).match(/\d+/g)!.map(Number);
    const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    expect(lum, s).toBeGreaterThan(120);
  }
  expect(await c('#red')).toBe('rgb(255, 114, 95)');
  // authored highlight keeps its colour, with dark text; red on it keeps the authored pair
  expect(await c('#hl', 'background-color')).toBe('rgb(251, 238, 184)');
  expect(await c('#hl')).toBe('rgb(27, 35, 48)');
  expect(await c('#hlred')).toBe('rgb(224, 62, 45)');
  // near-white authored backgrounds stop being paper islands
  for (const s of ['#whitebox', '#white2']) expect(await c(s, 'background-color'), s).toBe('rgba(0, 0, 0, 0)');
  // …but only low-chroma ones: a light tint is meaningful and keeps its pair
  expect(await c('#tint', 'background-color')).toBe('rgb(255, 248, 220)');
  expect(await c('#tint')).toBe('rgb(27, 35, 48)');
  expect(await c('#whitebox')).toBe('rgb(232, 237, 244)');
  // table: coloured cell keeps colour with dark text; th raised
  expect(await c('#tdbg', 'background-color')).toBe('rgb(194, 224, 244)');
  expect(await c('#tdbg')).toBe('rgb(27, 35, 48)');
  expect(await c('#th', 'background-color')).toBe('rgb(43, 53, 65)');
  // images: equations inverted to read as text; transparent diagrams on a white plate
  expect(await c('#eq', 'filter')).toContain('invert(1)');
  expect(await c('#diagram', 'background-color')).toBe('rgb(255, 255, 255)');
  await page.screenshot({ path: '.scratch/dark/shots/fixture-user-content-dark.png', fullPage: true });
});

test('calendar: borderless mini-month with a link ring for today; event chips with a course edge and tinted fill', async ({ context, setSettings }) => {
  await context.addCookies([{ name: 'mock_delay', value: '0', domain: 'b2c-mock-school.instructure.com', path: '/' }]);
  await setSettings({ 'palette.useDark': 'always' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/calendar');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  await page.locator('#minical .fc-content-skeleton .fc-today').waitFor();
  await page.locator('#calendar-app .fc-event').first().waitFor();
  const r = await page.evaluate(() => {
    const cs = (el: Element) => getComputedStyle(el);
    const days = [...document.querySelectorAll('#minical td')].filter(td => !td.closest('.event'));
    const visibleBorders = days.filter(td => {
      const s = cs(td);
      return ['Top', 'Right', 'Bottom', 'Left'].some(k => parseFloat(s.getPropertyValue(`border-${k.toLowerCase()}-width`)) > 0 && !/rgba\(0, 0, 0, 0\)/.test(s.getPropertyValue(`border-${k.toLowerCase()}-color`)));
    }).length;
    const today = cs(document.querySelector('#minical .fc-content-skeleton .fc-today')!);
    const todayBg = cs(document.querySelector('#minical .fc-bg .fc-today, #minical .fc-widget-content .fc-today')!).backgroundColor;
    const link = getComputedStyle(document.body).getPropertyValue('--b2c-dm-link');
    const ev = document.querySelector('#calendar-app .fc-event')!;
    const e = cs(ev);
    const corner = getComputedStyle(document.documentElement).getPropertyValue('--b2c-corner').trim();
    return { visibleBorders, ring: today.boxShadow, radius: today.borderTopLeftRadius, corner, todayBg, link, ev: { bg: e.backgroundColor, color: e.color, top: e.borderTopColor, left: e.borderLeftColor, shadow: e.boxShadow } };
  });
  expect(r.visibleBorders).toBe(0);
  expect(r.ring).toContain('inset');
  expect(r.ring).not.toBe('none');
  expect(r.radius).toBe(r.corner); // square styling: follows --b2c-corner, never round
  expect(r.todayBg).toBe('rgba(0, 0, 0, 0)');
  expect(r.ev.top).toBe('rgba(0, 0, 0, 0)');
  expect(r.ev.left).toBe(r.ev.color); // course-colour edge
  expect(r.ev.shadow).toContain('inset');
  expect(r.ev.bg).not.toBe(DARK); // tinted, not plain bg
  expect(r.ev.bg).not.toBe('rgb(255, 255, 255)');
  await page.locator('#minical').screenshot({ path: '.scratch/dark/shots/calendar-minical-dark.png' });
  await page.locator('#calendar-app .fc-view-container').screenshot({ path: '.scratch/dark/shots/calendar-events-dark.png' });
});

test('InstUI runtime styles (layer c): dark when on, original when toggled off', async ({ context, setSettings }) => {
  // No theme: InstUI's colours are untouched. (The page world is patched only
  // for a theme or Canvas corners; shape's corner token is on by default.)
  await setSettings({ 'palette.useDark': 'never' });
  const page = await context.newPage();
  await fixture(page, '/b2c-fixture/instui', INSTUI_PAGE);
  await page.goto(CANVAS + '/b2c-fixture/instui');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  expect(await patched(page)).toBe(await page.evaluate(() => document.documentElement.hasAttribute('data-b2c-shape')));
  expect(await css(page, '#panel', 'background-color')).toBe('rgb(255, 255, 255)');
  // On: covered from the next load (the patch must run before Canvas's scripts).
  await setSettings({ 'palette.useDark': 'always' });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  expect(await patched(page)).toBe(true);
  expect(await css(page, '#panel', 'background-color')).toBe(DARK);
  expect(await css(page, '#ink', 'color')).toBe('rgb(232, 237, 244)');
  expect(await css(page, '#panel', 'border-top-color')).toBe('rgb(68, 78, 91)');
  // Toggled off live: every rewritten rule falls back to its original literal.
  await setSettings({ 'palette.useDark': 'never' });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-dark', /.*/);
  expect(await css(page, '#panel', 'background-color')).toBe('rgb(255, 255, 255)');
  expect(await css(page, '#ink', 'color')).toBe('rgb(39, 53, 64)');
  expect(await css(page, '#panel', 'border-top-color')).toBe('rgb(199, 205, 209)');
});

test('quiz-taking pages: no InstUI patch and no feature code', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'always', 'core.quizSafe': 'nothing' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses/101/quizzes/7/take');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  expect(await attr(page)).toBeNull();
  expect(await patched(page)).toBe(false);
});

// ── v2: the palette engine paints any theme; shape tokens; Director rulings ──

const LIGHT_ROLES = { bg: '#fbf7ee', surface: '#fffdf8', surfaceRaised: '#f2ecdf', border: '#d8cfbd', text: '#2a2420', textSecondary: '#5a4f45', textTertiary: '#6b5f53', link: 'school' };
const theme = (p: Page) =>
  p.evaluate(() => ['data-b2c-theme', 'data-b2c-scheme', 'data-b2c-slot', 'data-b2c-dark'].map(a => document.documentElement.getAttribute(a)));

test('a custom LIGHT theme restyles Canvas through the same engine, live, and Canvas is the identity', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'never', 'palette.light': 'canvas' });
  const page = await context.newPage();
  await fixture(page, '/b2c-fixture/uc', USER_CONTENT_PAGE);
  await page.goto(CANVAS + '/b2c-fixture/uc');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  expect(await theme(page)).toEqual([null, null, null, null]); // Canvas: nothing applies
  const canvasBg = await bodyBg(page);
  const linkVar = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--ic-link-color').trim().toLowerCase());
  const schoolLink = await linkVar();

  await setSettings({ 'palette.light': 'custom', 'palette.lightRoles': LIGHT_ROLES });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  expect(await theme(page)).toEqual(['on', 'light', 'l', null]);
  expect(await bodyBg(page)).toBe('rgb(251, 247, 238)');
  const c = (s: string, p = 'color') => css(page, s, p);
  expect(await c('#plain')).toBe('rgb(42, 36, 32)'); // text role
  expect(await c('html', 'color-scheme')).toBe('light');
  // link stays the school's own (from its brand config, unlifted) on a light theme
  expect(schoolLink).toMatch(/^#[0-9a-f]{6}$/);
  expect(await linkVar()).toBe(schoolLink);
  // dark-only calls stay off: authored red as authored, equations not inverted, no white plate
  expect(await c('#red')).toBe('rgb(224, 62, 45)');
  expect(await c('#oddred')).toBe('rgb(200, 30, 60)');
  expect(await c('#eq', 'filter')).toBe('none');
  // …while the universal ones apply: white wrappers clear, th raised
  expect(await c('#whitebox', 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(await c('#th', 'background-color')).toBe('rgb(242, 236, 223)');
  // the RCE frame follows the light theme too
  await expect(page.frameLocator('#rce1').locator('html')).toHaveAttribute('data-b2c-scheme', 'light');
  await expect.poll(() => page.frameLocator('#rce1').locator('body').evaluate(b => getComputedStyle(b).backgroundColor)).toBe('rgb(251, 247, 238)');
  await page.screenshot({ path: '.scratch/dark/shots/fixture-user-content-light-custom.png', fullPage: true });

  // a bundled light theme, live
  await setSettings({ 'palette.light': 'sepia' });
  await expect.poll(() => bodyBg(page)).toBe('rgb(243, 234, 214)');
  // back to Canvas: every trace gone
  await setSettings({ 'palette.light': 'canvas' });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-theme', /.*/);
  expect(await bodyBg(page)).toBe(canvasBg);
});

test('Use dark theme: Match system switches between the Light and Dark theme slots live, pre-paint on reload', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'system', 'palette.light': 'sepia', 'palette.dark': 'warm' });
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-slot', 'l');
  expect(await bodyBg(page)).toBe('rgb(243, 234, 214)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-slot', 'd');
  expect(await theme(page)).toEqual(['on', 'dark', 'd', 'on']);
  expect(await bodyBg(page)).toBe('rgb(37, 31, 25)');
  await page.reload();
  expect(await page.evaluate(() => [document.documentElement.getAttribute('data-b2c-slot'), document.body ? null : 'pre-body'])).toEqual(['d', null]);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-slot', 'l');
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-dark', /.*/);
});

test('pre-paint: a light theme is in place before first paint under 6x throttle', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'never', 'palette.light': 'custom', 'palette.lightRoles': LIGHT_ROLES });
  const warm = await context.newPage();
  await warm.goto(CANVAS + '/');
  await expect(warm.locator('html')).toHaveAttribute('data-b2c-theme', 'on');
  await warm.close();
  const page = await context.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __t: { at: number | null; body: boolean | null } };
    const on = () => document.documentElement?.getAttribute('data-b2c-theme') === 'on';
    w.__t = { at: on() ? 0 : null, body: on() ? !!document.body : null };
    new MutationObserver(() => {
      if (w.__t.at === null && on()) w.__t = { at: performance.now(), body: !!document.body };
    }).observe(document, { attributes: true, childList: true, subtree: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.goto(CANVAS + '/courses');
  const r = await page.evaluate(async () => {
    const fp = await new Promise<number>(res => new PerformanceObserver(l => {
      const e = l.getEntries().find(x => x.name === 'first-paint');
      if (e) res(e.startTime);
    }).observe({ type: 'paint', buffered: true }));
    const w = window as unknown as { __t: { at: number | null; body: boolean | null } };
    return { ...w.__t, fp, bg: getComputedStyle(document.documentElement).backgroundColor };
  });
  expect(r.at).not.toBeNull();
  expect(r.body).toBe(false);
  expect(r.at!).toBeLessThan(r.fp);
  expect(r.bg).toBe('rgb(251, 247, 238)');
});

const HC_PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${BRAND}">
<link rel="stylesheet" href="/dist/brandable_css/default/variables-high_contrast-9dec371ad57e3dd0396f0b2eddb63479.css">
<link rel="stylesheet" href="${COMMON}"></head><body><p id="t">High contrast text <a id="l" href="#">link</a></p><div id="card" class="ic-DashboardCard">card</div></body></html>`;

test('High Contrast UI + a dark theme reaches AAA (only failing roles fall back to Black)', async ({ context, setSettings }) => {
  const weak = { bg: '#3a3a3a', surface: '#444444', surfaceRaised: '#4c4c4c', text: '#bbbbbb', link: '#6699cc' };
  await setSettings({ 'palette.useDark': 'always', 'palette.dark': 'custom', 'palette.darkRoles': weak });
  const page = await context.newPage();
  await fixture(page, '/b2c-fixture/hc', HC_PAGE);
  await page.goto(CANVAS + '/b2c-fixture/hc');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-scheme', 'dark');
  const r = await page.evaluate(() => {
    // Any CSS colour (oklch included) → sRGB through a canvas pixel.
    const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const lum = (c: string) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const [r, g, b] = Array.from(cx.getImageData(0, 0, 1, 1).data).slice(0, 3).map(x => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
    const body = getComputedStyle(document.body).backgroundColor;
    const card = getComputedStyle(document.getElementById('card')!).backgroundColor;
    const text = getComputedStyle(document.getElementById('t')!).color;
    const link = getComputedStyle(document.getElementById('l')!).color;
    return { text: Math.min(ratio(text, body), ratio(text, card)), link: Math.min(ratio(link, body), ratio(link, card)), border: getComputedStyle(document.documentElement).getPropertyValue('--b2c-dm-border').trim() };
  });
  expect(r.text).toBeGreaterThanOrEqual(7);
  expect(r.link).toBeGreaterThanOrEqual(7);
});

const TOX_PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${BRAND}"><link rel="stylesheet" href="${COMMON}">
<style>/* stand-in for TinyMCE's oxide skin */
.tox .tox-editor-header,.tox .tox-toolbar__primary,.tox .tox-statusbar{background:#fff;border-color:#ccc}
.tox .tox-tbtn{color:#222f3e;background:transparent}.tox .tox-tbtn svg{fill:#222f3e}
.tox .tox-tbtn:hover:not(.tox-tbtn--disabled){background:#dee0e2}.tox .tox-statusbar a{color:rgba(34,47,62,.7)}</style></head>
<body><div class="tox tox-tinymce"><div class="tox-editor-container"><div class="tox-editor-header"><div class="tox-toolbar-overlord"><div class="tox-toolbar__primary"><div class="tox-toolbar__group">
<button id="bold" class="tox-tbtn" type="button"><span class="tox-icon"><svg width="24" height="24"><path id="glyph" d="M4 4h16v16H4z"/></svg></span></button>
</div></div></div></div><div class="tox-edit-area"><iframe class="tox-edit-area__iframe" srcdoc="<p>Body</p>"></iframe></div>
<div class="tox-statusbar"><div class="tox-statusbar__text-container"><span class="tox-statusbar__wordcount">12 words</span></div></div></div></div></body></html>`;

test('the rich content editor chrome (.tox) follows the theme (parity #1)', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'always' });
  const page = await context.newPage();
  await fixture(page, '/b2c-fixture/tox', TOX_PAGE);
  await page.goto(CANVAS + '/b2c-fixture/tox');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-scheme', 'dark');
  expect(await css(page, '.tox-toolbar__primary', 'background-color')).toBe('rgb(33, 43, 55)'); // surface
  expect(await css(page, '.tox-statusbar', 'background-color')).toBe('rgb(33, 43, 55)');
  expect(await css(page, '#glyph', 'fill')).toBe('rgb(190, 195, 201)'); // text-secondary
  expect(await css(page, '.tox-statusbar__wordcount', 'color')).toBe('rgb(190, 195, 201)');
  await page.locator('.tox').screenshot({ path: '.scratch/dark/shots/rce-toolbar-dark.png' });
});

test('Documents in dark mode: the DocViewer frame goes light, dimmed or dark with the scheme', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'always', 'palette.documents': 'dark' });
  const page = await context.newPage();
  await context.route('https://canvadocs.instructure.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="background:#fff"><p>Page 1 of a PDF</p><img id="photo" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></body></html>' }));
  await fixture(page, '/b2c-fixture/doc', `<!doctype html><html><head><link rel="stylesheet" href="${BRAND}"><link rel="stylesheet" href="${COMMON}"></head><body>
    <iframe id="doc" src="https://canvadocs.instructure.com/1/sessions/abc/view" style="width:600px;height:300px"></iframe></body></html>`);
  await page.goto(CANVAS + '/b2c-fixture/doc');
  const frameFilter = () => page.frameLocator('#doc').locator('html').evaluate(h => getComputedStyle(h).filter);
  await expect.poll(frameFilter).toContain('invert(0.9)');
  expect(await page.frameLocator('#doc').locator('#photo').evaluate(i => getComputedStyle(i).filter)).toContain('invert(1)');
  await setSettings({ 'palette.documents': 'dimmed' });
  await expect.poll(frameFilter).toContain('brightness(0.82)');
  await setSettings({ 'palette.useDark': 'never' });
  await expect.poll(frameFilter).toBe('none'); // light scheme: documents untouched
});

test('shape: corner squares Canvas (generated) and InstUI (page world), border and density restyle Canvas, live', async ({ context, setSettings }) => {
  await context.addCookies([{ name: 'mock_delay', value: '0', domain: 'b2c-mock-school.instructure.com', path: '/' }]);
  await setSettings({ 'shape.corner': 0, 'type.density': 'compact', 'shape.border': '0' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/courses');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-shape', '');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-density', 'compact');
  // a Canvas button with a compiled radius
  const btn = page.locator('.btn, .Button, .ic-Button').first();
  expect(await btn.evaluate(b => getComputedStyle(b).borderTopLeftRadius)).toBe('0px');
  await setSettings({ 'shape.corner': 6 });
  await expect.poll(() => btn.evaluate(b => getComputedStyle(b).borderTopLeftRadius)).toBe('6px');
  // density: Canvas tables at half their padding
  const td = page.locator('.ic-Table td').first();
  expect(await td.evaluate(t => getComputedStyle(t).paddingTop)).toBe('7px');
  await setSettings({ 'type.density': 'roomy' });
  await expect.poll(() => td.evaluate(t => getComputedStyle(t).paddingTop)).toBe('21px');
  await setSettings({ 'type.density': 'comfortable' });
  await expect.poll(() => td.evaluate(t => getComputedStyle(t).paddingTop)).toBe('14px');
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-density', /.*/);
  // InstUI (emotion) radii follow the corner from the next load
  await fixture(page, '/b2c-fixture/instui', INSTUI_PAGE.replace('padding:12px}', 'padding:12px;border-radius:0.25rem}'));
  await page.goto(CANVAS + '/b2c-fixture/instui');
  expect(await css(page, '#panel', 'border-top-left-radius')).toBe('6px');
});

