// Importers (research/v2-theming-todo.md §A3–A5): other formats → a v1 Theme.
// Each returns the palette as the source has it, plus notes. The caller shows
// the contrast report (contrast.ts checkPalette) and offers Fix contrast
// (fixContrast); nothing is repaired silently.
//
//   Better Canvas   a bc export ({dark_preset, card_colors, custom_font, …}) or a
//                   gallery entry ({title, exports})
//   base16 / base24 YAML: the tinted-theming shape (palette: {base00: "#…"}) or the
//                   classic flat one (base00: "…")
//   Catppuccin      catppuccin/palette's palette.json (all flavours) or one flavour
//   pywal           ~/.cache/wal/colors.json

import { toOklch, parseColor } from '../../features/palette/color.ts';
import { oklchHex } from './contrast.ts';
import { THEME_VERSION, normHex, type Palette, type Scheme, type Theme } from './format.ts';

export type Source = 'better-canvas' | 'base16' | 'catppuccin' | 'pywal';

export interface Imported {
  source: Source;
  theme: Theme;
  notes: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const schemeOf = (bg: string): Scheme => (toOklch(parseColor(bg)!)[0] < 0.6 ? 'dark' : 'light');
const base = (name: string, author?: string, source?: string): Theme => ({
  $b2c: 'theme', v: THEME_VERSION, name: name.trim().slice(0, 80) || 'Imported theme',
  ...(author?.trim() ? { author: author.trim().slice(0, 120) } : {}),
  ...(source ? { source } : {}),
});
/** Drop empty roles. */
const clean = (p: Palette): Palette => Object.fromEntries(Object.entries(p).filter(([, v]) => !!v)) as Palette;
/** A colour moved in OKLCH lightness (hue and chroma kept). */
const shift = (hex: string, dL: number) => {
  const [L, C, H] = toOklch(parseColor(hex)!);
  return oklchHex(Math.max(0, Math.min(1, L + dL)), C, H);
};

// ── Better Canvas ─────────────────────────────────────────────────────────────

/** bc dark_preset slot → b²c role (same table as settings-storage's BC_DARK_ROLES). */
const BC_ROLES: [string, keyof Palette][] = [
  ['background-0', 'bg'], ['background-1', 'surface'], ['background-2', 'surfaceRaised'], ['borders', 'border'],
  ['text-0', 'text'], ['text-1', 'textSecondary'], ['text-2', 'textTertiary'], ['links', 'link'],
  ['sidebar', 'nav'], ['sidebar-text', 'navText'],
];

export function isBetterCanvas(v: unknown): boolean {
  if (!isObj(v)) return false;
  const x = isObj(v.exports) ? v.exports : v;
  return ['dark_preset', 'card_colors', 'custom_font', 'gradient_cards', 'disable_color_overlay', 'custom_cards'].some(k => k in x);
}

export function fromBetterCanvas(v: unknown): Imported {
  if (!isBetterCanvas(v)) throw new Error("That isn't a Better Canvas theme.");
  const entry = v as Record<string, unknown>;
  const x = (isObj(entry.exports) ? entry.exports : entry) as Record<string, unknown>;
  const notes: string[] = [];
  const title = typeof entry.title === 'string' ? entry.title : '';
  const by = / by (.+)$/.exec(title);
  const theme = base(by ? title.slice(0, by.index) : title || 'Better Canvas theme', by?.[1], 'Better Canvas');

  if (isObj(x.dark_preset)) {
    const p: Palette = {};
    for (const [slot, role] of BC_ROLES) {
      const raw = x.dark_preset[slot];
      if (typeof raw !== 'string') continue;
      let h = normHex(raw);
      if (!h) {
        // bc allowed CSS gradients for the sidebar: take its first colour.
        const first = /#[0-9a-f]{3,6}\b/i.exec(raw)?.[0];
        h = first ? normHex(first) : null;
        if (h) notes.push(`The ${slot} was a gradient; b²c uses its first colour, ${h}.`);
        else notes.push(`The ${slot} value "${raw.slice(0, 40)}" isn't a colour, so it was left out.`);
      }
      if (h) p[role] = h;
    }
    if (p.bg) theme.palette = { [schemeOf(p.bg)]: p };
  }
  const cards: NonNullable<Theme['cards']> = {};
  if (Array.isArray(x.card_colors)) {
    const list = x.card_colors.map(normHex).filter((c): c is string => !!c).slice(0, 12);
    if (list.length) cards.colors = { list };
  }
  if (typeof x.gradient_cards === 'boolean') cards.style = x.gradient_cards ? 'gradient' : 'flat';
  if (typeof x.disable_color_overlay === 'boolean') cards.overlay = !x.disable_color_overlay;
  if (Object.keys(cards).length) theme.cards = cards;
  if (isObj(x.custom_font) && typeof x.custom_font.family === 'string') {
    const family = x.custom_font.family.split(',')[0]!.replace(/['"]/g, '').trim();
    if (family) {
      theme.type = { family };
      if (!['inter', 'atkinson hyperlegible', 'source serif 4', 'jetbrains mono'].includes(family.toLowerCase()))
        notes.push(`"${family}" came from Google Fonts, which b²c doesn't use. It shows if it's installed on this computer; otherwise pick one of b²c's fonts.`);
    }
  }
  if (Array.isArray(x.custom_cards)) {
    const n = x.custom_cards.filter(u => typeof u === 'string' && u !== 'none' && u !== '').length;
    if (n) notes.push(`${n} card image${n === 1 ? ' was' : 's were'} left out. Card images are personal and links to other sites break, so they never travel in a theme.`);
  }
  return { source: 'better-canvas', theme, notes };
}

// ── base16 / base24 ───────────────────────────────────────────────────────────

/** The small YAML subset scheme files use: `key: value` lines, one level of nesting, comments. */
export function parseSimpleYaml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let parent: Record<string, unknown> | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#') || line.trim() === '---') continue;
    const m = /^(\s*)([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, indent, key, rest] = m as unknown as [string, string, string, string];
    let value = rest.trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const q = value[0]!;
      const end = value.indexOf(q, 1);
      value = end > 0 ? value.slice(1, end) : value.slice(1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    if (!indent) {
      if (value === '') { parent = {}; out[key] = parent; }
      else { out[key] = value; parent = null; }
    } else if (parent) parent[key] = value;
  }
  return out;
}

export function isBase16(text: string): boolean {
  return /^\s*base0[0-9A-Fa-f]\s*:/m.test(text);
}

export function fromBase16(text: string): Imported {
  const y = parseSimpleYaml(text);
  const pal = (isObj(y.palette) ? y.palette : y) as Record<string, unknown>;
  const c = (k: string) => normHex(pal[k] ?? pal[k.toLowerCase()]);
  const need = ['base00', 'base01', 'base02', 'base03', 'base04', 'base05', 'base06', 'base07', 'base08', 'base09', 'base0A', 'base0B', 'base0C', 'base0D', 'base0E', 'base0F'];
  const missing = need.filter(k => !c(k));
  if (missing.length) throw new Error(`That base16 scheme is missing ${missing.join(', ')}.`);
  const b = (k: string) => c(k)!;
  const variant = y.variant === 'light' || y.variant === 'dark' ? (y.variant as Scheme) : schemeOf(b('base00'));
  const notes: string[] = [];
  // base24 adds darker backgrounds (base10, base11): the nav uses the darkest.
  const darkest = variant === 'dark' ? (c('base11') ?? c('base10') ?? b('base00')) : b('base07');
  const p: Palette = {
    bg: b('base00'), surface: b('base01'), surfaceRaised: b('base02'), border: b('base03'),
    text: b('base05'), textSecondary: b('base04'), textTertiary: b('base03'),
    link: b('base0D'), accent: b('base0E'),
    nav: darkest, navText: variant === 'dark' ? b('base06') : b('base00'),
    success: b('base0B'), warning: b('base0A'), danger: b('base08'),
  };
  notes.push('base16 has no roles for a border or tertiary text, so both start from base03 (the dim "comments" colour); check the contrast report.');
  const name = String(y.name ?? y.scheme ?? 'base16 scheme');
  const theme = base(name, typeof y.author === 'string' ? y.author : undefined, 'base16');
  theme.palette = { [variant]: p };
  theme.cards = { colors: { list: ['base08', 'base09', 'base0A', 'base0B', 'base0C', 'base0D', 'base0E'].map(b) } };
  return { source: 'base16', theme, notes };
}

// ── Catppuccin ────────────────────────────────────────────────────────────────

export const CATPPUCCIN_FLAVORS = ['latte', 'frappe', 'macchiato', 'mocha'] as const;
export const CATPPUCCIN_ACCENTS = ['rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach', 'yellow', 'green', 'teal', 'sky', 'sapphire', 'blue', 'lavender'] as const;
type Flavor = { name?: string; dark?: boolean; colors: Record<string, { hex: string } | string> };

function flavorOf(v: Record<string, unknown>, which?: string): { id: string; f: Flavor } | null {
  if (isObj(v.colors)) return { id: String(v.name ?? 'catppuccin').toLowerCase(), f: v as unknown as Flavor };
  const id = which ?? 'mocha';
  return isObj(v[id]) && isObj((v[id] as Record<string, unknown>).colors) ? { id, f: v[id] as unknown as Flavor } : null;
}

export function isCatppuccin(v: unknown): boolean {
  if (!isObj(v)) return false;
  return CATPPUCCIN_FLAVORS.some(f => isObj(v[f]) && isObj((v[f] as Record<string, unknown>).colors)) || (isObj(v.colors) && 'mantle' in v.colors && 'crust' in v.colors);
}

/**
 * Catppuccin palette.json → theme, mapped as Design mapped the bundled
 * Catppuccin themes: bg base, surface mantle, raised surface0 (crust in a
 * light flavour), border surface1, nav crust (text in a light flavour), link
 * blue, accent = the chosen accent (default mauve).
 */
export function fromCatppuccin(v: unknown, opts: { flavor?: string; accent?: string } = {}): Imported {
  if (!isObj(v)) throw new Error("That isn't a Catppuccin palette.");
  const fl = flavorOf(v, opts.flavor);
  if (!fl) throw new Error(`That Catppuccin palette has no "${opts.flavor ?? 'mocha'}" flavour.`);
  const col = (k: string): string => {
    const x = fl.f.colors[k];
    const h = normHex(typeof x === 'string' ? x : x?.hex);
    if (!h) throw new Error(`That Catppuccin palette is missing "${k}".`);
    return h;
  };
  const dark = fl.f.dark ?? schemeOf(col('base')) === 'dark';
  const accent = opts.accent && (CATPPUCCIN_ACCENTS as readonly string[]).includes(opts.accent) ? opts.accent : 'mauve';
  const p: Palette = {
    bg: col('base'), surface: col('mantle'), surfaceRaised: dark ? col('surface0') : col('crust'), border: col('surface1'),
    text: col('text'), textSecondary: col('subtext1'), textTertiary: dark ? col('overlay2') : col('subtext0'),
    link: col('blue'), accent: col(accent),
    nav: dark ? col('crust') : col('text'), navText: dark ? col('text') : col('base'),
    success: col('green'), warning: col('yellow'), danger: col('red'),
  };
  const pretty = typeof fl.f.name === 'string' ? fl.f.name : fl.id[0]!.toUpperCase() + fl.id.slice(1);
  const theme = base(`Catppuccin ${pretty}`, 'Catppuccin', 'https://catppuccin.com/palette');
  theme.palette = { [dark ? 'dark' : 'light']: p };
  theme.cards = { colors: { list: ['red', 'peach', 'yellow', 'green', 'teal', 'sapphire', 'blue', 'mauve'].map(col) } };
  return { source: 'catppuccin', theme, notes: [] };
}

// ── pywal ─────────────────────────────────────────────────────────────────────

export function isPywal(v: unknown): boolean {
  return isObj(v) && isObj(v.special) && isObj(v.colors) && 'color0' in v.colors;
}

/**
 * pywal's colors.json → theme. pywal's colours come from a wallpaper, so their
 * roles are guesses: background and foreground are real; the surfaces step
 * from the background in OKLCH lightness; color4 is the link, color5 the
 * accent, color1–6 the course colours.
 */
export function fromPywal(v: unknown, opts: { name?: string } = {}): Imported {
  if (!isPywal(v)) throw new Error("That isn't a pywal colors.json.");
  const w = v as { special: Record<string, unknown>; colors: Record<string, unknown>; wallpaper?: unknown };
  const c = (k: string) => {
    const h = normHex(w.colors[k]);
    if (!h) throw new Error(`That colors.json is missing ${k}.`);
    return h;
  };
  const bg = normHex(w.special.background) ?? c('color0');
  const fg = normHex(w.special.foreground) ?? c('color7');
  const scheme = schemeOf(bg);
  const step = scheme === 'dark' ? 1 : -1;
  const p: Palette = clean({
    bg, surface: shift(bg, 0.035 * step), surfaceRaised: shift(bg, 0.07 * step), border: shift(bg, 0.16 * step),
    text: fg, textSecondary: c('color7'), textTertiary: c('color8'),
    link: c('color4'), accent: c('color5'),
    nav: scheme === 'dark' ? shift(bg, -0.03) : fg, navText: scheme === 'dark' ? fg : bg,
    success: c('color2'), warning: c('color3'), danger: c('color1'),
  });
  const wall = typeof w.wallpaper === 'string' ? w.wallpaper.split(/[\\/]/).pop()!.replace(/\.[a-z0-9]+$/i, '') : '';
  const theme = base(opts.name ?? (wall ? `pywal: ${wall}` : 'pywal'), undefined, 'pywal');
  theme.palette = { [scheme]: p };
  theme.cards = { colors: { list: ['color1', 'color2', 'color3', 'color4', 'color5', 'color6'].map(c) } };
  return { source: 'pywal', theme, notes: ["pywal's colours come from a wallpaper, so which colour plays which role is a guess. Check the preview and the contrast report."] };
}
