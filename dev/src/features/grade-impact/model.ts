// Matches card rows to assignments and formats the impact. Pure.

import type { AssignmentGroup } from '../../core/canvas/data.ts';
import type { PeriodState } from '../grade-engine/periods.ts';
import { agreesWithCanvas, coursePercent, fromApi, impactOf, type Course, type Impact } from '../grade-engine/engine.ts';

/** `data-b2c-plannable="assignment:456"` -> { type, id }. */
export function parsePlannable(v: string | null | undefined): { type: string; id: string } | null {
  const m = v?.match(/^([a-z_]+):(\d+)$/);
  return m ? { type: m[1]!, id: m[2]! } : null;
}

/** Map `type:id` (as the card hook names items) to the assignment id in assignment_groups. */
export function plannableIndex(groups: readonly AssignmentGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of groups) {
    for (const a of g.assignments ?? []) {
      const x = a as typeof a & { quiz_id?: string | number | null; discussion_topic?: { id: string | number } | null };
      map.set(`assignment:${a.id}`, String(a.id));
      if (x.quiz_id) map.set(`quiz:${x.quiz_id}`, String(a.id));
      if (x.discussion_topic?.id) map.set(`discussion_topic:${x.discussion_topic.id}`, String(a.id));
    }
  }
  return map;
}

export interface CourseImpact {
  course: Course;
  index: Map<string, string>;
  /** Engine's current percent agrees with Canvas's shown total, and the grading period is known. */
  trusted: boolean;
  period: PeriodState;
}

export function prepare(groups: readonly AssignmentGroup[], applyWeights: boolean | undefined, canvasScore: number | null, hidden: boolean, period: PeriodState = { kind: 'none' }): CourseImpact {
  const course = fromApi(groups, applyWeights);
  const ours = coursePercent(course, 'current');
  return { course, index: plannableIndex(groups), period, trusted: !hidden && period.kind !== 'unknown' && canvasScore !== null && ours !== null && agreesWithCanvas(ours, canvasScore, 0.05) };
}

/** Signed percentage points, one decimal, true minus sign; an effective zero is plain "0.0". */
export function signed(n: number): string {
  const r = Math.round(Math.abs(n) * 10) / 10;
  if (r === 0) return '0.0';
  return `${n < 0 ? '−' : '+'}${r.toFixed(1)}`;
}

export interface Shown { down: string; up: string; title: string }

export function impactFor(ci: CourseImpact, plannable: string): { impact: Impact; shown: Shown } | null {
  if (!ci.trusted) return null;
  const aid = ci.index.get(plannable);
  if (!aid) return null;
  const impact = impactOf(ci.course, aid);
  if (!impact) return null;
  // "−4.2" means the course percent falls by 4.2 points at zero.
  const down = signed(-impact.down);
  const up = signed(impact.up);
  const f = (n: number) => `${Math.round(n * 10) / 10}%`;
  return {
    impact,
    shown: {
      down, up,
      title: `If you score 0: ${f(impact.ifZero)} (${down}). Full marks: ${f(impact.ifFull)} (${up}). Based on your current score${ci.period.kind === 'current' ? ` for ${ci.period.title ?? 'the current grading period'}` : ''}, with ungraded work excluded and Canvas’s group weights.`,
    },
  };
}
