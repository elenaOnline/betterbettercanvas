// Theme file v1 (design/spec/rice.md, "Theme file v1", agreed by Design and
// Dev on 2026-10-20). parse() validates; nothing here touches storage.
//
// Rules: every field is optional except the envelope ($b2c, v) and name. A
// theme overrides only what it names. Unknown fields are kept (they ride
// along on re-export) and reported, never dropped silently. Invalid known
// fields are dropped with a plain-language error. `css` is always sanitised
// here: any CSS that arrives in a file or code is someone else's until she
// edits it herself.

import { sanitizeCss, type Removed } from './sanitize.ts';

export const THEME_VERSION = 1;
/** Raw JSON size cap without `css` (rice.md: under 4 KB). */
export const THEME_MAX = 4 * 1024;

/** The 14 palette roles, in display order. Roles are only ever added, never renamed. */
export const ROLE_NAMES = [
  'bg', 'surface', 'surfaceRaised', 'border', 'text', 'textSecondary', 'textTertiary',
  'link', 'accent', 'nav', 'navText', 'success', 'warning', 'danger',
] as const;
export type Role = (typeof ROLE_NAMES)[number];
/** Roles that may be "school": derived from the school's brand at runtime. */
export const SCHOOL_ROLES: readonly Role[] = ['link', 'accent', 'nav'];
export const SCHOOL = 'school';
export type Palette = Partial<Record<Role, string>>;
export type Scheme = 'light' | 'dark';

export const DENSITIES = ['compact', 'comfortable', 'roomy'] as const;
export const CARD_STYLES = ['flat', 'gradient', 'image'] as const;
export const CARD_HEIGHTS = ['standard', 'condensed'] as const;
export const WIDTHS = ['standard', 'wide', 'full'] as const;
export const PANELS = ['right', 'left', 'hidden'] as const;
export const TODO_VIEWS = ['list', 'ring', 'week', 'courses'] as const;
/** The card due list (rice.md views.cards): every row, the next item only, or counts. */
export const CARD_VIEWS = ['rows', 'next', 'count'] as const;

export type CourseColors = { list: string[] } | { gradient: [string, string] };

export interface Theme {
  $b2c: 'theme';
  v: number;
  name: string;
  author?: string;
  source?: string;
  updateUrl?: string;
  /** Lineage (rice.md): random id set on first save, rev bumped per save, and what it was remixed from. */
  id?: string;
  rev?: number;
  from?: { id?: string; rev?: number; name?: string };
  palette?: { light?: Palette; dark?: Palette };
  type?: { family?: string; scale?: number };
  shape?: { corner?: number; border?: number };
  density?: (typeof DENSITIES)[number];
  cards?: {
    style?: (typeof CARD_STYLES)[number];
    height?: (typeof CARD_HEIGHTS)[number];
    overlay?: boolean;
    width?: number;
    gap?: number;
    colors?: CourseColors;
  };
  layout?: { width?: (typeof WIDTHS)[number]; panel?: (typeof PANELS)[number]; sections?: string[] };
  views?: { todo?: (typeof TODO_VIEWS)[number]; /** One of CARD_VIEWS (validated on parse). */ cards?: string; [view: string]: unknown };
  /** Custom CSS. Only in a full-rice share or a file; always sanitised on the way in. */
  css?: string;
  /** Unknown fields, kept as they came. */
  [extra: string]: unknown;
}

export interface ParseResult {
  /** null only when the envelope is wrong (not a theme, or a newer version). */
  theme: Theme | null;
  /** Paths of fields this version doesn't know (kept in `theme`). */
  unknown: string[];
  /** Plain-language problems; the field each one names was left out. */
  errors: string[];
  /** What the CSS sanitiser removed, when the theme had `css`. */
  cssRemoved: Removed[];
}

const HEX6 = /^#[0-9a-f]{6}$/;
/** '#ABC' / '#aabbcc' / 'aabbcc' → '#aabbcc', or null. */
export function normHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let x = v.trim().toLowerCase();
  if (!x.startsWith('#')) x = '#' + x;
  if (/^#[0-9a-f]{3}$/.test(x)) x = '#' + [...x.slice(1)].map(c => c + c).join('');
  return HEX6.test(x) ? x : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const KNOWN_TOP = new Set(['$b2c', 'v', 'name', 'author', 'source', 'updateUrl', 'id', 'rev', 'from', 'palette', 'type', 'shape', 'density', 'cards', 'layout', 'views', 'css']);

class Reader {
  unknown: string[] = [];
  errors: string[] = [];
  err(path: string, msg: string) { this.errors.push(`${path}: ${msg}`); }

  /** Copy a sub-object, validating known keys and keeping unknown ones. */
  obj(src: unknown, path: string, fields: Record<string, (v: unknown, p: string) => unknown>): Record<string, unknown> | undefined {
    if (src === undefined) return undefined;
    if (!isObj(src)) { this.err(path, 'should be a group of settings, so it was left out.'); return undefined; }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      const p = `${path}.${k}`;
      const check = Object.hasOwn(fields, k) ? fields[k] : undefined;
      if (!check) { this.unknown.push(p); out[k] = v; continue; }
      const r = check(v, p);
      if (r !== undefined) out[k] = r;
    }
    return Object.keys(out).length ? out : undefined;
  }
  str(max: number) {
    return (v: unknown, p: string) => {
      if (typeof v === 'string' && v.trim() && v.length <= max) return v.trim();
      this.err(p, `should be text (up to ${max} characters), so it was left out.`);
      return undefined;
    };
  }
  oneOf<T extends string>(values: readonly T[]) {
    return (v: unknown, p: string) => {
      if (typeof v === 'string' && (values as readonly string[]).includes(v)) return v;
      this.err(p, `"${String(v)}" isn't one of ${values.join(', ')}, so it was left out.`);
      return undefined;
    };
  }
  num(min: number, max: number, int = false) {
    return (v: unknown, p: string) => {
      if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!int || Number.isInteger(v))) return v;
      this.err(p, `should be a ${int ? 'whole ' : ''}number from ${min} to ${max}, so it was left out.`);
      return undefined;
    };
  }
  bool() {
    return (v: unknown, p: string) => {
      if (typeof v === 'boolean') return v;
      this.err(p, 'should be true or false, so it was left out.');
      return undefined;
    };
  }
  colors(min: number, max: number) {
    return (v: unknown, p: string) => {
      if (!Array.isArray(v) || v.length < min || v.length > max) { this.err(p, `should be a list of ${min} to ${max} colours, so it was left out.`); return undefined; }
      const out = v.map(normHex);
      const bad = v.filter((_, k) => !out[k]);
      if (bad.length) { this.err(p, `${bad.map(x => JSON.stringify(x)).join(', ')} ${bad.length === 1 ? "isn't a colour" : "aren't colours"} (use #rrggbb), so the list was left out.`); return undefined; }
      return out as string[];
    };
  }
  palette(v: unknown, p: string): Palette | undefined {
    const fields: Record<string, (v: unknown, p: string) => unknown> = {};
    for (const role of ROLE_NAMES) {
      fields[role] = (x, q) => {
        if (x === SCHOOL && SCHOOL_ROLES.includes(role)) return SCHOOL;
        const h = normHex(x);
        if (h) return h;
        this.err(q, `${JSON.stringify(x)} isn't a colour (use #rrggbb${SCHOOL_ROLES.includes(role) ? ' or "school"' : ''}), so it was left out.`);
        return undefined;
      };
    }
    return this.obj(v, p, fields) as Palette | undefined;
  }
}

/** Parse a theme from JSON text or an already-parsed object. Never throws. */
export function parse(input: string | object): ParseResult {
  const res: ParseResult = { theme: null, unknown: [], errors: [], cssRemoved: [] };
  let raw: unknown = input;
  if (typeof input === 'string') {
    if (input.length > 256 * 1024) { res.errors.push('That file is too big to be a b²c theme.'); return res; }
    try {
      raw = JSON.parse(input);
    } catch {
      res.errors.push("That isn't a b²c theme (it isn't JSON).");
      return res;
    }
  }
  if (!isObj(raw) || raw.$b2c !== 'theme') {
    res.errors.push(isObj(raw) && 'b2cTheme' in raw
      ? 'This is a look saved by an older b²c. Open it from Settings → Themes instead.'
      : "That isn't a b²c theme (it has no \"$b2c\": \"theme\").");
    return res;
  }
  if (typeof raw.v !== 'number' || !Number.isInteger(raw.v) || raw.v < 1) { res.errors.push('This theme has no version number ("v"), so it can\'t be read.'); return res; }
  if (raw.v > THEME_VERSION) { res.errors.push('This theme was made by a newer b²c. Update b²c and try again.'); return res; }
  if (typeof raw.name !== 'string' || !raw.name.trim()) { res.errors.push('This theme has no name.'); return res; }
  const { css: rawCss, ...rest } = raw;
  const size = new TextEncoder().encode(JSON.stringify(rest)).length;
  if (size > THEME_MAX) { res.errors.push(`This theme is ${Math.ceil(size / 1024)} KB without its CSS. A theme can be at most ${THEME_MAX / 1024} KB.`); return res; }

  const r = new Reader();
  const theme: Theme = { $b2c: 'theme', v: raw.v, name: raw.name.trim().slice(0, 80) };
  for (const [k, v] of Object.entries(raw)) {
    if (k === '$b2c' || k === 'v' || k === 'name') continue;
    if (!KNOWN_TOP.has(k)) { r.unknown.push(k); theme[k] = v; continue; }
    let out: unknown;
    switch (k) {
      case 'author': out = r.str(120)(v, k); break;
      case 'source': case 'updateUrl': out = r.str(500)(v, k); break;
      case 'id': out = r.str(64)(v, k); break;
      case 'rev': out = r.num(0, Number.MAX_SAFE_INTEGER, true)(v, k); break;
      case 'from': out = r.obj(v, k, { id: r.str(64), rev: r.num(0, Number.MAX_SAFE_INTEGER, true), name: r.str(80) }); break;
      case 'palette': out = r.obj(v, k, { light: (x, p) => r.palette(x, p), dark: (x, p) => r.palette(x, p) }); break;
      case 'type': out = r.obj(v, k, { family: r.str(100), scale: r.num(0.9, 1.15) }); break;
      case 'shape': out = r.obj(v, k, { corner: r.num(0, 12, true), border: r.num(0, 2, true) }); break;
      case 'density': out = r.oneOf(DENSITIES)(v, k); break;
      case 'cards': out = r.obj(v, k, {
        style: r.oneOf(CARD_STYLES), height: r.oneOf(CARD_HEIGHTS), overlay: r.bool(),
        width: r.num(220, 360, true), gap: r.num(8, 48, true),
        colors: (x, p) => {
          if (isObj(x) && 'list' in x) { const l = r.colors(1, 12)(x.list, `${p}.list`); return l ? { list: l } : undefined; }
          if (isObj(x) && 'gradient' in x) { const g = r.colors(2, 2)(x.gradient, `${p}.gradient`); return g ? { gradient: g } : undefined; }
          r.err(p, 'should be {"list": [colours]} or {"gradient": [from, to]}, so it was left out.');
          return undefined;
        },
      }); break;
      case 'layout': out = r.obj(v, k, {
        width: r.oneOf(WIDTHS), panel: r.oneOf(PANELS),
        sections: (x, p) => {
          if (Array.isArray(x) && x.length <= 12 && x.every(s => typeof s === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(s)) && new Set(x).size === x.length) return [...x];
          r.err(p, 'should be a list of section names (like "todo", "notes"), so it was left out.');
          return undefined;
        },
      }); break;
      case 'views': out = r.obj(v, k, { todo: r.oneOf(TODO_VIEWS), cards: r.oneOf(CARD_VIEWS) }); break;
      case 'css': break; // below
    }
    if (out !== undefined) theme[k] = out;
  }
  if (rawCss !== undefined) {
    if (typeof rawCss !== 'string') r.err('css', 'should be text, so it was left out.');
    else if (rawCss.trim()) {
      const s = sanitizeCss(rawCss);
      res.cssRemoved = s.removed;
      if (s.error) r.err('css', s.error);
      else if (s.css) theme.css = s.css;
    }
  }
  res.theme = theme;
  res.unknown = r.unknown;
  res.errors = r.errors;
  return res;
}

/** The theme as a file: `<name>.b2c-theme.json`. */
export function toJson(theme: Theme): string {
  return JSON.stringify(theme, null, 2) + '\n';
}

export function fileName(theme: Theme): string {
  const base = theme.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
  return `${base}.b2c-theme.json`;
}
