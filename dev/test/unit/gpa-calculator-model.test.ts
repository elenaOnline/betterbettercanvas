import { describe, expect, it } from 'vitest';
import type { Course } from '../../src/core/canvas/data.ts';
import { buildModel, isCourseMap, termCourses } from '../../src/features/gpa-calculator/model.ts';
import { PSU_SCALE } from '../../src/features/gpa-calculator/gpa.ts';

const FALL = { id: '3', name: 'Fall 2026', start_at: '2026-09-28T00:00:00-07:00', end_at: '2026-12-12T23:59:00-08:00' };
const SPRING = { id: '2', name: 'Spring 2026', start_at: '2026-03-30T00:00:00-07:00', end_at: '2026-06-13T23:59:00-07:00' };
const DEFAULT = { id: '1', name: 'Default Term', start_at: null, end_at: null };
const NOW = new Date('2026-10-21T10:00:00-07:00');

const course = (id: string, code: string, o: Partial<Course> & { score?: number | null; grade?: string | null } = {}): Course => ({
  id, name: `${code} name`, course_code: code, term: FALL,
  enrollments: [{ type: 'student', computed_current_score: o.score ?? null, computed_current_grade: o.grade ?? null }],
  ...o,
});
const opts = { creditWeighted: true, prior: null };

describe('term selection', () => {
  it('keeps this term, drops others, and counts them', () => {
    const t = termCourses([course('1', 'MATH 401', { score: 90 }), course('2', 'WRIT 121', { term: SPRING, score: 95 })], NOW);
    expect(t.inTerm.map(c => c.id)).toEqual(['1']);
    expect(t.other).toBe(1);
  });
  it('undated courses count only when graded (advising is not a row)', () => {
    const t = termCourses([course('1', 'MATH 401', { score: 90 }), course('9', 'ADV', { term: DEFAULT }), course('8', 'LAB', { term: DEFAULT, score: 88 })], NOW);
    expect(t.inTerm.map(c => c.id).sort()).toEqual(['1', '8']);
  });
  it('with no dated terms, every course is in', () => {
    const t = termCourses([course('1', 'A', { term: DEFAULT, score: 90 }), course('2', 'B', { term: DEFAULT })], NOW);
    expect(t.inTerm).toHaveLength(2);
  });
});

describe('model', () => {
  const courses = [
    course('1', 'MATH 401', { score: 93.4, grade: 'A' }),
    course('2', 'CHEM 101', { score: 88.1 }), // no scheme: percent fallback -> B+
    course('3', 'CHEM 107', {}), // nothing graded
  ];
  it('credits start empty and are never guessed', () => {
    const m = buildModel(courses, {}, PSU_SCALE, opts, NOW);
    expect(m.term.gpa).toBeNull();
    expect(m.needCredits).toEqual(['2', '1']); // row order: CHEM 101, MATH 401
    expect(m.rows.map(r => r.result.status)).toEqual(['no-credits', 'no-grade', 'no-credits']);
  });
  it('uses Canvas letters first, the scale fallback second, and the user override over both', () => {
    const map = { '1': { credits: 4 }, '2': { credits: 4 }, '3': { credits: 1 } };
    const m = buildModel(courses, map, PSU_SCALE, opts, NOW);
    expect(m.rows.map(r => [r.result.letter, r.result.source])).toEqual([['B+', 'percent'], [null, null], ['A', 'canvas']]); // CHEM 101, CHEM 107, MATH 401
    expect(m.term.gpa).toBe(3.66); // (3.33*4 + 4*4)/8 = 3.665 -> 3.66 truncated
    const m2 = buildModel(courses, { ...map, '2': { credits: 4, assume: 'A-' } }, PSU_SCALE, opts, NOW);
    expect(m2.term.gpa).toBe(3.83); // (3.67*4 + 4*4)/8 = 3.835
  });
  it('rows sort by code, numerically', () => {
    const m = buildModel([course('1', 'MATH 401'), course('2', 'MATH 301'), course('3', 'CHEM 101')], {}, PSU_SCALE, opts, NOW);
    expect(m.rows.map(r => r.code)).toEqual(['CHEM 101', 'MATH 301', 'MATH 401']);
  });
  it('concluded courses start excluded; an explicit include wins', () => {
    const c = course('1', 'MATH 261', { score: 91, concluded: true });
    const off = buildModel([c], { '1': { credits: 4 } }, PSU_SCALE, opts, NOW);
    expect(off.rows[0]!.input.include).toBe(false);
    expect(off.term.gpa).toBeNull();
    const on = buildModel([c], { '1': { credits: 4, include: true } }, PSU_SCALE, opts, NOW);
    expect(on.term.gpa).toBe(3.67);
  });
  it('hidden final grades give no score, so no grade', () => {
    const m = buildModel([course('1', 'X', { score: 90, hide_final_grades: true })], { '1': { credits: 4 } }, PSU_SCALE, opts, NOW);
    expect(m.rows[0]!.result.status).toBe('no-grade');
  });
  it('pass/no-pass is left out, and cumulative blends the prior', () => {
    const map = { '1': { credits: 4 }, '2': { credits: 4, pnp: true }, '3': { credits: 1 } };
    const m = buildModel(courses, map, PSU_SCALE, { creditWeighted: true, prior: { gpa: 3.5, credits: 60 } }, NOW);
    expect(m.term.gpa).toBe(4);
    expect(m.term.skipped.pnp).toBe(1);
    expect(m.cumulative).toBe(3.53); // (16 + 210)/64 = 3.53125
  });
  it('unweighted mode needs no credits', () => {
    const m = buildModel(courses, {}, PSU_SCALE, { creditWeighted: false, prior: null }, NOW);
    expect(m.term.gpa).toBe(3.66); // (4 + 3.33)/2 = 3.665
    expect(m.needCredits).toEqual([]);
  });
  it('validates the stored course map', () => {
    expect(isCourseMap({ '1': { credits: 4 } })).toBe(true);
    expect(isCourseMap({})).toBe(true);
    expect(isCourseMap([])).toBe(false);
    expect(isCourseMap({ '1': 4 })).toBe(false);
    expect(isCourseMap(null)).toBe(false);
  });
});
