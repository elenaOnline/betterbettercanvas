// Small, dependency-free colour maths for dark mode: parsing what Canvas and
// teachers write, OKLCH (for the luminance remap that keeps hue), and WCAG
// contrast (for the nav fallback). Pure; unit-tested.

export type RGBA = [r: number, g: number, b: number, a: number]; // 0–255, alpha 0–1

const NAMED: Record<string, RGBA> = {
  white: [255, 255, 255, 1], black: [0, 0, 0, 1], red: [255, 0, 0, 1], blue: [0, 0, 255, 1],
  green: [0, 128, 0, 1], navy: [0, 0, 128, 1], maroon: [128, 0, 0, 1], purple: [128, 0, 128, 1],
  gray: [128, 128, 128, 1], grey: [128, 128, 128, 1], orange: [255, 165, 0, 1], yellow: [255, 255, 0, 1],
  teal: [0, 128, 128, 1], olive: [128, 128, 0, 1], silver: [192, 192, 192, 1], fuchsia: [255, 0, 255, 1],
  magenta: [255, 0, 255, 1], lime: [0, 255, 0, 1], aqua: [0, 255, 255, 1], cyan: [0, 255, 255, 1],
};

/** Parse #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() (comma or space syntax) and a few names. */
export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s]!;
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const m = s.match(/^rgba?\(([^)]*)\)$/);
  if (!m) return null;
  const parts = m[1]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const ch = (x: string) => (x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x));
  const rgb = parts.slice(0, 3).map(ch);
  if (rgb.some(x => !Number.isFinite(x))) return null;
  const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return [...(rgb.map(x => Math.max(0, Math.min(255, Math.round(x)))) as [number, number, number]), Number.isFinite(a) ? a : 1];
}

export const toHex = ([r, g, b]: RGBA) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

const lin = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2 relative luminance. */
export function luminance([r, g, b]: RGBA): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: RGBA, b: RGBA): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** sRGB → OKLCH: L 0–1, C ≥ 0, H degrees. */
export function toOklch([r, g, b]: RGBA): [l: number, c: number, h: number] {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, Bb);
  let H = (Math.atan2(Bb, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, C < 1e-4 ? 0 : H];
}

/** OKLCH → sRGB channels (0–255, unclamped floats; out of gamut when any is outside). */
export function fromOklch(L: number, C: number, H: number): [number, number, number] {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const enc = (x: number) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.sign(x) * Math.abs(x) ** (1 / 2.4) - 0.055);
  return [enc(R), enc(G), enc(B)];
}

/** The in-sRGB colour with this L and H and the most chroma ≤ C (keeps hue; no channel clipping). */
export function oklchInGamut(L: number, C: number, H: number): RGBA {
  const ok = (c: number) => fromOklch(L, c, H).every(x => x >= -0.5 && x <= 255.5);
  let lo = 0, hi = C;
  if (!ok(hi)) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }
  const [r, g, b] = fromOklch(L, hi, H).map(x => Math.max(0, Math.min(255, Math.round(x)))) as [number, number, number];
  return [r, g, b, 1];
}

/** Lightness floor for authored text on dark (dark-mode.md §4, §7). */
export const LIFT_L = 0.72;

export type Ink =
  | { kind: 'keep' } // already light enough, or transparent
  | { kind: 'text' } // near-black authored text → the `text` role
  | { kind: 'muted' } // authored mid-grey (de-emphasis) → `text-secondary`
  | { kind: 'lift'; css: string }; // saturated: same hue and chroma, lightness raised

/**
 * What an authored text colour becomes on a dark surface. Near-neutral dark
 * colours (black, #333, Canvas's own ink) take the theme's text colour, and
 * mid-greys (authored de-emphasis) its secondary text colour;
 * saturated ones keep hue and chroma with lightness raised to LIFT_L, so red
 * emphasis stays red.
 */
export function inkFor(c: RGBA): Ink {
  if (c[3] < 0.05) return { kind: 'keep' };
  const [L, C, H] = toOklch(c);
  if (L >= LIFT_L) return { kind: 'keep' };
  if (C < 0.045) return L < 0.45 ? { kind: 'text' } : { kind: 'muted' };
  return { kind: 'lift', css: toHex(oklchInGamut(LIFT_L, C, H)) };
}
