// Card colour palettes and the maths for "Set all…". Pure; unit-tested.
// b²c's own palettes keep ≥ 3:1 contrast on white, because Canvas paints the
// course name in the course colour on a white card. "Canvas" is Canvas's own
// picker set, kept as Canvas ships it.

export const PALETTES: Record<string, readonly string[]> = {
  // Canvas's own colour-picker presets, in its order.
  Canvas: ['#BD3C14', '#FF2717', '#E71F63', '#8F3E97', '#65499D', '#4554A4', '#1770AB', '#0B9BE3', '#06A3B7', '#009688', '#009606', '#8D9900', '#D97900', '#FD5D10', '#F06291', '#111111', '#556572', '#8B969E'],
  Ocean: ['#0B4F6C', '#1F6F8B', '#0E7C86', '#2A7F62', '#26547C', '#3A6EA5'],
  Sunset: ['#C0392B', '#D35400', '#B9480F', '#A93F55', '#C2185B', '#8E3B46'],
  Forest: ['#2D6A4F', '#40794B', '#1B4332', '#52734D', '#386641', '#4F772D'],
  Berry: ['#7B2CBF', '#5A189A', '#9C27B0', '#B5179E', '#7209B7', '#6A1B9A'],
  Muted: ['#6D6875', '#8D5A6A', '#6B705C', '#577590', '#7A6C5D', '#5E6472'],
  Rainbow: ['#D62828', '#E76F00', '#A07800', '#2A9D8F', '#3A6EA5', '#6A4C93'],
  Slate: ['#2D3B45', '#4A5B68', '#3D4F5C', '#5A6D7C', '#2F4858', '#556572'],
};

export const PALETTE_NAMES = Object.keys(PALETTES);

export type ColorMode = 'palette' | 'single' | 'gradient' | 'list' | 'revert';

export interface ColorRequest {
  /** Unique per request; a request applies once, in whichever Canvas tab sees it first. */
  id: string;
  mode: ColorMode;
  palette?: string;
  color?: string;
  from?: string;
  to?: string;
  /** mode 'list': colours applied in her card order, cycling (theme courseColors). */
  colors?: string[];
}

export function isColorRequest(v: unknown): v is ColorRequest | null {
  if (v === null) return true;
  if (!v || typeof v !== 'object') return false;
  const r = v as ColorRequest;
  if (r.mode === 'list') return typeof r.id === 'string' && Array.isArray(r.colors);
  return typeof r.id === 'string' && ['palette', 'single', 'gradient', 'revert'].includes(r.mode);
}

/** For the settings UI: `ctx.set({'card-colors.request': makeColorRequest({...})})`. */
export function makeColorRequest(r: Omit<ColorRequest, 'id'>): ColorRequest {
  return { ...r, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` };
}

const HEX = /^#[0-9a-f]{6}$/i;
export const normHex = (h: string) => {
  let x = h.trim();
  if (!x.startsWith('#')) x = '#' + x;
  if (/^#[0-9a-f]{3}$/i.test(x)) x = '#' + [...x.slice(1)].map(c => c + c).join('');
  return HEX.test(x) ? x.toLowerCase() : null;
};

// ── OKLab interpolation for gradients (even steps that look even) ──
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklab(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => toLin(v / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function oklabToHex([L, A, B]: [number, number, number]): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + rgb.map(c => Math.round(Math.min(1, Math.max(0, fromLin(c))) * 255).toString(16).padStart(2, '0')).join('');
}

export function gradient(from: string, to: string, n: number): string[] {
  const a = hexToOklab(from), b = hexToOklab(to);
  if (n <= 1) return [from.toLowerCase()];
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return oklabToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  });
}

/** Colours for n cards, in dashboard order. Null if the request is unusable. */
export function colorsFor(r: ColorRequest, n: number): string[] | null {
  if (r.mode === 'list') {
    const l = (r.colors ?? []).map(normHex).filter(Boolean) as string[];
    return l.length ? Array.from({ length: n }, (_, i) => l[i % l.length]!) : null;
  }
  if (r.mode === 'single') {
    const c = r.color && normHex(r.color);
    return c ? Array(n).fill(c) : null;
  }
  if (r.mode === 'gradient') {
    const a = r.from && normHex(r.from), b = r.to && normHex(r.to);
    return a && b ? gradient(a, b, n) : null;
  }
  if (r.mode === 'palette') {
    const p = r.palette ? PALETTES[r.palette] : undefined;
    return p ? Array.from({ length: n }, (_, i) => p[i % p.length]!.toLowerCase()) : null;
  }
  return null;
}

/** WCAG contrast ratio of a colour against white. */
export function contrastOnWhite(h: string): number {
  const n = parseInt(h.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => toLin(v / 255)) as [number, number, number];
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05);
}
