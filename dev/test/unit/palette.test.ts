import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { contrast, fromOklch, inkFor, oklchInGamut, parseColor, toHex, toOklch } from '../../src/features/palette/color.ts';
import { DARK_ATTR, SUPPRESS_KEY, setSuppressed, suppressedAttrs } from '../../src/features/palette/original.ts';
import { DARK_PRESETS, LIGHT_PRESETS, aaaFallback, isRoles, isSchool, lightPresetRoles, paletteContrast, polarity, presetRoles, roleVars, ROLE_KEYS, type Roles } from '../../src/features/palette/palettes.ts';
import { nextBoundaryMs } from '../../src/features/palette/schedule.ts';
import { LIT, fallbackRef, litVarDefs, neutralRole, norm, rewriteValue, roleRef } from '../../src/features/palette/literals.ts';
import { rewriteRule } from '../../src/features/palette/instui.ts';
import { darkSlot, lightSlot, paletteMirror } from '../../src/features/palette/index.ts';
import { bgRole } from '../../src/features/palette/ink.ts';
import { inkBlock } from '../../scripts/gen-dark-ink.mts';
import { migrateV1 } from '../../src/features/palette/migrate.ts';
import { checkHighContrast } from '../../src/core/theme/contrast.ts';
import { darkPossible } from '../../src/features/palette/instui-main.ts';
import { shapeMirror } from '../../src/features/shape/index.ts';
import { mergeParts, resolveAttrs } from '../../src/core/mirror.ts';
// @ts-expect-error plain JS
import { OUTPUTS, colourOnly, cornerValue, defaultInputs, gate, generate, parse } from '../../scripts/gen-dark-literals.mjs';
// @ts-expect-error plain JS
import { lintGating } from '../../build.mjs';

const DEV = path.resolve(import.meta.dirname, '../..');
const base = { useDark: 'always', start: '20:00', end: '08:00', light: 'canvas', dark: 'dark', lightRoles: null, darkRoles: null, navStyle: 'school', dimImages: false };
const resolved = (p: ReturnType<typeof paletteMirror>, at = new Date(2026, 9, 21, 12)) => resolveAttrs(mergeParts([p]), at);

describe('palette mirror (two theme slots + Use dark theme)', () => {
  it('Canvas light slot and never-dark: nothing at all', () => {
    expect(paletteMirror({ ...base, useDark: 'never' })).toEqual({});
  });
  it('always: the dark slot paints, with the v1 alias', () => {
    expect(resolved(paletteMirror(base))).toMatchObject({ 'data-b2c-theme': 'on', 'data-b2c-scheme': 'dark', 'data-b2c-slot': 'd', 'data-b2c-dark': 'on' });
  });
  it('system and schedule: light slot by default, dark slot by condition', () => {
    const sys = paletteMirror({ ...base, useDark: 'system', light: 'sepia' });
    expect(resolved(sys)).toMatchObject({ 'data-b2c-theme': 'on', 'data-b2c-scheme': 'light', 'data-b2c-slot': 'l' });
    expect(resolved(sys)).not.toHaveProperty('data-b2c-dark');
    expect(sys.cond!.every(c => 'media' in c.when)).toBe(true);
    expect(sys.cond!.map(c => [c.attr, c.value])).toEqual(expect.arrayContaining([['data-b2c-slot', 'd'], ['data-b2c-scheme', 'dark'], ['data-b2c-dark', 'on']]));
    const sch = paletteMirror({ ...base, useDark: 'schedule', start: '21:30', end: '07:00' });
    expect(resolved(sch, new Date(2026, 9, 21, 22))['data-b2c-slot']).toBe('d');
    expect(resolved(sch, new Date(2026, 9, 21, 12))['data-b2c-theme']).toBeUndefined(); // Canvas light slot
  });
  it('a light theme with dark never: the light slot only', () => {
    const p = paletteMirror({ ...base, useDark: 'never', light: 'custom', lightRoles: { bg: '#fbf7ee', text: '#222222', link: 'school' } });
    expect(resolved(p)).toMatchObject({ 'data-b2c-theme': 'on', 'data-b2c-scheme': 'light', 'data-b2c-slot': 'l' });
    expect(p.cond).toEqual([]);
    expect(p.vars!['--b2c-pl-l-bg']).toBe('#fbf7ee');
    expect(p.vars!['--b2c-pl-l-surface']).toBe(lightPresetRoles('paper').surface); // missing roles from Paper
    expect(p.vars).not.toHaveProperty('--b2c-pl-l-link'); // school: derived in CSS
  });
  it('scheme follows the palette, not the slot', () => {
    const p = paletteMirror({ ...base, dark: 'custom', darkRoles: { bg: '#fdfdfd', text: '#111111' } });
    expect(resolved(p)['data-b2c-scheme']).toBe('light');
    expect(resolved(p)).not.toHaveProperty('data-b2c-dark');
  });
  it('personal options become the attributes Design\'s sheet reads', () => {
    expect(paletteMirror({ ...base, navStyle: 'theme', dimImages: true }).attrs).toMatchObject({ 'data-b2c-nav-style': 'theme', 'data-b2c-dim-images': '' });
  });
  it('dark presets fill the dark slot; link, nav and accent stay derived', () => {
    const v = paletteMirror({ ...base, dark: 'warm' }).vars!;
    expect(v['--b2c-pl-d-bg']).toBe('#251f19');
    expect(v['--b2c-pl-d-surface-raised']).toBe('#39332c');
    expect(v['--b2c-pl-d-nav-text']).toBe('#ffffff');
    for (const r of ['link', 'nav', 'accent', 'success']) expect(v).not.toHaveProperty(`--b2c-pl-d-${r}`);
  });
  it('custom dark roles: set ones win, the rest from Dark', () => {
    const v = paletteMirror({ ...base, dark: 'custom', darkRoles: { bg: '#102030', link: '#ff00ff', danger: '#ff5555' } }).vars!;
    expect(v['--b2c-pl-d-bg']).toBe('#102030');
    expect(v['--b2c-pl-d-link']).toBe('#ff00ff');
    expect(v['--b2c-pl-d-danger']).toBe('#ff5555');
    expect(v['--b2c-pl-d-text']).toBe(presetRoles('dark').text);
  });
  it('slot helpers', () => {
    expect(darkSlot({ dark: 'black', darkRoles: null }).bg).toBe('#000000');
    expect(lightSlot({ light: 'canvas', lightRoles: null })).toBeNull();
    expect(lightSlot({ light: 'sepia', lightRoles: null })!.bg).toBe(lightPresetRoles('sepia').bg);
  });
});

describe('presets', () => {
  const floors = (r: Roles) => {
    const c = paletteContrast(r);
    return [c.text >= 7, c.secondary >= 4.5, c.tertiary >= 4.5];
  };
  it('every bundled theme meets the contrast floors (text 7:1, secondary and tertiary 4.5:1)', () => {
    for (const p of DARK_PRESETS) expect(floors(presetRoles(p)), p).toEqual([true, true, true]);
    for (const p of LIGHT_PRESETS) expect(floors(lightPresetRoles(p)), p).toEqual([true, true, true]);
  });
  it('schemes', () => {
    for (const p of DARK_PRESETS) expect(polarity(presetRoles(p)), p).toBe('dark');
    for (const p of LIGHT_PRESETS) expect(polarity(lightPresetRoles(p)), p).toBe('light');
  });
  it('validates stored roles', () => {
    expect(isRoles({ bg: '#000000', link: 'school' })).toBe(true);
    expect(isRoles({ bg: 'school' })).toBe(false);
    expect(isRoles({ nope: '#000000' })).toBe(false);
    expect(isRoles([])).toBe(false);
  });
});

describe('High Contrast reaches AAA (Director ruling), judged by the theme lane\'s hcGate', () => {
  const passes = (r: Roles, scheme: 'light' | 'dark') => checkHighContrast(r as never, scheme).every(c => c.ok);
  it('every bundled theme passes as it is: nothing falls back', () => {
    for (const p of DARK_PRESETS) expect(aaaFallback(presetRoles(p)), p).toEqual({});
    for (const p of LIGHT_PRESETS) expect(aaaFallback(lightPresetRoles(p)), p).toEqual({});
  });
  it('weak text alone: only text falls back (HC already lifts links to L .93 on dark)', () => {
    const r = { ...presetRoles('black'), text: '#9a9a9a', link: '#33557a' };
    const fb = aaaFallback(r, 'dark');
    expect(fb).toEqual({ text: presetRoles('black').text });
    expect(passes({ ...r, ...fb }, 'dark')).toBe(true);
  });
  it('a weak dark palette ends up AAA; a light one falls back to the light High contrast preset', () => {
    const weak = { ...presetRoles('dark'), bg: '#3a3a3a', surface: '#444444', surfaceRaised: '#4c4c4c', text: '#bbbbbb', link: '#6699cc' };
    expect(passes({ ...weak, ...aaaFallback(weak, 'dark') }, 'dark')).toBe(true);
    const weakLight = { ...lightPresetRoles('paper'), text: '#777777', textTertiary: '#999999' };
    const fbl = aaaFallback(weakLight, 'light');
    expect(fbl.text).toBe(lightPresetRoles('contrast').text);
    expect(passes({ ...weakLight, ...fbl }, 'light')).toBe(true);
  });
  it('the mirror carries the fallbacks as --b2c-pl-<slot>-hc-*; a derived one as its CSS', () => {
    const v = paletteMirror({ ...base, dark: 'custom', darkRoles: { ...presetRoles('black'), text: '#9a9a9a' } }).vars!;
    expect(v['--b2c-pl-d-hc-text']).toBe(presetRoles('black').text);
    expect(v).not.toHaveProperty('--b2c-pl-d-hc-link');
    const weak = { bg: '#3a3a3a', surface: '#444444', surfaceRaised: '#4c4c4c', text: '#bbbbbb', link: '#6699cc' };
    const w = paletteMirror({ ...base, dark: 'custom', darkRoles: weak }).vars!; // whole fallback: link is Black's derived link
    expect(w['--b2c-pl-d-hc-link']).toBe('var(--b2c-school-link)'); // derived per scheme in style.css
    expect(w['--b2c-pl-d-hc-bg']).toBe('#000000');
  });
});

describe('v1 → v2 migration', () => {
  it('maps mode, schedule, preset and personal options', () => {
    const m = migrateV1({ 'dark-mode.mode': 'off', 'dark-mode.start': '21:00', 'dark-mode.end': '07:30', 'dark-mode.preset': 'warm', 'dark-mode.navStyle': 'theme', 'dark-mode.dimImages': true });
    expect(m.set).toEqual({ 'palette.useDark': 'never', 'palette.start': '21:00', 'palette.end': '07:30', 'palette.dark': 'warm', 'palette.navStyle': 'theme', 'palette.dimImages': true });
    expect(m.remove.sort()).toEqual(['dark-mode.dimImages', 'dark-mode.end', 'dark-mode.mode', 'dark-mode.navStyle', 'dark-mode.preset', 'dark-mode.start']);
    for (const [v1, v2] of [['on', 'always'], ['system', 'system'], ['schedule', 'schedule']]) expect(migrateV1({ 'dark-mode.mode': v1 }).set['palette.useDark']).toBe(v2);
  });
  it('custom roles move into the dark slot, derived ones as "school"', () => {
    const m = migrateV1({ 'dark-mode.preset': 'custom', 'dark-mode.bg': '#102030', 'dark-mode.link': '', 'dark-mode.text': '#eeeeee' });
    expect(m.set).toEqual({ 'palette.dark': 'custom', 'palette.darkRoles': { bg: '#102030', link: 'school', text: '#eeeeee' } });
    expect(isRoles(m.set['palette.darkRoles'])).toBe(true);
  });
  it('nothing to do without v1 keys', () => {
    expect(migrateV1({ 'palette.useDark': 'always' })).toEqual({ set: {}, remove: [] });
  });
});

describe('colour maths', () => {
  it('parses what Canvas and teachers write', () => {
    expect(parseColor('#FFF')).toEqual([255, 255, 255, 1]);
    expect(parseColor('#00000080')![3]).toBeCloseTo(0.5, 2);
    expect(parseColor('rgb(224, 62, 45)')).toEqual([224, 62, 45, 1]);
    expect(parseColor('rgba(0 0 0 / 50%)')).toEqual([0, 0, 0, 0.5]);
    expect(parseColor('Red')).toEqual([255, 0, 0, 1]);
    expect(parseColor('var(--x)')).toBeNull();
    expect(parseColor('#12')).toBeNull();
  });
  it('OKLCH round-trips', () => {
    for (const h of ['#005f85', '#e03e2d', '#213921', '#ffffff', '#7dc8f3']) {
      const [l, c, hh] = toOklch(parseColor(h)!);
      expect(toHex([...fromOklch(l, c, hh).map(Math.round), 1] as never)).toBe(h);
    }
    expect(toOklch(parseColor('#ffffff')!)[0]).toBeCloseTo(1, 3);
  });
  it('WCAG contrast', () => {
    expect(contrast(parseColor('#000')!, parseColor('#fff')!)).toBeCloseTo(21, 1);
    expect(contrast(parseColor('#213921')!, parseColor('#ffffff')!)).toBeGreaterThan(4.5);
  });
  it('gamut mapping keeps lightness and hue, drops only chroma', () => {
    const [r, g, b] = oklchInGamut(0.72, 0.31, 264);
    const [l, , h] = toOklch([r, g, b, 1]);
    expect(l).toBeCloseTo(0.72, 2);
    expect(h).toBeCloseTo(264, 0);
  });
});

describe('authored ink (user content)', () => {
  it('near-black → text, mid-grey → muted, light → keep', () => {
    expect(inkFor(parseColor('#000')!).kind).toBe('text');
    expect(inkFor(parseColor('#34495e')!).kind).toBe('text');
    expect(inkFor(parseColor('#808080')!).kind).toBe('muted');
    expect(inkFor(parseColor('#f1c40f')!).kind).toBe('keep');
    expect(inkFor(parseColor('rgba(0,0,0,0)')!).kind).toBe('keep');
  });
  it('saturated colours keep their hue with lightness raised to 0.72, and read on every preset bg', () => {
    for (const c of ['#e03e2d', '#ff0000', '#0000ff', '#236fa1', '#843fa1', '#008000']) {
      const ink = inkFor(parseColor(c)!);
      expect(ink.kind).toBe('lift');
      if (ink.kind !== 'lift') continue;
      const lifted = parseColor(ink.css)!;
      const [L, , H] = toOklch(lifted);
      expect(L).toBeCloseTo(0.72, 2);
      const h0 = toOklch(parseColor(c)!)[2];
      expect(Math.abs(((H - h0 + 540) % 360) - 180)).toBeLessThan(3);
      for (const p of ['dark', 'gray', 'black', 'warm'] as const) {
        expect(contrast(lifted, parseColor(presetRoles(p).bg)!)).toBeGreaterThan(4.5);
      }
    }
  });
});

describe('inline backgrounds', () => {
  it('teacher HTML: only near-white is cleared', () => {
    expect(bgRole('#ffffff', true)).toBe('clear');
    expect(bgRole('rgb(251, 238, 184)', true)).toBeNull();
    expect(bgRole('#fdfdfd', true)).toBe('clear');
    expect(bgRole('#fff8dc', true)).toBeNull(); // near-white but tinted (chroma ≥ 0.02): keeps its colour
    expect(bgRole('#f0f8ff', true)).toBe('clear'); // chroma 0.013: still paper
  });
  it('Canvas inline styles map like its CSS; course colours stay', () => {
    expect(bgRole('#fff', false)).toBe('bg');
    expect(bgRole('rgb(224, 247, 250)', false)).toBe('selected');
    expect(bgRole('#f5f5f5', false)).toBe('surface');
    expect(bgRole('#c8cdd2', false)).toBeNull(); // a grey course colour
    expect(bgRole('#e66000', false)).toBeNull();
    expect(bgRole('rgba(255,255,255,0.3)', false)).toBeNull();
  });
});

describe('Show original (per-tab suppression)', () => {
  it('is per path and lapses on navigation', () => {
    sessionStorage.clear();
    setSuppressed(DARK_ATTR, true, '/courses/1/pages/x');
    expect(suppressedAttrs('/courses/1/pages/x')).toEqual([DARK_ATTR]);
    expect(suppressedAttrs('/courses/1/pages/y')).toEqual([]);
    // navigating away dropped it for good
    expect(suppressedAttrs('/courses/1/pages/x')).toEqual([]);
    expect(sessionStorage.getItem(SUPPRESS_KEY)).toBeNull();
  });
  it('turns off cleanly and survives bad storage', () => {
    setSuppressed(DARK_ATTR, true, '/a');
    setSuppressed(DARK_ATTR, false, '/a');
    expect(suppressedAttrs('/a')).toEqual([]);
    sessionStorage.setItem(SUPPRESS_KEY, '{not json');
    expect(suppressedAttrs('/a')).toEqual([]);
  });
});

describe('schedule boundaries', () => {
  const cond = [{ attr: 'data-b2c-dark', value: 'on', when: { start: '20:00', end: '08:00' } }];
  it('waits exactly until the next start or end', () => {
    expect(nextBoundaryMs(cond, new Date(2026, 9, 21, 19, 59, 30))).toBe(30_000);
    expect(nextBoundaryMs(cond, new Date(2026, 9, 21, 7, 0))).toBe(60 * 60_000);
    expect(nextBoundaryMs(cond, new Date(2026, 9, 21, 12, 0))).toBe(8 * 60 * 60_000);
  });
  it('at a boundary, schedules the following one; none without time windows', () => {
    expect(nextBoundaryMs(cond, new Date(2026, 9, 21, 20, 0))).toBe(12 * 60 * 60_000);
    expect(nextBoundaryMs([{ attr: 'x', value: '', when: { media: '(x)' } }], new Date())).toBeNull();
  });
});

describe('literal map (layer b and c)', () => {
  it('normalises literals', () => {
    expect(norm('#FFF')).toEqual(['#ffffff', 1]);
    expect(norm('white')).toEqual(['#ffffff', 1]);
    expect(norm('rgba(255,255,255,.5)')).toEqual(['#ffffff', 0.5]);
  });
  it('maps by property kind and keeps alpha', () => {
    expect(rewriteValue('background-color', '#fff', roleRef)).toBe('var(--b2c-dm-bg)');
    expect(rewriteValue('color', '#fff', roleRef)).toBeNull(); // white text on coloured fills
    expect(rewriteValue('color', '#2D3B45', roleRef)).toBe('var(--b2c-dm-text)');
    expect(rewriteValue('border', '1px solid #c7cdd1', roleRef)).toBe('1px solid var(--b2c-dm-border)');
    expect(rewriteValue('background', 'rgba(255, 255, 255, 0.5)', roleRef)).toBe('color-mix(in srgb, var(--b2c-dm-bg) 50%, transparent)');
    expect(rewriteValue('background', 'url(/images/icon-x-black.svg) #fff', roleRef)).toBe('url(/images/icon-x-black.svg) var(--b2c-dm-bg)');
    expect(rewriteValue('width', '#fff', roleRef)).toBeNull();
  });
  it('maps stray neutral greys by lightness, leaves saturated colours', () => {
    expect(neutralRole('#f4f4f4', 0)).toBe('surface');
    expect(neutralRole('#d9d9d9', 0)).toBe('surface-raised');
    expect(neutralRole('#858585', 1)).toBe('text-tertiary');
    expect(neutralRole('#d9d9d9', 2)).toBe('border');
    expect(neutralRole('#ec5f10', 0)).toBeNull();
    expect('#f4f4f4' in LIT).toBe(false);
  });
  it('InstUI rewrite is a no-op when dark is off (fallback = original)', () => {
    expect(rewriteValue('color', '#273540', fallbackRef)).toBe('var(--b2c-lit-text, #273540)');
    expect(rewriteValue('background', 'rgba(255,255,255,0.5)', fallbackRef)).toBe('color-mix(in srgb, var(--b2c-lit-bg, #ffffff) 50%, transparent)');
    expect(litVarDefs()).toContain('--b2c-lit-bg:var(--b2c-dm-bg)');
    expect(litVarDefs()).toContain('--b2c-lit-surface-raised:var(--b2c-dm-surface-raised)');
  });
  it('rewrites emotion rules, declaration blocks only', () => {
    expect(rewriteRule('.css-1a{color:#2D3B45;background:#FFFFFF}')).toBe('.css-1a{color:var(--b2c-lit-text, #2d3b45);background:var(--b2c-lit-bg, #ffffff)}');
    expect(rewriteRule('@media (min-width:30em){.css-2b:hover{border-color:#C7CDD1 !important}}')).toBe(
      '@media (min-width:30em){.css-2b:hover{border-color:var(--b2c-lit-border, #c7cdd1) !important}}',
    );
    expect(rewriteRule('.css-3c{display:flex}')).toBe('.css-3c{display:flex}');
    expect(rewriteRule('.css-black{width:1px}')).toBe('.css-black{width:1px}');
  });
});

describe('InstUI install gate', () => {
  it('installs only when the mirror can turn dark on', () => {
    expect(darkPossible(null)).toBe(false);
    expect(darkPossible(JSON.stringify(mergeParts([paletteMirror({ ...base, useDark: 'never' })])))).toBe(false);
    for (const useDark of ['always', 'system', 'schedule']) expect(darkPossible(JSON.stringify(mergeParts([paletteMirror({ ...base, useDark })]))), useDark).toBe(true);
    expect(darkPossible(JSON.stringify(mergeParts([paletteMirror({ ...base, useDark: 'never', light: 'sepia' })])))).toBe(true);
    expect(darkPossible(JSON.stringify(mergeParts([shapeMirror({ corner: 2, border: '1' })])))).toBe(true);
  });
});

describe('generator (scripts/gen-dark-literals.mjs)', () => {
  const SRC = 'html.x .a, body .b { background: #fff; color: #2d3b45 } :root{--x:#fff}' +
    '@media screen and (min-width: 1px){ .c { border-top: 1px dashed #ccc } } @media print { .d { color:#000 } }';
  it('flat: gates every selector, keeps media context, skips print', () => {
    const { css } = generate([SRC], { nest: false });
    expect(css).toContain('html[data-b2c-theme="on"].x .a,html[data-b2c-theme="on"] body .b{background-color:var(--b2c-dm-bg);color:var(--b2c-dm-text)}');
    expect(css).toContain('@media screen and (min-width: 1px){html[data-b2c-theme="on"] .c{border-top-color:var(--b2c-dm-border)}}');
    expect(css).not.toContain('.d');
    expect(css).not.toContain(':root');
    expect(gate(':root')).toBeNull();
  });
  it('nested: one gate for the whole sheet; html-anchored selectors become &', () => {
    const { css } = generate([SRC], { nest: true });
    expect(css.startsWith('html[data-b2c-theme="on"]{')).toBe(true);
    expect(css).toContain('&.x .a,body .b{background-color:var(--b2c-dm-bg);color:var(--b2c-dm-text)}');
    expect(css).toContain('@media screen and (min-width: 1px){.c{border-top-color:var(--b2c-dm-border)}}');
    expect(lintGating(css, 'nested')).toEqual([]);
  });
  it('merges identical rules only when nothing in between touches the same properties', () => {
    const { css } = generate(['.a{color:#000} .b{color:#fff;background:#fff} .c{color:#000} .d{border-color:#ccc} .e{border-color:#ccc}'], { nest: false });
    expect(css).toContain('html[data-b2c-theme="on"] .d,html[data-b2c-theme="on"] .e{border-color:var(--b2c-dm-border)}');
    const { css: c2 } = generate(['.a{color:#000} .b{color:#999} .c{color:#000}'], { nest: false });
    expect(c2.indexOf('.c{')).toBeGreaterThan(c2.indexOf('.b{')); // .b sets colour in between: no merge
  });
  it('corners: every non-zero radius → the corner token, under the shape gate', () => {
    expect(cornerValue('4px')).toBe('var(--b2c-corner)');
    expect(cornerValue('50%')).toBe('var(--b2c-corner)');
    expect(cornerValue('4px 4px 0 0')).toBe('var(--b2c-corner) var(--b2c-corner) 0 0');
    expect(cornerValue('0')).toBeNull();
    expect(cornerValue('var(--x)')).toBeNull();
    const { css } = generate(['.btn{border-radius:.25rem;color:#000} .av{border-radius:50%}'], { kind: 'corner', gate: 'html[data-b2c-shape]', nest: false });
    expect(css).toContain('html[data-b2c-shape] .btn,html[data-b2c-shape] .av{border-radius:var(--b2c-corner)}');
    expect(css).not.toContain('color');
  });
  it('emits colour-only longhands', () => {
    expect(colourOnly('border', '1px dashed var(--b2c-dm-border)')).toEqual(['border-color', 'var(--b2c-dm-border)']);
    expect(colourOnly('background', 'var(--b2c-dm-bg) url(x.png) no-repeat')).toEqual(['background-color', 'var(--b2c-dm-bg)']);
    expect(colourOnly('color', 'var(--b2c-dm-text)')).toEqual(['color', 'var(--b2c-dm-text)']);
  });
  it('parses nested at-rules and skips keyframes/font-face', () => {
    const r = parse('@font-face{src:url(x)} @keyframes k{from{color:#fff}} @supports (x:y){.a{color:#000}} .b{color:#000}');
    expect(r.map((x: { sel: string }) => x.sel)).toEqual(['.a', '.b']);
  });
  it('the checked-in outputs are current, colour-only / radius-only, and pass the gating lint', () => {
    // The generator reads the captured Canvas bundles in mock-canvas/vendor-live,
    // which can't be redistributed (absent in the public repo). Without them the
    // staleness check is skipped; the lint and content checks still run.
    const haveInputs = fs.existsSync(path.join(DEV, 'mock-canvas/vendor-live'));
    const texts = haveInputs ? (defaultInputs() as string[]).map(f => fs.readFileSync(f, 'utf8')) : [];
    for (const o of OUTPUTS as { kind: string; gate: string; file: string }[]) {
      const out = fs.readFileSync(path.join(DEV, o.file), 'utf8');
      if (haveInputs) {
        const fresh = generate(texts, { kind: o.kind, gate: o.gate, nest: true }).css;
        expect(out.endsWith(fresh), `${o.file} is stale: run node scripts/gen-dark-literals.mjs`).toBe(true);
      }
      expect(lintGating(out, o.file)).toEqual([]);
    }
    const colour = fs.readFileSync(path.join(DEV, 'src/features/palette/literals.gen.css'), 'utf8');
    expect(colour).not.toMatch(/[{;](border|background|outline):/);
    expect(colour).not.toMatch(/radius/);
    expect(fs.readFileSync(path.join(DEV, 'src/features/palette/style.css'), 'utf8'), 'ink block stale: node scripts/gen-dark-ink.mts').toContain(inkBlock());
    for (const f of ['src/features/palette/style.css', 'src/features/shape/style.css']) {
      expect(lintGating(fs.readFileSync(path.join(DEV, f), 'utf8'), f)).toEqual([]);
    }
  });
});
