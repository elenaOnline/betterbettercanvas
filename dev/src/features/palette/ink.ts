// Inline-colour classification for the palette engine's runtime pass
// (run.ts). Pure; unit-tested.
import { parseColor, toOklch } from './color.ts';
import { LIT, norm } from './literals.ts';

/** Near-white, low-chroma (pasted white wrappers read as paper islands on any palette). */
export const nearWhite = (c: string | null) => {
  const rgb = c ? parseColor(c) : null;
  if (!rgb || rgb[3] < 0.9) return false;
  const [L, C] = toOklch(rgb);
  return L >= 0.96 && C < 0.02;
};

/**
 * What an inline background becomes under a palette (the data-b2c-ink-bg
 * value), or null to keep it. Teacher HTML: only near-white, low-chroma is
 * cleared ("clear"); tinted authored colours are meaningful and keep their
 * pair. Canvas's own inline backgrounds (React styles, the calendar's today
 * cell): mapped like its CSS, by the literal map, plus any near-white.
 */
export function bgRole(c: string | null, userContent: boolean): string | null {
  if (userContent) return nearWhite(c) ? 'clear' : null;
  const n = c ? norm(c) : null;
  if (!n || n[1] < 0.9) return null;
  const [hex] = n;
  // Exact Canvas literals and near-white only: an inline grey may be a
  // course colour (card heroes), which is identity and stays.
  return hex in LIT ? LIT[hex]![0] : nearWhite(c) ? 'bg' : null;
}
