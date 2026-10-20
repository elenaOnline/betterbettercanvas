import { describe, expect, it } from 'vitest';
import type { Course } from '../../src/core/canvas/data.ts';
import { chipFor, fmtScore } from '../../src/features/card-grades/grade.ts';

const course = (e: Record<string, unknown> | null, o: Partial<Course> = {}): Course => ({
  id: '1', name: 'MATH 301', course_code: 'MATH-301',
  enrollments: e ? [{ type: 'student', ...e }] : [],
  ...o,
});

describe('grade chip', () => {
  it('formats like Canvas: ≤2 decimals, trailing zeros trimmed', () => {
    expect(fmtScore(92.5)).toBe('92.5');
    expect(fmtScore(93)).toBe('93');
    expect(fmtScore(88.3333)).toBe('88.33');
    expect(fmtScore(89.995)).toBe('90');
  });
  it('shows score and the course letter when it has one', () => {
    expect(chipFor(course({ computed_current_score: 92.5, computed_current_grade: 'A-' }))).toMatchObject({ kind: 'score', text: '92.5% A-' });
    expect(chipFor(course({ computed_current_score: 81 }))).toMatchObject({ kind: 'score', text: '81%' });
  });
  it('uses the current grading period when the course has them', () => {
    const c = course({ multiple_grading_periods_enabled: true, computed_current_score: 70, current_period_computed_current_score: 95, current_period_computed_current_grade: 'A', computed_current_grade: 'C-' });
    expect(chipFor(c)).toMatchObject({ text: '95% A' });
  });
  it('says "No grade" without a score and hides when the course hides totals', () => {
    expect(chipFor(course({ computed_current_score: null }))).toEqual({ kind: 'none', text: 'No grade' });
    expect(chipFor(course({ computed_current_score: 90 }, { hide_final_grades: true }))).toEqual({ kind: 'hidden' });
    expect(chipFor(undefined)).toEqual({ kind: 'hidden' });
  });
});
