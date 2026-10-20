import { describe, expect, it } from 'vitest';
import { agreesWithCanvas, coursePercent, fromApi, impactOf, type Course, type Group, type Item } from '../../src/features/grade-engine/engine.ts';

const item = (id: string, score: number | null, possible: number): Item => ({ id, name: id, score, possible });
const grp = (id: string, items: Item[], o: Partial<Group> = {}): Group => ({ id, name: id, weight: 0, dropLowest: 0, dropHighest: 0, neverDrop: [], items, ...o });
const near = (a: number | undefined, b: number) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(1e-9);

// Every expected number below was worked by hand from Canvas's rules.
describe('impactOf (hand-worked)', () => {
  it('A: unweighted pools points. 90/100 graded, one 20-point item left', () => {
    const c: Course = { weighted: false, groups: [grp('hw', [item('a', 90, 100), item('x', null, 20)])] };
    const r = impactOf(c, 'x')!;
    near(r.base, 90);
    near(r.ifZero, 75); //  90/120
    near(r.ifFull, 110 / 120 * 100); // 91.666..
    near(r.down, 15);
    near(r.up, 110 / 120 * 100 - 90);
  });

  it('B: weighted. HW 40% at 90%, Exams 60% at 70/100, new 100-pt exam', () => {
    const c: Course = {
      weighted: true,
      groups: [grp('hw', [item('h', 45, 50)], { weight: 40 }), grp('ex', [item('m', 70, 100), item('x', null, 100)], { weight: 60 })],
    };
    const r = impactOf(c, 'x')!;
    near(r.base, 78); //     .9*40 + .7*60
    near(r.ifZero, 57); //   .9*40 + .35*60
    near(r.ifFull, 87); //   .9*40 + .85*60
    near(r.down, 21);
    near(r.up, 9);
  });

  it('C: weighted. An item in a group with nothing graded brings the whole group in', () => {
    const c: Course = {
      weighted: true,
      groups: [grp('hw', [item('h', 8, 10)], { weight: 50 }), grp('qz', [item('x', null, 10)], { weight: 50 })],
    };
    const r = impactOf(c, 'x')!;
    near(r.base, 80); //    only the HW group has graded work
    near(r.ifZero, 40); //  .8*50 + 0*50
    near(r.ifFull, 90); //  .8*50 + 1*50
  });

  it('D: drop_lowest. Scoring 0 costs, scoring full marks costs nothing extra', () => {
    const c: Course = { weighted: false, groups: [grp('hw', [item('a', 10, 10), item('b', 4, 10), item('x', null, 10)], { dropLowest: 1 })] };
    const r = impactOf(c, 'x')!;
    near(r.base, 100); //  2 graded, lowest (4/10) dropped -> 10/10
    near(r.ifZero, 70); // 10,4,0 -> drop 0 -> 14/20
    near(r.ifFull, 100); // 10,4,10 -> drop 4 -> 20/20
    near(r.down, 30);
    near(r.up, 0);
  });

  it('E: drop_lowest where the new item would itself be dropped at 0', () => {
    // 9/10 and 7/10 graded, drop 1: base keeps 9/10 (90). New item: at 0 it is the lowest and is dropped, so keeps 9+7 = 16/20.
    const c: Course = { weighted: false, groups: [grp('hw', [item('a', 9, 10), item('b', 7, 10), item('x', null, 10)], { dropLowest: 1 })] };
    const r = impactOf(c, 'x')!;
    near(r.base, 90);
    near(r.ifZero, 80);
    near(r.ifFull, 95); // 9,7,10 -> drop 7 -> 19/20
  });

  it('F: never_drop protects the item from the drop', () => {
    // a=0/10 never dropped; b=10/10; x ungraded. drop_lowest 1.
    const c: Course = { weighted: false, groups: [grp('g', [item('a', 0, 10), item('b', 10, 10), item('x', null, 10)], { dropLowest: 1, neverDrop: ['a'] })] };
    const r = impactOf(c, 'x')!;
    // base: free = {b}; cap leaves at least one -> nothing dropped: 10/20
    near(r.base, 50);
    near(r.ifZero, 50); // free {b:10, x:0}: drop x -> a(0)+b(10) = 10/20
    near(r.ifFull, 50); // free {b:10, x:10}: drop one (tie) -> 10/20 total with a
  });

  it('G: unequal points choose the drop that helps most', () => {
    // graded 50/100 and 4/5; drop lowest 1. Keeping 4/5 (80%) beats keeping 50/100 (50%).
    const c: Course = { weighted: false, groups: [grp('g', [item('a', 50, 100), item('b', 4, 5), item('x', null, 5)], { dropLowest: 1 })] };
    const r = impactOf(c, 'x')!;
    near(r.base, 80);
    // x=0/5: choose best 2 of {50/100, 4/5, 0/5}: {50/100,4/5}=54/105=51.4%, {4/5,0/5}=40%, {50/100,0/5}=47.6% -> 54/105
    near(r.ifZero, 54 / 105 * 100);
  });

  it('H: excused, omitted and unpublished work does not matter', () => {
    const c = fromApi([
      {
        id: '1', name: 'HW', group_weight: 0, assignments: [
          { id: 'a', name: 'a', points_possible: 10, submission: { score: 8 } },
          { id: 'b', name: 'b', points_possible: 100, submission: { excused: true } },
          { id: 'c', name: 'c', points_possible: 100, omit_from_final_grade: true },
          { id: 'd', name: 'd', points_possible: 100, published: false },
          { id: 'x', name: 'x', points_possible: 10 },
        ],
      },
    ]);
    const r = impactOf(c, 'x')!;
    near(r.base, 80);
    near(r.ifZero, 40);
    near(r.ifFull, 90);
    expect(impactOf(c, 'b')).toBeNull();
    expect(impactOf(c, 'c')).toBeNull();
    expect(impactOf(c, 'd')).toBeNull();
  });

  it('I: nothing to show for graded items, zero-point items, unknown ids, or an ungraded course', () => {
    const c: Course = { weighted: false, groups: [grp('g', [item('a', 8, 10), item('z', null, 0), item('x', null, 10)])] };
    expect(impactOf(c, 'a')).toBeNull();
    expect(impactOf(c, 'z')).toBeNull();
    expect(impactOf(c, 'nope')).toBeNull();
    expect(impactOf({ weighted: false, groups: [grp('g', [item('x', null, 10)])] }, 'x')).toBeNull();
  });

  it('J: a graded 0 is graded, not missing', () => {
    const c: Course = { weighted: false, groups: [grp('g', [item('a', 0, 10), item('x', null, 10)])] };
    const r = impactOf(c, 'x')!;
    near(r.base, 0);
    near(r.ifFull, 50);
  });

  it('K: extra credit scores push the pooled grade over 100', () => {
    const c: Course = { weighted: false, groups: [grp('g', [item('a', 12, 10), item('x', null, 10)])] };
    near(impactOf(c, 'x')!.base, 120);
  });
});

describe('whole-course percent (hand-worked)', () => {
  it('weighted with a drop and an ungraded group, current vs final', () => {
    const c: Course = {
      weighted: true,
      groups: [
        grp('hw', [item('1', 10, 10), item('2', 5, 10), item('3', 9, 10)], { weight: 20, dropLowest: 1 }), // keep 10,9 -> 95%
        grp('mid', [item('4', 80, 100)], { weight: 30 }), //                                               80%
        grp('fin', [item('5', null, 100)], { weight: 50 }), //                                              ungraded
      ],
    };
    near(coursePercent(c, 'current')!, (0.95 * 20 + 0.8 * 30) / 50 * 100); // 86.0
    near(coursePercent(c, 'final', 0)!, 0.95 * 20 + 0.8 * 30); //            43
    near(coursePercent(c, 'final', 1)!, 0.95 * 20 + 0.8 * 30 + 50); //      93
  });
  it('compares against Canvas with a tolerance', () => {
    expect(agreesWithCanvas(86.0, 86.04)).toBe(true);
    expect(agreesWithCanvas(86.0, 87)).toBe(false);
    expect(agreesWithCanvas(null, null)).toBe(true);
    expect(agreesWithCanvas(null, 80)).toBe(false);
  });
});

import { impactFor, parsePlannable, plannableIndex, prepare, signed } from '../../src/features/grade-impact/model.ts';

describe('card row matching and formatting', () => {
  const groups = [
    {
      id: '1', name: 'HW', group_weight: 0, assignments: [
        { id: '11', name: 'PS1', points_possible: 100, submission: { score: 90 } },
        { id: '12', name: 'PS2', points_possible: 20, submission: null },
        { id: '13', name: 'Quiz', points_possible: 10, quiz_id: '77', submission: null },
        { id: '14', name: 'Disc', points_possible: 10, discussion_topic: { id: '88' }, submission: null },
      ],
    },
  ] as unknown as Parameters<typeof plannableIndex>[0];
  it('parses the card hook', () => {
    expect(parsePlannable('assignment:456')).toEqual({ type: 'assignment', id: '456' });
    expect(parsePlannable('discussion_topic:9')).toEqual({ type: 'discussion_topic', id: '9' });
    expect(parsePlannable('assignment')).toBeNull();
    expect(parsePlannable(null)).toBeNull();
  });
  it('maps assignment, quiz and discussion hooks to assignment ids', () => {
    const idx = plannableIndex(groups);
    expect(idx.get('assignment:12')).toBe('12');
    expect(idx.get('quiz:77')).toBe('13');
    expect(idx.get('discussion_topic:88')).toBe('14');
  });
  it('formats hand-worked numbers with true minus signs and a tooltip', () => {
    const ci = prepare(groups, undefined, 90, false); // 90/100 graded
    const r = impactFor(ci, 'assignment:12')!; //        +20 pts: zero -> 90/120 = 75, full -> 110/120 = 91.7
    expect(r.shown.down).toBe('−15.0');
    expect(r.shown.up).toBe('+1.7');
    expect(r.shown.title).toBe('If you score 0: 75% (−15.0). Full marks: 91.7% (+1.7). Based on your current score, with ungraded work excluded and Canvas’s group weights.');
    expect(impactFor(ci, 'quiz:77')!.shown.down).toBe('−8.2'); // 10 pts: 90/110 = 81.8, so 90 - 81.8
  });
  it('is hidden when Canvas disagrees, hides totals, or has no score', () => {
    expect(impactFor(prepare(groups, undefined, 85, false), 'assignment:12')).toBeNull(); // we compute 90
    expect(impactFor(prepare(groups, undefined, 90, true), 'assignment:12')).toBeNull();
    expect(impactFor(prepare(groups, undefined, null, false), 'assignment:12')).toBeNull();
    expect(impactFor(prepare(groups, undefined, 90, false), 'assignment:99')).toBeNull();
    expect(impactFor(prepare(groups, undefined, 90, false), 'assignment:11')).toBeNull(); // already graded
  });
  it('signed()', () => {
    expect(signed(-4.24)).toBe('−4.2');
    expect(signed(1.8)).toBe('+1.8');
    expect(signed(0)).toBe('0.0');
    expect(signed(-0.04)).toBe('0.0');
    expect(signed(12.35)).toBe('+12.4');
  });
});
