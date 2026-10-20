// shape: Canvas-level shape tokens (design/spec/rice.md: Shape). Pure CSS,
// pre-paint from the mirror; no runtime. (Density moved to `type` on
// 2026-10-20; migration 2026-10-20-type.)
//
// ── Setting keys (final, 2026-10-20). The theme-file lane writes these. ──
//   shape.corner   int px 0–12 (default 2)   → --b2c-corner, on b²c and on Canvas's own
//                  cards, buttons, inputs, tables, menus, pills and avatars (corners.gen.css,
//                  generated from Canvas's CSS; InstUI via the palette's page-world layer)
//   shape.border   0 | 1 | 2 (default 1)     → --b2c-border; 0 and 2 restyle Canvas's hairlines
// Attributes: data-b2c-shape (corner applies to Canvas), data-b2c-border="0|2".
import { defineFeature } from '../../core/feature.ts';
import { int, oneOf } from '../../core/settings/schema.ts';

/** v1 re-export: density lives in `type` now. */
export { DENSITY } from '../type/index.ts';

export function shapeMirror(s: { corner: number; border: string }) {
  const attrs: Record<string, string> = { 'data-b2c-shape': '' };
  const vars: Record<string, string> = { '--b2c-corner': `${s.corner}px`, '--b2c-border': `${s.border}px` };
  if (s.border !== '1') attrs['data-b2c-border'] = s.border;
  return { attrs, vars };
}

export default defineFeature({
  id: 'shape',
  settings: {
    corner: int(2, { min: 0, max: 12 }),
    border: oneOf(['0', '1', '2'], '1'),
  },
  pages: [],
  // Corners change layout: never on quiz pages.
  anchors: { cards: '.ic-DashboardCard', buttons: '.btn, .Button' },
  mirror: s => shapeMirror(s),
});
