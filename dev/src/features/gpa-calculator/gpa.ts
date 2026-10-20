// Pure GPA maths. No DOM, no Canvas, no clock.
//
// Policy (research/canvas-surface.md §4, the pilot school 2025-26 bulletin):
//  - letter -> points is the scale below (no A+); percent -> letter is only a
//    fallback for courses where Canvas gives no letter;
//  - GPA is TRUNCATED to two decimals, not rounded;
//  - pass/no-pass and ungraded courses carry no points.

export interface ScaleRow {
  letter: string;
  /** Grade points, e.g. 3.67. */
  points: number;
  /** Lowest percent that earns this letter (fallback only). */
  min: number;
}

/** The "4.0, plus/minus in thirds" scale (the pilot school's, and the most common US college scale), with common cutoffs. The instructor's own scheme wins in Canvas. */
export const PSU_SCALE: ScaleRow[] = [
  { letter: 'A', points: 4.0, min: 93 },
  { letter: 'A-', points: 3.67, min: 90 },
  { letter: 'B+', points: 3.33, min: 87 },
  { letter: 'B', points: 3.0, min: 83 },
  { letter: 'B-', points: 2.67, min: 80 },
  { letter: 'C+', points: 2.33, min: 77 },
  { letter: 'C', points: 2.0, min: 73 },
  { letter: 'C-', points: 1.67, min: 70 },
  { letter: 'D+', points: 1.33, min: 67 },
  { letter: 'D', points: 1.0, min: 63 },
  { letter: 'D-', points: 0.67, min: 60 },
  { letter: 'F', points: 0.0, min: 0 },
];

const T = (rows: Array<[string, number, number]>): ScaleRow[] => rows.map(([letter, points, min]) => ({ letter, points, min }));
const CUT: Array<[string, number]> = [['A', 93], ['A-', 90], ['B+', 87], ['B', 83], ['B-', 80], ['C+', 77], ['C', 73], ['C-', 70], ['D+', 67], ['D', 63], ['D-', 60], ['F', 0]];

/** Presets for the settings menu (design/spec/surfaces/gpa-calculator.md). The table is the setting; a preset just fills it. */
export const SCALE_PRESETS: Record<string, { label: string; scale: ScaleRow[]; /** Honors/AP bumps this preset turns on (the settings menu writes them with the scale). */ weights?: WeightBumps }> = {
  thirds: { label: '4.0, plus/minus in thirds (the pilot school)', scale: PSU_SCALE },
  tenths: {
    label: '4.0, plus/minus in tenths',
    scale: T(CUT.map(([l, m], i) => [l, [4.0, 3.7, 3.3, 3.0, 2.7, 2.3, 2.0, 1.7, 1.3, 1.0, 0.7, 0][i]!, m])),
  },
  'a-plus': {
    label: '4.0 with A+ 4.33 (thirds)',
    scale: T([['A+', 4.33, 97], ...PSU_SCALE.map((r): [string, number, number] => [r.letter, r.points, r.min])]),
  },
  'high-school': {
    label: 'High school 4.0, weighted (Honors +0.5, AP/IB +1.0)',
    scale: T([['A', 4, 90], ['B', 3, 80], ['C', 2, 70], ['D', 1, 60], ['F', 0, 0]]),
    weights: { honors: 0.5, ap: 1 },
  },
  whole: { label: '4.0, no plus/minus', scale: T([['A', 4, 90], ['B', 3, 80], ['C', 2, 70], ['D', 1, 60], ['F', 0, 0]]) },
};

/**
 * Host -> suggested defaults (research/school-scales.md; add a row only with an
 * official source). Unknown hosts get the common US scale, rounded.
 */
export const HOST_DEFAULTS: Record<string, { preset: keyof typeof SCALE_PRESETS; rounding: Rounding }> = {
  // Per-school rules, each with a public source. None ship yet: a school that
  // truncates is a user choice (Rounding → Truncate).
};
export const FALLBACK_DEFAULTS: { preset: keyof typeof SCALE_PRESETS; rounding: Rounding } = { preset: 'thirds', rounding: 'round' };

/** What an unset scale / 'auto' rounding resolve to on this host. */
export function hostDefaults(host: string): { scale: ScaleRow[]; rounding: Rounding; known: boolean } {
  const known = HOST_DEFAULTS[host.toLowerCase()];
  const d = known ?? FALLBACK_DEFAULTS;
  return { scale: SCALE_PRESETS[d.preset]!.scale, rounding: d.rounding, known: !!known };
}

/** The scale and rounding in effect: the user's explicit choice, else the host's default. */
export function resolveScale(setting: ScaleRow[] | null, rounding: Rounding | 'auto', host: string): { scale: ScaleRow[]; rounding: Rounding } {
  const d = hostDefaults(host);
  return { scale: setting ?? d.scale, rounding: rounding === 'auto' ? d.rounding : rounding };
}

/** Validator for the editable scale setting. */
export function isScale(v: unknown): v is ScaleRow[] {
  return (
    Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= 30 &&
    v.every(
      r =>
        r &&
        typeof r.letter === 'string' &&
        r.letter.trim().length > 0 &&
        r.letter.length <= 4 &&
        Number.isFinite(r.points) &&
        r.points >= 0 &&
        r.points <= 5 &&
        Number.isFinite(r.min) &&
        r.min >= 0 &&
        r.min <= 1000,
    )
  );
}

/** Truncate (not round) to 2 decimals, immune to binary float noise (3.6699999 -> 3.66 is right, 3.67 stays 3.67). */
export function truncate2(x: number): number {
  return Math.floor(x * 100 + 1e-9) / 100;
}

export type Rounding = 'truncate' | 'round';

/** Round half up to 2 decimals, immune to float noise. */
export function round2(x: number): number {
  return Math.round(x * 100 + 1e-9) / 100;
}

/** Apply a GPA rounding rule: truncate (some schools' published rule) or round. */
export const fix2 = (x: number, rounding: Rounding = 'truncate') => (rounding === 'round' ? round2(x) : truncate2(x));

export const format2 = (x: number) => x.toFixed(2);

/** Normalise a letter: trim, upper-case, unicode minus/plus to ASCII. */
export function normLetter(s: string): string {
  return s.trim().toUpperCase().replace(/[−–—]/g, '-').replace(/＋/g, '+');
}

const PASS = /^(P|PASS|S|SAT|SATISFACTORY|CR|CREDIT|COMPLETE|COMPLETED)$/;
const NO_PASS = /^(NP|N|NO PASS|U|UNSAT|UNSATISFACTORY|NC|NO CREDIT|INCOMPLETE|I|M|FAIL)$/;

/** Is this Canvas grade a pass/no-pass style grade (no grade points)? */
export const isPassNoPass = (letter: string | null | undefined): boolean => {
  if (!letter) return false;
  const l = normLetter(letter);
  return PASS.test(l) || NO_PASS.test(l);
};

/** Points for a letter on the scale. `A+` maps to `A` when the scale has no A+. */
export function pointsForLetter(letter: string, scale: readonly ScaleRow[]): number | null {
  const l = normLetter(letter);
  const hit = scale.find(r => normLetter(r.letter) === l);
  if (hit) return hit.points;
  if (l === 'A+') return pointsForLetter('A', scale);
  return null;
}

/** Fallback letter for a percent: highest row whose `min` the score reaches. */
export function letterForPercent(pct: number, scale: readonly ScaleRow[]): ScaleRow | null {
  if (!Number.isFinite(pct)) return null;
  const p = Math.round(pct * 100) / 100;
  const rows = [...scale].sort((a, b) => b.min - a.min);
  for (const r of rows) if (p + 1e-9 >= r.min) return r;
  // Below every cutoff: the lowest row (normally F) is the floor.
  return rows[rows.length - 1] ?? null;
}

/** Extra grade points for Honors and AP/IB courses (high-school weighted GPA). */
export interface WeightBumps { honors: number; ap: number }
export type CourseWeight = 'honors' | 'ap';
export const isWeights = (v: unknown): v is WeightBumps | null =>
  v === null || (!!v && typeof v === 'object' && [(v as WeightBumps).honors, (v as WeightBumps).ap].every(n => Number.isFinite(n) && n >= 0 && n <= 2));

export interface CourseInput {
  id: string;
  /** Credits the user entered; null = not entered. */
  credits: number | null;
  include: boolean;
  /** User marks the course pass/no-pass (no grade points). */
  pnp: boolean;
  /** Canvas's current percent, if any. */
  score: number | null;
  /** Canvas's own letter (computed_current_grade), if any. */
  letter: string | null;
  /** Letter the user assumes instead of Canvas's (projection). */
  assume: string | null;
  /** Honors / AP-IB, for the weighted GPA (ignored unless the scale enables weighting). */
  weight?: CourseWeight | null;
}

export type CourseStatus =
  | 'counted'
  | 'excluded' //   user turned it off
  | 'pnp' //        pass/no-pass: no points
  | 'no-grade' //   nothing graded yet
  | 'no-credits' // credits needed (credit-weighted mode only)
  | 'unknown-letter'; // letter isn't on the scale

export interface CourseResult {
  id: string;
  status: CourseStatus;
  letter: string | null;
  points: number | null;
  /** Points plus the Honors/AP bump (only when weighting is on and the course earned points above 0). */
  weightedPoints: number | null;
  credits: number | null;
  /** Where the letter came from. */
  source: 'assumed' | 'canvas' | 'percent' | null;
}

export interface Options {
  /** true = weight by credits; false = plain average per course. */
  creditWeighted: boolean;
  /** Default 'truncate' (the pilot school). */
  rounding?: Rounding;
  /** Honors/AP bumps; null/absent = no weighted figure. */
  weights?: WeightBumps | null;
}

/** The bump a course earns: nothing for a failing grade (0 points), as schools that weight do. */
export function bumpFor(weight: CourseWeight | null | undefined, points: number, weights: WeightBumps | null | undefined): number {
  if (!weights || !weight || !(points > 0)) return 0;
  return weight === 'ap' ? weights.ap : weights.honors;
}

export function courseResult(c: CourseInput, scale: readonly ScaleRow[], opts: Options): CourseResult {
  const base = { id: c.id, letter: null, points: null, weightedPoints: null, credits: c.credits, source: null } as const;
  if (!c.include) return { ...base, status: 'excluded' };
  if (c.pnp || (!c.assume && isPassNoPass(c.letter))) return { ...base, status: 'pnp' };

  let letter: string | null = null;
  let source: CourseResult['source'] = null;
  if (c.assume) {
    letter = normLetter(c.assume);
    source = 'assumed';
  } else if (c.letter && c.letter.trim()) {
    letter = c.letter.trim();
    source = 'canvas';
  } else if (c.score !== null && Number.isFinite(c.score)) {
    letter = letterForPercent(c.score, scale)?.letter ?? null;
    source = 'percent';
  }
  if (!letter) return { ...base, status: 'no-grade' };

  const points = pointsForLetter(letter, scale);
  if (points === null) return { ...base, letter, source, status: 'unknown-letter' };
  const weightedPoints = opts.weights ? points + bumpFor(c.weight, points, opts.weights) : null;
  if (opts.creditWeighted && !(c.credits !== null && c.credits > 0)) {
    return { ...base, letter, points, weightedPoints, source, status: 'no-credits' };
  }
  return { ...base, letter, points, weightedPoints, source, status: 'counted' };
}

export interface Summary {
  /** Truncated GPA, or null when nothing counts. */
  gpa: number | null;
  /** The weighted figure (Honors/AP bumps), when the scale enables weighting. */
  weightedGpa: number | null;
  counted: number;
  credits: number;
  qualityPoints: number;
  weightedQualityPoints: number;
  /** Included courses that were left out and why (for the honest footnote). */
  skipped: { noCredits: number; noGrade: number; unknownLetter: number; pnp: number; excluded: number };
}

export function termSummary(results: readonly CourseResult[], opts: Options): Summary {
  const skipped = { noCredits: 0, noGrade: 0, unknownLetter: 0, pnp: 0, excluded: 0 };
  let qp = 0, wqp = 0, cr = 0, n = 0, sum = 0, wsum = 0;
  for (const r of results) {
    switch (r.status) {
      case 'counted': {
        n++;
        const credits = r.credits ?? 0;
        qp += (r.points ?? 0) * credits;
        wqp += (r.weightedPoints ?? r.points ?? 0) * credits;
        cr += credits;
        sum += r.points ?? 0;
        wsum += r.weightedPoints ?? r.points ?? 0;
        break;
      }
      case 'no-credits': skipped.noCredits++; break;
      case 'no-grade': skipped.noGrade++; break;
      case 'unknown-letter': skipped.unknownLetter++; break;
      case 'pnp': skipped.pnp++; break;
      case 'excluded': skipped.excluded++; break;
    }
  }
  let gpa: number | null = null;
  let weightedGpa: number | null = null;
  if (n > 0) {
    if (opts.creditWeighted) {
      gpa = cr > 0 ? fix2(qp / cr, opts.rounding) : null;
      weightedGpa = opts.weights && cr > 0 ? fix2(wqp / cr, opts.rounding) : null;
    } else {
      gpa = fix2(sum / n, opts.rounding);
      weightedGpa = opts.weights ? fix2(wsum / n, opts.rounding) : null;
    }
  }
  return { gpa, weightedGpa, counted: n, credits: cr, qualityPoints: qp, weightedQualityPoints: wqp, skipped };
}

export interface Prior { gpa: number; credits: number }

/**
 * Cumulative GPA = (term quality points + prior GPA x prior credits) /
 * (term credits + prior credits). Always credit-based, because the prior is
 * only known as GPA and credits. Returns null when the term side lacks credits
 * (an unweighted term has courses but maybe no credits).
 */
export function cumulativeGpa(term: Summary, prior: Prior | null, results: readonly CourseResult[], rounding: Rounding = 'truncate'): number | null {
  if (!prior || !(prior.credits > 0) || !Number.isFinite(prior.gpa)) return null;
  // Every counted course needs credits for a credit-based figure.
  const counted = results.filter(r => r.status === 'counted');
  if (counted.some(r => !(r.credits !== null && r.credits > 0))) return null;
  const credits = term.credits + prior.credits;
  if (credits <= 0) return null;
  return fix2((term.qualityPoints + prior.gpa * prior.credits) / credits, rounding);
}

/** Parse a user-typed credits/GPA field: '' -> null, junk -> undefined (reject). */
export function parseNumber(s: string, min: number, max: number): number | null | undefined {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

/** Which term is "this term"? The one whose dates contain `now`; else the latest-starting dated one. */
export interface TermLike { id: string; start_at: string | null; end_at: string | null }
export function currentTermId(terms: readonly TermLike[], now: Date): string | null {
  const dated = terms.filter(t => t.start_at);
  const t = now.getTime();
  const within = dated.filter(x => Date.parse(x.start_at!) <= t && (!x.end_at || t <= Date.parse(x.end_at)));
  if (within.length) return within.sort((a, b) => Date.parse(b.start_at!) - Date.parse(a.start_at!))[0]!.id;
  const past = dated.filter(x => Date.parse(x.start_at!) <= t).sort((a, b) => Date.parse(b.start_at!) - Date.parse(a.start_at!));
  return past[0]?.id ?? null;
}
