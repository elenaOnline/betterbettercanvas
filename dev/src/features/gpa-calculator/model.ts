// Turns Canvas courses + the user's per-course settings into rows and figures.
// Pure: no DOM, no storage. The widget only draws what this returns.

import type { Course } from '../../core/canvas/data.ts';
import { currentScore } from '../../core/canvas/data.ts';
import {
  courseResult, cumulativeGpa, currentTermId, termSummary,
  type CourseInput, type CourseResult, type CourseWeight, type Options, type Prior, type ScaleRow, type Summary,
} from './gpa.ts';

export interface CourseSetting {
  /** Credits typed by the user. Absent/null = not entered (never guessed). */
  credits?: number | null;
  /** Explicit include toggle. Absent = default (concluded courses start excluded). */
  include?: boolean;
  /** Letter the user assumes instead of Canvas's. */
  assume?: string | null;
  /** Pass/no-pass: no grade points. */
  pnp?: boolean;
  /** Honors or AP/IB (weighted GPA; used only when the scale enables weighting). */
  weight?: CourseWeight;
}
export type CourseMap = Record<string, CourseSetting>;

export const isCourseMap = (v: unknown): v is CourseMap =>
  !!v && typeof v === 'object' && !Array.isArray(v) &&
  Object.values(v as object).every(s => s && typeof s === 'object' && !Array.isArray(s));

export interface Row {
  id: string;
  code: string;
  name: string;
  /** Letter Canvas reports (or null). */
  canvasLetter: string | null;
  score: number | null;
  defaultInclude: boolean;
  setting: CourseSetting;
  input: CourseInput;
  result: CourseResult;
}

export interface Model {
  rows: Row[];
  term: Summary;
  cumulative: number | null;
  /** How many active courses belong to other terms and are left out. */
  otherTerms: number;
  /** Ids of included, graded courses that still need credits (credit-weighted mode). */
  needCredits: string[];
}

export interface ModelOptions extends Options {
  prior: Prior | null;
}

const grade = (c: Course): string | null => {
  const e = c.enrollments?.find(x => /student/i.test(x.type)) as (Record<string, unknown> & { multiple_grading_periods_enabled?: boolean; computed_current_grade?: string | null }) | undefined;
  if (!e || c.hide_final_grades) return null;
  const g = e.multiple_grading_periods_enabled ? (e.current_period_computed_current_grade as string | null | undefined) ?? e.computed_current_grade : e.computed_current_grade;
  return typeof g === 'string' && g.trim() ? g : null;
};

const isConcluded = (c: Course) => !!c.concluded || c.workflow_state === 'completed' || c.enrollments?.some(e => e.enrollment_state === 'completed') === true;

/** Which courses belong in "this term". */
export function termCourses(courses: readonly Course[], now: Date): { inTerm: Course[]; other: number; termId: string | null } {
  const terms = courses.flatMap(c => (c.term ? [c.term] : []));
  const termId = currentTermId(terms, now);
  const inTerm: Course[] = [];
  let other = 0;
  for (const c of courses) {
    const hasGrade = currentScore(c) !== null || grade(c) !== null;
    const sameTerm = termId === null || c.term?.id === termId;
    // Undated "Default Term" courses (advising, orientation) only count when graded.
    const undated = !!c.term && !c.term.start_at;
    if (sameTerm || (undated && hasGrade)) inTerm.push(c);
    else other++;
  }
  return { inTerm, other, termId };
}

export function buildModel(courses: readonly Course[], map: CourseMap, scale: readonly ScaleRow[], opts: ModelOptions, now: Date): Model {
  const { inTerm, other } = termCourses(courses, now);
  const rows: Row[] = inTerm
    .map((c): Row => {
      const s = map[c.id] ?? {};
      const defaultInclude = !isConcluded(c);
      const canvasLetter = grade(c);
      const score = currentScore(c);
      const input: CourseInput = {
        id: c.id,
        credits: typeof s.credits === 'number' ? s.credits : null,
        include: s.include ?? defaultInclude,
        pnp: !!s.pnp,
        score,
        letter: canvasLetter,
        assume: s.assume ?? null,
        weight: s.weight ?? null,
      };
      return { id: c.id, code: c.course_code, name: c.name, canvasLetter, score, defaultInclude, setting: s, input, result: courseResult(input, scale, opts) };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const results = rows.map(r => r.result);
  const term = termSummary(results, opts);
  return {
    rows,
    term,
    cumulative: cumulativeGpa(term, opts.prior, results, opts.rounding),
    otherTerms: other,
    needCredits: rows.filter(r => r.result.status === 'no-credits').map(r => r.id),
  };
}
