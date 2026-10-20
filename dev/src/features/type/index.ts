// type: Canvas-level type tokens (design/spec/rice.md, Type): font family,
// text size and density, on b²c and on Canvas's own surfaces. Was
// `custom-font` (family) plus `shape.density`; migration 2026-10-20-type.
//
// ── Setting keys (final, 2026-10-20). The theme-file lane writes these. ──
//   type.family       'Canvas default' | 'System' | bundled fonts | 'Installed'
//                     (default 'Canvas default' = Canvas's own font: nothing applies).
//                     Canvas's OpenDyslexic (dyslexia font) always wins over it.
//   type.localFamily  the installed font's name, for 'Installed' (≤ 100 chars)
//   type.scale        0.9–1.15 (default 1): text size on Canvas
//   type.density      compact | comfortable | roomy (default comfortable = Canvas's own spacing)
// Pre-paint attributes: data-b2c-font (a family is chosen), data-b2c-type-scale
// (scale ≠ 1, with --b2c-type-scale), data-b2c-density (with --b2c-density).
import { defineFeature } from '../../core/feature.ts';
import { num, oneOf, str } from '../../core/settings/schema.ts';
import { fontSheet, fonts, selectedStack } from './fonts.ts';

export { bundledFaces, bundledFontCss, fontFamily, fontStack, fonts, selectedStack, type Font } from './fonts.ts';

export const DENSITY = { compact: 0.5, comfortable: 1, roomy: 1.5 } as const;
export const FONT_ATTR = 'data-b2c-font';

// main.js runs at document_start, before its async settings load. On warm
// navigations boot has already restored the gate: declare dynamic URLs now,
// while body is still absent. A later start (run.ts) adopts this same sheet
// by finding it in the document (module state isn't shared with the chunk).
let earlySheet: HTMLStyleElement | null = null;
let earlyObserver: MutationObserver | null = null;
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && typeof chrome.runtime?.getURL === 'function' && document.documentElement.hasAttribute(FONT_ATTR)) {
  earlySheet = fontSheet();
  (document.head ?? document.documentElement).append(earlySheet);
  earlyObserver = new MutationObserver(() => {
    if (!document.documentElement.hasAttribute(FONT_ATTR)) {
      earlySheet?.remove(); earlySheet = null;
      earlyObserver?.disconnect(); earlyObserver = null;
    }
  });
  earlyObserver.observe(document.documentElement, { attributes: true, attributeFilter: [FONT_ATTR] });
}

export function typeMirror(s: { family: string; localFamily: string; scale: number; density: string }) {
  const attrs: Record<string, string> = {};
  const vars: Record<string, string> = {};
  if (s.family !== 'Canvas default') {
    attrs[FONT_ATTR] = '';
    vars['--b2c-font'] = selectedStack(s.family as (typeof fonts)[number], s.localFamily);
  }
  if (s.scale !== 1) {
    attrs['data-b2c-type-scale'] = '';
    vars['--b2c-type-scale'] = String(s.scale);
  }
  if (s.density !== 'comfortable') {
    attrs['data-b2c-density'] = s.density;
    vars['--b2c-density'] = String(DENSITY[s.density as keyof typeof DENSITY] ?? 1);
  }
  return { attrs, vars };
}

// Runtime (start) lives in run.ts, loaded on demand: it only declares the
// bundled fonts' dynamic URLs, so it's needed only while a family is chosen.
export default defineFeature({
  id: 'type',
  settings: {
    family: oneOf(fonts, 'Canvas default'),
    localFamily: str('', { maxLength: 100 }),
    scale: num(1, { min: 0.9, max: 1.15, step: 0.01 }),
    density: oneOf(['compact', 'comfortable', 'roomy'], 'comfortable'),
  },
  pages: 'all',
  anchors: { body: 'body', instui: '#application', dyslexia: 'link[href*="dyslexic"]', tables: '.ic-Table', moduleRows: '.ig-list .ig-row' },
  mirror: s => typeMirror(s),
});
