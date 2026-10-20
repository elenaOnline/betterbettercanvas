// Grading periods (design/spec/surfaces/grade-goals.md "Grading periods").
// In a course with grading periods Canvas's Grades page defaults to the
// CURRENT period, so goals and impact use that period's assignments (Canvas
// filters them: assignment_groups?grading_period_id=). If a course has periods
// but none is current (or we can't tell), both features decline, never silently.

import type { Course } from '../../core/canvas/data.ts';

export type PeriodState =
  | { kind: 'none' } //                                       no grading periods: the whole course
  | { kind: 'current'; id: string; title: string | null } //  use this period
  | { kind: 'unknown' }; //                                   periods exist, current one can't be determined

export function periodState(c: Pick<Course, 'enrollments'> & { has_grading_periods?: boolean }): PeriodState {
  const e = c.enrollments?.find(x => /student/i.test(x.type));
  if (!e) return { kind: 'none' };
  const has = !!(e.has_grading_periods || e.multiple_grading_periods_enabled || c.has_grading_periods);
  if (!has) return { kind: 'none' };
  const id = e.current_grading_period_id;
  if (id === null || id === undefined || id === '') return { kind: 'unknown' };
  return { kind: 'current', id: String(id), title: e.current_grading_period_title ?? null };
}

/** Request option for ctx.data.assignmentGroups; undefined = whole course. Null = don't ask (unknown). */
export function periodOpts(p: PeriodState): { gradingPeriodId?: string } | null {
  if (p.kind === 'unknown') return null;
  return p.kind === 'current' ? { gradingPeriodId: p.id } : {};
}

/** Cache/identity key for "which groups did we ask for". */
export const periodKey = (p: PeriodState) => (p.kind === 'current' ? `p${p.id}` : p.kind);

/** "Current grading period (Weeks 6–11)". */
export const periodLabel = (p: PeriodState): string | null =>
  p.kind === 'current' ? `Current grading period${p.title ? ` (${p.title})` : ''}` : null;
