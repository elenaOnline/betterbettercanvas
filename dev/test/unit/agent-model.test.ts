import { describe, expect, it } from 'vitest';
import type { Course, DashboardCard, PlannerItem } from '../../src/core/canvas/data.ts';
import {
  absUrl, changeFacts, itemUrl, courseList, describeFrom, doneInB2c, dueList, mergePlanner, opensChange, pageItemId, stateOf, windowOf,
  STATES, type PlannerEntry, type Snapshot,
} from '../../src/core/agent/model.ts';
import { marksRead, MARKS_READ_PATHS, MARKS_READ_PUBLISHED } from '../../src/core/agent/read-safety.ts';
import { moduleItemPath, mustViewPaths } from '../../src/core/agent/run.ts';

const LA = 'America/Los_Angeles';
const NOW = Date.parse('2026-10-21T10:00:00-07:00');
const ORIGIN = 'https://school.instructure.com';
const subs = (o: Partial<Exclude<PlannerItem['submissions'], false>> = {}) => ({
  submitted: false, excused: false, graded: false, late: false, missing: false, needs_grading: false, has_feedback: false, ...o,
});

function item(o: Partial<PlannerItem> & { id: string; due?: string | null; type?: PlannerItem['plannable_type'] }): PlannerItem {
  const type = o.type ?? 'assignment';
  const date = o.plannable_date ?? o.due ?? '2026-10-24T23:59:00-07:00';
  return {
    course_id: '118200',
    plannable_id: o.id,
    plannable_type: type,
    plannable_date: date,
    plannable: { id: o.id, title: `Item ${o.id}`, due_at: o.due === undefined ? date : o.due, points_possible: 10, ...(o.plannable ?? {}) },
    planner_override: null,
    submissions: subs(),
    new_activity: false,
    html_url: `/courses/118200/assignments/${o.id}`,
    ...o,
  } as PlannerItem;
}

describe('agent model: states (§2, first match wins)', () => {
  const doneO = { id: 'o', plannable_type: 'assignment', plannable_id: '1', marked_complete: true, dismissed: false };
  const past = '2026-10-20T23:59:00-07:00';
  it('the contract order, all nine', () => {
    expect(STATES).toEqual(['excused', 'missing', 'graded', 'late', 'submitted', 'done', 'overdue', 'past', 'upcoming']);
    expect(stateOf(item({ id: '1', submissions: subs({ excused: true, graded: true, missing: true }) }), NOW)).toBe('excused');
    expect(stateOf(item({ id: '1', submissions: subs({ missing: true, late: true }) }), NOW)).toBe('missing');
    expect(stateOf(item({ id: '1', submissions: subs({ graded: true, submitted: true, late: true }) }), NOW)).toBe('graded');
    expect(stateOf(item({ id: '1', submissions: subs({ submitted: true, late: true }), planner_override: doneO }), NOW)).toBe('late');
    expect(stateOf(item({ id: '1', submissions: subs({ submitted: true }), planner_override: doneO }), NOW)).toBe('submitted');
    expect(stateOf(item({ id: '1', due: past, planner_override: doneO }), NOW)).toBe('done');
    expect(stateOf(item({ id: '1', due: past }), NOW)).toBe('overdue');
    expect(stateOf(item({ id: '1', due: past, submissions: false }), NOW)).toBe('past');
    expect(stateOf(item({ id: '1', due: '2026-10-22T23:59:00-07:00' }), NOW)).toBe('upcoming');
  });

  it('missing beats graded: a zero recorded for missing work (mock Lab Report 3, Peer Review 2)', () => {
    const zero = subs({ missing: true, graded: true, submitted: false });
    expect(stateOf(item({ id: 'lab3', due: past, plannable: { id: 'lab3', title: 'Lab Report 3' }, submissions: zero }), NOW)).toBe('missing');
    expect(stateOf(item({ id: 'pr2', due: past, plannable: { id: 'pr2', title: 'Peer Review 2' }, submissions: zero }), NOW)).toBe('missing');
  });

  it('late beats submitted: submitted late, not yet graded', () => {
    expect(stateOf(item({ id: '1', due: past, submissions: subs({ submitted: true, late: true }) }), NOW)).toBe('late');
    expect(stateOf(item({ id: '1', due: past, submissions: subs({ submitted: true, late: true, graded: true }) }), NOW)).toBe('graded');
  });

  it('done: marked complete in the planner, even before the due date', () => {
    expect(stateOf(item({ id: '1', due: '2026-10-22T23:59:00-07:00', planner_override: doneO }), NOW)).toBe('done');
  });

  it('past: announcements, events, notes and pages (nothing to submit) once their time has gone', () => {
    const at = '2026-10-19T09:00:00-07:00';
    expect(stateOf(item({ id: '1', type: 'announcement', due: null, plannable_date: at, submissions: false }), NOW)).toBe('past');
    expect(stateOf(item({ id: '1', type: 'calendar_event', plannable_date: at, submissions: false }), NOW)).toBe('past');
    expect(stateOf(item({ id: '1', type: 'planner_note', due: null, plannable: { id: '1', title: 'n', todo_date: at }, submissions: false }), NOW)).toBe('past');
    expect(stateOf(item({ id: '1', type: 'wiki_page', due: null, plannable: { id: '1', title: 'p', todo_date: at }, submissions: false }), NOW)).toBe('past');
    expect(stateOf(item({ id: '1', type: 'announcement', due: null, plannable_date: '2026-10-22T09:00:00-07:00', submissions: false }), NOW)).toBe('upcoming');
  });
});

describe('agent model: doneInB2c', () => {
  it('a live b²c mark wins; else the planner override', () => {
    const i = item({ id: '7' });
    expect(doneInB2c(i, {}, NOW)).toBe(false);
    expect(doneInB2c(i, { 'assignment:7': { done: true, at: NOW } }, NOW)).toBe(true);
    expect(doneInB2c(i, { 'assignment:7': { done: true, at: NOW, until: NOW - 1 } }, NOW)).toBe(false);
    const o = { ...i, planner_override: { id: 'o', plannable_type: 'assignment', plannable_id: '7', marked_complete: true, dismissed: false } };
    expect(doneInB2c(o, {}, NOW)).toBe(true);
    expect(doneInB2c(o, { 'assignment:7': { done: false, at: NOW } }, NOW)).toBe(false);
  });
});

describe('agent model: planner merge and window', () => {
  const day = (d: number) => Date.parse(`2026-10-${String(d).padStart(2, '0')}T00:00:00Z`);
  it('the newest entry covering an instant is authoritative', () => {
    const old: PlannerEntry = { t: 1, start: day(1), end: day(30), data: [item({ id: 'a', due: '2026-10-10T10:00:00Z' }), item({ id: 'gone', due: '2026-10-22T10:00:00Z' }), item({ id: 'b', due: '2026-10-28T10:00:00Z' })] };
    const fresh: PlannerEntry = { t: 2, start: day(15), end: day(25), data: [item({ id: 'c', due: '2026-10-20T10:00:00Z', plannable: { id: 'c', title: 'new title' } })] };
    const ids = mergePlanner([old, fresh]).map(i => i.plannable_id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('defaults to 7 days back and 14 ahead; bare days are whole days in the zone', () => {
    expect(windowOf({}, NOW, LA)).toEqual({ from: NOW - 7 * 86_400_000, to: NOW + 14 * 86_400_000 });
    const w = windowOf({ from: '2026-10-13', to: '2026-11-03' }, NOW, LA);
    expect(new Date(w.from).toISOString()).toBe('2026-10-13T07:00:00.000Z');
    expect(new Date(w.to).toISOString()).toBe('2026-11-04T08:00:00.000Z');
  });
});

describe('agent model: page and urls', () => {
  it('pageItemId', () => {
    expect(pageItemId('/courses/1/assignments/77')).toBe('assignment:77');
    expect(pageItemId('/courses/1/assignments/syllabus')).toBeNull();
    expect(pageItemId('/courses/1/assignments')).toBeNull();
    expect(pageItemId('/courses/1/quizzes/9/take')).toBe('quiz:9');
    expect(pageItemId('/courses/1/discussion_topics/5?x=1')).toBe('discussion_topic:5');
    expect(pageItemId('/courses/1/modules/items/12')).toBe('module_item:12');
    expect(pageItemId('/courses/1/pages/syllabus-page')).toBeNull();
    expect(pageItemId('/courses/1/files/3')).toBe('file:3');
    expect(pageItemId('/')).toBeNull();
  });

  it('absUrl forces the page origin', () => {
    expect(absUrl('/courses/1/assignments/2', ORIGIN)).toBe(`${ORIGIN}/courses/1/assignments/2`);
    expect(absUrl('https://canvas.other.edu/courses/1', ORIGIN)).toBe(`${ORIGIN}/courses/1`);
    expect(absUrl(null, ORIGIN)).toBeNull();
  });

  it('marks-read paths match the contract list', () => {
    expect(MARKS_READ_PUBLISHED).toEqual([...MARKS_READ_PATHS, '/courses/*/assignments/* (when a must-view module requirement is open)']);
    expect(MARKS_READ_PATHS).toEqual(['/courses/*/grades', '/courses/*/announcements/*', '/courses/*/discussion_topics/*', '/conversations*', '/courses/*/modules/items/*']);
    for (const p of ['/courses/1/grades', '/courses/1/grades/', '/courses/1/announcements/5', '/courses/1/discussion_topics/5', '/conversations', '/conversations/7', '/courses/1/modules/items/9', `${ORIGIN}/courses/1~2/grades#tab`]) {
      expect(marksRead(p), p).toBe(true);
    }
    for (const p of ['/courses/1', '/courses/1/announcements', '/courses/1/discussion_topics', '/courses/1/modules', '/courses/1/assignments/2', '/grades', '/calendar']) {
      expect(marksRead(p), p).toBe(false);
    }
  });
});

describe('agent model: marksRead = opening this changes state in Canvas', () => {
  const facts = { mustView: new Set(['/courses/118200/assignments/11820003', '/courses/118200/pages/week-1-notes']), unread: new Map([['/courses/118200/announcements/5', false], ['/courses/118200/announcements/6', true]]) };
  it('open must-view requirement → true, even on an assignment page', () => {
    expect(opensChange('/courses/118200/assignments/11820003', facts)).toBe(true);
    expect(opensChange('/courses/118200/assignments/11820003?module_item_id=4', facts)).toBe(true);
    expect(opensChange('/courses/118200/pages/week-1-notes/', facts)).toBe(true);
    expect(opensChange('/courses/118200/assignments/11820004', facts)).toBe(false);
  });
  it('a read announcement is false; unread or unknown stays true; grades, inbox, module items always true', () => {
    expect(opensChange('/courses/118200/announcements/5', facts)).toBe(false);
    expect(opensChange('/courses/118200/announcements/6', facts)).toBe(true);
    expect(opensChange('/courses/118200/announcements/7', facts)).toBe(true);
    for (const p of ['/courses/118200/grades', '/conversations', '/courses/118200/modules/items/9']) expect(opensChange(p, facts), p).toBe(true);
  });
  it('must-view paths come from cached module lists (incomplete must_view only)', () => {
    const items = [
      { id: '1', title: 'A', type: 'Assignment', content_id: '11820003', completion_requirement: { type: 'must_view', completed: false } },
      { id: '2', title: 'B', type: 'Assignment', content_id: '11820004', completion_requirement: { type: 'must_view', completed: true } },
      { id: '3', title: 'C', type: 'Assignment', content_id: '11820005', completion_requirement: { type: 'must_submit', completed: false } },
      { id: '4', title: 'Notes', type: 'Page', page_url: 'week-1-notes', completion_requirement: { type: 'must_view' } },
      { id: '5', title: 'Slides', type: 'File', content_id: '77', completion_requirement: { type: 'must_view', completed: false } },
      { id: '6', title: 'Link', type: 'ExternalUrl', completion_requirement: { type: 'must_view', completed: false } },
    ];
    expect([...mustViewPaths([{ courseId: '118200', items }])].sort()).toEqual(['/courses/118200/assignments/11820003', '/courses/118200/files/77', '/courses/118200/pages/week-1-notes']);
    expect(moduleItemPath('118200', { id: '9', title: 'Q', type: 'Quiz', content_id: '5001' })).toBe('/courses/118200/quizzes/5001');
  });
});

const course = (id: string, o: Partial<Course> = {}): Course => ({ id, name: `Course ${id}`, course_code: `C ${id}`, term: { id: 't', name: 'Fall 2026', start_at: null, end_at: null }, ...o });
const card = (id: string, o: Partial<DashboardCard> = {}): DashboardCard => ({
  id, shortName: `Course ${id}`, originalName: `Course ${id}`, courseCode: `C ${id}`, assetString: `course_${id}`, href: `/courses/${id}`, term: 'Fall 2026', image: null, position: null, ...o,
});

function snap(o: Partial<Snapshot> = {}): Snapshot {
  return {
    build: 'test', origin: ORIGIN, tz: LA, userId: '1001', now: NOW,
    page: { kind: 'dashboard', courseId: null, itemId: null }, path: '/', docTitle: 'Dashboard',
    courses: null, cards: null, colors: null, planner: [], marks: {}, ...o,
  };
}

describe('agent model: courses', () => {
  it('names, nicknames, colours, favourites and dashboard order', () => {
    const s = snap({
      courses: { t: NOW, data: [course('1', { name: 'Algebra', original_name: 'MATH 401 Abstract Algebra I' }), course('2'), course('3')] },
      cards: { t: NOW, data: [card('2', { position: 0, isFavorited: true, color: '#111111' }), card('1', { position: 1, isFavorited: false })] },
      colors: { t: NOW, data: { course_1: '#8a3ffc' } },
    });
    const out = courseList(s);
    expect(out.map(c => c.id)).toEqual(['course:2', 'course:1', 'course:3']);
    expect(out[1]).toEqual({ id: 'course:1', name: 'MATH 401 Abstract Algebra I', nickname: 'Algebra', code: 'C 1', term: 'Fall 2026', color: '#8a3ffc', url: `${ORIGIN}/courses/1`, favorite: false });
    expect(out[0]!.color).toBe('#111111');
    expect(out[2]!.favorite).toBeNull();
    expect(out[2]!.nickname).toBeNull();
  });

  it('falls back to dashboard cards when there is no courses cache', () => {
    const out = courseList(snap({ cards: { t: NOW, data: [card('9', { shortName: 'Nick', originalName: 'Real', isFavorited: true })] } }));
    expect(out).toEqual([{ id: 'course:9', name: 'Real', nickname: 'Nick', code: 'C 9', term: 'Fall 2026', color: null, url: `${ORIGIN}/courses/9`, favorite: true }]);
  });
});

describe('agent model: due and the whole response', () => {
  const planner: PlannerEntry[] = [{
    t: NOW - 60_000, start: NOW - 14 * 86_400_000, end: NOW + 28 * 86_400_000,
    data: [
      item({ id: 'late1', due: '2026-10-20T23:59:00-07:00' }),
      item({ id: 'far', due: '2026-12-20T23:59:00-08:00' }),
      item({ id: 'old', due: '2026-10-01T23:59:00-07:00' }),
      item({ id: 'ann', type: 'announcement', due: null, plannable_date: '2026-10-19T09:00:00-07:00', submissions: false, html_url: '/courses/118200/announcements/ann', plannable: { id: 'ann', title: 'Welcome', posted_at: '2026-10-19T16:00:00Z' } }),
      item({ id: 'n1', type: 'planner_note', course_id: undefined, due: null, plannable_date: '2026-10-23T12:00:00-07:00', plannable: { id: 'n1', title: 'Note', todo_date: '2026-10-23T12:00:00-07:00' }, submissions: false, html_url: '/api/v1/planner_notes/n1' }),
      item({ id: 'soon', due: '2026-10-22T09:00:00-07:00', plannable: { id: 'soon', title: 'Soon', points_possible: null } }),
      item({ id: 'ann2', type: 'announcement', due: null, plannable_date: '2026-10-20T09:00:00-07:00', submissions: false, new_activity: false, html_url: '/courses/118200/announcements/ann2', plannable: { id: 'ann2', title: 'Read already' } }),
    ],
  }];

  it('due: in window, oldest first, typed fields, absolute urls, marks-read flagged', () => {
    const d = dueList(snap({ planner, marks: { 'assignment:soon': { done: true, at: NOW } } }), windowOf({}, NOW, LA));
    expect(d.map(x => x.id)).toEqual(['announcement:ann', 'announcement:ann2', 'assignment:late1', 'assignment:soon', 'planner_note:n1']);
    // new_activity unknown (undefined) on ann → unread; ann2 is known read → opening it changes nothing.
    expect(d[0]).toMatchObject({ type: 'announcement', due: null, posted: '2026-10-19T09:00:00-07:00', url: `${ORIGIN}/courses/118200/announcements/ann`, state: 'past', courseId: 'course:118200' });
    expect(d[1]).toMatchObject({ marksRead: false, state: 'past' });
    d.splice(1, 1);
    expect(d[1]).toMatchObject({ due: '2026-10-20T23:59:00-07:00', state: 'overdue', points: 10, marksRead: false, url: `${ORIGIN}/courses/118200/assignments/late1` });
    expect(d[2]).toMatchObject({ title: 'Soon', points: null, doneInB2c: true, state: 'upcoming' });
    expect(d[3]).toMatchObject({ courseId: null, url: null, marksRead: false, state: 'upcoming', due: '2026-10-23T12:00:00-07:00' });
  });

  it('due: an assignment with an open must-view requirement is flagged', () => {
    const d = dueList(snap({ planner, mustView: new Set(['/courses/118200/assignments/soon']) }), windowOf({}, NOW, LA));
    expect(d.find(x => x.id === 'assignment:soon')!.marksRead).toBe(true);
    expect(d.find(x => x.id === 'assignment:late1')!.marksRead).toBe(false);
    expect(changeFacts({ planner, origin: ORIGIN }).unread.get('/courses/118200/announcements/ann2')).toBe(false);
  });

  it('url is always a page: calendar events map to the calendar, other /api/ addresses are dropped', () => {
    const ev = item({ id: '61001', type: 'calendar_event', plannable_date: '2026-10-22T12:00:00-07:00', submissions: false, html_url: '/api/v1/calendar_events/61001' });
    expect(itemUrl(ev, ORIGIN, '1001')).toBe(`${ORIGIN}/calendar?event_id=61001&include_contexts=course_118200`);
    expect(itemUrl({ ...ev, course_id: undefined }, ORIGIN, '1001')).toBe(`${ORIGIN}/calendar?event_id=61001&include_contexts=user_1001`);
    expect(itemUrl({ ...ev, html_url: '/calendar?event_id=61001&include_contexts=course_118200' }, ORIGIN, null)).toBe(`${ORIGIN}/calendar?event_id=61001&include_contexts=course_118200`);
    expect(itemUrl(item({ id: '1', html_url: '/api/v1/courses/1/assignments/1' }), ORIGIN, null)).toBeNull();
    expect(itemUrl(item({ id: '2', type: 'planner_note', html_url: '/api/v1/planner_notes/2' }), ORIGIN, null)).toBeNull();
    expect(itemUrl(item({ id: '3' }), ORIGIN, null)).toBe(`${ORIGIN}/courses/118200/assignments/3`);
  });

  it('fresh.due is the oldest planner fetch behind the window', () => {
    const older: PlannerEntry = { ...planner[0]!, t: NOW - 3_600_000, start: NOW - 86_400_000, end: NOW + 86_400_000, data: [] };
    const outside: PlannerEntry = { ...planner[0]!, t: NOW - 99 * 86_400_000, start: NOW - 90 * 86_400_000, end: NOW - 60 * 86_400_000, data: [] };
    const r = describeFrom(snap({ planner: [...planner, older, outside] }), {}, 'f');
    expect(r.fresh.due).toBe('2026-10-21T09:00:00-07:00');
  });

  it('describeFrom: envelope, page, freshness, readSafety', () => {
    const s = snap({
      page: { kind: 'assignment', courseId: '118200', itemId: 'soon' }, path: '/courses/118200/assignments/soon', docTitle: 'Doc',
      courses: { t: NOW - 120_000, data: [course('118200')] }, planner,
    });
    const r = describeFrom(s, { id: 'abc' }, 'abc');
    expect(r).toMatchObject({ $b2c: 'describe', v: 1, id: 'abc', build: 'test', at: '2026-10-21T10:00:00-07:00', origin: ORIGIN, timeZone: LA, userId: '1001' });
    // pageItemId only accepts numeric assignment ids; 'soon' isn't one.
    expect(r.page).toEqual({ kind: 'assignment', courseId: '118200', itemId: null, title: 'Doc', url: `${ORIGIN}/courses/118200/assignments/soon`, marksRead: false });
    expect(r.fresh).toEqual({ courses: '2026-10-21T09:58:00-07:00', due: '2026-10-21T09:59:00-07:00' });
    expect(r.readSafety.marksReadPaths).toEqual([...MARKS_READ_PUBLISHED]);
    expect(r.readSafety.readSafeApi).toContain('GET /api/v1/planner/items');
  });

  it('describeFrom: a known item names the page; nothing cached → empty lists and null freshness', () => {
    const p2 = [{ ...planner[0]!, data: [item({ id: '77', due: '2026-10-22T09:00:00-07:00', plannable: { id: '77', title: 'Homework 1' } })] }];
    const r = describeFrom(snap({ path: '/courses/118200/assignments/77', page: { kind: 'assignment', courseId: '118200', itemId: '77' }, planner: p2 }), {}, 'x');
    expect(r.page.itemId).toBe('assignment:77');
    expect(r.page.title).toBe('Homework 1');
    const empty = describeFrom(snap(), {}, 'y');
    expect(empty.courses).toEqual([]);
    expect(empty.due).toEqual([]);
    expect(empty.fresh).toEqual({ courses: null, due: null });
  });
});
