// Pure: what the grade chip on a card says. Canvas's own numbers, never computed.
import { currentScore, type Course } from '../../core/canvas/data.ts';

export type Chip = { kind: 'hidden' } | { kind: 'none'; text: string } | { kind: 'score'; text: string; score: number; letter: string | null };

/** "92.5", "93", "88.33": at most 2 decimals, trailing zeros trimmed. */
export const fmtScore = (n: number) => String(Number(n.toFixed(2)));

export function chipFor(c: Course | undefined): Chip {
  if (!c) return { kind: 'hidden' };
  if (c.hide_final_grades) return { kind: 'hidden' };
  const score = currentScore(c);
  if (score === null) return { kind: 'none', text: 'No grade' };
  const e = c.enrollments?.find(x => /student/i.test(x.type)) as (Course['enrollments'] & {})[number] & { current_period_computed_current_grade?: string | null } | undefined;
  const letter = (e?.multiple_grading_periods_enabled ? e.current_period_computed_current_grade ?? e.computed_current_grade : e?.computed_current_grade) ?? null;
  const pct = `${fmtScore(score)}%`;
  return { kind: 'score', score, letter, text: letter ? `${pct} ${letter}` : pct };
}
