// Theme → setting keys (plan), settings → theme (exportTheme), and writing a
// plan in one transaction with Undo (apply / revert).

import type { Store } from '../settings/store.ts';
import { changeWithUndo } from '../settings/undo.ts';
import { makeColorRequest } from '../../features/card-colors/palettes.ts';
import { DARK_PRESETS, LIGHT_PRESETS, OPTIONAL, ROLE_KEYS, lightPresetRoles, presetRoles, type Roles } from '../../features/palette/palettes.ts';
import { darkSlot, lightSlot, type PaletteValues } from '../../features/palette/index.ts';
import { ROLE_NAMES, THEME_VERSION, type Palette, type Scheme, type Theme } from './format.ts';
import { KEYS, MAP, PARTS, getPath, setPath, type Flat, type Part } from './map.ts';

export interface Note {
  /** The theme field it's about. */
  path: string;
  /** skipped: this build can't apply it; consent: needs a yes first; info: worth saying. */
  kind: 'skipped' | 'consent' | 'info';
  text: string;
}

export interface Plan {
  /** Setting values to write (one transaction). */
  values: Flat;
  notes: Note[];
  /** The theme's custom CSS, when it has some: shown for consent ("12 lines"). */
  css: { lines: number; bytes: number; included: boolean } | null;
  /** Course colours the theme would write to Canvas, in her card order. */
  courseColors: { count: number; included: boolean } | null;
}

export interface PlanOptions {
  /** Include the theme's custom CSS (default false: it needs an explicit yes). */
  css?: boolean;
  /** Include the course colour request (default true; the sheet says it writes to Canvas). */
  courseColors?: boolean;
}

const has = (s: Flat, k: string) => Object.hasOwn(s, k);
const sameRoles = (a: Partial<Roles>, b: Partial<Roles>) =>
  ROLE_KEYS.filter(k => !OPTIONAL.includes(k)).every(k => (a[k] || '') === (b[k] || ''));

/** The stored roles for a theme palette: only what it names ("school" stays "school"). */
function storedRoles(p: Palette): Partial<Roles> {
  const out: Partial<Roles> = {};
  for (const k of ROLE_KEYS) if (typeof p[k] === 'string') out[k] = p[k]!;
  return out;
}

/** Slot value for a palette: a bundled preset's name when it's exactly that preset, else 'custom'. */
function slotFor(scheme: Scheme, p: Palette): { name: string; roles: Partial<Roles> | null } {
  const roles = storedRoles(p);
  const presets = scheme === 'dark' ? DARK_PRESETS : LIGHT_PRESETS;
  const base = scheme === 'dark' ? presetRoles('dark') : lightPresetRoles('paper');
  const full = { ...base, ...roles };
  for (const name of presets) {
    const pr = scheme === 'dark' ? presetRoles(name as (typeof DARK_PRESETS)[number]) : lightPresetRoles(name as (typeof LIGHT_PRESETS)[number]);
    if (sameRoles(full, pr)) return { name, roles: null };
  }
  return { name: 'custom', roles };
}

/** Map a theme to setting values. `settings` is the full loaded settings (store.load()). */
export function plan(theme: Theme, settings: Flat, opts: PlanOptions = {}): Plan {
  const values: Flat = {};
  const notes: Note[] = [];
  const skip = (path: string) => notes.push({ path, kind: 'skipped', text: "This version of b²c can't apply this yet, so it was skipped." });

  // Palette slots.
  for (const scheme of ['light', 'dark'] as const) {
    const p = theme.palette?.[scheme];
    if (!p) continue;
    const [slotKey, rolesKey] = scheme === 'dark' ? [KEYS.dark, KEYS.darkRoles] : [KEYS.light, KEYS.lightRoles];
    if (!has(settings, slotKey)) { skip(`palette.${scheme}`); continue; }
    const { name, roles } = slotFor(scheme, p);
    values[slotKey] = name;
    if (roles) values[rolesKey] = roles;
    const useDark = settings[KEYS.useDark];
    if (scheme === 'dark' && useDark === 'never') notes.push({ path: 'palette.dark', kind: 'info', text: 'This sets your dark theme. "Use dark theme" is Never, so it shows when you turn that on.' });
    if (scheme === 'light' && useDark === 'always') notes.push({ path: 'palette.light', kind: 'info', text: 'This sets your light theme. "Use dark theme" is Always, so it shows when you change that.' });
  }

  // The table.
  for (const r of MAP) {
    const v = getPath(theme, r.path);
    if (v === undefined) continue;
    if (!has(settings, r.keys[0]!)) { skip(r.path); continue; }
    for (const [k, x] of Object.entries(r.write(v))) if (has(settings, k)) values[k] = x;
    if (r.path === 'cards.style' && v === 'image') notes.push({ path: r.path, kind: 'info', text: 'Card images are personal, so they never travel in a theme. Add your own from each card\'s menu.' });
  }

  // Course colours: Canvas's own colours, in her card order.
  let courseColors: Plan['courseColors'] = null;
  const cc = theme.cards?.colors;
  if (cc) {
    const count = 'list' in cc ? cc.list.length : 2;
    const included = opts.courseColors !== false && has(settings, KEYS.colorRequest);
    courseColors = { count, included };
    if (!has(settings, KEYS.colorRequest)) skip('cards.colors');
    else if (included) {
      const req = 'gradient' in cc
        ? makeColorRequest({ mode: 'gradient', from: cc.gradient[0], to: cc.gradient[1] })
        : cc.list.length === 1
          ? makeColorRequest({ mode: 'single', color: cc.list[0]! })
          : // `list` mode (cycles the list in card order): requested from the card-colors owner.
            { id: makeColorRequest({ mode: 'revert' }).id, mode: 'list', colors: [...cc.list] };
      values[KEYS.colorRequest] = req;
      notes.push({ path: 'cards.colors', kind: 'info', text: "Course colours are Canvas's own, so this changes them in Canvas too, in your card order. Undo puts them back." });
    }
  }

  // Custom CSS: never without a yes.
  let css: Plan['css'] = null;
  if (theme.css) {
    const included = !!opts.css && has(settings, KEYS.css);
    css = { lines: theme.css.trimEnd().split('\n').length, bytes: new TextEncoder().encode(theme.css).length, included };
    if (!has(settings, KEYS.css)) skip('css');
    else if (included) {
      values[KEYS.css] = theme.css;
      if (has(settings, KEYS.cssEnabled)) values[KEYS.cssEnabled] = true;
      notes.push({ path: 'css', kind: 'info', text: 'This replaces your custom CSS. Undo puts yours back.' });
    } else {
      notes.push({ path: 'css', kind: 'consent', text: `This theme includes custom CSS (${css.lines} line${css.lines === 1 ? '' : 's'}). It applies only if you choose Apply all.` });
    }
  }
  return { values, notes, css, courseColors };
}

export interface ExportOptions {
  name: string;
  author?: string;
  /** Which parts (default: everything but css, so a theme is gallery-safe). */
  parts?: readonly Part[];
  /** Her course colours in card order (from ctx.data.colors), to carry as cards.colors. */
  courseColors?: readonly string[];
  /** Lineage, when re-saving or remixing. */
  id?: string; rev?: number; from?: Theme['from'];
}

/** Read the current look back from setting keys. */
export function exportTheme(settings: Flat, opts: ExportOptions): Theme {
  const parts = new Set<Part>(opts.parts ?? PARTS.filter(p => p !== 'css'));
  const t: Theme = { $b2c: 'theme', v: THEME_VERSION, name: opts.name.trim().slice(0, 80) || 'My theme' };
  if (opts.author?.trim()) t.author = opts.author.trim().slice(0, 120);
  if (opts.id) t.id = opts.id;
  if (opts.rev !== undefined) t.rev = opts.rev;
  if (opts.from) t.from = opts.from;
  if (parts.has('palette') && has(settings, KEYS.dark)) {
    const s = { dark: settings[KEYS.dark], darkRoles: settings[KEYS.darkRoles], light: settings[KEYS.light], lightRoles: settings[KEYS.lightRoles] } as PaletteValues;
    const toPalette = (r: Roles): Palette => Object.fromEntries(ROLE_NAMES.filter(k => r[k]).map(k => [k, r[k]]));
    const palette: Theme['palette'] = { dark: toPalette(darkSlot(s)) };
    const l = lightSlot(s);
    if (l) palette.light = toPalette(l);
    t.palette = palette;
  }
  for (const r of MAP) {
    if (!parts.has(r.part) || !has(settings, r.keys[0]!)) continue;
    const v = r.read(settings);
    if (v !== undefined) setPath(t, r.path, v);
  }
  if (parts.has('layout') && opts.courseColors?.length) setPath(t, 'cards.colors', { list: opts.courseColors.slice(0, 12).map(c => c.toLowerCase()) });
  if (parts.has('css') && typeof settings[KEYS.css] === 'string' && (settings[KEYS.css] as string).trim()) t.css = settings[KEYS.css] as string;
  return t;
}

export interface Applied {
  plan: Plan;
  /** The values the keys had before, for a later revert. */
  before: Flat;
  /** Undo within 10 s (settings-storage's changeWithUndo). Resolves false once expired. */
  undo(): Promise<boolean>;
}

/**
 * Apply a theme: one transaction through the store, so open Canvas tabs update
 * live. Undo also files a card-colors revert when the course colours were
 * already written to Canvas.
 */
export async function apply(store: Store, theme: Theme, opts: PlanOptions & { now?: () => number } = {}): Promise<Applied> {
  const settings = await store.load();
  const p = plan(theme, settings, opts);
  const before = Object.fromEntries(Object.keys(p.values).map(k => [k, settings[k]]));
  const undo = await changeWithUndo(store, { values: p.values }, opts.now);
  return {
    plan: p,
    before,
    async undo() {
      const req = p.values[KEYS.colorRequest] as { id?: string } | undefined;
      const appliedId = req ? (await store.load())[KEYS.colorApplied] : undefined;
      const ok = await undo();
      if (ok && req && appliedId === req.id) await store.set({ [KEYS.colorRequest]: makeColorRequest({ mode: 'revert' }) });
      return ok;
    },
  };
}

/** Put back what an apply changed, at any later time (the Studio's "Revert"). */
export async function revert(store: Store, applied: Pick<Applied, 'before' | 'plan'>): Promise<void> {
  const req = applied.plan.values[KEYS.colorRequest] as { id?: string } | undefined;
  const now = await store.load();
  const values: Flat = { ...applied.before };
  if (req) values[KEYS.colorRequest] = now[KEYS.colorApplied] === req.id ? makeColorRequest({ mode: 'revert' }) : applied.before[KEYS.colorRequest];
  await store.set(values);
}
