// Decides what the Goal box says. Pure.

import type { Course as ApiCourse } from '../../core/canvas/data.ts';
import { currentScore } from '../../core/canvas/data.ts';
import { periodState, type PeriodState } from '../grade-engine/periods.ts';
import { agreesWithCanvas, coursePercent, remainingItems, solveGoal, type Course, type GoalResult, type Item } from '../grade-engine/engine.ts';

export interface Goal {
  /** Target course percent, e.g. 90. */
  pct: number;
  /** Letter it was picked as, for display (e.g. "A-"). */
  label?: string;
}
export type GoalMap = Record<string, Goal>;

export const isGoalMap = (v: unknown): v is GoalMap =>
  !!v && typeof v === 'object' && !Array.isArray(v) &&
  Object.values(v as object).every(g => g && typeof g === 'object' && Number.isFinite((g as Goal).pct) && (g as Goal).pct >= 0 && (g as Goal).pct <= 200);

/** Letters with their minimum fraction (0-1), highest first. */
export type Scheme = Array<[string, number]>;

/**
 * Canvas puts the course's grading scheme in ENV.course_active_grading_scheme:
 * { id, title, data: [{ name: "A", value: 0.94 }, ...], points_based?, scaling_factor? }.
 * null when the course has none. Points-based schemes aren't percent cutoffs, so
 * they fall back to the plain % field.
 */
export function parseScheme(raw: unknown): Scheme | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { data?: unknown; points_based?: unknown };
  if (r.points_based === true || !Array.isArray(r.data) || !r.data.length) return null;
  const out: Scheme = [];
  for (const row of r.data) {
    const x = row as { name?: unknown; value?: unknown };
    if (typeof x?.name !== 'string' || typeof x.value !== 'number' || !Number.isFinite(x.value) || x.value < 0 || x.value > 2) return null;
    out.push([x.name, x.value]);
  }
  return out.sort((a, b) => b[1] - a[1]);
}

/** Agreement tolerance between our maths and Canvas's shown total (design: 0.05). */
export const TOLERANCE = 0.05;

export type BoxState =
  | { kind: 'hidden' } //                  course hides totals: draw nothing
  | { kind: 'no-score' } //                nothing graded yet
  | { kind: 'mismatch'; ours: number | null; canvas: number } // our maths disagrees with Canvas
  | { kind: 'periods-unknown' } //          the course has grading periods and we can't tell which applies
  | { kind: 'no-goal'; current: number; period: PeriodState }
  | { kind: 'goal'; result: GoalResult; target: number; remaining: Item[]; period: PeriodState };

export function boxState(course: Course, api: Pick<ApiCourse, 'hide_final_grades' | 'enrollments'>, target: number | null): BoxState {
  if (api.hide_final_grades) return { kind: 'hidden' };
  const period = periodState(api);
  if (period.kind === 'unknown') return { kind: 'periods-unknown' };
  const canvas = currentScore(api as ApiCourse);
  const ours = coursePercent(course, 'current');
  if (canvas === null || ours === null) {
    // Canvas shows a total we cannot reproduce, or has none.
    return canvas !== null ? { kind: 'mismatch', ours, canvas } : { kind: 'no-score' };
  }
  if (!agreesWithCanvas(ours, canvas, TOLERANCE)) return { kind: 'mismatch', ours, canvas };
  if (target === null) return { kind: 'no-goal', current: ours, period };
  return { kind: 'goal', result: solveGoal(course, target), target, remaining: remainingItems(course), period };
}

/** 84, 84.2, 84.17 (up to two decimals, no trailing zeros). */
export const pct = (n: number) => String(Math.round(n * 100) / 100);

export interface Sentence { lead: string; strong?: string; tail: string }

/** The one-sentence answer, split so the number can be bold. */
export function sentence(r: GoalResult, target: number): Sentence {
  switch (r.kind) {
    case 'need': {
      const pts = Math.round(r.remainingPoints * 100) / 100;
      return { lead: 'You need an average of ', strong: `${pct(r.needed)}%`, tail: ` on the remaining ${pct(pts)} point${pts === 1 ? '' : 's'}.` };
    }
    case 'secured':
      return { lead: 'Already secured', tail: `: even zeros on the rest keep you at or above ${pct(target)}%.` };
    case 'unreachable':
      return { lead: 'Out of reach', tail: `: full marks on the rest gives ${pct(r.ceiling)}%.` };
    case 'no-remaining':
      return { lead: 'No remaining graded work', tail: ' is posted yet.' };
  }
}
