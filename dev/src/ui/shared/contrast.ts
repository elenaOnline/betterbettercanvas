// Contrast readouts for the dark-mode colour wells (surfaces/dark-mode.md §8):
// WCAG 2 ratio and APCA Lc, worst case across the surfaces a text role is
// read on. Same maths as design/spec/check_palettes.py. It warns; it never
// blocks or fixes anything.

/** "School" link/nav colours derive from Canvas's brand at runtime. the pilot school's: */
export const SCHOOL: Readonly<Record<string, string>> = { link: '#7dc8f3', nav: '#213921' };

/** Floors per text role: [WCAG ratio, APCA |Lc|]. */
export const FLOORS: Readonly<Record<string, readonly [number, number]>> = {
  text: [7, 75], 'text-secondary': [4.5, 60], 'text-tertiary': [4.5, 45], link: [4.5, 60], 'nav-text': [7, 75],
};
/** Surfaces each text role is read on (default: page, surface, raised). */
const ON: Readonly<Record<string, readonly string[]>> = { 'nav-text': ['nav'] };
const SURFACES = ['bg', 'surface', 'surface-raised'] as const;

const HEX6 = /^#[0-9a-f]{6}$/i;
export const isSchool = (v: unknown) => v === 'school' || v === '' || v == null;
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX6.test(v);

/** Resolve "school" placeholders to concrete colours. */
export function resolveRoles(c: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = { ...c };
  for (const [r, v] of Object.entries(SCHOOL)) if (isSchool(out[r])) out[r] = v;
  return out;
}

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const relLum = (h: string) => { const [r, g, b] = rgb(h).map(lin) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

export function wcag(a: string, b: string): number {
  const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** APCA-W3 0.0.98G-4g, signed Lc. */
export function apca(fg: string, bg: string): number {
  const Y = (h: string) => {
    const [r, g, b] = rgb(h).map(c => (c / 255) ** 2.4) as [number, number, number];
    const v = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    return v < 0.022 ? v + (0.022 - v) ** 1.414 : v;
  };
  const yt = Y(fg), yb = Y(bg);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

export interface Readout { w: number; lc: number; low: string; text: string; title: string }

/** Worst-case contrast of a text role, or null when it isn't a text role or a colour is missing. */
export function readout(role: string, colors: Readonly<Record<string, string>>): Readout | null {
  const floor = FLOORS[role];
  if (!floor) return null;
  const c = resolveRoles(colors);
  const on = ON[role] ?? SURFACES;
  if (!isHex(c[role]) || !on.every(s => isHex(c[s]))) return null;
  const w = Math.min(...on.map(s => wcag(c[role]!, c[s]!)));
  const lc = Math.min(...on.map(s => Math.abs(apca(c[role]!, c[s]!))));
  const [fw, fl] = floor;
  const low = w < fw ? 'Below AA' : lc < fl ? `Below Lc ${fl}` : '';
  return {
    w, lc, low,
    text: `${w.toFixed(1)}:1 · Lc ${Math.round(lc)}`,
    title: `Worst case on ${role === 'nav-text' ? 'the nav' : 'page, surface and raised'}. Floor ${fw}:1, Lc ${fl}`,
  };
}
