// The Studio (options.html), on the built extension: Design's 60 prototype
// checks (design/v2/studio/tools/test.js) adapted to the real engine, plus
// live tabs, keyboard-only use, light/dark, a narrow window and @perf.
import { test, expect, CANVAS } from './fixtures.ts';
import type { BrowserContext, Page, Worker } from '@playwright/test';

type St = { look: any; pal: any; f: any; cc: any; from: any; editing: string; saved: any[]; base: any; useDark: string };
const S = (p: Page) => p.evaluate(() => JSON.parse(JSON.stringify((window as any).__studio.S))) as Promise<St>;
const stored = (sw: Worker, key: string) => sw.evaluate(async k => { const [a, b] = await Promise.all([chrome.storage.sync.get(k), chrome.storage.local.get(k)]); return a[k] ?? b[k]; }, key);
const box = async (p: Page, sel: string) => (await p.locator(sel).first().boundingBox())!;

async function studio(context: BrowserContext, sw: Worker, hash = '', size = { width: 1440, height: 900 }) {
  const p = await context.newPage();
  const errs: string[] = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setViewportSize(size);
  await p.goto(new URL('options.html' + hash, sw.url()).href);
  await expect(p.locator('#frame .cv')).toBeVisible();
  return { p, errs };
}

test('Look: select a card, drag width, corner by keyboard and field, undo/redo, reset; live in an open Canvas tab', async ({ context, sw }, info) => {
  const canvas = await context.newPage();
  await canvas.goto(CANVAS + '/');
  await expect(canvas.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  const { p, errs } = await studio(context, sw);
  expect(await p.locator('#frame .b2c-card').count()).toBe(4);
  expect(await p.locator('.chip').count()).toBeGreaterThanOrEqual(15);

  await p.hover('#frame .b2c-card[data-cid="hist"] .code');
  await expect(p.locator('.o-hover .o-tag').first()).toHaveText('Course card · HIST 101');
  await p.click('#frame .b2c-card[data-cid="bio"] .code');
  await expect(p.locator('#insp .i-crumbs b')).toHaveText('Course card · BIO 140');
  for (const h of ['width', 'gap', 'corner']) await expect(p.locator(`.h[data-h="${h}"][role="slider"]`)).toHaveCount(1);

  const w0 = (await S(p)).look.cards.width;
  const wb = await box(p, '.h[data-h="width"]');
  await p.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2); await p.mouse.down();
  for (let i = 1; i <= 6; i++) await p.mouse.move(wb.x + wb.width / 2 + i * 6, wb.y + wb.height / 2);
  await p.mouse.up();
  let s = await S(p);
  expect(s.look.cards.width).toBeGreaterThan(w0);
  const w1 = s.look.cards.width;
  await expect.poll(() => stored(sw, 'card-customization.cardWidth')).toBe(w1);
  expect((await S(p)).look.cards.width).toBe(w1); // one drag = one Undo step
  const steps = await p.evaluate(() => (window as any).__studio.H.past.length);

  const c0 = (await S(p)).look.shape.corner;
  await p.focus('.h[data-h="corner"]');
  for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowRight');
  expect((await S(p)).look.shape.corner).toBe(Math.min(12, c0 + 4));
  await p.keyboard.press('Shift+ArrowLeft');
  expect((await S(p)).look.shape.corner).toBe(Math.max(0, Math.min(12, c0 + 4) - 10));
  await p.keyboard.press('End');
  expect((await S(p)).look.shape.corner).toBe(12);
  // Live in the open Canvas tab, through the store and the mirror.
  await expect.poll(() => canvas.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--b2c-corner').trim())).toBe('12px');

  const g0 = (await S(p)).look.cards.gap;
  const gb = await box(p, '.h[data-h="gap"]');
  await p.mouse.move(gb.x + gb.width / 2, gb.y + 10); await p.mouse.down(); await p.mouse.move(gb.x + gb.width / 2 - 8, gb.y + 10); await p.mouse.move(gb.x + gb.width / 2 - 12, gb.y + 10); await p.mouse.up();
  expect((await S(p)).look.cards.gap).toBeLessThan(g0);
  await p.fill('#insp input[data-k="l.shape.corner"][data-ctl="num"]', '6'); await p.keyboard.press('Enter');
  expect((await S(p)).look.shape.corner).toBe(6);
  await expect(p.locator('#insp .reset.on[data-k="l.cards.width"]')).toHaveCount(1);
  await expect(p.locator('#tb-status')).toContainText('Edited');
  expect(await p.evaluate(() => (window as any).__studio.H.past.length)).toBeGreaterThan(steps);
  await p.screenshot({ path: info.outputPath('card-dragged.png') });

  const before = await S(p);
  await p.locator('#tabsline').click();
  await p.keyboard.press('Meta+z');
  s = await S(p); expect(s.look.shape.corner).not.toBe(before.look.shape.corner);
  await p.keyboard.press('Meta+Shift+z');
  s = await S(p); expect(s.look.shape.corner).toBe(before.look.shape.corner);
  await p.click('#insp .reset.on[data-k="l.cards.width"]');
  s = await S(p); expect(s.look.cards.width).not.toBe(w1);
  await p.keyboard.press('Meta+z');
  expect((await S(p)).look.cards.width).toBe(w1);
  await expect.poll(() => stored(sw, 'card-customization.cardWidth')).toBe(w1);
  expect(errs).toEqual([]);
});

test('Palette: page roles, role picker with contrast, ramp and hex; a preset fills its slot; course colours are offered', async ({ context, sw }, info) => {
  const { p, errs } = await studio(context, sw);
  await p.click('#frame .cv-tabsbar');
  await expect(p.locator('#insp .i-crumbs')).toContainText('Page');
  await expect(p.locator('#insp .well')).toHaveCount(14);
  await p.click('#insp .well[data-v="bg"]');
  await expect(p.locator('#insp .contrast tr')).toHaveCount(4);
  await p.click('#insp .ramp .swatch >> nth=8');
  let s = await S(p); expect(s.pal.light && s.pal.light.bg).not.toBe('#ffffff');
  await expect(p.locator('#insp .contrast')).toContainText(/:1/);
  await expect(p.locator('#insp .contrast')).toContainText(/Lc \d+/);
  await p.fill('#insp input[data-ctl="hex"]', '#f6f1e7'); await p.keyboard.press('Enter');
  s = await S(p); expect(s.pal.light.bg).toBe('#f6f1e7');
  await expect.poll(() => stored(sw, 'palette.light')).toBe('custom');
  expect(((await stored(sw, 'palette.lightRoles')) as any).bg).toBe('#f6f1e7');
  await p.screenshot({ path: info.outputPath('palette-role.png') });

  await p.click('.chip[data-v="nord"]');
  s = await S(p); expect(s.editing).toBe('dark'); expect(s.pal.dark.bg).toBe('#2e3440'); expect(s.from.dark).toBe('Nord');
  await expect.poll(() => stored(sw, 'palette.dark')).toBe('custom');
  await expect(p.locator('[data-act="offeryes"]')).toHaveCount(1);
  expect((await stored(sw, 'card-colors.request')) ?? null).toBeNull(); // offered, never applied silently
  await p.click('[data-act="offeryes"]');
  s = await S(p); expect(s.cc.bio).not.toBe('#009688');
  await expect.poll(async () => ((await stored(sw, 'card-colors.request')) as any)?.mode).toBe('list');
  expect(errs).toEqual([]);
});

test('Views and layout: to-do view, section order by keyboard and drag, panel side; font and density reach the stage; remix and save', async ({ context, sw }, info) => {
  const { p, errs } = await studio(context, sw);
  await p.click('.chip[data-v="nord"]');
  await p.click('#frame [data-part="todo"] .b2c-sec-h');
  await p.click('#insp .vthumb:has-text("Progress ring")');
  let s = await S(p); expect(s.look.views.todo).toBe('ring');
  await expect(p.locator('#frame .tv-ring svg')).toHaveCount(1);
  await p.click('#insp .vthumb:has-text("Week")'); await expect(p.locator('#frame .tv-week')).toHaveCount(1);
  await p.focus('#insp .grip[data-v="gpa"]'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp');
  s = await S(p); expect(s.look.layout.sections[0]).toBe('gpa');
  const g1 = await box(p, '#insp .grip[data-v="notes"]');
  await p.mouse.move(g1.x + 5, g1.y + 5); await p.mouse.down(); await p.mouse.move(g1.x + 5, g1.y - 40, { steps: 6 }); await p.mouse.up();
  s = await S(p); expect(s.look.layout.sections.indexOf('notes')).toBeLessThan(2);
  await p.click('#insp [data-k="l.layout.panel"][data-v="\\"left\\""]'); s = await S(p); expect(s.look.layout.panel).toBe('left');
  await p.screenshot({ path: info.outputPath('todo-week-left.png') });

  await p.click('#frame .cv-h1');
  await p.click('#insp .fam:has-text("JetBrains Mono")');
  expect(await p.evaluate(() => getComputedStyle(document.querySelector('#frame .b2c-card .title')!).fontFamily)).toContain('JetBrains');
  await expect.poll(() => stored(sw, 'type.family')).toBe('JetBrains Mono');
  await p.click('#insp [data-k="l.density"][data-v="\\"compact\\""]');
  await expect.poll(() => stored(sw, 'type.density')).toBe('compact');
  await expect(p.locator('#tb-status')).toContainText('Edited from Nord');
  await p.click('[data-act="saveas"]'); await p.fill('#savename', 'Nord terminal'); await p.keyboard.press('Enter');
  s = await S(p); expect(s.saved.some(t => t.name === 'Nord terminal')).toBe(true); expect(s.base.name).toBe('Nord terminal');
  await expect(p.locator('.chip:has-text("Nord terminal")')).toHaveCount(1);
  await expect.poll(async () => ((await stored(sw, 'themes.saved')) as any[]).some(x => x.theme.name === 'Nord terminal')).toBe(true);
  expect(errs).toEqual([]);
});

test('Share then import round-trips; a full rice previews its sanitised CSS; Apply without CSS; Revert import', async ({ context, sw }, info) => {
  const { p, errs } = await studio(context, sw);
  await p.click('.chip[data-v="nord"]');
  await p.click('#frame .cv-h1'); await p.click('#insp .fam:has-text("Inter")');
  await p.click('[data-act="sharemenu"]');
  await expect(p.locator('#menu [data-act="share"]')).toHaveCount(2);
  await p.click('#menu [data-act="share"][data-v="theme"]');
  await p.waitForFunction(() => (document.querySelector('#share-str') as HTMLTextAreaElement | null)?.value.startsWith('b2c-theme:'));
  const str = await p.inputValue('#share-str');
  expect(str.startsWith('b2c-theme:')).toBe(true);
  expect(str.length).toBeLessThan(1600);
  const dl = p.waitForEvent('download'); await p.click('.sheet [data-act="savefile"]'); const d = await dl;
  expect(d.suggestedFilename()).toMatch(/\.b2c-theme\.json$/);
  await p.screenshot({ path: info.outputPath('share-sheet.png') });
  const exp1 = await p.evaluate(() => JSON.stringify((window as any).__studio.exportTheme(false, true)));
  await p.keyboard.press('Escape');
  await p.click('.chip[data-v="dracula"]'); await p.click('.chip[data-v="canvas"]');
  let s = await S(p); expect(s.pal.dark.bg).not.toBe('#2e3440');
  await p.click('[data-act="import"]'); await p.fill('#imp-text', str);
  await expect(p.locator('#tabsline')).toContainText('Previewing');
  s = await S(p); expect(s.pal.dark.bg).not.toBe('#2e3440'); // nothing applied while previewing
  await p.screenshot({ path: info.outputPath('import-preview.png') });
  await p.click('.sheet [data-act="importapply"][data-v="all"]');
  const exp2 = await p.evaluate(() => JSON.stringify((window as any).__studio.exportTheme(false, true)));
  const strip = (j: string) => { const o = JSON.parse(j); delete o.name; return o; };
  expect(strip(exp2)).toEqual(strip(exp1));
  await expect(p.locator('#tb-status')).toContainText('Revert import');

  // A full rice from a friend: CSS with two remote references.
  const rice = await p.evaluate(() => (window as any).__studio.encode({ $b2c: 'theme', v: 1, name: 'Terminal', palette: { dark: { bg: '#1d2021', surface: '#282828', text: '#ebdbb2' } }, type: { family: 'JetBrains Mono' },
    css: '@import url(https://fonts.example.com/x.css);\n.b2c-card .title::before { content: "~/"; }\n.cv-nav { background-image: url(https://example.com/s.png); }' }, 'rice'));
  await p.click('[data-act="import"]'); await p.fill('#imp-text', rice);
  await expect(p.locator('.sheet .flag')).toContainText(/Includes custom CSS \(\d+ lines\)/);
  await expect(p.locator('.sheet .flag')).toContainText('Removed 2 remote references');
  await expect(p.locator('.sheet [data-act="importapply"][data-v="nocss"]')).toHaveCount(1);
  await p.click('[data-act="viewcss"]');
  expect(await p.evaluate(() => document.querySelector('#theme-css')!.textContent!.includes('~/'))).toBe(true);
  await p.screenshot({ path: info.outputPath('import-rice.png') });
  await p.click('.sheet [data-act="importapply"][data-v="nocss"]');
  s = await S(p); expect(s.look.css).toBe(''); expect(s.look.type.family).toBe('JetBrains Mono');
  await p.click('#tb-status [data-act="revertimport"]');
  s = await S(p); expect(s.pal.dark.bg).toBe('#2e3440');
  expect(errs).toEqual([]);
});

test('Features mode, search and deep links', async ({ context, sw }, info) => {
  let { p, errs } = await studio(context, sw);
  await p.click('.r-it[data-v="dashboard"]');
  const count = p.locator('#features [data-row="card-assignments-count"]');
  await expect(count).toBeVisible();
  await count.getByRole('spinbutton').focus(); await p.keyboard.press('ArrowUp');
  await expect.poll(() => stored(sw, 'card-assignments.count')).toBe(5);
  await expect.poll(async () => (await S(p)).f.nShown).toBe(5); // the stage follows a Features row
  await p.hover('#features [data-row="card-assignments"]');
  await expect(p.locator('.o-hover').first()).toBeVisible();
  for (const id of ['sites', 'backup', 'diagnostics']) await expect(p.locator('#' + id)).toBeAttached();
  await p.screenshot({ path: info.outputPath('features.png') });
  await p.keyboard.press('Escape'); await p.locator('#tabsline').click(); await p.keyboard.press('/'); await p.keyboard.type('planner');
  await expect(p.locator('#results')).toContainText('Sync with Canvas planner');
  await p.fill('#search', 'corner');
  await p.keyboard.press('Enter');
  expect(await p.evaluate(() => (document.activeElement as HTMLElement).dataset.k)).toBe('l.shape.corner');
  expect(errs).toEqual([]);

  for (const [hash, crumb] of [['#gpa', 'GPA'], ['#todo', 'To do'], ['#goal', 'Grade goal'], ['#better-todo', 'To do']] as const) {
    ({ p } = await studio(context, sw, hash));
    await expect(p.locator('#insp .i-crumbs b')).toHaveText(crumb);
    await p.close();
  }
  ({ p } = await studio(context, sw, '#dates'));
  await expect(p.locator('#features [data-row="dates"]')).toBeVisible();
  await expect(p.locator('#features [data-row="dates"].flash')).toHaveCount(1);
  const code = await p.evaluate(() => (window as any).__studio.encode({ $b2c: 'theme', v: 1, name: 'Linked', palette: { dark: { bg: '#101010' } } }, 'theme'));
  await p.close();
  ({ p } = await studio(context, sw, '#' + code));
  await expect(p.locator('#tabsline')).toContainText('Previewing');
});

test('Course page links, the popup mock, dark chrome', async ({ context, sw }, info) => {
  const { p, errs } = await studio(context, sw);
  await p.click('.chip[data-v="catppuccin-latte"]'); await p.click('[data-act="tab"][data-v="course"]'); await p.click('#frame .cv-rich a');
  await expect(p.locator('#insp .i-crumbs')).toContainText('Links');
  await p.click('.r-it[data-v="popup"]');
  await p.click('.popmock [data-k="useDark"][data-v="\\"always\\""]');
  expect((await S(p)).useDark).toBe('always');
  await expect.poll(() => stored(sw, 'palette.useDark')).toBe('always');
  await p.screenshot({ path: info.outputPath('popup-mock.png') });
  await p.emulateMedia({ colorScheme: 'dark' });
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await p.emulateMedia({ colorScheme: 'light' });
  expect(await p.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(bg);
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.goto(new URL('options.html#todo', sw.url()).href); await p.click('.chip[data-v="tokyo-night"]');
  await p.screenshot({ path: info.outputPath('dark-chrome.png') });
  expect(errs).toEqual([]);
});

test('keyboard only: rail → card → corner handle; Esc deselects', async ({ context, sw }) => {
  const { p } = await studio(context, sw);
  const shape = p.locator('.r-it[data-v="shape"]');
  await p.locator('body').press('Tab');
  for (let i = 0; i < 40 && !(await shape.evaluate(el => el === document.activeElement)); i++) await p.keyboard.press('Tab');
  await expect(shape).toBeFocused();
  await p.keyboard.press('Enter');
  await expect(p.locator('#insp [data-k="l.shape.corner"][data-ctl="range"]')).toBeFocused();
  const c0 = (await S(p)).look.shape.corner;
  await p.keyboard.press('ArrowRight');
  expect((await S(p)).look.shape.corner).toBe(Math.min(12, c0 + 1));
  await p.locator('.h[data-h="width"]').focus();
  await expect(p.locator('.h[data-h="width"]')).toHaveAttribute('role', 'slider');
  const w = (await S(p)).look.cards.width;
  await p.keyboard.press('Shift+ArrowRight');
  expect((await S(p)).look.cards.width).toBe(Math.min(360, w + 10));
  expect(await p.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe('none');
  await p.locator('#tabsline').click();
  await p.keyboard.press('Escape');
  await expect(p.locator('#insp')).toHaveClass(/idle/);
});

test('narrow window: no horizontal scroll', async ({ context, sw }, info) => {
  const { p } = await studio(context, sw, '', { width: 1024, height: 720 });
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await p.screenshot({ path: info.outputPath('narrow.png') });
});

test('@perf input to present under 50 ms for handles and sliders on the stage', async ({ context, sw }) => {
  const { p } = await studio(context, sw);
  await p.click('#frame .b2c-card[data-cid="bio"] .code');
  await p.evaluate(() => performance.clearMeasures('b2c:present'));
  const wb = await box(p, '.h[data-h="width"]');
  await p.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2); await p.mouse.down();
  for (let i = 1; i <= 20; i++) { await p.mouse.move(wb.x + wb.width / 2 + i * 4, wb.y + wb.height / 2); await p.waitForTimeout(20); }
  await p.mouse.up();
  await p.focus('.h[data-h="corner"]');
  for (let i = 0; i < 10; i++) { await p.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await p.waitForTimeout(20); }
  const range = p.locator('#insp input[data-k="l.cards.gap"][data-ctl="range"]');
  await range.focus();
  for (let i = 0; i < 10; i++) { await p.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await p.waitForTimeout(20); }
  const ms = await p.evaluate(() => performance.getEntriesByName('b2c:present', 'measure').map(m => m.duration));
  console.log(`input→present: n=${ms.length} median=${[...ms].sort((a, b) => a - b)[ms.length >> 1]?.toFixed(1)} max=${Math.max(...ms).toFixed(1)} ms`);
  expect(ms.length).toBeGreaterThanOrEqual(20);
  expect(Math.max(...ms)).toBeLessThan(50);
});

test('the stage sample is fictional; overdue reads "Overdue Nd"; chip names are never cut; Lato loads from the extension', async ({ context, sw }) => {
  const { p } = await studio(context, sw);
  await expect(p.locator('#frame .cv-h1')).toHaveText('Hello, Avery Student!');
  const overdue = p.locator('#frame .b2c-card .b2c-row.overdue .d').first();
  await expect(overdue).toHaveText(/^Overdue \d+d$/);
  for (const chip of await p.locator('.chip .nm').all()) {
    const fits = await chip.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1);
    expect(fits, await chip.textContent() ?? '').toBe(true);
  }
  expect(await p.evaluate(async () => { await document.fonts.load('16px "LatoStage"'); return document.fonts.check('16px "LatoStage"'); })).toBe(true);
});

test('colour budget: the Studio chrome at rest shows one accent and danger, nothing else (theme samples excluded)', async ({ context, sw }) => {
  const { measureColours, checkBudget } = await import('./colour-budget.ts');
  const { p } = await studio(context, sw);
  await p.click('#frame .b2c-card[data-cid="bio"] .code'); // a selection on stage: handles, labels, inspector
  await p.mouse.move(2, 890); // at rest: no hover
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const resolve = (v: string) => p.evaluate(v => { const el = document.createElement('span'); el.style.color = v; document.body.append(el); const c = getComputedStyle(el).color; el.remove(); const m = c.match(/\d+/g)!.slice(0, 3).map(Number); return '#' + m.map(n => n.toString(16).padStart(2, '0')).join(''); }, v);
  const budget = { courses: [] as string[], accent: await resolve('var(--b2c-ui-accent)'), danger: await resolve('var(--b2c-ui-danger)') };
  // Chrome only: theme chips, slot minis, wells and swatches show a theme's colours as content.
  const roots = ['.tb-row1', '.usedark', '#rail', '#stagebar', '#tabsline', '#insp .i-h', '#insp .i-sec:first-child', '.h[data-h="width"]', '.h[data-h="gap"]', '.h[data-h="corner"]', '.h-lbl', '.h-lbl.g'];
  const paints = (await Promise.all(roots.map(r => measureColours(p, r)))).flat();
  const r = checkBudget(paints, budget);
  expect(r.extra.map(x => `${x.where} ${x.hex}`)).toEqual([]);
  expect(r.families).toBeLessThanOrEqual(2);
  expect(r.byFamily.accent ?? 0).toBeGreaterThan(0); // the selection is painted, in the accent
});
