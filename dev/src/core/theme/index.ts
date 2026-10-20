// b²c theme engine (v2, core; theme lane). A theme is one shareable file
// (design/spec/rice.md "Theme file v1") that maps onto setting keys, so the
// Studio, popup and settings page always agree. Nothing here renders: the
// palette, shape, custom-font, card and custom-css features paint what the
// keys say, pre-paint, as before.
//
// ── API (for the Studio; the ui lane builds on this) ──────────────────────────
//
// Reading something pasted or opened:
//   importText(text, opts?) → Promise<ImportResult>
//       Any of: a share code (b2c-theme:… / b2c-rice:…, bare or in a link's
//       #fragment), a .b2c-theme.json file, a Better Canvas export or gallery
//       entry, a base16/base24 YAML scheme, a Catppuccin palette.json
//       (opts.flavor, opts.accent), or a pywal colors.json. Returns the theme
//       (or null + errors), unknown fields, notes, what the CSS sanitiser
//       removed, and the contrast report. Never throws.
//   parse(text | object) → { theme, unknown[], errors[], cssRemoved[] }
//       Validate a v1 theme. Unknown fields are kept and reported. `css` is
//       always sanitised (sanitize.ts).
//
// Contrast (Design's floors, WCAG + APCA; and the High Contrast AAA gate):
//   contrastReport(theme) → { light?, dark? }: per scheme, every check, the
//       failing ones, and hcGate (failing roles + their fallback values), on
//       the palette as painted (unnamed roles from Dark/Paper, listed in
//       `inherited` and marked on each check). "school" roles: both sample brands.
//   fixTheme(theme) → { theme, fixes[], advice[] }: "Fix contrast", OKLCH
//       lightness only, hue and chroma kept; reproduces Design's bundled
//       adjustments. Only named roles change; inherited failures are advice.
//
// Applying:
//   plan(theme, settings, { css?, courseColors? }) → { values, notes, css, courseColors }
//       settings = store.load(). Keys this build lacks are skipped with a note.
//       CSS is included only with { css: true } (the "Apply all" consent).
//       cards.colors becomes a card-colors request (her card order).
//   apply(store, theme, opts) → Promise<{ plan, before, undo() }>
//       One transaction through the store (live in open tabs). undo() works
//       for 10 s (settings-storage's changeWithUndo) and also reverts course
//       colours already written to Canvas.
//   revert(store, applied): put back `before` at any later time.
//
// Exporting and sharing:
//   exportTheme(settings, { name, parts?, courseColors?, author?, id?, rev?, from? }) → Theme
//       parts ⊆ palette, shape, type, layout, views, css (default: all but css).
//   encodeShare(theme, 'theme' | 'rice') → Promise<string>
//       'theme' (b2c-theme:…) never carries CSS: the gallery and public
//       sharing use it. 'rice' (b2c-rice:…) carries CSS, person to person.
//   decodeShare(text) → Promise<{ kind, data, notes }>; toJson(theme); fileName(theme)
//
// Built-in looks: PRESETS (id, theme, licence?), preset(id). Notices ship in
//   THEMES-NOTICE.txt. Gruvbox is excluded (EXCLUDED says why).
//
// Shared CSS: sanitizeCss(css) → { css, removed[{rule, reason}], error? }.
//   Only CSS arriving through a share or file goes through it; her own typed
//   CSS never does. Limit SHARED_CSS_MAX (32 KB).
//
// The theme → key table is map.ts (MAP): one row per field.

import { SLOT_BASE, lightPresetRoles, presetRoles, type Roles } from '../../features/palette/palettes.ts';
import { checkPalette, fixContrast, hcGate, type Check, type Fix, type HcGate } from './contrast.ts';
import { parse, ROLE_NAMES, type Palette, type Role, type Scheme, type Theme } from './format.ts';
import { fromBase16, fromBetterCanvas, fromCatppuccin, fromPywal, isBase16, isBetterCanvas, isCatppuccin, isPywal, type Source } from './importers.ts';
import type { Removed } from './sanitize.ts';
import { decodeShare, findShare } from './share.ts';

export { parse, toJson, fileName, normHex, ROLE_NAMES, SCHOOL, THEME_VERSION, type Palette, type Role, type Scheme, type Theme, type ParseResult } from './format.ts';
export { plan, exportTheme, apply, revert, type Plan, type PlanOptions, type Note, type Applied, type ExportOptions } from './plan.ts';
export { encodeShare, decodeShare, findShare, THEME_PREFIX, RICE_PREFIX, type ShareKind } from './share.ts';
export { sanitizeCss, SHARED_CSS_MAX, type Removed, type SanitizeResult } from './sanitize.ts';
export { checkPalette, checkHighContrast, hcGate, hcRoles, fixContrast, wcag, apca, resolveSchool, schemeOf, REFERENCE_BRAND, SAMPLE_BRANDS, CANVAS_BRAND, PSU_BRAND, type Brand, type Check, type Fix, type HcGate } from './contrast.ts';
export { CATPPUCCIN_FLAVORS, CATPPUCCIN_ACCENTS, type Source } from './importers.ts';
export { PRESETS, EXCLUDED, preset, type Preset, type Licence } from './presets.ts';
export { MAP, PARTS, type Part } from './map.ts';

export interface SchemeReport {
  checks: Check[];
  failing: Check[];
  /** High Contrast (AAA) gate: failing roles fall back (Black for dark, light High contrast for light). */
  hc: HcGate;
  /** Roles the theme leaves out: b²c paints them from the base preset, and they're checked as painted. */
  inherited: Role[];
  /** The base preset those come from ("Dark" or "Paper"). */
  base: string;
}

const asPalette = (r: Roles): Palette => Object.fromEntries(Object.entries(r).filter(([, v]) => v)) as Palette;

/** The fallback preset for the High Contrast gate. */
export function hcFallbackFor(scheme: Scheme): Palette {
  return asPalette(scheme === 'dark' ? presetRoles('black') : lightPresetRoles('contrast'));
}

/**
 * A theme palette as applying it would paint it: its roles over the slot's
 * base preset (Dark, or Paper for light), plus which roles were inherited.
 */
export function resolvePalette(p: Palette, scheme: Scheme): { palette: Palette; inherited: Role[]; base: string } {
  const base = SLOT_BASE[scheme];
  const full = base.roles() as Record<string, string>;
  const inherited: Role[] = [];
  const palette: Palette = {};
  for (const r of ROLE_NAMES) {
    const own = p[r];
    if (typeof own === 'string' && own !== '') palette[r] = own;
    else if (full[r]) { palette[r] = full[r]; inherited.push(r); }
  }
  return { palette, inherited, base: base.name };
}

const markInherited = (checks: Check[], inherited: readonly Role[]) => {
  for (const c of checks) {
    const roles = [c.role, c.on].filter((r): r is Role => !!r && r !== 'courseColor' && inherited.includes(r as Role));
    if (roles.length) c.inherited = roles;
  }
  return checks;
};

/**
 * The contrast report for each scheme a theme carries, on the palette as it
 * would be painted (unnamed roles filled from the base preset, and marked
 * `inherited`). "school" roles are checked against both sample brands.
 * Course colours are checked once, with the first scheme.
 */
export function contrastReport(theme: Theme): Partial<Record<Scheme, SchemeReport>> {
  const out: Partial<Record<Scheme, SchemeReport>> = {};
  const course = theme.cards?.colors && 'list' in theme.cards.colors ? theme.cards.colors.list : [];
  let first = true;
  for (const scheme of ['dark', 'light'] as const) {
    const p = theme.palette?.[scheme];
    if (!p) continue;
    const { palette, inherited, base } = resolvePalette(p, scheme);
    const checks = markInherited(checkPalette(palette, first ? course : [], undefined, scheme), inherited);
    first = false;
    const hc = hcGate(palette, scheme, hcFallbackFor(scheme));
    markInherited(hc.checks, inherited);
    out[scheme] = { checks, failing: checks.filter(c => !c.ok), hc, inherited, base };
  }
  return out;
}

/** A failure "Fix contrast" won't change because the role is inherited: the author should name it. */
export interface Advice { scheme: Scheme; role: Role; from: string; to: string; base: string; why: string }

/**
 * "Fix contrast" for a whole theme: each scheme's palette as painted, and the
 * course colours once. Only roles the theme names are changed; a failing role
 * it inherits is reported as advice ("inherited from Dark: name textTertiary
 * as #…").
 */
export function fixTheme(theme: Theme): { theme: Theme; fixes: (Fix & { scheme?: Scheme })[]; advice: Advice[] } {
  const t: Theme = structuredClone(theme);
  const fixes: (Fix & { scheme?: Scheme })[] = [];
  const advice: Advice[] = [];
  const colors = t.cards?.colors;
  let course = colors && 'list' in colors ? colors.list : [];
  for (const scheme of ['dark', 'light'] as const) {
    const p = t.palette?.[scheme];
    if (!p) continue;
    const { palette, inherited, base } = resolvePalette(p, scheme);
    const r = fixContrast(palette, course);
    for (const f of r.fixes) {
      if (f.role === 'courseColor') { fixes.push(f); continue; }
      if (inherited.includes(f.role)) {
        advice.push({ scheme, role: f.role, from: f.from, to: f.to, base, why: `${f.role} is inherited from ${base} and fails here (${f.why}); name it in the theme, e.g. ${f.to}` });
        continue;
      }
      p[f.role] = f.to;
      fixes.push({ ...f, scheme });
    }
    if (course.length && colors && 'list' in colors) colors.list = r.courseColors;
    course = []; // course colours are checked once
  }
  if (course.length && colors && 'list' in colors) {
    const r = fixContrast({}, course); // a theme with course colours but no palette
    colors.list = r.courseColors;
    fixes.push(...r.fixes);
  }
  return { theme: t, fixes, advice };
}

export interface ImportResult {
  /** What it was: a b²c theme, a rice code, or another format. */
  kind: 'theme' | 'rice' | Source;
  theme: Theme | null;
  unknown: string[];
  errors: string[];
  notes: string[];
  /** What the sanitiser took out of the theme's CSS, and why. */
  cssRemoved: Removed[];
  contrast: Partial<Record<Scheme, SchemeReport>>;
}

/** Read whatever was pasted or opened. Never throws; problems are in `errors`. */
export async function importText(text: string, opts: { flavor?: string; accent?: string; name?: string } = {}): Promise<ImportResult> {
  const res: ImportResult = { kind: 'theme', theme: null, unknown: [], errors: [], notes: [], cssRemoved: [], contrast: {} };
  const finish = (data: unknown) => {
    const p = parse(data as object);
    res.theme = p.theme;
    res.unknown = p.unknown;
    res.errors.push(...p.errors);
    res.cssRemoved = p.cssRemoved;
    if (p.theme) res.contrast = contrastReport(p.theme);
    return res;
  };
  const trimmed = text.trim();
  if (!trimmed) { res.errors.push('Paste a theme code, or choose a theme file.'); return res; }
  if (findShare(trimmed)) {
    try {
      const d = await decodeShare(trimmed);
      res.kind = d.kind;
      res.notes.push(...d.notes);
      return finish(d.data);
    } catch (e) {
      res.errors.push((e as Error).message);
      return res;
    }
  }
  let json: unknown;
  try { json = JSON.parse(trimmed); } catch { json = undefined; }
  try {
    if (json !== undefined) {
      if (json && typeof json === 'object' && '$b2c' in json) return finish(json);
      // A file may carry css (a full rice); parse() sanitises it.
      const other = isBetterCanvas(json) ? fromBetterCanvas(json)
        : isCatppuccin(json) ? fromCatppuccin(json, opts)
        : isPywal(json) ? fromPywal(json, opts)
        : null;
      if (!other) { res.errors.push("That JSON isn't a theme b²c knows (b²c, Better Canvas, Catppuccin or pywal)."); return res; }
      res.kind = other.source;
      res.notes.push(...other.notes);
      return finish(other.theme);
    }
    if (isBase16(trimmed)) {
      const b = fromBase16(trimmed);
      res.kind = b.source;
      res.notes.push(...b.notes);
      return finish(b.theme);
    }
  } catch (e) {
    res.errors.push((e as Error).message);
    return res;
  }
  res.errors.push("That isn't a theme b²c can read. Paste a theme code (b2c-theme:…), or open a .b2c-theme.json, Better Canvas, base16, Catppuccin or pywal file.");
  return res;
}

