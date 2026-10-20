import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SCALE_PRESETS, fix2, round2, PSU_SCALE, courseResult, cumulativeGpa, currentTermId, format2, isPassNoPass, isScale, letterForPercent,
  parseNumber, pointsForLetter, termSummary, truncate2, type CourseInput,
} from '../../src/features/gpa-calculator/gpa.ts';

const c = (o: Partial<CourseInput> & { id: string }): CourseInput => ({ credits: 4, include: true, pnp: false, score: null, letter: null, assume: null, ...o });
const W = { creditWeighted: true };
const U = { creditWeighted: false };
const run = (inputs: CourseInput[], opts = W) => {
  const results = inputs.map(i => courseResult(i, PSU_SCALE, opts));
  return { results, term: termSummary(results, opts) };
};

describe('the pilot school scale', () => {
  it('has no A+ and the verified points', () => {
    expect(PSU_SCALE.find(r => r.letter === 'A+')).toBeUndefined();
    expect(PSU_SCALE.map(r => r.points)).toEqual([4, 3.67, 3.33, 3, 2.67, 2.33, 2, 1.67, 1.33, 1, 0.67, 0]);
  });
  it('maps letters, tolerating unicode minus, case and spaces', () => {
    expect(pointsForLetter('A-', PSU_SCALE)).toBe(3.67);
    expect(pointsForLetter('A−', PSU_SCALE)).toBe(3.67);
    expect(pointsForLetter(' b+ ', PSU_SCALE)).toBe(3.33);
    expect(pointsForLetter('A+', PSU_SCALE)).toBe(4); // Canvas scheme may say A+, the pilot school has none
    expect(pointsForLetter('Q', PSU_SCALE)).toBeNull();
  });
  it('an edited scale with its own A+ wins', () => {
    const scale = [{ letter: 'A+', points: 4.3, min: 97 }, ...PSU_SCALE];
    expect(pointsForLetter('A+', scale)).toBe(4.3);
  });
  it('percent fallback hits the boundaries exactly', () => {
    expect(letterForPercent(93, PSU_SCALE)?.letter).toBe('A');
    expect(letterForPercent(92.99, PSU_SCALE)?.letter).toBe('A-');
    expect(letterForPercent(100, PSU_SCALE)?.letter).toBe('A');
    expect(letterForPercent(120, PSU_SCALE)?.letter).toBe('A');
    expect(letterForPercent(0, PSU_SCALE)?.letter).toBe('F');
    expect(letterForPercent(-5, PSU_SCALE)?.letter).toBe('F');
    expect(letterForPercent(59.99, PSU_SCALE)?.letter).toBe('F');
    expect(letterForPercent(59.999, PSU_SCALE)?.letter).toBe('D-'); // compared at 2 decimals, like Canvas's own scores
    expect(letterForPercent(NaN, PSU_SCALE)).toBeNull();
  });
  it('validates the editable scale', () => {
    expect(isScale(PSU_SCALE)).toBe(true);
    expect(isScale([])).toBe(false);
    expect(isScale([{ letter: 'A', points: 9, min: 90 }])).toBe(false);
    expect(isScale([{ letter: '', points: 4, min: 90 }])).toBe(false);
    expect(isScale('x')).toBe(false);
  });
});

describe('truncation, not rounding', () => {
  it('truncates to two decimals', () => {
    expect(truncate2(3.6666)).toBe(3.66);
    expect(truncate2(3.999)).toBe(3.99);
    expect(truncate2(3.67)).toBe(3.67);
    expect(truncate2(2.675)).toBe(2.67);
    expect(truncate2(0)).toBe(0);
    expect(format2(truncate2(3.9999))).toBe('3.99');
    expect(format2(4)).toBe('4.00');
  });
  it('survives float noise that sits just under a hundredth', () => {
    expect(truncate2(0.29)).toBe(0.29); // 0.29*100 = 28.999999999999996
    expect(truncate2(1.1)).toBe(1.1);
    expect(truncate2((3.67 * 4 + 3.33 * 4) / 8)).toBe(3.5);
  });
});

describe('course result', () => {
  it('prefers an assumed letter, then Canvas letter, then the percent', () => {
    expect(courseResult(c({ id: '1', letter: 'B', score: 95, assume: 'A' }), PSU_SCALE, W)).toMatchObject({ letter: 'A', source: 'assumed', status: 'counted' });
    expect(courseResult(c({ id: '1', letter: 'B', score: 95 }), PSU_SCALE, W)).toMatchObject({ letter: 'B', source: 'canvas', points: 3 });
    expect(courseResult(c({ id: '1', score: 91.4 }), PSU_SCALE, W)).toMatchObject({ letter: 'A-', source: 'percent', points: 3.67 });
  });
  it('missing score and letter means no grade yet, not an F', () => {
    expect(courseResult(c({ id: '1' }), PSU_SCALE, W).status).toBe('no-grade');
    expect(courseResult(c({ id: '1', letter: '  ' }), PSU_SCALE, W).status).toBe('no-grade');
  });
  it('a real zero percent is an F, not missing', () => {
    expect(courseResult(c({ id: '1', score: 0 }), PSU_SCALE, W)).toMatchObject({ status: 'counted', letter: 'F', points: 0 });
  });
  it('credit-weighted mode needs credits; never guesses them', () => {
    expect(courseResult(c({ id: '1', credits: null, score: 95 }), PSU_SCALE, W).status).toBe('no-credits');
    expect(courseResult(c({ id: '1', credits: 0, score: 95 }), PSU_SCALE, W).status).toBe('no-credits');
    expect(courseResult(c({ id: '1', credits: null, score: 95 }), PSU_SCALE, U).status).toBe('counted');
  });
  it('excluded and pass/no-pass carry no points', () => {
    expect(courseResult(c({ id: '1', include: false, score: 95 }), PSU_SCALE, W).status).toBe('excluded');
    expect(courseResult(c({ id: '1', pnp: true, score: 95 }), PSU_SCALE, W).status).toBe('pnp');
    expect(courseResult(c({ id: '1', letter: 'P' }), PSU_SCALE, W).status).toBe('pnp');
    expect(courseResult(c({ id: '1', letter: 'NP' }), PSU_SCALE, W).status).toBe('pnp');
    expect(courseResult(c({ id: '1', letter: 'Pass' }), PSU_SCALE, W).status).toBe('pnp');
  });
  it('a letter that is not on the scale is flagged, not guessed', () => {
    expect(courseResult(c({ id: '1', letter: 'Q' }), PSU_SCALE, W).status).toBe('unknown-letter');
  });
  it('recognises pass/no-pass words only', () => {
    expect(isPassNoPass('P')).toBe(true);
    expect(isPassNoPass('B')).toBe(false);
    expect(isPassNoPass('C-')).toBe(false);
    expect(isPassNoPass(null)).toBe(false);
  });
});

describe('term GPA', () => {
  it('weights by credits', () => {
    const { term } = run([c({ id: 'a', credits: 4, letter: 'A' }), c({ id: 'b', credits: 1, letter: 'C' })]);
    // (4*4 + 2*1)/5 = 3.6
    expect(term.gpa).toBe(3.6);
    expect(term.credits).toBe(5);
    expect(term.counted).toBe(2);
  });
  it('unweighted averages courses and ignores credits (even missing ones)', () => {
    const { term } = run([c({ id: 'a', credits: 4, letter: 'A' }), c({ id: 'b', credits: null, letter: 'C' })], U);
    expect(term.gpa).toBe(3);
  });
  it('truncates the result', () => {
    // (3.67*3 + 3.33*3 + 3.0*3)/9 = 3.3333..
    const { term } = run([c({ id: 'a', credits: 3, letter: 'A-' }), c({ id: 'b', credits: 3, letter: 'B+' }), c({ id: 'c', credits: 3, letter: 'B' })]);
    expect(term.gpa).toBe(3.33);
    const t2 = run([c({ id: 'a', credits: 4, letter: 'A' }), c({ id: 'b', credits: 4, letter: 'A' }), c({ id: 'c', credits: 3, letter: 'B+' })]).term;
    // (16+16+9.99)/11 = 3.8163.. -> 3.81 (rounding would give 3.82)
    expect(t2.gpa).toBe(3.81);
  });
  it('skips courses without a grade, credits, or inclusion, and counts why', () => {
    const { term } = run([
      c({ id: 'a', credits: 4, letter: 'A' }),
      c({ id: 'b', credits: 4 }),
      c({ id: 'c', credits: null, letter: 'B' }),
      c({ id: 'd', credits: 4, letter: 'F', include: false }),
      c({ id: 'e', credits: 4, letter: 'P' }),
      c({ id: 'f', credits: 4, letter: 'Q' }),
    ]);
    expect(term.gpa).toBe(4);
    expect(term.skipped).toEqual({ noCredits: 1, noGrade: 1, unknownLetter: 1, pnp: 1, excluded: 1 });
  });
  it('is null when nothing counts', () => {
    expect(run([]).term.gpa).toBeNull();
    expect(run([c({ id: 'a' })]).term.gpa).toBeNull();
    expect(run([c({ id: 'a', include: false, letter: 'A' })]).term.gpa).toBeNull();
  });
  it('an F counts as zero points, which drags the average', () => {
    expect(run([c({ id: 'a', credits: 4, letter: 'A' }), c({ id: 'b', credits: 4, letter: 'F' })]).term.gpa).toBe(2);
  });
  it('fractional credits work', () => {
    expect(run([c({ id: 'a', credits: 0.5, letter: 'A' }), c({ id: 'b', credits: 1.5, letter: 'B' })]).term.gpa).toBe(3.25);
  });
});

describe('cumulative GPA', () => {
  it('blends prior GPA x credits with the term', () => {
    const { term, results } = run([c({ id: 'a', credits: 4, letter: 'A' })]);
    // (4*4 + 3.5*60)/64 = 3.53125 -> 3.53
    expect(cumulativeGpa(term, { gpa: 3.5, credits: 60 }, results)).toBe(3.53);
  });
  it('returns null without a prior, with zero prior credits, or when a counted course lacks credits', () => {
    const { term, results } = run([c({ id: 'a', credits: 4, letter: 'A' })]);
    expect(cumulativeGpa(term, null, results)).toBeNull();
    expect(cumulativeGpa(term, { gpa: 3.5, credits: 0 }, results)).toBeNull();
    const u = run([c({ id: 'a', credits: null, letter: 'A' })], U);
    expect(cumulativeGpa(u.term, { gpa: 3.5, credits: 60 }, u.results)).toBeNull();
  });
  it('with an empty term it is the prior', () => {
    const { term, results } = run([]);
    expect(cumulativeGpa(term, { gpa: 3.25, credits: 30 }, results)).toBe(3.25);
  });
  it('ignores excluded and pass/no-pass courses', () => {
    const { term, results } = run([c({ id: 'a', credits: 4, letter: 'B' }), c({ id: 'b', credits: 4, letter: 'A', include: false }), c({ id: 'c', credits: 4, letter: 'P' })]);
    expect(cumulativeGpa(term, { gpa: 3, credits: 4 }, results)).toBe(3);
  });
});

describe('input parsing', () => {
  it('parses, clears and rejects', () => {
    expect(parseNumber('3.5', 0, 4)).toBe(3.5);
    expect(parseNumber('  ', 0, 4)).toBeNull();
    expect(parseNumber('abc', 0, 4)).toBeUndefined();
    expect(parseNumber('5', 0, 4)).toBeUndefined();
    expect(parseNumber('-1', 0, 4)).toBeUndefined();
    expect(parseNumber('Infinity', 0, 4)).toBeUndefined();
  });
});

describe('current term', () => {
  const terms = [
    { id: '2', start_at: '2026-03-30T00:00:00-07:00', end_at: '2026-06-13T23:59:00-07:00' },
    { id: '3', start_at: '2026-09-28T00:00:00-07:00', end_at: '2026-12-12T23:59:00-08:00' },
    { id: '1', start_at: null, end_at: null },
  ];
  it('picks the term containing now', () => {
    expect(currentTermId(terms, new Date('2026-10-21T10:00:00-07:00'))).toBe('3');
  });
  it('between terms, picks the most recent that started', () => {
    expect(currentTermId(terms, new Date('2026-07-15T10:00:00-07:00'))).toBe('2');
  });
  it('is null when no term has dates yet', () => {
    expect(currentTermId([terms[2]!], new Date())).toBeNull();
  });
});

describe('rounding rule and presets', () => {
  it('round vs truncate', () => {
    expect(fix2(3.816, 'truncate')).toBe(3.81);
    expect(fix2(3.816, 'round')).toBe(3.82);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(3.004)).toBe(3);
  });
  it('the rule flows through term and cumulative GPA', () => {
    const inputs = [c({ id: 'a', credits: 4, letter: 'A' }), c({ id: 'b', credits: 4, letter: 'A' }), c({ id: 'c', credits: 3, letter: 'B+' })];
    expect(run(inputs).term.gpa).toBe(3.81);
    const opts = { creditWeighted: true, rounding: 'round' as const };
    const results = inputs.map(i => courseResult(i, PSU_SCALE, opts));
    const term = termSummary(results, opts);
    expect(term.gpa).toBe(3.82);
    // (16+16+9.99+3.5*10)/21 = 3.66.. -> round 3.67, truncate 3.66
    expect(cumulativeGpa(term, { gpa: 3.5, credits: 10 }, results, 'round')).toBe(3.67);
    expect(cumulativeGpa(term, { gpa: 3.5, credits: 10 }, results, 'truncate')).toBe(3.66);
  });
  it('every preset is a valid scale; thirds is the pilot school; the A+ preset has A+', () => {
    for (const p of Object.values(SCALE_PRESETS)) expect(isScale(p.scale)).toBe(true);
    expect(SCALE_PRESETS.thirds!.scale).toBe(PSU_SCALE);
    expect(pointsForLetter('A+', SCALE_PRESETS['a-plus']!.scale)).toBe(4.33);
    expect(pointsForLetter('B+', SCALE_PRESETS.tenths!.scale)).toBe(3.3);
    expect(letterForPercent(85, SCALE_PRESETS.whole!.scale)?.letter).toBe('B');
  });
});

import { FALLBACK_DEFAULTS, HOST_DEFAULTS, hostDefaults, resolveScale } from '../../src/features/gpa-calculator/gpa.ts';
describe('per-host defaults', () => {
  // No school rule ships; the mechanism is tested with a fictional one.
  const RULE_HOST = 'rules.example.edu';
  beforeEach(() => { HOST_DEFAULTS[RULE_HOST] = { preset: 'thirds', rounding: 'truncate' }; });
  afterEach(() => { delete HOST_DEFAULTS[RULE_HOST]; });
  it('ships no school-specific rule', () => {
    expect(Object.keys(HOST_DEFAULTS)).toEqual([RULE_HOST]);
  });
  it('a sourced host rule supplies scale and rounding, case-insensitively', () => {
    const d = hostDefaults(RULE_HOST);
    expect(d).toMatchObject({ rounding: 'truncate', known: true });
    expect(d.scale).toBe(PSU_SCALE);
    expect(hostDefaults(RULE_HOST.toUpperCase()).known).toBe(true);
  });
  it('unknown hosts get the common scale, rounded', () => {
    const d = hostDefaults('canvas.example.edu');
    expect(d.known).toBe(false);
    expect(d.rounding).toBe('round');
    expect(FALLBACK_DEFAULTS.preset).toBe('thirds');
  });
  it('explicit settings win over the host default; auto defers to it', () => {
    const tenths = SCALE_PRESETS.tenths!.scale;
    expect(resolveScale(null, 'auto', RULE_HOST)).toEqual({ scale: PSU_SCALE, rounding: 'truncate' });
    expect(resolveScale(tenths, 'round', RULE_HOST)).toEqual({ scale: tenths, rounding: 'round' });
    expect(resolveScale(null, 'auto', 'x.edu').rounding).toBe('round');
    expect(resolveScale(null, 'truncate', 'x.edu').rounding).toBe('truncate');
  });
});

import { bumpFor, isWeights } from '../../src/features/gpa-calculator/gpa.ts';
describe('weighted GPA (Honors/AP)', () => {
  const W = { honors: 0.5, ap: 1 };
  const opts = { creditWeighted: true, weights: W };
  const go = (inputs: CourseInput[]) => {
    const results = inputs.map(i => courseResult(i, SCALE_PRESETS['high-school']!.scale, opts));
    return { results, term: termSummary(results, opts) };
  };
  it('the high-school preset carries its bumps and a no-plus/minus scale', () => {
    const p = SCALE_PRESETS['high-school']!;
    expect(p.weights).toEqual({ honors: 0.5, ap: 1 });
    expect(p.scale.map(r => r.letter)).toEqual(['A', 'B', 'C', 'D', 'F']);
    expect(isScale(p.scale)).toBe(true);
  });
  it('hand-worked: A regular, A honors, B AP, all 1 credit', () => {
    const { term } = go([c({ id: 'a', credits: 1, letter: 'A' }), c({ id: 'b', credits: 1, letter: 'A', weight: 'honors' }), c({ id: 'c', credits: 1, letter: 'B', weight: 'ap' })]);
    expect(term.gpa).toBe(3.66); //         (4 + 4 + 3) / 3 = 3.666.. truncated
    expect(term.weightedGpa).toBe(4.16); // (4 + 4.5 + 4) / 3 = 4.1666.. truncated
  });
  it('weighs by credits', () => {
    const { term } = go([c({ id: 'a', credits: 3, letter: 'B', weight: 'ap' }), c({ id: 'b', credits: 1, letter: 'A' })]);
    expect(term.weightedGpa).toBe(4); //  B+1 = 4 points x 3 credits = 12, plus A 4 x 1 = 4: 16 / 4
    expect(term.gpa).toBe(3.25); //      (3*3 + 4*1) / 4
  });
  it('a failing grade earns no bump', () => {
    expect(bumpFor('ap', 0, W)).toBe(0);
    expect(bumpFor('ap', 1, W)).toBe(1);
    expect(bumpFor('honors', 3, W)).toBe(0.5);
    expect(bumpFor(null, 3, W)).toBe(0);
    expect(bumpFor('ap', 3, null)).toBe(0);
    const { term } = go([c({ id: 'a', credits: 1, letter: 'F', weight: 'ap' })]);
    expect(term.weightedGpa).toBe(0);
  });
  it('without weights there is no weighted figure, and the unweighted one is unchanged', () => {
    const results = [c({ id: 'a', credits: 1, letter: 'A', weight: 'ap' })].map(i => courseResult(i, PSU_SCALE, W_OFF));
    expect(termSummary(results, W_OFF).weightedGpa).toBeNull();
    expect(termSummary(results, W_OFF).gpa).toBe(4);
  });
  it('validates the stored bumps', () => {
    expect(isWeights(null)).toBe(true);
    expect(isWeights({ honors: 0.5, ap: 1 })).toBe(true);
    expect(isWeights({ honors: -1, ap: 1 })).toBe(false);
    expect(isWeights({ honors: 0.5 })).toBe(false);
    expect(isWeights('x')).toBe(false);
  });
});
const W_OFF = { creditWeighted: true };
