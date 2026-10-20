// The palette engine and the theme checks agree on what gets painted:
// - "school" roles: one per-scheme rule (palette/school.ts) for runtime CSS and checks,
//   checked against both of Design's sample brands;
// - contrastReport / hcGate / fixTheme run on the palette as applied (unnamed
//   roles from Dark or Paper), marking what was inherited;
// - any role value works, extremes included.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANVAS_BRAND, DARK_LIFT, PSU_BRAND, SAMPLE_BRANDS, schoolCss, schoolHex } from '../../src/features/palette/school.ts';
import { lightPresetRoles, presetRoles, ROLES, ROLE_KEYS, slotVars, type Roles } from '../../src/features/palette/palettes.ts';
import { paletteMirror } from '../../src/features/palette/index.ts';
import { checkPalette, contrastReport, fixTheme, hcGate, hcFallbackFor, preset, resolvePalette, resolveSchool, type Theme } from '../../src/core/theme/index.ts';
import { toOklch, parseColor } from '../../src/features/palette/color.ts';

const DEV = path.resolve(import.meta.dirname, '../..');
const css = () => fs.readFileSync(path.join(DEV, 'src/features/palette/style.css'), 'utf8');
const T = (t: Partial<Theme>): Theme => ({ $b2c: 'theme', v: 1, name: 't', ...t }) as Theme;
const base = { useDark: 'always', start: '20:00', end: '08:00', light: 'canvas', dark: 'dark', lightRoles: null, darkRoles: null, navStyle: 'school', dimImages: false };

describe('"school" roles: one rule per scheme (Design dark-mode.md §9c)', () => {
  it('light uses the school\'s colours as they are; dark lifts link to L .80 and accent to L .50', () => {
    for (const b of SAMPLE_BRANDS) {
      expect(schoolHex('light', 'link', b)).toBe(b.link);
      expect(schoolHex('light', 'accent', b)).toBe(b.primary);
      expect(schoolHex('dark', 'nav', b)).toBe(b.nav);
      expect(toOklch(parseColor(schoolHex('dark', 'link', b))!)[0]).toBeCloseTo(DARK_LIFT.link.L, 1);
      expect(toOklch(parseColor(schoolHex('dark', 'accent', b))!)[0]).toBeCloseTo(DARK_LIFT.accent.L, 1);
    }
    expect(schoolCss('light', 'link')).toBe('var(--ic-link-color, #0e68b3)');
    expect(schoolCss('light', 'accent')).toBe('var(--ic-brand-primary, #2b7abc)');
  });
  it('the runtime CSS is that rule, per scheme (drift guard)', () => {
    const sheet = css();
    for (const scheme of ['light', 'dark'] as const) {
      const block = sheet.match(new RegExp(`html\\[data-b2c-theme="on"\\]\\[data-b2c-scheme="${scheme}"\\] \\{\\n(  --b2c-school[^}]*)\\}`))![1]!;
      for (const role of ['link', 'accent', 'nav'] as const) expect(block, `${scheme} ${role}`).toContain(`--b2c-school-${role}: ${schoolCss(scheme, role)};`);
    }
    // and every slot falls back to it
    for (const slot of ['d', 'l']) for (const role of ['link', 'accent', 'nav']) expect(sheet).toContain(`--b2c-dm-${role}: var(--b2c-pl-${slot}-${role}, var(--b2c-school-${role}));`);
  });
  it('the checks resolve "school" the same way, per scheme', () => {
    const light = resolveSchool({ bg: '#ffffff', link: 'school', accent: 'school' }, CANVAS_BRAND, 'light');
    expect(light.link).toBe('#0e68b3');
    expect(light.accent).toBe('#2b7abc');
    const dark = resolveSchool({ bg: '#000000', link: 'school' }, CANVAS_BRAND, 'dark');
    expect(dark.link).toBe(schoolHex('dark', 'link', CANVAS_BRAND));
  });
  it('a "school" pair is checked against both sample brands (the pilot school and Canvas default)', () => {
    const checks = checkPalette(lightPresetRoles('sepia') as never, [], SAMPLE_BRANDS, 'light').filter(c => c.role === 'link');
    expect(new Set(checks.map(c => c.brand))).toEqual(new Set([PSU_BRAND.name, CANVAS_BRAND.name]));
    expect(checks.filter(c => c.on === 'surfaceRaised')).toHaveLength(2);
  });
  it('Paper and Sepia pass on both brands (b2c check); Sepia\'s raised surface comes from palettes.json', () => {
    for (const id of ['paper', 'sepia']) {
      const r = contrastReport(preset(id)!);
      expect(r.light!.failing.map(c => `${c.pair} ${c.brand ?? ''} ${c.ratio.toFixed(2)}`), id).toEqual([]);
    }
    expect(lightPresetRoles('sepia').surfaceRaised).toBe('#eee3ca');
  });
});

describe('contrastReport / hcGate / fixTheme check the palette as painted', () => {
  it('fills unnamed roles from the slot base (Dark / Paper) and marks them inherited', () => {
    const r = resolvePalette({ bg: '#101820', text: '#eeeeee' }, 'dark');
    expect(r.base).toBe('Dark');
    expect(r.palette.surface).toBe(presetRoles('dark').surface);
    expect(r.inherited).toContain('surface');
    expect(r.inherited).not.toContain('bg');
    expect(resolvePalette({ bg: '#fffef8' }, 'light').base).toBe('Paper');
  });
  it('an inherited role that fails on the theme\'s own surfaces is reported, marked inherited', () => {
    // A light-ish dark bg: Dark's inherited textTertiary (#a2a7ac) fails on it.
    const t = T({ palette: { dark: { bg: '#5a5f66', surface: '#5f646b', surfaceRaised: '#666b72', text: '#ffffff', link: '#ffffff' } } });
    const rep = contrastReport(t).dark!;
    const tert = rep.failing.filter(c => c.role === 'textTertiary');
    expect(tert.length).toBeGreaterThan(0);
    expect(tert.every(c => c.inherited?.includes('textTertiary'))).toBe(true);
    expect(rep.inherited).toEqual(expect.arrayContaining(['textTertiary', 'textSecondary', 'border', 'accent', 'nav', 'navText']));
  });
  it('hcGate runs on the painted palette too', () => {
    const t = T({ palette: { dark: { bg: '#3a3a3a', surface: '#444444', surfaceRaised: '#4c4c4c' } } }); // inherited text #e8edf4
    const rep = contrastReport(t).dark!;
    expect(rep.hc.checks.some(c => c.inherited?.includes('text'))).toBe(true);
  });
  it('fixTheme changes only named roles; inherited failures come back as advice', () => {
    const t = T({ palette: { dark: { bg: '#3a3f46', surface: '#40454c', surfaceRaised: '#4a4f56', text: '#999999', link: '#ffffff' } } });
    const r = fixTheme(t);
    const named = Object.keys(r.theme.palette!.dark!).sort();
    expect(named).toEqual(['bg', 'link', 'surface', 'surfaceRaised', 'text']); // nothing added
    expect(r.fixes.map(f => f.role)).toContain('text');
    expect(r.advice.map(a => a.role)).toContain('textTertiary');
    expect(r.advice.find(a => a.role === 'textTertiary')!.why).toMatch(/inherited from Dark/);
    // the named fix passes on the painted palette
    const after = contrastReport(r.theme).dark!;
    expect(after.failing.filter(c => c.role === 'text')).toEqual([]);
  });
  it('a complete palette has nothing inherited and no advice', () => {
    for (const id of ['nord', 'dark', 'black']) {
      const t = preset(id)!;
      expect(contrastReport(t).dark!.inherited.filter(r => !['success', 'warning', 'danger'].includes(r)), id).toEqual([]);
      expect(fixTheme(t).advice, id).toEqual([]);
    }
  });
  it('the High Contrast gate agrees between engine and checks', () => {
    for (const [scheme, roles] of [['dark', presetRoles('black')], ['light', lightPresetRoles('contrast')]] as const) {
      expect(hcGate(roles as never, scheme, hcFallbackFor(scheme)).pass, scheme).toBe(true);
    }
  });
});

describe('any role value works, extremes included (Agent kit: Black)', () => {
  const extremes = ['#000000', '#ffffff'];
  it('every role at #000000 and #ffffff reaches the page as that value, in both slots', () => {
    for (const k of ROLE_KEYS) {
      for (const v of extremes) {
        const dark = paletteMirror({ ...base, dark: 'custom', darkRoles: { [k]: v } } as never).vars!;
        expect(dark[`--b2c-pl-d-${ROLES[k]}`], `dark ${k} ${v}`).toBe(v);
        const light = paletteMirror({ ...base, useDark: 'never', light: 'custom', lightRoles: { [k]: v } } as never).vars!;
        expect(light[`--b2c-pl-l-${ROLES[k]}`], `light ${k} ${v}`).toBe(v);
        expect(slotVars('d', { [k]: v } as Partial<Roles>)).toEqual({ [`--b2c-pl-d-${ROLES[k]}`]: v });
      }
    }
  });
  it('the generated layer refers only to role variables, which every slot defines (no literal can collide with a role value)', () => {
    const gen = fs.readFileSync(path.join(DEV, 'src/features/palette/literals.gen.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const sheet = css();
    const tokens = fs.readFileSync(path.join(DEV, '../design/spec/tokens.css'), 'utf8') + fs.readFileSync(path.join(DEV, '../design/spec/surfaces/palette.css'), 'utf8');
    const used = new Set(Array.from(gen.matchAll(/var\(--b2c-dm-([\w-]+)\)/g), m => m[1]!));
    for (const role of used) expect(sheet.includes(`--b2c-dm-${role}:`) || tokens.includes(`--b2c-dm-${role}:`), role).toBe(true);
    // The generated rules never write a role's value as a literal in a declaration.
    const decls = Array.from(gen.matchAll(/\{([^{}]*)\}/g), m => m[1]!).join(';');
    expect(decls).not.toMatch(/:\s*#(000000|ffffff|000|fff)\b/i);
  });
  it('a theme can use black or white for any role and still be checked', () => {
    const t = T({ palette: { dark: { bg: '#000000', surface: '#000000', surfaceRaised: '#000000', text: '#ffffff', textSecondary: '#ffffff', textTertiary: '#ffffff', link: '#ffffff', navText: '#ffffff', nav: '#000000', border: '#ffffff' } } });
    expect(contrastReport(t).dark!.failing.filter(c => c.role !== 'accent')).toEqual([]);
    const l = T({ palette: { light: { bg: '#ffffff', surface: '#ffffff', surfaceRaised: '#ffffff', text: '#000000', textSecondary: '#000000', textTertiary: '#000000', link: '#000000', nav: '#000000', navText: '#ffffff', border: '#000000' } } });
    expect(contrastReport(l).light!.failing.filter(c => c.role !== 'accent')).toEqual([]);
  });
});
