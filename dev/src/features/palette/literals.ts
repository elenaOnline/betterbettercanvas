// The literal map (dark-mode.md §6): which Canvas colour literal becomes which
// dark-mode role, per property kind. One source for both
//   layer (b), scripts/gen-dark-literals.mjs → literals.gen.css (compiled SCSS), and
//   layer (c), instui-main.ts (InstUI/emotion styles inserted at runtime).
// Colours not in the table but nearly neutral (OKLCH chroma < 0.02) map by
// lightness (neutralRole), so Canvas's stray greys (#f4f4f4, #e6e6e6, #d9d9d9,
// #858585 …) don't leave light islands. Saturated unmapped colours are left
// alone and reported. Ported from Design's prototype (design/spec/tools/gen_dark_prototype.py),
// which is a superset of the spec table. Node imports this file directly
// (type stripping), so keep it to erasable TypeScript.

/** 0 = background, 1 = foreground (color/fill/stroke), 2 = border/outline. */
export type Kind = 0 | 1 | 2;
import { parseColor, toOklch } from './color.ts';

type Row = [bg: string | null, fg: string | null, bd: string | null];

export const LIT: Record<string, Row> = {};
function m(hexes: string, bg: string | null, fg: string | null, bd: string | null) {
  for (const h of hexes.split(/\s+/).filter(Boolean)) LIT[h] = [bg, fg, bd];
}

// White text sits on coloured fills (buttons, badges, heroes): left alone.
m('#ffffff', 'bg', null, 'border');
m('#f2f4f4 #f5f5f5 #f9fafa #f0f0f0 #eeeeee #f7f7f7 #fafafa #f3f3f3', 'surface', null, 'border');
m('#e8eaec #e5e5e5 #dddddd #d7dade #c7cdd1 #c1c7cf #cccccc #e0e0e0 #d5d5d5 #bbbbbb', 'surface-raised', 'text-tertiary', 'border');
m('#273540 #2d3b45 #333333 #3d454c #444444 #000000 #222222 #404040', 'surface-raised', 'text', 'border');
m('#334451', 'surface-raised', 'text', 'border');
m('#3f515e #4a5b68 #555555', null, 'text-secondary', 'border');
m('#586874 #6a7883 #6b7780 #666666 #777777', null, 'text-secondary', 'border');
m('#8d959f #9ea6ad #888888 #999999 #aaaaaa', null, 'text-tertiary', 'border');
m('#eef7ff', 'hover', null, null);
m('#d9edf9 #e0ebf5 #e0f7fa', 'selected', null, null);
m('#dceee4', 'success-tint', null, null);
m('#fce4e5 #f2dede', 'danger-tint', null, null);
m('#fce5d9 #fcf8e3', 'warning-tint', null, null);
m('#d9edf7', 'info-tint', null, null);
m('#03893d #027634 #417e42 #468847', null, 'success', 'success');
m('#e62429 #c71f23 #b94a48 #c43c35 #ee5f5b #ad393a #e0061f', null, 'danger', 'danger');
m('#f06e26 #cf4a00 #c86604 #c09853', null, 'warning', 'warning');
m('#2b7abc #0e68b3 #3a87ad #0374b5 #1a5a8e', null, 'link', 'link');
m('#ffff00 #eedc94', 'highlight', null, null);

/**
 * Role for an unmapped near-neutral colour, by lightness. Thresholds bracket
 * the table's own greys (#ffffff bg, #f5f5f5 surface, #e8eaec raised, …).
 */
export function neutralRole(hex: string, kind: Kind): string | null {
  const rgb = parseColor(hex);
  if (!rgb) return null;
  const [L, C] = toOklch(rgb);
  if (C >= 0.02) return null;
  if (kind === 2) return 'border';
  if (kind === 0) {
    if (L >= 0.99) return 'bg';
    if (L >= 0.955) return 'surface';
    if (L >= 0.8) return 'surface-raised';
    if (L < 0.45) return 'surface-raised';
    return null;
  }
  if (L < 0.45) return 'text';
  if (L < 0.6) return 'text-secondary';
  if (L < 0.9) return 'text-tertiary';
  return null; // light text sits on a coloured or dark fill
}

export const KIND: Record<string, Kind> = {};
for (const p of 'background background-color background-image'.split(' ')) KIND[p] = 0;
for (const p of 'color fill stroke caret-color text-decoration-color -webkit-text-fill-color'.split(' ')) KIND[p] = 1;
for (const p of ('border border-color border-top border-right border-bottom border-left border-top-color ' +
  'border-right-color border-bottom-color border-left-color outline outline-color column-rule ' +
  'column-rule-color border-block border-inline border-block-color border-inline-color').split(' ')) KIND[p] = 2;

const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000' };
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;

/** Normalise a colour token to [#rrggbb, alpha], or null. */
export function norm(tok: string): [string, number] | null {
  const t = tok.toLowerCase();
  if (NAMED[t]) return [NAMED[t]!, 1];
  if (t.startsWith('#')) {
    let h = t.slice(1);
    if (![3, 4, 6, 8].includes(h.length)) return null;
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    return ['#' + h.slice(0, 6), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  const nums = t.slice(t.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean);
  if (nums.length < 3) return null;
  const rgb = nums.slice(0, 3).map(x => Math.round(x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x)));
  if (rgb.some(x => !Number.isFinite(x))) return null;
  const a = nums[3] === undefined ? 1 : nums[3].endsWith('%') ? parseFloat(nums[3]) / 100 : parseFloat(nums[3]);
  return ['#' + rgb.map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join(''), a];
}

/** How a mapped literal is written: the generator uses the role var; InstUI a var with the literal as fallback. */
export type Ref = (role: string, kind: Kind, hex: string, original: string) => string;

export const roleRef: Ref = role => `var(--b2c-dm-${role})`;
/** Role-named switch variable: undefined (so the fallback literal applies) unless dark is on. */
export const litVar = (role: string) => `--b2c-lit-${role}`;
// The fallback is the opaque hex: alpha is re-applied by rewriteValue's
// color-mix, so with dark off the result equals the original exactly.
export const fallbackRef: Ref = (role, _kind, hex, original) => `var(${litVar(role)}, ${hex || original})`;

/**
 * Rewrite the colour literals in one declaration value, or return null when
 * nothing is mapped. `unmapped` (optional) collects colours with no role.
 */
/** Extra, runtime-only mapping consulted before the neutral fallback (the school's brand literals). */
export type Extra = (hex: string, kind: Kind) => string | null;

export function rewriteValue(prop: string, value: string, ref: Ref, unmapped?: (hex: string) => void, extra?: Extra): string | null {
  const kind = KIND[prop];
  if (kind === undefined) return null;
  let changed = false;
  const sub = (tok: string) => {
    const n = norm(tok);
    if (!n) return tok;
    const [hex, a] = n;
    const role = hex in LIT ? LIT[hex]![kind] : (extra?.(hex, kind) ?? neutralRole(hex, kind));
    if (role === null) {
      if (!(hex in LIT)) unmapped?.(hex);
      return tok;
    }
    if (a <= 0.001) return tok;
    // Black at partial alpha as a fill or border is shading (hover darkening,
    // scrims, shadows on the nav), not a surface: it reads on any theme.
    if (hex === '#000000' && a < 0.999 && kind !== 1) return tok;
    changed = true;
    const r = ref(role, kind, hex, tok);
    return a >= 0.999 ? r : `color-mix(in srgb, ${r} ${Math.round(a * 100)}%, transparent)`;
  };
  // Canvas's brand primary used as TEXT or a border (the school's dark
  // green, say): on a theme it's the link role; as a fill it stays the accent
  // (palette.css remaps the variable to accent on body).
  const brandVar = (m: string) => {
    if (kind === 0) return m;
    changed = true;
    return ref('link', kind, '', m);
  };
  // Never touch url(...) contents (file names like icon-x-black.svg).
  const BRAND = /^var\(--ic-brand-(?:primary|button--primary-bgd)(?:-[\w-]*)?(?:,[^()]*)?\)$/;
  const out = value
    .split(/(url\([^)]*\)|var\(--ic-brand-(?:primary|button--primary-bgd)(?:-[\w-]*)?(?:,[^()]*)?\))/)
    .map(p => (p.startsWith('url(') ? p : BRAND.test(p) ? brandVar(p) : p.replace(COLOR_RE, sub)))
    .join('');
  return changed ? out : null;
}

/** Every role the map can produce (table + neutral fallback). */
export const ALL_ROLES = [...new Set([
  ...Object.values(LIT).flat().filter((r): r is string => !!r),
  'bg', 'surface', 'surface-raised', 'border', 'text', 'text-secondary', 'text-tertiary', 'accent', 'link',
])].sort();

/** The --b2c-lit-* definitions that switch InstUI literals to roles while dark is on. */
export function litVarDefs(): string {
  return ALL_ROLES.map(r => `${litVar(r)}:var(--b2c-dm-${r})`).join(';');
}

// ── Corners (shape): every non-zero border radius → the corner token ─────────

export const RADIUS_PROP = /^border(-(top|bottom)-(left|right)|-(start|end)-(start|end))?-radius$/;

/**
 * A radius value with each non-zero length mapped through `to(token)`, or
 * null when there's nothing to map (all zero, or var()/calc()/inherit).
 */
export function cornerValue(value: string, to: (tok: string) => string = () => 'var(--b2c-corner)'): string | null {
  const toks = value.trim().split(/\s+/);
  if (!toks.every(t => t === '/' || /^-?[\d.]+(px|rem|em|%)?$/.test(t))) return null;
  if (toks.every(t => t === '/' || parseFloat(t) === 0)) return null;
  return toks.map(t => (t === '/' || parseFloat(t) === 0 ? t : to(t))).join(' ');
}
