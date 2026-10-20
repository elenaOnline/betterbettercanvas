import { describe, expect, it } from 'vitest';
import { applyDrops, coursePercent, fromApi, groupSum, remainingItems, solveGoal, type Course, type Group, type Item } from '../../src/features/grade-engine/engine.ts';

let n = 0;
const it_ = (score: number | null, possible: number, id = `i${++n}`): Item => ({ id, name: id, score, possible });
const grp = (items: Item[], o: Partial<Group> = {}): Group => ({ id: `g${++n}`, name: 'G', weight: 0, dropLowest: 0, dropHighest: 0, neverDrop: [], items, ...o });
const close = (a: number | null, b: number, d = 1e-6) => { expect(a).not.toBeNull(); expect(Math.abs(a! - b)).toBeLessThan(d); };

describe('coursePercent', () => {
  it('pools points when unweighted (not group averages)', () => {
    const c: Course = { weighted: false, groups: [grp([it_(10, 10)]), grp([it_(0, 90)])] };
    close(coursePercent(c, 'current'), 10); // 10/100, not (100%+0%)/2
  });
  it('weighted: group percents x weights, current renormalised over groups with graded work', () => {
    const c: Course = {
      weighted: true,
      groups: [grp([it_(9, 10)], { weight: 40 }), grp([it_(null, 10)], { weight: 60 })],
    };
    close(coursePercent(c, 'current'), 90); // only the 40-weight group has a score
    close(coursePercent(c, 'final', 0), 36); // ungraded counts as 0 in final: 0.9*40 / 100
  });
  it('weights not summing to 100 are scaled to the groups present', () => {
    const c: Course = { weighted: true, groups: [grp([it_(8, 10)], { weight: 30 }), grp([it_(10, 10)], { weight: 20 })] };
    close(coursePercent(c, 'current'), (0.8 * 30 + 1.0 * 20) / 50 * 100);
  });
  it('weights over 100 are extra credit (divided by 100)', () => {
    const c: Course = { weighted: true, groups: [grp([it_(10, 10)], { weight: 100 }), grp([it_(10, 10)], { weight: 5 })] };
    close(coursePercent(c, 'current'), 105);
  });
  it('zero-weight groups do not count when weighted', () => {
    const c: Course = { weighted: true, groups: [grp([it_(5, 10)], { weight: 100 }), grp([it_(10, 10)], { weight: 0 })] };
    close(coursePercent(c, 'current'), 50);
  });
  it('null when nothing is graded', () => {
    expect(coursePercent({ weighted: false, groups: [grp([it_(null, 10)])] }, 'current')).toBeNull();
    expect(coursePercent({ weighted: false, groups: [] }, 'final', 0)).toBeNull();
  });
  it('ignores zero-point items', () => {
    close(coursePercent({ weighted: false, groups: [grp([it_(0, 0), it_(8, 10)])] }, 'current'), 80);
  });
  it('extra credit scores above possible are honoured', () => {
    close(coursePercent({ weighted: false, groups: [grp([it_(12, 10)])] }, 'current'), 120);
  });
});

describe('drop rules', () => {
  it('drops the lowest score (equal points)', () => {
    const g = grp([it_(2, 10), it_(9, 10), it_(8, 10)], { dropLowest: 1 });
    const s = groupSum(g, 'current');
    expect(s.earned).toBe(17);
    expect(s.possible).toBe(20);
  });
  it('drops the highest', () => {
    const s = groupSum(grp([it_(2, 10), it_(9, 10), it_(8, 10)], { dropHighest: 1 }), 'current');
    expect(s.earned).toBe(10);
  });
  it('with unequal points, drops what helps the student most (not just the lowest score)', () => {
    // 5/5 (100%) and 0/100 (0%): drop the 0/100.
    const kept = applyDrops([{ id: 'a', s: 5, p: 5 }, { id: 'b', s: 0, p: 100 }], 1, 0, []);
    expect(kept.map(e => e.id)).toEqual(['a']);
    // 50/100 vs 4/5: lowest raw score is 4/5 but dropping 50/100 leaves 80%, dropping 4/5 leaves 50%.
    const k2 = applyDrops([{ id: 'a', s: 50, p: 100 }, { id: 'b', s: 4, p: 5 }], 1, 0, []);
    expect(k2.map(e => e.id)).toEqual(['b']);
  });
  it('never_drop items are kept', () => {
    const g = grp([it_(0, 10, 'x'), it_(9, 10, 'y'), it_(8, 10, 'z')], { dropLowest: 1, neverDrop: ['x'] });
    const s = groupSum(g, 'current');
    expect(s.items).toBe(2);
    expect(s.earned).toBe(9); // x kept (0) + y kept (9); z (8) is the lowest droppable
  });
  it('never drops everything', () => {
    const s = groupSum(grp([it_(5, 10), it_(6, 10)], { dropLowest: 5 }), 'current');
    expect(s.items).toBe(1);
    expect(s.earned).toBe(6);
  });
  it('applies drops to unscored work in the final calculation', () => {
    // 9/10, 1 ungraded; drop lowest: the ungraded 0 is dropped.
    const c: Course = { weighted: false, groups: [grp([it_(9, 10), it_(null, 10)], { dropLowest: 1 })] };
    close(coursePercent(c, 'final', 0), 90);
  });
});

describe('solveGoal', () => {
  it('unweighted: what average on the rest to reach a target', () => {
    // 80/100 earned, 100 more possible; to end at 90% need 100/200 -> 100 => 100%?? no: (80+x)/200 = .9 -> x = 100.
    const c: Course = { weighted: false, groups: [grp([it_(80, 100), it_(null, 100)])] };
    const r = solveGoal(c, 85);
    expect(r.kind).toBe('need');
    if (r.kind === 'need') {
      close(r.needed, 90, 0.011);
      expect(r.remainingPoints).toBe(100);
      expect(r.remainingCount).toBe(1);
      close(r.neededPoints, 90, 0.2);
    }
  });
  it('the answer really lands on the target (rounded up)', () => {
    const c: Course = {
      weighted: true,
      groups: [grp([it_(17, 20), it_(null, 20)], { weight: 30 }), grp([it_(41, 50)], { weight: 25 }), grp([it_(null, 100)], { weight: 45 })],
    };
    for (const target of [60, 73, 80, 87.5, 90]) {
      const r = solveGoal(c, target);
      expect(r.kind).toBe('need');
      if (r.kind !== 'need') continue;
      expect(coursePercent(c, 'final', r.needed / 100)!).toBeGreaterThanOrEqual(target - 1e-9);
      expect(coursePercent(c, 'final', (r.needed - 0.02) / 100)!).toBeLessThan(target);
    }
  });
  it('weighted: a group with only ungraded work still weighs in the final', () => {
    const c: Course = { weighted: true, groups: [grp([it_(10, 10)], { weight: 50 }), grp([it_(null, 100)], { weight: 50 })] };
    const r = solveGoal(c, 90);
    expect(r.kind).toBe('need');
    if (r.kind === 'need') close(r.needed, 80, 0.011); // 50*1 + 50*x = 90
  });
  it('secured: target already safe even with zeros', () => {
    const c: Course = { weighted: false, groups: [grp([it_(190, 200), it_(null, 10)])] };
    expect(solveGoal(c, 85).kind).toBe('secured');
  });
  it('unreachable: even full marks fall short, and says by how much', () => {
    const c: Course = { weighted: false, groups: [grp([it_(50, 100), it_(null, 10)])] };
    const r = solveGoal(c, 90);
    expect(r.kind).toBe('unreachable');
    if (r.kind === 'unreachable') close(r.ceiling, (60 / 110) * 100);
  });
  it('no remaining work', () => {
    const r = solveGoal({ weighted: false, groups: [grp([it_(8, 10)])] }, 90);
    expect(r.kind).toBe('no-remaining');
  });
  it('drop-lowest on the remaining work is honoured', () => {
    // Two quizzes left, drop lowest 1, all ungraded: only one counts, so needing it all on one.
    const c: Course = { weighted: false, groups: [grp([it_(null, 10), it_(null, 10)], { dropLowest: 1 })] };
    const r = solveGoal(c, 80);
    expect(r.kind).toBe('need');
    if (r.kind === 'need') close(r.needed, 80, 0.011);
  });
  it('a target of 0 is secured, of >max is unreachable', () => {
    const c: Course = { weighted: false, groups: [grp([it_(5, 10), it_(null, 10)])] };
    expect(solveGoal(c, 0).kind).toBe('secured');
    expect(solveGoal(c, 101).kind).toBe('unreachable');
  });
  it('excused and omitted items are not remaining', () => {
    const course = fromApi([
      {
        id: '1', name: 'HW', group_weight: 0, assignments: [
          { id: 'a', name: 'a', points_possible: 10, submission: { score: 8 } },
          { id: 'b', name: 'b', points_possible: 10, submission: { excused: true } },
          { id: 'c', name: 'c', points_possible: 10, omit_from_final_grade: true, submission: null },
          { id: 'd', name: 'd', points_possible: 10, published: false },
          { id: 'e', name: 'e', points_possible: 10, submission: { score: null, workflow_state: 'unsubmitted' } },
          { id: 'f', name: 'f', points_possible: null },
        ],
      },
    ]);
    expect(remainingItems(course).map(i => i.id)).toEqual(['e']);
  });
});

describe('fromApi', () => {
  it('reads weights, rules and decides weighting', () => {
    const groups = [
      { id: '1', name: 'A', group_weight: 40, rules: { drop_lowest: 1, never_drop: ['5'] }, assignments: [] },
      { id: '2', name: 'B', group_weight: 60, assignments: [{ id: '9', name: 'x', points_possible: 5, submission: { score: 4 } }] },
    ];
    const c = fromApi(groups);
    expect(c.weighted).toBe(true);
    expect(c.groups[0]).toMatchObject({ weight: 40, dropLowest: 1, neverDrop: ['5'] });
    expect(c.groups[1]!.items[0]).toMatchObject({ possible: 5, score: 4 });
    expect(fromApi(groups, false).weighted).toBe(false);
    expect(fromApi([{ id: '1', name: 'A', group_weight: 0 }]).weighted).toBe(false);
  });
});

import { boxState, parseScheme, pct, sentence } from '../../src/features/grade-goals/model.ts';

describe('grading scheme from ENV.course_active_grading_scheme', () => {
  it('parses letters and minimum fractions, highest first', () => {
    const s = parseScheme({ id: '1', title: 'the pilot school', data: [{ name: 'B', value: 0.83 }, { name: 'A', value: 0.93 }, { name: 'F', value: 0 }] });
    expect(s).toEqual([['A', 0.93], ['B', 0.83], ['F', 0]]);
  });
  it('is null for no scheme, points-based, or malformed data', () => {
    expect(parseScheme(null)).toBeNull();
    expect(parseScheme({ data: [] })).toBeNull();
    expect(parseScheme({ points_based: true, data: [{ name: 'A', value: 90 }] })).toBeNull();
    expect(parseScheme({ data: [{ name: 'A' }] })).toBeNull();
    expect(parseScheme({ data: [{ name: 'A', value: 'x' }] })).toBeNull();
    expect(parseScheme('x')).toBeNull();
  });
});

describe('box state and wording', () => {
  const enroll = (score: number | null) => ({ enrollments: [{ type: 'student', computed_current_score: score }] });
  const course: Course = { weighted: false, groups: [grp([it_(80, 100), it_(null, 100)])] };
  it('says what the answer is, in the four outcomes', () => {
    const st = boxState(course, enroll(80), 85);
    expect(st.kind).toBe('goal');
    const r = (st as Extract<typeof st, { kind: 'goal' }>).result;
    expect(sentence(r, 85)).toEqual({ lead: 'You need an average of ', strong: '90%', tail: ' on the remaining 100 points.' });
    expect(sentence(solveGoal(course, 10), 10).lead).toBe('Already secured');
    expect(sentence(solveGoal(course, 95), 95).tail).toBe(': full marks on the rest gives 90%.');
    expect(sentence({ kind: 'no-remaining', current: 1, final: 1 }, 90).lead).toBe('No remaining graded work');
  });
  it('draws nothing when totals are hidden; asks for a graded item when there is no score', () => {
    expect(boxState(course, { ...enroll(80), hide_final_grades: true }, 85).kind).toBe('hidden');
    expect(boxState({ weighted: false, groups: [grp([it_(null, 10)])] }, enroll(null), 85).kind).toBe('no-score');
  });
  it('refuses to show a number when b2c and Canvas disagree by more than 0.05', () => {
    expect(boxState(course, enroll(80.04), 85).kind).toBe('goal');
    expect(boxState(course, enroll(80.2), 85).kind).toBe('mismatch');
    expect(boxState(course, enroll(75), null).kind).toBe('mismatch');
  });
  it('without a goal it just waits', () => {
    expect(boxState(course, enroll(80), null).kind).toBe('no-goal');
  });
  it('formats percents without trailing zeros', () => {
    expect([pct(84), pct(84.2), pct(84.17), pct(84.1699)]).toEqual(['84', '84.2', '84.17', '84.17']);
  });
});
