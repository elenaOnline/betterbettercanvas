// themes: a "look" as portable JSON (design/spec/surfaces/themes.md,
// settings.md §6). Local only: no hosting, no accounts. Pure functions; the
// settings UI (ui lane) calls them, and index.ts handles preview in Canvas tabs.
//
// A theme file:
//   { "b2cTheme": 1, "name": "…", "created": "2026-10-19T…Z",
//     "parts": { "dark": {…}, "cards": {…}, "cardColors": {…}, "font": {…}, "css": {…} } }
// Each part is optional (chosen by checkboxes on export). Setting parts hold
// full b²c setting keys, e.g. "palette.darkRoles", so import validates them against
// the running schema like any settings import.

import type { Setting } from '../../core/settings/schema.ts';
import type { Flat } from '../../core/settings/store.ts';
import { validateSettings } from '../settings-storage/model.ts';
import { PRESETS } from '../palette/palettes.ts';

export const THEME_VERSION = 1;
export type Schema = Record<string, Setting>;

/** Setting-backed parts, by key. Keys not in the running schema are skipped. */
export const PARTS = {
  /** The two theme slots (when to use dark, and personal options, stay hers). */
  dark: (k: string) => /^palette\.(light|dark|lightRoles|darkRoles)$/.test(k),
  /** Card look: gradient, overlay, condensed. */
  cards: (k: string) => /^(gradient-cards|card-overlay|condensed-cards)\./.test(k),
  font: (k: string) => k.startsWith('type.'),
  css: (k: string) => k.startsWith('custom-css.'),
} as const;
export type SettingPart = keyof typeof PARTS;
export type Part = SettingPart | 'cardColors';
export const ALL_PARTS: readonly Part[] = ['dark', 'cards', 'cardColors', 'font', 'css'];

/**
 * Card colours are Canvas's own per-course colours, not b²c settings, so a
 * theme carries a recipe, applied through card-colors' request mechanism.
 */
export interface CardColors { mode: 'palette' | 'single' | 'gradient'; palette?: string; color?: string; from?: string; to?: string }

export interface Theme {
  b2cTheme: number;
  name: string;
  created: string;
  parts: Partial<Record<SettingPart, Flat>> & { cardColors?: CardColors };
}

export interface SavedTheme { id: string; theme: Theme }

const HEX = /^#[0-9a-f]{6}$/i;

export function partOf(key: string): SettingPart | null {
  for (const p of Object.keys(PARTS) as SettingPart[]) if (PARTS[p](key)) return p;
  return null;
}

/** Build a theme from the current settings. */
export function exportTheme(all: Flat, schema: Schema, parts: readonly Part[], opts: { name: string; now: Date; cardColors?: CardColors }): Theme {
  const theme: Theme = { b2cTheme: THEME_VERSION, name: opts.name.trim() || 'My look', created: opts.now.toISOString(), parts: {} };
  for (const p of parts) {
    if (p === 'cardColors') {
      if (opts.cardColors) theme.parts.cardColors = { ...opts.cardColors };
      continue;
    }
    const vals: Flat = {};
    for (const k of Object.keys(schema)) if (PARTS[p](k) && k in all) vals[k] = all[k];
    if (Object.keys(vals).length) theme.parts[p] = vals;
  }
  return theme;
}

export const themeToJson = (t: Theme) => JSON.stringify(t, null, 2) + '\n';

export interface ThemePlan {
  theme: Theme;
  /** Validated settings to write (only keys this build knows). */
  values: Flat;
  cardColors: CardColors | null;
  /** Human-readable notes: unknown keys, invalid values, keys outside their part. */
  warnings: string[];
}

function isCardColors(v: unknown): v is CardColors {
  if (!v || typeof v !== 'object') return false;
  const c = v as CardColors;
  if (c.mode === 'palette') return typeof c.palette === 'string';
  if (c.mode === 'single') return typeof c.color === 'string' && HEX.test(c.color);
  if (c.mode === 'gradient') return typeof c.from === 'string' && typeof c.to === 'string' && HEX.test(c.from) && HEX.test(c.to);
  return false;
}

/** Parse and validate a theme file. Throws with a plain message when it isn't one. */
export function parseTheme(text: string, schema: Schema): ThemePlan {
  if (text.length > 2 * 1024 * 1024) throw new Error('That file is too big to be a b²c theme.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That isn't a b²c theme (it isn't JSON).");
  }
  const t = raw as Partial<Theme>;
  if (!t || typeof t !== 'object' || typeof t.b2cTheme !== 'number' || !t.parts || typeof t.parts !== 'object') {
    throw new Error("That isn't a b²c theme.");
  }
  if (t.b2cTheme > THEME_VERSION) throw new Error('This theme was made by a newer b²c. Update b²c and try again.');
  const warnings: string[] = [];
  const flat: Flat = {};
  for (const p of Object.keys(PARTS) as SettingPart[]) {
    const part = (t.parts as Record<string, unknown>)[p];
    if (part === undefined) continue;
    if (!part || typeof part !== 'object') {
      warnings.push(`${p}: not a list of settings, skipped.`);
      continue;
    }
    for (const [k, v] of Object.entries(part as Flat)) {
      if (!PARTS[p](k)) warnings.push(`${k}: not part of "${p}", skipped.`);
      else flat[k] = v;
    }
  }
  const plan = validateSettings(flat, schema);
  for (const k of plan.unknown) warnings.push(`${k}: not in this version of b²c, skipped.`);
  for (const k of plan.invalid) warnings.push(`${k}: invalid value, skipped.`);
  let cardColors: CardColors | null = null;
  const cc = (t.parts as Record<string, unknown>).cardColors;
  if (cc !== undefined) {
    if (isCardColors(cc)) cardColors = { ...cc };
    else warnings.push('cardColors: not a colour recipe, skipped.');
  }
  const theme: Theme = {
    b2cTheme: t.b2cTheme,
    name: typeof t.name === 'string' && t.name.trim() ? t.name.trim().slice(0, 80) : 'Imported look',
    created: typeof t.created === 'string' ? t.created : '',
    parts: t.parts as Theme['parts'],
  };
  return { theme, values: plan.values, cardColors, warnings };
}

/** Which parts a plan would change. */
export function planParts(plan: ThemePlan): Part[] {
  const ps = new Set<Part>();
  for (const k of Object.keys(plan.values)) {
    const p = partOf(k);
    if (p) ps.add(p);
  }
  if (plan.cardColors) ps.add('cardColors');
  return ALL_PARTS.filter(p => ps.has(p));
}

// ── Saved themes (themes.saved, chrome.storage.local) ─────────────────────────

export function isSavedList(v: unknown): v is SavedTheme[] {
  return Array.isArray(v) && v.every(x => !!x && typeof x === 'object' && typeof (x as SavedTheme).id === 'string' && !!(x as SavedTheme).theme);
}

export function saveTheme(list: readonly SavedTheme[], theme: Theme, id: string): SavedTheme[] {
  return [...list.filter(x => x.id !== id), { id, theme }];
}

export function renameTheme(list: readonly SavedTheme[], id: string, name: string): SavedTheme[] {
  return list.map(x => (x.id === id ? { id, theme: { ...x.theme, name: name.trim() || x.theme.name } } : x));
}

export function deleteTheme(list: readonly SavedTheme[], id: string): SavedTheme[] {
  return list.filter(x => x.id !== id);
}

export const newThemeId = (now: Date) => `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── Bundled looks: the dark presets as one-click themes ───────────────────────

export const PRESET_NAMES: Record<(typeof PRESETS)[number], string> = { dark: 'Dark', gray: 'Gray', black: 'Black', warm: 'Warm', contrast: 'High contrast' };

export function bundledThemes(): Theme[] {
  return PRESETS.map(p => {
    const dark: Flat = { 'palette.dark': p };
    return { b2cTheme: THEME_VERSION, name: PRESET_NAMES[p], created: '', parts: { dark } };
  });
}

// ── Undo beyond the 10 s toast: the look before the last Apply (24 h) ─────────

export interface Previous { at: number; values: Flat }
export const PREVIOUS_TTL = 24 * 60 * 60 * 1000;

export function isPrevious(v: unknown): v is Previous | null {
  return v === null || (!!v && typeof v === 'object' && typeof (v as Previous).at === 'number' && !!(v as Previous).values && typeof (v as Previous).values === 'object');
}

/** Snapshot the keys a plan will touch, for "Undo theme". */
export function snapshotFor(plan: ThemePlan, all: Flat, now: Date): Previous {
  const values: Flat = {};
  for (const k of Object.keys(plan.values)) values[k] = all[k];
  return { at: now.getTime(), values };
}

export function previousValid(p: Previous | null, now: Date): p is Previous {
  return !!p && now.getTime() - p.at < PREVIOUS_TTL;
}
