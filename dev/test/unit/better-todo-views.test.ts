import { describe, expect, it } from 'vitest';
import type { PlannerItem } from '../../src/core/canvas/data.ts';
import { dayIndex } from '../../src/features/better-todo/format.ts';
import { classify, isDoneToday, keyOf, type Marks } from '../../src/features/better-todo/logic.ts';
import { arcs, countWords, progress, spanOf, splitDone, summary, weekColumns, weekday } from '../../src/features/better-todo/views/model.ts';

const TZ = 'America/Los_Angeles';
const NOW = new Date('2026-10-21T17:00:00Z'); // Wed Oct 21, 10:00 PDT
const day = (d: Date) => dayIndex(d, TZ);
const T = day(NOW);
let seq = 0;
const at = (s: string) => new Date(s);
function item(title: string, due: string, o: { course?: string | null; submitted?: boolean; done?: boolean; updated?: string; type?: PlannerItem['plannable_type'] } = {}): PlannerItem {
  const id = String(++seq);
  const type = o.type ?? 'assignment';
  return {
    plannable_type: type,
    plannable_id: id,
    plannable_date: at(due).toISOString(),
    plannable: { id, title },
    planner_override: o.done ? ({ id: 'o' + id, plannable_type: type, plannable_id: id, marked_complete: true, dismissed: false, updated_at: o.updated } as PlannerItem['planner_override']) : null,
    submissions: type === 'planner_note' ? false : { submitted: !!o.submitted, excused: false, graded: false, late: false, missing: false, needs_grading: false, has_feedback: false },
    new_activity: false,
    html_url: `/x/${id}`,
    course_id: o.course === null ? undefined : (o.course ?? '1'),
  } as PlannerItem;
}
const opts = { showOverdue: true, hideCompleted: true };

describe('spans', () => {
  it('week is Monday to Sunday in the Canvas zone; offsets move by weeks', () => {
    const w = spanOf('week', T);
    expect(weekday(w.start)).toBe(0);
    expect(w.end - w.start).toBe(7);
    expect(T - w.start).toBe(2); // Wednesday
    expect(spanOf('week', T, 1).start).toBe(w.start + 7);
    expect(spanOf('week', T, 1).noun).toBe('next week');
    expect(spanOf('today', T)).toMatchObject({ start: T, end: T + 1, noun: 'today' });
    expect(spanOf('next7', T)).toMatchObject({ start: T, end: T + 7 });
  });
});

describe('progress: honest counts', () => {
  const items = [
    item('Mon done', '2026-10-19T23:59:00-07:00', { done: true }),
    item('Wed open', '2026-10-21T23:59:00-07:00', { course: '2' }),
    item('Fri submitted', '2026-10-23T17:00:00-07:00', { submitted: true, course: '2' }),
    item('Sun note', '2026-10-25T12:00:00-07:00', { type: 'planner_note', course: null }),
    item('Last week overdue', '2026-10-16T23:59:00-07:00'),
    item('Next week', '2026-10-27T23:59:00-07:00'),
  ];
  const lists = classify(items, [], {}, opts, NOW);
  const span = spanOf('week', T);
  const p = progress(lists.all, span, day, NOW);
  it('counts the range only; overdue from before is listed, not counted', () => {
    expect([p.done, p.total]).toEqual([2, 4]);
    expect(p.before.map(r => r.title)).toEqual(['Last week overdue']);
    expect(countWords(p, span)).toBe('2 of 4 done this week');
  });
  it('per course, Personal last', () => {
    expect(p.courses.map(c => [c.courseId, c.done, c.total])).toEqual([
      ['1', 1, 1],
      ['2', 1, 2],
      [null, 0, 1],
    ]);
  });
  it('summary never says 0/0 or a percentage', () => {
    expect(summary({ done: 0, total: 0 }, span, 'week')).toEqual({ big: 'Nothing due this week', small: '', state: 'empty' });
    expect(summary({ done: 11, total: 11 }, span, 'week')).toEqual({ big: 'Week done', small: '11 of 11', state: 'done' });
    expect(summary({ done: 4, total: 11 }, span, 'week')).toEqual({ big: '4 of 11', small: 'done this week', state: 'progress' });
    for (const x of [summary({ done: 0, total: 0 }, span, 'today'), summary({ done: 3, total: 4 }, spanOf('next7', T), 'next7')]) expect(JSON.stringify(x)).not.toMatch(/%|0\/0|0 of 0/);
  });
  it('a tick moves every count at once (one state)', () => {
    const wed = lists.all.find(r => r.title === 'Wed open')!;
    const m: Marks = { [wed.key]: { done: true, at: NOW.getTime() } };
    const p2 = progress(classify(items, [], m, opts, NOW).all, span, day, NOW);
    expect([p2.done, p2.total]).toEqual([3, 4]);
    expect(p2.courses.find(c => c.courseId === '2')!.done).toBe(2);
  });
  it('arcs: lengths are shares of the range, fills the share done', () => {
    const a = arcs(p.courses, p.total, 0);
    expect(a.map(x => [x.length, x.doneLength])).toEqual([
      [25, 25],
      [50, 25],
      [25, 0],
    ]);
    expect(a.map(x => x.offset)).toEqual([0, 25, 75]);
    expect(arcs([], 0)).toEqual([]);
  });
  it('week columns: LATE first, then Mon–Sun with today flagged', () => {
    const cols = weekColumns(lists.all, span, day, NOW);
    expect(cols.map(c => c.total)).toEqual([1, 1, 0, 1, 0, 1, 0, 1]);
    expect(cols.findIndex(c => c.today)).toBe(3);
    expect(cols[1]!.done).toBe(1);
  });
});

describe('polish B: crossed-off stays crossed; Done today', () => {
  const a = item('Ticked now', '2026-10-22T23:59:00-07:00');
  const b = item('Ticked earlier today', '2026-10-24T23:59:00-07:00', { done: true, updated: '2026-10-21T15:00:00Z' });
  const c = item('Done yesterday', '2026-10-24T23:59:00-07:00', { done: true, updated: '2026-10-20T15:00:00Z' });
  const d = item('Submitted, due today', '2026-10-21T23:59:00-07:00', { submitted: true });
  it('a row ticked this session stays in To do, crossed off', () => {
    const m: Marks = { [keyOf(a)]: { done: true, at: NOW.getTime() } };
    const l = classify([a, b, c, d], [], m, opts, NOW, { session: new Set([keyOf(a)]) });
    const row = l.todo.find(r => r.key === keyOf(a))!;
    expect(row.complete).toBe(true);
    // On the next load (no session) it leaves To do…
    const next = classify([a, b, c, d], [], m, opts, NOW);
    expect(next.todo.find(r => r.key === keyOf(a))).toBeUndefined();
    // …and is "done today", like b (override today) and d (submitted, due today), but not c.
    const today = next.all.filter(r => isDoneToday(r, NOW, day)).map(r => r.title).sort();
    expect(today).toEqual(['Submitted, due today', 'Ticked earlier today', 'Ticked now'].sort());
  });
  it('removed rows leave even if ticked this session', () => {
    const m: Marks = { [keyOf(a)]: { done: true, removed: true, at: 0 } };
    expect(classify([a], [], m, opts, NOW, { session: new Set([keyOf(a)]) }).todo).toHaveLength(0);
  });
  it('splitDone keeps session rows in place and folds the others', () => {
    const m: Marks = { [keyOf(a)]: { done: true, at: NOW.getTime() } };
    const l = classify([a, b], [], m, opts, NOW);
    const { open, done } = splitDone(l.all, new Set([keyOf(a)]));
    expect(open.map(r => r.title)).toEqual(['Ticked now']);
    expect(done.map(r => r.title)).toEqual(['Ticked earlier today']);
  });
});

// ── One state with describe() (Agent kit trial, 2026-10-20) ─────────────────
import { stateOf } from '../../src/core/agent/model.ts';
import { STATES } from '../../src/core/agent/anchors.ts';
import { overdueWords } from '../../src/features/better-todo/rows.tsx';

describe('the panel derives state from core/agent stateOf', () => {
  // The mock's Lab Report 3 and Peer Review 2: a zero recorded for missing work.
  const zeroForMissing = (title: string, id: string) => {
    const it = item(title, '2026-10-15T23:59:59-07:00', {});
    it.plannable_id = id;
    it.submissions = { submitted: false, excused: false, graded: true, late: false, missing: true, needs_grading: false, has_feedback: false };
    return it;
  };
  const labReport3 = zeroForMissing('Lab Report 3', '11822106');
  const peerReview2 = zeroForMissing('Peer Review 2', '11822806');

  it('Lab Report 3 and Peer Review 2: the panel says what describe() says', () => {
    const l = classify([labReport3, peerReview2], [], {}, opts, NOW);
    for (const it of [labReport3, peerReview2]) {
      const r = l.all.find(x => x.key === keyOf(it))!;
      expect(r.state).toBe(stateOf(it, NOW.getTime()));
    }
  });

  // Active once core/agent's contract order puts missing before graded (the agent lane's change).
  it.runIf(STATES.indexOf('missing') < STATES.indexOf('graded'))('missing work reads Missing, sits under Overdue, and can be ticked', () => {
    const l = classify([labReport3, peerReview2], [], {}, opts, NOW);
    for (const it of [labReport3, peerReview2]) {
      const r = l.todo.find(x => x.key === keyOf(it))!;
      expect(r.state).toBe('missing');
      expect(r.overdue).toBe(true);
      expect(r.complete).toBe(false);
      expect(r.submitted).toBe(false); // the box is enabled
      expect(overdueWords(r, NOW)).toBe('Missing · 5d');
    }
  });

  it('every submission combination agrees with stateOf, and finished states leave To do', () => {
    const flags = ['submitted', 'excused', 'graded', 'late', 'missing'] as const;
    for (let mask = 0; mask < 32; mask++) {
      for (const due of ['2026-10-18T23:59:00-07:00', '2026-10-25T23:59:00-07:00']) {
        const it = item(`combo ${mask}`, due);
        it.submissions = { submitted: false, excused: false, graded: false, late: false, missing: false, needs_grading: false, has_feedback: false };
        flags.forEach((f, i) => ((it.submissions as Record<string, boolean>)[f] = !!(mask & (1 << i))));
        const r = classify([it], [], {}, opts, NOW).all[0]!;
        const s = stateOf(it, NOW.getTime());
        expect(r.state, `${mask} ${due}`).toBe(s);
        const finished = ['excused', 'graded', 'submitted', 'done'].includes(s) || (s === 'late' && !!(mask & 1));
        expect(r.complete, `${mask} ${due} ${s}`).toBe(finished);
        expect(r.overdue, `${mask} ${due} ${s}`).toBe(!finished && ['missing', 'late', 'overdue', 'past'].includes(s));
      }
    }
  });

  it("a b²c tick reads done without changing Canvas's own states", () => {
    const it = item('Ticked', '2026-10-18T23:59:00-07:00');
    const r = classify([it], [], { [keyOf(it)]: { done: true, at: NOW.getTime() } }, opts, NOW).all[0]!;
    expect(stateOf(it, NOW.getTime())).toBe('overdue');
    expect([r.state, r.complete, r.overdue]).toEqual(['done', true, false]);
    const ze = zeroForMissing('Zero', '9');
    const z = classify([ze], [], { [keyOf(ze)]: { done: true, at: NOW.getTime() } }, opts, NOW).all[0]!;
    expect(z.state).toBe(stateOf(ze, NOW.getTime())); // Canvas's verdict stays
    expect(z.complete).toBe(true); // but she ticked it, so it leaves To do
  });
});
