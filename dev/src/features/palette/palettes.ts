// Palette roles and presets for the palette engine (v2: any palette, light or
// dark, restyles Canvas through the same machinery). Dark presets come from
// Design's palettes.json (design/spec/palettes.json, checked by
// check_palettes.py), the single source for every bundled palette.
import designPalettes from '../../../../design/spec/palettes.json';
import { contrast, parseColor, toOklch } from './color.ts';
import { hcGate } from '../../core/theme/contrast.ts';
import type { Palette } from '../../core/theme/format.ts';

/** Setting key → role name used in palettes.json and in `--b2c-dm-<role>`. */
export const ROLES = {
  bg: 'bg',
  surface: 'surface',
  surfaceRaised: 'surface-raised',
  border: 'border',
  text: 'text',
  textSecondary: 'text-secondary',
  textTertiary: 'text-tertiary',
  link: 'link',
  nav: 'nav',
  navText: 'nav-text',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const;

export type RoleKey = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];
export type Roles = Record<RoleKey, string>;

export const DARK_PRESETS = ['dark', 'gray', 'black', 'warm', 'contrast'] as const;
export const LIGHT_PRESETS = ['paper', 'sepia', 'contrast'] as const;
export type DarkPreset = (typeof DARK_PRESETS)[number];
export type LightPreset = (typeof LIGHT_PRESETS)[number];
/** v1 name, kept: the dark preset list. */
export const PRESETS = DARK_PRESETS;
export type Preset = DarkPreset;

/** Roles that may be "school": derived from the school's brand at runtime (in CSS). */
export const DERIVED: readonly RoleKey[] = ['link', 'nav', 'accent'];
/** Roles a palette may leave out: the scheme's defaults apply (status colours). */
export const OPTIONAL: readonly RoleKey[] = ['success', 'warning', 'danger'];
/** Stored value meaning "derived from the school" (the theme file's word). '' is read the same. */
export const SCHOOL = 'school';
export const isSchool = (v: string | undefined) => !v || v === SCHOOL;

type Table = Record<string, Partial<Record<string, string>>>;
const S = 'school';

// palettes.json is the single source (Design, check_palettes.py): dark
// presets at the top level, light ones under "light".
const DESIGN = designPalettes as unknown as Table & { light: Table };

function rolesFrom(src: Partial<Record<string, string>> | undefined, fallback: Partial<Record<string, string>>): Roles {
  const out = {} as Roles;
  for (const k of ROLE_KEYS) {
    if (OPTIONAL.includes(k)) {
      const v = src?.[ROLES[k]] ?? src?.[k];
      out[k] = v ?? '';
      continue;
    }
    out[k] = src?.[ROLES[k]] ?? src?.[k] ?? fallback[ROLES[k]] ?? S;
  }
  return out;
}

/**
 * The role values of a dark preset, as stored ("school" for derived roles,
 * '' for optional roles the preset leaves to the scheme).
 * The ui lane calls this when a preset chip is chosen ("choosing a preset
 * rewrites the roles").
 */
export function presetRoles(p: DarkPreset): Roles {
  return rolesFrom(DESIGN[p] ?? DESIGN.dark, DESIGN.dark ?? {});
}

/** The role values of a light preset. */
export function lightPresetRoles(p: LightPreset): Roles {
  return rolesFrom(DESIGN.light[p] ?? DESIGN.light.paper, DESIGN.light.paper ?? {});
}

/** Dark or light, from the bg role. */
export function polarity(r: Pick<Roles, 'bg'>): 'dark' | 'light' {
  const c = parseColor(r.bg);
  return c && toOklch(c)[0] < 0.6 ? 'dark' : 'light';
}

/** Validator for stored custom palettes (json settings). */
export function isRoles(v: unknown): v is Partial<Roles> | null {
  if (v === null) return true;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.entries(v).every(([k, x]) => k in ROLES && typeof x === 'string' && (x === '' || (x === SCHOOL && DERIVED.includes(k as RoleKey)) || /^#[0-9a-f]{6}$/i.test(x)));
}

/** A complete role set: missing roles from `base`. */
export const complete = (custom: Partial<Roles> | null | undefined, base: Roles): Roles => ({ ...base, ...(custom ?? {}) });

/**
 * CSS variables for one palette, namespaced by slot (`--b2c-pl-d-*` for the
 * dark palette, `--b2c-pl-l-*` for the light one); style.css maps the slot in
 * effect onto `--b2c-dm-*`. Derived roles ('') are left out, so CSS derives
 * them from the school's brand variables.
 */
export function slotVars(slot: 'd' | 'l', roles: Partial<Roles>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const k of ROLE_KEYS) {
    const v = roles[k];
    if (v && v !== SCHOOL) vars[`--b2c-pl-${slot}-${ROLES[k]}`] = v;
  }
  return vars;
}

/** v1 helper (still used by tests and themes): vars for a dark preset or custom roles. */
export function roleVars(preset: DarkPreset | 'custom', stored: Partial<Roles>): Record<string, string> {
  return slotVars('d', preset === 'custom' ? stored : presetRoles(preset));
}

/** Worst-case contrast figures for a palette, for the settings UI's warnings. */
export function paletteContrast(r: Roles): { text: number; secondary: number; tertiary: number } {
  const c = (a: string, b: string) => {
    const x = parseColor(a), y = parseColor(b);
    return x && y ? contrast(x, y) : 0;
  };
  const on = (fg: string) => Math.min(c(fg, r.bg), c(fg, r.surface), c(fg, r.surfaceRaised));
  return { text: on(r.text), secondary: on(r.textSecondary), tertiary: Math.min(c(r.textTertiary, r.bg), c(r.textTertiary, r.surface)) };
}

/**
 * Director ruling (dark-mode.md §7): with Canvas's High Contrast UI on, a
 * theme reaches AAA. Uses the theme lane's hcGate (core/theme/contrast.ts,
 * Design's check_themes.py HC pass on the HC-transformed roles) so the engine
 * and the Studio agree: failing roles, and only those, take the fallback
 * preset's values (Black for a dark scheme, the light High contrast preset for
 * a light one); if that still fails, the whole fallback palette applies.
 * Returns just the replaced roles.
 */
export function aaaFallback(r: Roles, scheme: 'light' | 'dark' = polarity(r)): Partial<Roles> {
  const fb = scheme === 'dark' ? presetRoles('black') : lightPresetRoles('contrast');
  const gate = hcGate(r as Palette, scheme, fb as Palette);
  return gate.pass ? {} : (gate.fallback as Partial<Roles>);
}

/**
 * What a theme's unnamed roles are filled from when it's applied: the Dark
 * preset for the Dark slot, Paper for the Light slot. Used by the palette
 * engine (index.ts), the theme planner and the contrast report alike.
 */
export const SLOT_BASE = { dark: { name: 'Dark', roles: () => presetRoles('dark') }, light: { name: 'Paper', roles: () => lightPresetRoles('paper') } } as const;
