// "school" roles: link, accent and nav taken from the school's own brand at
// runtime (dark-mode.md §4, §9c). One rule, per scheme, shared by the runtime
// (the mirror's DERIVED_CSS and style.css's slot rules, drift-tested) and by
// the contrast checks (core/theme/contrast.ts), so the engine and the Studio
// can't disagree:
//   light  the school's colours as they are: link = --ic-link-color,
//          accent = --ic-brand-primary, nav = --ic-brand-global-nav-bgd
//   dark   link lifted to OKLCH L 0.80 (chroma ≤ 0.11), accent set to L 0.50
//          (chroma ≥ 0.08), nav as it is
import { fromOklch, parseColor, toHex, toOklch, type RGBA } from './color.ts';

export type Scheme = 'light' | 'dark';
export type SchoolRole = 'link' | 'accent' | 'nav';

export interface Brand { name: string; link: string; nav: string; primary: string }

/** Design's two sample brands: a school's own (the pilot school) and Canvas's default. "school" roles must pass on both. */
export const PSU_BRAND: Brand = { name: 'sample school (the pilot school)', link: '#005f85', nav: '#213921', primary: '#213921' };
export const CANVAS_BRAND: Brand = { name: 'Canvas default', link: '#0e68b3', nav: '#334451', primary: '#2b7abc' };
export const SAMPLE_BRANDS: readonly Brand[] = [PSU_BRAND, CANVAS_BRAND];

/** The dark lift (the only numbers in the rule). */
export const DARK_LIFT = { link: { L: 0.8, maxC: 0.11 }, accent: { L: 0.5, minC: 0.08 } } as const;

/** The brand variable each role reads, and Canvas's default as the CSS fallback. */
const SOURCE: Record<SchoolRole, { v: string; fallback: string; key: keyof Omit<Brand, 'name'> }> = {
  link: { v: '--ic-link-color', fallback: CANVAS_BRAND.link, key: 'link' },
  accent: { v: '--ic-brand-primary', fallback: CANVAS_BRAND.primary, key: 'primary' },
  nav: { v: '--ic-brand-global-nav-bgd', fallback: CANVAS_BRAND.nav, key: 'nav' },
};

/** The CSS that derives a "school" role on <html> for a scheme. */
export function schoolCss(scheme: Scheme, role: SchoolRole): string {
  const src = `var(${SOURCE[role].v}, ${SOURCE[role].fallback})`;
  if (scheme === 'dark' && role === 'link') return `oklch(from ${src} ${DARK_LIFT.link.L.toFixed(2)} min(c, ${DARK_LIFT.link.maxC}) h)`;
  if (scheme === 'dark' && role === 'accent') return `oklch(from ${src} ${DARK_LIFT.accent.L.toFixed(2)} max(c, ${DARK_LIFT.accent.minC}) h)`;
  return src;
}

const clampHex = (rgb: [number, number, number]) => toHex([...rgb.map(x => Math.max(0, Math.min(255, Math.round(x)))), 1] as RGBA);

/** The colour a "school" role resolves to for a brand, as the CSS above computes it. */
export function schoolHex(scheme: Scheme, role: SchoolRole, brand: Brand): string {
  const hex = brand[SOURCE[role].key].toLowerCase();
  if (scheme !== 'dark' || role === 'nav') return hex;
  const [, C, H] = toOklch(parseColor(hex)!);
  if (role === 'link') return clampHex(fromOklch(DARK_LIFT.link.L, Math.min(C, DARK_LIFT.link.maxC), H));
  return clampHex(fromOklch(DARK_LIFT.accent.L, Math.max(C, DARK_LIFT.accent.minC), H));
}
