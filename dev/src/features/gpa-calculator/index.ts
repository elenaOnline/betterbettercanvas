import { defineFeature } from '../../core/feature.ts';
import { bool, json, num, oneOf } from '../../core/settings/schema.ts';
import { isScale, isWeights, type ScaleRow, type WeightBumps } from './gpa.ts';
import { isCourseMap, type CourseMap } from './model.ts';
import { SIDE_PANEL_MIRROR } from '../../core/side-panel.ts';
import { ANCHORS } from './anchors.ts';

export { ANCHORS } from './anchors.ts';

// Runtime (start) lives in run.ts, loaded on demand.
export default defineFeature({
  id: 'gpa-calculator',
  settings: {
    enabled: bool(false),
    /** 'auto' = this school's rule where b²c has a sourced one (none ship yet), else round. */
    rounding: oneOf(['auto', 'truncate', 'round'], 'auto'),
    /** Letter -> points table (+ fallback percent cutoffs). null = this school's scale, else 4.0 in thirds. */
    scale: json<ScaleRow[] | null>(null, { check: v => v === null || isScale(v) }),
    /** Honors/AP grade-point bumps for a weighted GPA (the "High school 4.0, weighted" preset sets {honors: 0.5, ap: 1}). null = off, which is right for colleges. */
    weights: json<WeightBumps | null>(null, { check: isWeights }),
    /** Per-course credits / include / assumed letter / pass-no-pass, keyed by Canvas course id. */
    courses: json({} as CourseMap, { check: isCourseMap }),
    includePrevious: bool(false),
    priorGpa: num(0, { min: 0, max: 5, step: 0.01 }),
    priorCredits: num(0, { min: 0, max: 1000, step: 0.5 }),
    /** Move from the side panel to a strip above the cards (bc's "Move to top"). */
    aboveCards: bool(false),
    collapsed: bool(false),
  },
  pages: ['dashboard'],
  // Reserve the side-panel column before first paint (unless it sits above the cards).
  mirror: s => (s.aboveCards ? {} : { attrs: { ...SIDE_PANEL_MIRROR } }),
  anchors: ANCHORS,
});
