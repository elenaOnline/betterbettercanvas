// Contrast for themes: Design's floors (design/spec/themes/check_themes.py,
// WCAG 2 ratio AND APCA Lc, both required), the High Contrast AAA pass that
// mirrors palette.css under Canvas's HC flag, and "Fix contrast": OKLCH
// lightness-only repair that keeps hue and chroma, in Design's 0.002 steps.
// Numbers are a floor, not the authority: rendered specimens get the last word.

import { contrast as wcagRgb, fromOklch, parseColor, toOklch } from '../../features/palette/color.ts';
import { CANVAS_BRAND, PSU_BRAND, SAMPLE_BRANDS, schoolHex, type Brand } from '../../features/palette/school.ts';
import { SCHOOL, type Palette, type Role, type Scheme } from './format.ts';

// ── Measures ──────────────────────────────────────────────────────────────────

export function wcag(fg: string, bg: string): number {
  const a = parseColor(fg), b = parseColor(bg);
  return a && b ? wcagRgb(a, b) : 0;
}

/** APCA-W3 0.0.98G-4g Lc (signed; use Math.abs), as check_themes.py computes it. */
export function apca(fg: string, bg: string): number {
  const y = (h: string) => {
    const c = parseColor(h)!;
    const [r, g, b] = [c[0], c[1], c[2]].map(x => (x / 255) ** 2.4) as [number, number, number];
    const v = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    return v < 0.022 ? v + (0.022 - v) ** 1.414 : v;
  };
  const yt = y(fg), yb = y(bg);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

/** OKLCH → hex the way design/spec/oklch.py does it (channels clamped, not gamut-mapped). */
export function oklchHex(L: number, C: number, H: number): string {
  return '#' + fromOklch(L, C, H).map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}
const lch = (h: string) => toOklch(parseColor(h)!);

// ── Floors (check_themes.py) ──────────────────────────────────────────────────

/** role → [min WCAG ratio, min |APCA Lc|], each on bg, surface and surfaceRaised. */
export const FLOORS: Partial<Record<Role, [number, number]>> = {
  text: [7, 75], textSecondary: [4.5, 60], textTertiary: [4.5, 45], link: [4.5, 60],
};
const SURFACES = ['bg', 'surface', 'surfaceRaised'] as const;

/**
 * Sample brands for checking "school" roles: Design's two, a school's own
 * (the pilot school) and Canvas's default. A "school" role must pass on both. The real
 * school's colours are only known on Canvas, so a pass here is about the
 * theme's own colours. (REFERENCE_BRAND is the first, kept for callers.)
 */
export const REFERENCE_BRAND: Brand = PSU_BRAND;
export { SAMPLE_BRANDS, CANVAS_BRAND, PSU_BRAND, type Brand };
type Brands = Brand | readonly Brand[];
const brandList = (b: Brands): readonly Brand[] => (Array.isArray(b) ? b : [b as Brand]);

/** Light or dark, from the palette's bg (a palette without bg counts as dark). */
export const schemeOf = (p: Palette): Scheme => (p.bg && parseColor(p.bg) && lch(p.bg)[0] >= 0.6 ? 'light' : 'dark');

/**
 * "school" roles resolved the way the palette engine derives them for this
 * scheme (palette/school.ts: the one rule, shared with the runtime CSS).
 */
export function resolveSchool(p: Palette, brand: Brand = REFERENCE_BRAND, scheme: Scheme = schemeOf(p)): Palette {
  const q = { ...p };
  // The palette engine stores '' for "derived from the school" too.
  for (const r of ['link', 'accent', 'nav'] as const) if (q[r] === '') q[r] = SCHOOL;
  if (q.link === SCHOOL) q.link = schoolHex(scheme, 'link', brand);
  if (q.nav === SCHOOL) { const nav = schoolHex(scheme, 'nav', brand); q.nav = q.navText && wcag(q.navText, nav) >= 4.5 ? nav : q.surface; }
  if (q.accent === SCHOOL) q.accent = schoolHex(scheme, 'accent', brand);
  return q;
}

/** Does this check depend on a "school" role (so it's run per sample brand)? */
const usesSchool = (raw: Palette, roles: readonly string[]) =>
  roles.some(r => (r === 'link' || r === 'accent' || r === 'nav') && (raw[r as Role] === SCHOOL || raw[r as Role] === ''));

export interface Check {
  /** The role a fix would change. */
  role: Role | 'courseColor';
  /** What was measured, in words: "text on surface", "white on accent". */
  pair: string;
  ratio: number;
  lc?: number;
  /** The floor, in words: "7:1 and Lc 75". */
  floor: string;
  ok: boolean;
  /** For course colours: which entry. */
  index?: number;
  /** The other role in the pair (the surface, or nav for navText). */
  on?: Role;
  /** When the pair involves a "school" role: which sample brand it was resolved against. */
  brand?: string;
  /** Roles in this pair the theme didn't name (filled from the base preset); set by contrastReport. */
  inherited?: Role[];
}

/** Every role is a real colour (not missing, not '' and not "school"). */
const hasAll = (p: Palette, roles: readonly string[]) => roles.every(r => { const v = p[r as Role]; return typeof v === 'string' && v !== '' && v !== SCHOOL && !!parseColor(v); });

/** Every floor check for one scheme's palette (plus course colours, if given). "school" pairs are checked against every sample brand. */
export function checkPalette(raw: Palette, courseColors: readonly string[] = [], brands: Brands = SAMPLE_BRANDS, scheme: Scheme = schemeOf(raw)): Check[] {
  const out: Check[] = [];
  brandList(brands).forEach((brand, bi) => {
    const p = resolveSchool(raw, brand, scheme);
    // Pairs without a "school" role are the same for every brand: once.
    const want = (roles: string[]) => bi === 0 || usesSchool(raw, roles);
    const tag = (roles: string[]) => (usesSchool(raw, roles) ? { brand: brand.name } : {});
    for (const [role, [fw, fl]] of Object.entries(FLOORS) as [Role, [number, number]][]) {
      for (const s of SURFACES) {
        if (!hasAll(p, [role, s]) || !want([role, s])) continue;
        const ratio = wcag(p[role]!, p[s]!), lc = Math.abs(apca(p[role]!, p[s]!));
        out.push({ role, on: s, pair: `${role} on ${s}`, ratio, lc, floor: `${fw}:1 and Lc ${fl}`, ok: ratio >= fw && lc >= fl, ...tag([role, s]) });
      }
    }
    if (hasAll(p, ['navText', 'nav']) && want(['nav'])) {
      const ratio = wcag(p.navText!, p.nav!), lc = Math.abs(apca(p.navText!, p.nav!));
      out.push({ role: 'navText', on: 'nav', pair: 'navText on nav', ratio, lc, floor: '4.5:1 and Lc 60', ok: ratio >= 4.5 && lc >= 60, ...tag(['nav']) });
    }
    if (hasAll(p, ['accent']) && want(['accent'])) {
      const ratio = wcag('#ffffff', p.accent!);
      out.push({ role: 'accent', pair: 'white on accent', ratio, floor: '4.5:1', ok: ratio >= 4.5, ...tag(['accent']) });
    }
    if (bi === 0) courseColors.forEach((c, index) => {
      const ratio = wcag('#ffffff', c);
      out.push({ role: 'courseColor', pair: `white on course colour ${index + 1}`, ratio, floor: '3:1', ok: ratio >= 3, index });
    });
  });
  return out;
}

// ── High Contrast (AAA) pass: mirrors palette.css under Canvas's HC flag ─────

/** Roles as palette.css computes them under Canvas High Contrast. */
export function hcRoles(p: Palette, scheme: Scheme): Palette {
  // (Called on resolved roles; '' and "school" are left for CSS to derive.)
  const q = { ...p };
  q.border = p.textTertiary;
  q.textSecondary = q.textTertiary = p.text;
  if (p.link && p.link !== SCHOOL) {
    const [L, C, H] = lch(p.link);
    q.link = scheme === 'dark' ? oklchHex(0.93, Math.min(C, 0.08), H) : oklchHex(Math.min(L, 0.36), C, H);
  }
  if (p.accent && p.accent !== SCHOOL) {
    const [L, C, H] = lch(p.accent);
    q.accent = oklchHex(scheme === 'dark' ? 0.42 : Math.min(L, 0.42), C, H);
  }
  return q;
}

/** The HC checks: text and link 7:1 on every surface, white on accent 7:1, control border 3:1 (each "school" pair per sample brand). */
export function checkHighContrast(raw: Palette, scheme: Scheme, brands: Brands = SAMPLE_BRANDS): Check[] {
  const out: Check[] = [];
  brandList(brands).forEach((brand, bi) => {
    const hc = hcRoles(resolveSchool(raw, brand, scheme), scheme);
    const want = (roles: string[]) => bi === 0 || usesSchool(raw, roles);
    const tag = (roles: string[]) => (usesSchool(raw, roles) ? { brand: brand.name } : {});
    for (const role of ['text', 'link'] as const) {
      for (const s of SURFACES) {
        if (!hasAll(hc, [role, s]) || !want([role, s])) continue;
        const ratio = wcag(hc[role]!, hc[s]!);
        out.push({ role, on: s, pair: `HC ${role} on ${s}`, ratio, floor: '7:1 (AAA)', ok: ratio >= 7, ...tag([role, s]) });
      }
    }
    if (hasAll(hc, ['accent']) && want(['accent'])) {
      const ratio = wcag('#ffffff', hc.accent!);
      out.push({ role: 'accent', pair: 'HC white on accent', ratio, floor: '7:1 (AAA)', ok: ratio >= 7, ...tag(['accent']) });
    }
    if (hasAll(hc, ['border', 'bg']) && bi === 0) {
      const ratio = wcag(hc.border!, hc.bg!);
      // HC border is textTertiary, so that's the role to change.
      out.push({ role: 'textTertiary', on: 'bg', pair: 'HC control border on bg', ratio, floor: '3:1', ok: ratio >= 3 });
    }
  });
  return out;
}

export interface HcGate {
  pass: boolean;
  /** Roles that fail under High Contrast (each falls back). */
  failing: Role[];
  /** The replacement values for those roles, from the fallback preset. */
  fallback: Palette;
  /** True when replacing the failing roles wasn't enough and the whole fallback palette applies. */
  whole: boolean;
  checks: Check[];
}

/**
 * The gate for an imported theme's High Contrast fallback (Design, 2026-10-20):
 * failing roles fall back to the fallback preset's values (Black for a dark
 * scheme; for a light scheme, the light High contrast preset, since Black's
 * light-on-dark roles can't work on a light page). If the theme still fails
 * with those roles replaced, the whole fallback palette applies.
 */
export function hcGate(p: Palette, scheme: Scheme, fallbackPreset: Palette, brand: Brands = SAMPLE_BRANDS): HcGate {
  const checks = checkHighContrast(p, scheme, brand);
  const failing = [...new Set(checks.filter(c => !c.ok).map(c => c.role as Role))];
  if (!failing.length) return { pass: true, failing: [], fallback: {}, whole: false, checks };
  const fallback: Palette = Object.fromEntries(failing.map(r => [r, fallbackPreset[r]]));
  const patched = { ...p, ...fallback };
  if (checkHighContrast(patched, scheme, brand).every(c => c.ok)) return { pass: false, failing, fallback, whole: false, checks };
  return { pass: false, failing, fallback: { ...fallbackPreset }, whole: true, checks };
}

// ── Fix contrast: lightness only ──────────────────────────────────────────────

export interface Fix { role: Role | 'courseColor'; index?: number; from: string; to: string; why: string }

/**
 * Nudge failing colours in OKLCH lightness (steps of 0.002, hue and chroma
 * kept) until each floor passes, as Design adjusted the bundled themes. Text
 * roles move away from the surfaces; accent and course colours darken under
 * their white labels. Surfaces, border, status colours and "school" roles are
 * never changed. Returns the fixed palette and what moved.
 */
export function fixContrast(p: Palette, courseColors: readonly string[] = [], brand: Brands = SAMPLE_BRANDS): { palette: Palette; courseColors: string[]; fixes: Fix[] } {
  const out = { ...p };
  const colors = [...courseColors];
  const fixes: Fix[] = [];
  const darkBg = p.bg ? lch(p.bg)[0] < 0.6 : false;
  const nudge = (hex: string, dir: 1 | -1, passes: (h: string) => boolean): string | null => {
    const [L0, C, H] = lch(hex);
    for (let L = L0; L >= 0 && L <= 1; L += 0.002 * dir) {
      const h = oklchHex(L, C, H);
      if (passes(h)) return h;
    }
    return null;
  };
  const failing = () => checkPalette(out, colors, brand).filter(c => !c.ok);
  const roleOf = (c: Check) => `${c.role}:${c.index ?? ''}`;
  for (const key of new Set(failing().map(roleOf))) {
    const [role, idx] = key.split(':') as [Role | 'courseColor', string];
    if (role === 'courseColor') {
      const i = Number(idx);
      const to = nudge(colors[i]!, -1, h => wcag('#ffffff', h) >= 3);
      if (to && to !== colors[i]) { fixes.push({ role, index: i, from: colors[i]!, to, why: 'white course title needs 3:1' }); colors[i] = to; }
      continue;
    }
    const from = out[role];
    if (!from || from === SCHOOL) continue;
    let to: string | null = null;
    let why = '';
    if (role === 'accent') {
      to = nudge(from, -1, h => wcag('#ffffff', h) >= 4.5);
      why = 'white label on the accent needs 4.5:1';
    } else if (role === 'navText') {
      const navs = brandList(brand).map(b => resolveSchool(out, b).nav!).filter(n => n !== SCHOOL && !!parseColor(n));
      const nav = navs[0]!;
      to = nudge(from, lch(nav)[0] < 0.6 ? 1 : -1, h => navs.every(n => wcag(h, n) >= 4.5 && Math.abs(apca(h, n)) >= 60));
      why = 'nav text needs 4.5:1 and Lc 60 on the nav';
    } else {
      const [fw, fl] = FLOORS[role]!;
      const surf = SURFACES.map(s => out[s]).filter((x): x is string => !!x && x !== SCHOOL);
      to = nudge(from, darkBg ? 1 : -1, h => surf.every(s => wcag(h, s) >= fw && Math.abs(apca(h, s)) >= fl));
      why = `${role} needs ${fw}:1 and Lc ${fl} on all three surfaces`;
    }
    if (to && to !== from) { fixes.push({ role, from, to, why }); out[role] = to; }
  }
  return { palette: out, courseColors: colors, fixes };
}
