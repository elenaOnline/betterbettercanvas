import { describe, expect, it } from 'vitest';
import { periodKey, periodLabel, periodOpts, periodState } from '../../src/features/grade-engine/periods.ts';
import { boxState } from '../../src/features/grade-goals/model.ts';
import { impactFor, prepare } from '../../src/features/grade-impact/model.ts';
import type { Course, Group, Item } from '../../src/features/grade-engine/engine.ts';
import type { AssignmentGroup } from '../../src/core/canvas/data.ts';

const enr = (o: Record<string, unknown>) => ({ enrollments: [{ type: 'student', ...o }] }) as Parameters<typeof periodState>[0];

describe('periodState', () => {
  it('no periods: the whole course', () => {
    expect(periodState(enr({ computed_current_score: 80 }))).toEqual({ kind: 'none' });
    expect(periodState({ enrollments: [] })).toEqual({ kind: 'none' });
    expect(periodState(enr({ has_grading_periods: false }))).toEqual({ kind: 'none' });
  });
  it('periods with a current one: that period, named (either flag counts)', () => {
    expect(periodState(enr({ has_grading_periods: true, current_grading_period_id: 7102, current_grading_period_title: 'Weeks 6–11' }))).toEqual({ kind: 'current', id: '7102', title: 'Weeks 6–11' });
    expect(periodState(enr({ multiple_grading_periods_enabled: true, current_grading_period_id: '9', current_grading_period_title: null }))).toEqual({ kind: 'current', id: '9', title: null });
  });
  it('periods but no current one: unknown (decline)', () => {
    expect(periodState(enr({ has_grading_periods: true, current_grading_period_id: null }))).toEqual({ kind: 'unknown' });
    expect(periodState(enr({ has_grading_periods: true }))).toEqual({ kind: 'unknown' });
  });
  it('request options and labels', () => {
    expect(periodOpts({ kind: 'none' })).toEqual({});
    expect(periodOpts({ kind: 'current', id: '5', title: 'A' })).toEqual({ gradingPeriodId: '5' });
    expect(periodOpts({ kind: 'unknown' })).toBeNull();
    expect(periodKey({ kind: 'current', id: '5', title: 'A' })).toBe('p5');
    expect(periodKey({ kind: 'none' })).toBe('none');
    expect(periodLabel({ kind: 'current', id: '5', title: 'Weeks 6–11' })).toBe('Current grading period (Weeks 6–11)');
    expect(periodLabel({ kind: 'current', id: '5', title: null })).toBe('Current grading period');
    expect(periodLabel({ kind: 'none' })).toBeNull();
  });
});

const it_ = (id: string, score: number | null, possible: number): Item => ({ id, name: id, score, possible });
const grp = (items: Item[]): Group => ({ id: 'g', name: 'g', weight: 0, dropLowest: 0, dropHighest: 0, neverDrop: [], items });
const course: Course = { weighted: false, groups: [grp([it_('a', 80, 100), it_('b', null, 100)])] };

describe('grade-goals with grading periods', () => {
  it('names the period under the answer state', () => {
    const api = enr({ has_grading_periods: true, current_grading_period_id: 7102, current_grading_period_title: 'Weeks 6–11', current_period_computed_current_score: 80, computed_current_score: 60 });
    const st = boxState(course, api, 90);
    expect(st.kind).toBe('goal');
    expect((st as { period: unknown }).period).toEqual({ kind: 'current', id: '7102', title: 'Weeks 6–11' });
  });
  it('compares with the PERIOD total Canvas shows, not the all-periods total', () => {
    const api = enr({ has_grading_periods: true, current_grading_period_id: 1, current_grading_period_title: 'P', current_period_computed_current_score: 80, computed_current_score: 71 });
    expect(boxState(course, api, null).kind).toBe('no-goal');
    const wrong = enr({ has_grading_periods: true, current_grading_period_id: 1, current_period_computed_current_score: 71, computed_current_score: 80 });
    expect(boxState(course, wrong, null).kind).toBe('mismatch');
  });
  it('declines honestly when the current period is unknown', () => {
    expect(boxState(course, enr({ has_grading_periods: true, computed_current_score: 80 }), 90).kind).toBe('periods-unknown');
  });
  it('hidden totals still win over everything', () => {
    expect(boxState(course, { ...enr({ has_grading_periods: true }), hide_final_grades: true }, 90).kind).toBe('hidden');
  });
});

describe('grade-impact with grading periods', () => {
  const groups = [{ id: '1', name: 'HW', group_weight: 0, assignments: [
    { id: '11', name: 'a', points_possible: 100, submission: { score: 90 } },
    { id: '12', name: 'b', points_possible: 20, submission: null },
  ] }] as AssignmentGroup[];
  it('the tooltip names the period', () => {
    const ci = prepare(groups, undefined, 90, false, { kind: 'current', id: '7', title: 'Weeks 6–11' });
    const r = impactFor(ci, 'assignment:12')!;
    expect(r.shown.title).toContain('Based on your current score for Weeks 6–11, with ungraded work excluded');
  });
  it('an unnamed period still says which', () => {
    const ci = prepare(groups, undefined, 90, false, { kind: 'current', id: '7', title: null });
    expect(impactFor(ci, 'assignment:12')!.shown.title).toContain('for the current grading period');
  });
  it('declines when the period is unknown', () => {
    expect(impactFor(prepare(groups, undefined, 90, false, { kind: 'unknown' }), 'assignment:12')).toBeNull();
  });
  it('without periods the tooltip is unchanged', () => {
    expect(impactFor(prepare(groups, undefined, 90, false), 'assignment:12')!.shown.title).toMatch(/Based on your current score, with ungraded work excluded/);
  });
});
