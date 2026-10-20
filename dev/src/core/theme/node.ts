// Node entry for the Agent kit's `b2c check` (the Dev lead adds the build
// entry). No chrome.* at import or call time: everything here is pure, and
// share codes use Node's global CompressionStream (Node ≥ 21.2).
//
//   planTheme(text, opts?) → Promise<ThemeCheck>
//       Read a theme the way the Studio's Import does (share code, .b2c-theme.json,
//       Better Canvas, base16, Catppuccin, pywal), then plan it against b²c's
//       default settings (or `opts.settings`). `ok` is true when it parsed with
//       no errors and every floor passes; contrast failures and High Contrast
//       fallbacks are reported, never fixed silently.
//   sanitizeCss(css) → { css, removed[], error? }   (shared CSS, sanitize.ts)
//   THEME_LIMITS                                    the sizes a theme must fit

import { schema } from '../registry.ts';
import { importText, plan, type ImportResult, type Plan } from './index.ts';
import { THEME_MAX } from './format.ts';
import { SHARED_CSS_MAX } from './sanitize.ts';
import type { Flat } from './map.ts';

export { sanitizeCss, SHARED_CSS_MAX, type SanitizeResult, type Removed } from './sanitize.ts';
export { parse, encodeShare, decodeShare, exportTheme, fixTheme, contrastReport, PRESETS, EXCLUDED, type Theme } from './index.ts';

export const THEME_LIMITS = {
  /** Theme JSON without `css`, bytes (rice.md). */
  themeBytes: THEME_MAX,
  /** Shared CSS in a rice code or file, bytes (UTF-8, before sanitising). */
  cssBytes: SHARED_CSS_MAX,
  /** A typical token-only share code stays under this many characters (tested on the presets). */
  typicalCodeChars: 1024,
  /** cards.colors.list entries. */
  courseColors: 12,
  /** Name length (longer is cut). */
  nameChars: 80,
  /** Supported theme file version. */
  version: 1,
} as const;

/** b²c's default settings, as store.load() returns them on a fresh install. */
export function defaultSettings(): Flat {
  return Object.fromEntries(Object.entries(schema).map(([k, s]) => [k, s.default]));
}

export interface ThemeCheck extends ImportResult {
  /** Parsed cleanly, and no contrast floor fails. */
  ok: boolean;
  /** What applying would write (CSS included only with opts.css). Null when it didn't parse. */
  plan: Plan | null;
}

export async function planTheme(text: string, opts: { settings?: Flat; css?: boolean; courseColors?: boolean; flavor?: string; accent?: string } = {}): Promise<ThemeCheck> {
  const r = await importText(text, opts);
  const p = r.theme ? plan(r.theme, opts.settings ?? defaultSettings(), { css: opts.css, courseColors: opts.courseColors }) : null;
  const failing = Object.values(r.contrast).some(s => s.failing.length > 0);
  return { ...r, ok: !!r.theme && r.errors.length === 0 && !failing, plan: p };
}
