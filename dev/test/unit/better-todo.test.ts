import { describe, expect, it } from 'vitest';
import type { PlannerItem } from '../../src/core/canvas/data.ts';
import { previewSource } from '../../src/features/better-todo/canvas.ts';
import { agoShort, dayIndex, dayText, isoDay, sinceText, timeText, untilText, whenText, zonedToIso, type FmtOpts } from '../../src/features/better-todo/format.ts';
import { BRIDGE_MS, classify, effective, groupByDay, keyOf, LOCAL_KEEP_MS, markUntil, noteItem, pruneCustom, pruneMarks, shortCode, submissionWords, type CustomItem, type Marks } from '../../src/features/better-todo/logic.ts';
import { isEmptyHtml, sanitize, textToHtml } from '../../src/features/better-todo/sanitize.ts';

const NOW = new Date('2026-10-21T17:00:00Z'); // Wed 10:00 Pacific
const H = 3_600_000;
const TZ = 'America/Los_Angeles';

let seq = 0;
type Sub = Exclude<PlannerItem['submissions'], false>;
function item(p: { type?: PlannerItem['plannable_type']; due?: Date; submitted?: boolean; title?: string; id?: string; override?: PlannerItem['planner_override']; unread?: boolean; subs?: Partial<Sub>; extra?: Record<string, unknown> } = {}): PlannerItem {
  const id = p.id ?? String(++seq);
  const type = p.type ?? 'assignment';
  return {
    plannable_type: type,
    plannable_id: id,
    plannable_date: (p.due ?? new Date(NOW.getTime() + 48 * H)).toISOString(),
    plannable: { id, title: p.title ?? `Item ${id}`, points_possible: 10, ...p.extra },
    planner_override: p.override ?? null,
    submissions:
      type === 'announcement' || type === 'planner_note'
        ? false
        : { submitted: !!p.submitted, excused: false, graded: false, late: false, missing: false, needs_grading: false, has_feedback: false, ...p.subs },
    new_activity: p.unread ?? false,
    html_url: `/courses/1/assignments/${id}`,
    course_id: '1',
    context_name: 'Course 1',
  } as PlannerItem;
}
const ov = (marked_complete: boolean, dismissed = false) => ({ id: 'o1', plannable_type: 'assignment', plannable_id: 'x', marked_complete, dismissed });
const opts = { showOverdue: true, hideCompleted: true };
const titles = (rows: { title: string }[]) => rows.map(r => r.title);

describe('classify: To do filter (bc D11) and Done view (Design)', () => {
  const future = item({ title: 'future' });
  const soon = item({ title: 'soon', due: new Date(NOW.getTime() + 2 * H) });
  const submitted = item({ title: 'submitted', submitted: true });
  const overdue = item({ title: 'overdue', due: new Date(NOW.getTime() - 20 * H) });
  const overdueSubmitted = item({ title: 'overdue-sub', due: new Date(NOW.getTime() - 20 * H), submitted: true });
  const marked = item({ title: 'marked', override: ov(true) });
  const dismissed = item({ title: 'dismissed', override: ov(false, true) });
  const event = item({ title: 'event', type: 'calendar_event' });
  const note = item({ title: 'note', type: 'planner_note', due: new Date(NOW.getTime() + 30 * H) });
  const ann = item({ title: 'ann', type: 'announcement', due: new Date(NOW.getTime() - 5 * H), unread: true });
  const annOld = item({ title: 'ann-old', type: 'announcement', due: new Date(NOW.getTime() - 50 * H) });
  const all = [future, soon, submitted, overdue, overdueSubmitted, marked, dismissed, event, note, ann, annOld];

  it('defaults: hide completed, keep unsubmitted overdue, soonest first', () => {
    expect(titles(classify(all, [], {}, opts, NOW).todo)).toEqual(['overdue', 'soon', 'note', 'future']);
  });
  it('showOverdue off hides past due', () => {
    expect(titles(classify(all, [], {}, { ...opts, showOverdue: false }, NOW).todo)).toEqual(['soon', 'note', 'future']);
  });
  it('hideCompleted off keeps submitted and done rows, never past-due submitted or removed ones', () => {
    const t = titles(classify(all, [], {}, { ...opts, hideCompleted: false }, NOW).todo);
    expect(t).toEqual(expect.arrayContaining(['submitted', 'marked']));
    expect(t).not.toContain('overdue-sub');
    expect(t).not.toContain('dismissed');
  });
  it('calendar events are not to-dos; planner notes are', () => {
    const l = classify(all, [], {}, opts, NOW);
    expect([...titles(l.todo), ...titles(l.done)]).not.toContain('event');
    expect(titles(l.todo)).toContain('note');
  });
  it('Done: complete or removed, newest first; plain overdue stays in To do', () => {
    const l = classify(all, [], {}, opts, NOW);
    expect(new Set(titles(l.done))).toEqual(new Set(['submitted', 'overdue-sub', 'marked', 'dismissed']));
    const d = l.done.map(r => r.date!.getTime());
    expect([...d].sort((a, b) => b - a)).toEqual(d);
  });
  it('announcements newest first, unread flagged, removed ones hidden', () => {
    const l = classify(all, [], {}, opts, NOW);
    expect(titles(l.announcements)).toEqual(['ann', 'ann-old']);
    expect(l.announcements[0]!.unread).toBe(true);
    expect(titles(classify(all, [], { [keyOf(ann)]: { removed: true, at: 0 } }, opts, NOW).announcements)).toEqual(['ann-old']);
  });
  it('due soon within 24 h, urgent within 3 h, overdue when past and not complete', () => {
    const l = classify(all, [], {}, opts, NOW);
    const by = (t: string) => l.todo.find(r => r.title === t)!;
    expect([by('soon').dueSoon, by('soon').urgent]).toEqual([true, true]);
    expect([by('note').dueSoon, by('note').urgent]).toEqual([false, false]);
    expect(by('overdue').overdue).toBe(true);
  });
  it('live marks override Canvas state; lapsed marks do not', () => {
    const m: Marks = { [keyOf(marked)]: { done: false, at: 0 }, [keyOf(future)]: { removed: true, at: 0, until: NOW.getTime() + 1 } };
    const t = titles(classify(all, [], m, opts, NOW).todo);
    expect(t).toContain('marked');
    expect(t).not.toContain('future');
    expect(effective(marked, m, NOW).done).toBe(false);
    const later = new Date(NOW.getTime() + 2);
    expect(titles(classify(all, [], m, opts, later).todo)).toContain('future');
  });
  it('settling rows stay in To do while they settle', () => {
    const m: Marks = { [keyOf(soon)]: { done: true, at: 0 } };
    expect(titles(classify(all, [], m, opts, NOW).todo)).not.toContain('soon');
    const l = classify(all, [], m, opts, NOW, new Set([keyOf(soon)]));
    expect(l.todo.find(r => r.title === 'soon')!.complete).toBe(true);
  });
});

describe('local items and marks', () => {
  const local: CustomItem = { id: 'a', title: 'local thing', courseId: null, due: new Date(NOW.getTime() + 5 * H).toISOString(), at: 0 };
  it('merge into To do by date and take local marks', () => {
    expect(titles(classify([item({ title: 'x', due: new Date(NOW.getTime() + 1 * H) })], [local], {}, opts, NOW).todo)).toEqual(['x', 'local thing']);
    const l = classify([], [local], { 'local:a': { done: true, at: 0 } }, opts, NOW);
    expect(l.todo).toHaveLength(0);
    expect(l.done[0]!.source).toBe('local');
  });
  it('pruneCustom drops local items 14 days past their date', () => {
    expect(pruneCustom([local], NOW)).toEqual([local]);
    expect(pruneCustom([{ ...local, due: new Date(NOW.getTime() - LOCAL_KEEP_MS - 1).toISOString() }], NOW)).toEqual([]);
  });
  it('markUntil: a 10-minute bridge when syncing, 14 days past the date when local', () => {
    expect(markUntil(true, null, NOW)).toBe(NOW.getTime() + BRIDGE_MS);
    const due = new Date(NOW.getTime() + 48 * H);
    expect(markUntil(false, due, NOW)).toBe(due.getTime() + LOCAL_KEEP_MS);
    expect(pruneMarks({ a: { done: true, at: 0, until: NOW.getTime() - 1 }, b: { done: true, at: 0 } }, NOW)).toEqual({ b: { done: true, at: 0 } });
  });
  it('noteItem makes a planner item for a new note', () => {
    const it = noteItem({ id: 77, title: 'Call advisor', todo_date: NOW.toISOString(), course_id: null });
    expect(keyOf(it)).toBe('planner_note:77');
    expect(titles(classify([it], [], {}, opts, new Date(NOW.getTime() - H)).todo)).toEqual(['Call advisor']);
  });
});

describe('groupByDay', () => {
  const day = (d: Date) => dayIndex(d, TZ);
  const at = (s: string) => item({ title: s, due: new Date(s) });
  it('Overdue, Today, Tomorrow, This week, Later; empty groups left out', () => {
    const rows = classify(
      [at('2026-10-20T23:59:00-07:00'), at('2026-10-21T23:59:00-07:00'), at('2026-10-22T09:00:00-07:00'), at('2026-10-27T23:59:00-07:00'), at('2026-10-28T09:00:00-07:00')],
      [],
      {},
      opts,
      NOW,
    ).todo;
    const g = groupByDay(rows, NOW, day);
    expect(g.map(x => [x.id, x.rows.length])).toEqual([['overdue', 1], ['today', 1], ['tomorrow', 1], ['week', 1], ['later', 1]]);
    expect(groupByDay(rows.slice(1, 2), NOW, day).map(x => x.label)).toEqual(['Today']);
  });
});

describe('submissionWords (Canvas words)', () => {
  const row = (subs: Partial<Sub>) => classify([item({ subs, submitted: subs.submitted })], [], {}, { showOverdue: true, hideCompleted: false }, NOW).todo[0]!;
  it('maps states', () => {
    expect(submissionWords(row({ missing: true }))).toBe('Missing');
    expect(submissionWords(row({ submitted: true, late: true }))).toBe('Submitted late');
    expect(submissionWords(row({ submitted: true, graded: true }), { score: 18, points: 20 })).toBe('Graded 18/20');
    expect(submissionWords(row({}))).toBeNull();
  });
});

describe('format', () => {
  const o: FmtOpts = { tz: TZ, clock: '12', dates: 'relative' };
  const at = (s: string) => new Date(s);
  it('relative days in the Canvas time zone', () => {
    expect(dayText(at('2026-10-21T23:30:00-07:00'), NOW, o)).toBe('Today');
    expect(dayText(at('2026-10-22T06:59:59Z'), NOW, o)).toBe('Today'); // 23:59 PDT
    expect(dayText(at('2026-10-22T07:00:00Z'), NOW, o)).toBe('Tomorrow');
    expect(dayText(at('2026-10-21T06:59:59Z'), NOW, o)).toBe('Yesterday');
    expect(dayText(at('2026-10-24T12:00:00-07:00'), NOW, o)).toBe('Sat');
    expect(dayText(at('2026-11-05T12:00:00-08:00'), NOW, o)).toBe('Nov 5');
    expect(dayText(at('2027-01-05T12:00:00-08:00'), NOW, o)).toBe('Jan 5, 2027');
  });
  it('absolute dates and 12/24 h clocks', () => {
    const d = at('2026-10-22T06:59:59Z');
    expect(whenText(d, NOW, o)).toBe('Today at 11:59 PM');
    expect(whenText(d, NOW, { ...o, dates: 'absolute' })).toBe('Oct 21 at 11:59 PM');
    expect(timeText(d, { ...o, clock: '24' })).toBe('23:59');
  });
  it('until, ago and since', () => {
    expect(untilText(new Date(NOW.getTime() + 45 * 60_000), NOW)).toBe('in 45m');
    expect(untilText(new Date(NOW.getTime() + 2 * H + 10 * 60_000), NOW)).toBe('in 2h 10m');
    expect(untilText(new Date(NOW.getTime() + 2 * H), NOW)).toBe('in 2h');
    expect(agoShort(new Date(NOW.getTime() - 3 * H), NOW)).toBe('3h');
    expect(agoShort(new Date(NOW.getTime() - 50 * H), NOW)).toBe('2d');
    expect(sinceText(new Date(NOW.getTime() - 2 * H), NOW, o)).toBe('2h ago');
    expect(sinceText(at('2026-10-20T09:00:00-07:00'), NOW, o)).toBe('Yesterday');
    expect(sinceText(at('2026-10-01T09:00:00-07:00'), NOW, o)).toBe('Oct 1');
  });
  it('form date/time in the Canvas zone → ISO, across DST', () => {
    expect(zonedToIso('2026-10-21', '23:59', TZ)).toBe('2026-10-22T06:59:00.000Z');
    expect(zonedToIso('2026-12-01', '09:00', TZ)).toBe('2026-12-01T17:00:00.000Z');
    expect(zonedToIso('2026-11-01', '12:00', TZ)).toBe('2026-11-01T20:00:00.000Z');
    expect(zonedToIso('bad', '23:59', 'UTC')).toBeNull();
    expect(isoDay(at('2026-10-22T06:59:59Z'), TZ)).toBe('2026-10-21');
  });
});

describe('sanitize', () => {
  const base = 'https://canvas.b2c-mock.test';
  it('keeps structure, drops scripts, styles, handlers and unsafe URLs', () => {
    const out = sanitize(
      '<h2>Part A</h2><p style="color:red" onclick="x()">Do <b>this</b> <a href="/files/1" onmouseover="y()">file</a> <a href="javascript:alert(1)">bad</a></p><script>alert(1)</script><iframe src="https://x"></iframe><img src="/equation_images/x" alt="x^2" onerror="z()"><ul><li>one</li></ul><custom-el>kept text</custom-el>',
      base,
    );
    expect(out).not.toMatch(/script|iframe|style=|onclick|onmouseover|onerror|javascript:/);
    expect(out).toContain('<strong>Part A</strong>');
    expect(out).toContain('<a href="https://canvas.b2c-mock.test/files/1" target="_blank" rel="noopener noreferrer">file</a>');
    expect(out).toContain('<a target="_blank" rel="noopener noreferrer">bad</a>');
    expect(out).toContain('src="https://canvas.b2c-mock.test/equation_images/x"');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('kept text');
  });
  it('plain text and emptiness', () => {
    expect(textToHtml('a <b>\nb\n\nc')).toBe('<p>a &lt;b&gt;<br>b</p><p>c</p>');
    expect(isEmptyHtml('<p>&nbsp;</p>')).toBe(true);
    expect(isEmptyHtml('<p><img src="x"></p>')).toBe(false);
  });
});

describe('previewSource: read-safe endpoints only', () => {
  const row = (type: string, extra: Record<string, unknown> = {}) => {
    const it = item({ type: type as PlannerItem['plannable_type'], id: '9', extra, title: 'Week 3 discussion' });
    const l = classify([it], [], {}, { showOverdue: true, hideCompleted: false }, NOW);
    return l.todo[0] ?? l.announcements[0]!;
  };
  it('assignments, quizzes and graded discussions use the assignments LIST with assignment_ids (never /assignments/:id)', () => {
    expect(previewSource(row('assignment'))!.path).toBe('/courses/1/assignments?assignment_ids[]=9&include[]=submission&per_page=50');
    expect(previewSource(row('quiz', { assignment_id: 44 }))!.path).toMatch(/^\/courses\/1\/assignments\?assignment_ids\[\]=44&/);
    expect(previewSource(row('discussion_topic', { assignment_id: 45 }))!.path).toMatch(/assignment_ids\[\]=45/);
    const s = previewSource(row('assignment'))!;
    expect(s.pick([{ id: '8', description: 'no' }, { id: 9, description: '<p>yes</p>', points_possible: 20, submission: { score: 18 } }])).toEqual({ raw: '<p>yes</p>', score: { score: 18, grade: null, points: 20 } });
  });
  it('ungraded discussions search the topic list, never /discussion_topics/:id', () => {
    const s = previewSource(row('discussion_topic'))!;
    expect(s.path).toBe('/courses/1/discussion_topics?search_term=Week%203%20discussion&per_page=50');
  });
  it('announcements use /announcements around their date and pick by id', () => {
    const s = previewSource(row('announcement'))!;
    expect(s.path).toMatch(/^\/announcements\?context_codes\[\]=course_1&start_date=/);
    expect(s.pick([{ id: 8, message: 'no' }, { id: '9', message: '<p>yes</p>' }]).raw).toBe('<p>yes</p>');
  });
  it('pages and notes never fetch', () => {
    expect(previewSource(row('wiki_page', { url: 'p' }))).toBeNull();
    expect(previewSource(row('planner_note'))).toBeNull();
  });
  it('no endpoint that marks read or logs a view is ever used', () => {
    for (const t of ['assignment', 'quiz', 'discussion_topic', 'announcement', 'sub_assignment']) {
      const p = previewSource(row(t, { assignment_id: 3 }))?.path ?? '';
      expect(p).not.toMatch(/\/(assignments|discussion_topics|pages|quizzes)\/\d|\/read|mark_read|\/view/);
    }
  });
});

describe('shortCode', () => {
  it('cuts section and term, keeps subject and number', () => {
    expect(shortCode('MATH-301-002 Fall 2026')).toBe('MATH 301');
    expect(shortCode('ENV-410/510-001 Fall 2026')).toBe('ENV 410');
    expect(shortCode('CHEM 101-001')).toBe('CHEM 101');
    expect(shortCode('CAS Advising')).toBe('CAS');
  });
});
