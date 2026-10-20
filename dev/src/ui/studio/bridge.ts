// The Studio's model ↔ b²c's settings. Pure; unit-tested.
//
// The Studio edits one state object S (Design's prototype model: two palette
// slots, one shared "look", feature values, course colours, the theme names).
// Settings are the source of truth: S is read from them (fromSettings) and
// every edit is written back as the setting keys that changed (toPatch), so
// open Canvas tabs follow live through chrome.storage.
//
// Look fields go through the core theme table (src/core/theme/map.ts MAP) and
// palettes through the palette slots, so a value the Studio shows is exactly
// what a shared theme or the tabs would get. Fields this build has no key for
// (an image card face, the card due view, a panel side before it lands) live
// in the Studio's own record (`b2c:studio` in chrome.storage.local) and still
// travel in exported themes.
import { MAP, getPath, setPath, KEYS } from '../../core/theme/map.ts';
import { plan, type Theme, type Palette } from '../../core/theme/index.ts';
import { darkSlot, lightSlot } from '../../features/palette/index.ts';
import { lightPresetRoles, presetRoles, ROLE_KEYS, type Roles } from '../../features/palette/palettes.ts';
import type { ScaleRow } from '../../features/gpa-calculator/gpa.ts';
import { scalePreset, scalePresetPatch, SCALE_KEY, WEIGHTS_KEY } from '../shared/gpa-scale.ts';
import { CC_DEFAULT, COURSES } from './data.ts';

export type Flat = Record<string, unknown>;

export type SchemaLike = Readonly<Record<string, { default: unknown }>>;
export type Scheme = 'light' | 'dark';

export interface Look {
  shape: { corner: number; border: number };
  type: { family: string; scale: number };
  density: string;
  cards: { style: string; height: string; overlay: boolean; width: number; gap: number };
  layout: { width: string; panel: string; sections: string[] };
  views: { todo: string; cards: string };
  css: string;
}

/** A theme as the Studio holds it: whole role sets per slot (null = Canvas, untouched). */
export interface Rice {
  id?: string;
  name: string;
  palette: { light?: Roles | null; dark?: Roles };
  look: Partial<Look>;
  colors: string[] | null;
  css: string | null;
  bundled?: boolean;
}

export interface State {
  pal: { light: Roles | null; dark: Roles };
  from: { light: string; dark: string };
  look: Look;
  editing: Scheme;
  useDark: string;
  sched: { from: string; to: string };
  saved: Rice[];
  cc: Record<string, string>;
  f: Record<string, unknown>;
  base: { name: string; snap: string };
}

/** The Studio's own record, for what has no setting key. */
export interface Meta {
  from?: { light: string; dark: string };
  base?: { name: string; snap: string };
  look?: Partial<Look>;
  cc?: Record<string, string>;
  editing?: Scheme;
}
export const META_KEY = 'b2c:studio';

export function defaultLook(): Look {
  return {
    shape: { corner: 2, border: 1 }, type: { family: 'Canvas default', scale: 1 }, density: 'comfortable',
    cards: { style: 'flat', height: 'standard', overlay: true, width: 262, gap: 36 },
    layout: { width: 'standard', panel: 'right', sections: ['todo', 'notes', 'gpa'] },
    views: { todo: 'list', cards: 'rows' }, css: '',
  };
}

// ── Feature values: the Studio's short names ↔ setting keys ──
interface FKey { key: string; to?: (v: unknown) => unknown; from?: (v: unknown) => unknown; def: unknown }
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
export const FKEYS: Readonly<Record<string, FKey>> = {
  cardAssign: { key: 'card-assignments.enabled', def: true },
  nShown: { key: 'card-assignments.count', def: 4 },
  inclOverdue: { key: 'card-assignments.overdue', def: true },
  showCompleted: { key: 'card-assignments.showCompleted', def: false },
  tAssign: { key: 'card-assignments.assignments', def: true },
  tQuiz: { key: 'card-assignments.quizzes', def: true },
  tDisc: { key: 'card-assignments.discussions', def: true },
  gradeImpact: { key: 'grade-impact.enabled', def: false },
  cardGrades: { key: 'card-grades.enabled', def: true },
  gradeHover: { key: 'card-grades.hoverOnly', def: false },
  customizeCards: { key: 'card-customization.enabled', def: true },
  notes: { key: 'dashboard-notes.enabled', def: false },
  hideFeedback: { key: 'hide-recent-feedback.enabled', def: false },
  todo: { key: 'better-todo.enabled', def: true },
  todoN: { key: 'better-todo.count', def: 8 },
  todoAnn: { key: 'better-todo.announcements', def: true },
  todoOverdue: { key: 'better-todo.showOverdue', def: true },
  todoHideCompleted: { key: 'better-todo.hideCompleted', def: true },
  todoColors: { key: 'better-todo.courseColors', def: true },
  hoverPreview: { key: 'better-todo.hoverPreview', def: true },
  sync: { key: 'core.plannerSync', def: true },
  dates: { key: 'core.dates', def: 'relative' },
  clock: { key: 'core.clock', def: 'system' },
  gpa: { key: 'gpa-calculator.enabled', def: false },
  gpaScale: { key: 'gpa-calculator.scale', def: 'auto' }, // read and written with the weights (gpa-scale.ts)
  rounding: { key: 'gpa-calculator.rounding', def: 'auto' },
  includePrev: { key: 'gpa-calculator.includePrevious', def: false },
  prevGpa: { key: 'gpa-calculator.priorGpa', def: 0, to: num },
  prevCredits: { key: 'gpa-calculator.priorCredits', def: 0, to: num },
  aboveCards: { key: 'gpa-calculator.aboveCards', def: false },
  goals: { key: 'grade-goals.enabled', def: true },
  quiz: { key: 'core.quizSafe', def: 'untouched', from: v => (v === 'colours' ? 'colours' : 'untouched'), to: v => (v === 'colours' ? 'colours' : 'nothing') },
  dimImages: { key: 'palette.dimImages', def: false },
  navStyle: { key: 'palette.navStyle', def: 'school' },
  hideLogo: { key: 'hide-logo.enabled', def: false },
  tabIcons: { key: 'tab-icons.enabled', def: false },
  cssOn: { key: 'custom-css.enabled', def: false },
  paused: { key: 'core.paused', def: false },
  autoUpdate: { key: 'core.autoUpdate', def: false },
};

/** GPA scale: null = this school's (Automatic), a bundled preset, or her own table. */
export const scaleName = (v: ScaleRow[] | null | undefined, weights: unknown = null) => scalePreset(v, weights);

// ── Palettes ──
const BASE: Record<Scheme, () => Roles> = { dark: () => presetRoles('dark'), light: () => lightPresetRoles('paper') };

/** A theme palette as a whole role set ('' for status roles it leaves to the scheme). */
export function wholeRoles(p: Palette | Partial<Roles> | null | undefined, scheme: Scheme): Roles {
  const base = BASE[scheme]();
  const out = { ...base } as Roles;
  for (const k of ROLE_KEYS) {
    const v = (p as Record<string, string> | null | undefined)?.[k];
    if (typeof v === 'string') out[k] = v === '' && ['link', 'accent', 'nav'].includes(k) ? 'school' : v;
  }
  return out;
}
/** For a theme file: leave out roles that are '' (the scheme's own status colours). */
export function filePalette(r: Roles): Palette {
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v)) as Palette;
}

const SLOT_NAMES: Record<string, string> = { canvas: 'Canvas', paper: 'Paper', sepia: 'Sepia', contrast: 'High contrast', dark: 'Dark', gray: 'Gray', black: 'Black', warm: 'Warm', custom: 'Custom' };

// ── Settings → S ──
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const has = (s: Flat, k: string) => Object.hasOwn(s, k);

/** The look as settings say, keeping a Studio-only value where its key would read back the same. */
export function lookFrom(settings: Flat, meta: Partial<Look> | undefined): Look {
  const look = structuredClone({ ...defaultLook(), ...(meta ?? {}) }) as Look;
  for (const k of ['shape', 'type', 'cards', 'layout', 'views'] as const) look[k] = { ...defaultLook()[k], ...(meta?.[k] ?? {}) } as never;
  for (const r of MAP) {
    if (!has(settings, r.keys[0]!)) continue;
    const fromKeys = r.read(settings);
    if (fromKeys === undefined) continue;
    const mine = getPath(look as unknown as Theme, r.path);
    // A Studio value whose keys say the same thing stays (e.g. an image card face is "not gradient").
    if (mine !== undefined && eq(r.read({ ...settings, ...r.write(mine) }), fromKeys)) continue;
    setPath(look as unknown as Theme, r.path, fromKeys);
  }
  if (typeof settings[KEYS.css] === 'string') look.css = settings[KEYS.css] as string;
  return look;
}

export function fFrom(settings: Flat): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  for (const [name, d] of Object.entries(FKEYS)) {
    const v = settings[d.key];
    f[name] = v === undefined ? d.def : d.from ? d.from(v) : v;
  }
  f.gpaScale = scalePreset(settings[SCALE_KEY] as ScaleRow[] | null, settings[WEIGHTS_KEY]);
  return f;
}

export function palFrom(settings: Flat): State['pal'] {
  const s = {
    dark: String(settings[KEYS.dark] ?? 'dark'), darkRoles: (settings[KEYS.darkRoles] ?? null) as Partial<Roles> | null,
    light: String(settings[KEYS.light] ?? 'canvas'), lightRoles: (settings[KEYS.lightRoles] ?? null) as Partial<Roles> | null,
  };
  const l = lightSlot(s);
  return { light: l ? wholeRoles(l, 'light') : null, dark: wholeRoles(darkSlot(s), 'dark') };
}

/** Names for the slots: the Studio's record, else the bundled preset's name. */
function slotName(settings: Flat, scheme: Scheme, meta: Meta): string {
  const v = String(settings[scheme === 'dark' ? KEYS.dark : KEYS.light] ?? (scheme === 'dark' ? 'dark' : 'canvas'));
  if (v === 'custom') return meta.from?.[scheme] ?? 'Custom';
  return SLOT_NAMES[v] ?? v;
}

export const riceSnap = (s: Pick<State, 'pal' | 'look'>) => JSON.stringify({ pal: s.pal, look: s.look });

export function fromSettings(settings: Flat, meta: Meta = {}, saved: Rice[] = []): State {
  const s: State = {
    pal: palFrom(settings),
    from: { light: slotName(settings, 'light', meta), dark: slotName(settings, 'dark', meta) },
    look: lookFrom(settings, meta.look),
    editing: meta.editing ?? 'light',
    useDark: String(settings[KEYS.useDark] ?? 'system'),
    sched: { from: String(settings['palette.start'] ?? '20:00'), to: String(settings['palette.end'] ?? '08:00') },
    saved,
    cc: { ...CC_DEFAULT, ...(meta.cc ?? {}) },
    f: fFrom(settings),
    base: { name: '', snap: '' },
  };
  s.base = meta.base ?? { name: s.editing === 'dark' ? s.from.dark : s.from.light, snap: riceSnap(s) };
  return s;
}

// ── S → setting keys ──
/** Every setting value S implies (keys this build lacks are left out). */
export function settingsFor(s: State, settings: Flat): Flat {
  const out: Flat = {};
  const theme: Theme = { $b2c: 'theme', v: 1, name: 'studio', palette: { dark: s.pal.dark as Palette } };
  if (s.pal.light) theme.palette!.light = s.pal.light as Palette;
  const p = plan(theme, settings);
  for (const [k, v] of Object.entries(p.values)) out[k] = v;
  if (!s.pal.light && has(settings, KEYS.light)) out[KEYS.light] = 'canvas';
  for (const r of MAP) {
    const v = getPath(s.look as unknown as Theme, r.path);
    if (v === undefined || !has(settings, r.keys[0]!)) continue;
    // Keep a Studio-only value's key as it is when the key already reads the same.
    if (eq(r.read({ ...settings, ...r.write(v) }), r.read(settings))) continue;
    for (const [k, x] of Object.entries(r.write(v))) if (has(settings, k)) out[k] = x;
  }
  if (has(settings, KEYS.css)) out[KEYS.css] = s.look.css;
  for (const [name, d] of Object.entries(FKEYS)) {
    if (name === 'gpaScale') {
      if (has(settings, SCALE_KEY) && s.f.gpaScale !== scalePreset(settings[SCALE_KEY] as ScaleRow[] | null, settings[WEIGHTS_KEY]) && s.f.gpaScale !== 'custom')
        Object.assign(out, scalePresetPatch(String(s.f.gpaScale), settings[SCALE_KEY] as ScaleRow[] | null, has(settings, WEIGHTS_KEY)));
      continue;
    }
    if (!has(settings, d.key) || !(name in s.f)) continue;
    const cur = d.from ? d.from(settings[d.key]) : settings[d.key];
    if (eq(cur, s.f[name])) continue; // e.g. a custom GPA table stays as it is
    out[d.key] = d.to ? d.to(s.f[name]) : s.f[name];
  }
  if (has(settings, KEYS.useDark)) out[KEYS.useDark] = s.useDark;
  if (has(settings, 'palette.start')) out['palette.start'] = s.sched.from;
  if (has(settings, 'palette.end')) out['palette.end'] = s.sched.to;
  return out;
}

/** Only the keys that differ from the stored settings: what to write. */
export function toPatch(s: State, settings: Flat): Flat {
  const all = settingsFor(s, settings);
  return Object.fromEntries(Object.entries(all).filter(([k, v]) => !eq(settings[k], v)));
}

export const metaOf = (s: State): Meta => ({ from: s.from, base: s.base, look: s.look, cc: s.cc, editing: s.editing });

// ── Themes: the core file ↔ the Studio's Rice ──
const pick = <T extends string>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : undefined);

export function toRice(t: Theme, id?: string): Rice {
  const palette: Rice['palette'] = {};
  if (t.palette?.light) palette.light = wholeRoles(t.palette.light, 'light');
  if (t.palette?.dark) palette.dark = wholeRoles(t.palette.dark, 'dark');
  if (!t.palette && /identity/.test(String(t.source ?? ''))) palette.light = null; // Canvas: the identity
  const look: Partial<Look> = {};
  if (t.shape) look.shape = { ...defaultLook().shape, ...t.shape } as Look['shape'];
  if (t.type) look.type = { ...defaultLook().type, ...t.type } as Look['type'];
  if (t.density) look.density = t.density;
  if (t.cards) { const { colors: _c, ...c } = t.cards; look.cards = { ...defaultLook().cards, ...c } as Look['cards']; }
  if (t.layout) look.layout = { ...defaultLook().layout, ...t.layout } as Look['layout'];
  if (t.views) {
    const v: Partial<Look['views']> = {};
    const todo = pick(t.views.todo, ['list', 'ring', 'week', 'courses'] as const), cards = pick(t.views.cards, ['rows', 'next', 'count'] as const);
    if (todo) v.todo = todo;
    if (cards) v.cards = cards;
    if (Object.keys(v).length) look.views = { ...defaultLook().views, ...v };
  }
  const cc = t.cards?.colors;
  const colors = cc && 'list' in cc ? cc.list.slice(0, 16) : null;
  return { id: id ?? t.id, name: t.name, palette, look, colors, css: typeof t.css === 'string' && t.css.trim() ? t.css : null };
}

/** The theme file for S (the agreed v1 format). Course colours: hers, in card order. */
export function exportRice(s: State, name: string, opts: { css: boolean; colors: boolean }): Theme {
  const L = s.look;
  const t: Theme = { $b2c: 'theme', v: 1, name };
  const pal: Theme['palette'] = {};
  if (s.pal.light) pal.light = filePalette(s.pal.light);
  pal.dark = filePalette(s.pal.dark);
  t.palette = pal;
  t.type = { family: L.type.family, scale: L.type.scale };
  t.shape = { corner: L.shape.corner, border: L.shape.border };
  t.density = L.density as Theme['density'];
  t.cards = { style: L.cards.style as never, height: L.cards.height as never, overlay: L.cards.overlay, width: L.cards.width, gap: L.cards.gap };
  if (opts.colors) t.cards.colors = { list: COURSES.map(c => s.cc[c.id]!.toLowerCase()) };
  t.layout = { width: L.layout.width as never, panel: L.layout.panel as never, sections: [...L.layout.sections] };
  t.views = { todo: L.views.todo as never, cards: L.views.cards };
  if (opts.css && L.css.trim()) t.css = L.css;
  return t;
}

/** Apply a Rice to S: it overrides only what it names. Returns the slot it filled first. */
export function applyRice(s: State, t: Rice, opts: { css?: boolean } = {}): Scheme | null {
  let first: Scheme | null = null;
  for (const sc of ['light', 'dark'] as const) {
    if (!(sc in t.palette)) continue;
    const p = t.palette[sc];
    if (sc === 'light') s.pal.light = p ? { ...p } : null;
    else if (p) s.pal.dark = { ...p };
    s.from[sc] = t.name;
    first ??= sc;
  }
  const L = t.look;
  for (const k of Object.keys(L) as (keyof Look)[]) {
    const v = L[k];
    (s.look as unknown as Record<string, unknown>)[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(s.look[k] as object), ...structuredClone(v) } : structuredClone(v);
  }
  if (t.css != null && opts.css !== false) s.look.css = t.css;
  if (first) s.editing = first;
  s.base = { name: t.name, snap: riceSnap(s) };
  return first;
}

/** My themes, as stored in themes.saved ({ id, theme }) — b²c v1 theme files only. */
export function savedFrom(v: unknown): Rice[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap(x => {
    const t = (x as { theme?: Theme })?.theme;
    return t && t.$b2c === 'theme' ? [toRice(t, String((x as { id?: string }).id ?? t.name))] : [];
  });
}
export function savedTo(list: readonly Rice[], s: State): { id: string; theme: Theme }[] {
  return list.map(r => {
    const tmp: State = { ...s, pal: { light: r.palette.light ?? null, dark: r.palette.dark ?? s.pal.dark }, look: { ...defaultLook(), ...structuredClone(r.look) } as Look };
    const t = exportRice(tmp, r.name, { css: !!r.css, colors: false });
    if (!('light' in r.palette)) delete t.palette!.light;
    if (!r.palette.dark) delete t.palette!.dark;
    if (r.colors) t.cards = { ...t.cards, colors: { list: r.colors } };
    if (r.css) t.css = r.css;
    return { id: r.id ?? r.name, theme: t };
  });
}
