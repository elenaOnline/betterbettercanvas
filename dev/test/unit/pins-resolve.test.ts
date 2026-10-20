import { describe, expect, it } from 'vitest';
import type { CanvasFile, Course, Module, PlannerItem, WikiPage } from '../../src/core/canvas/data.ts';
import { suggest } from '../../src/features/pins/capture.ts';
import { isPin, isPinList, type Pin, type Target } from '../../src/features/pins/model.ts';
import { defaultLabel, emptySnapshot, matcher, needs, pathOf, resolve, type Snapshot } from '../../src/features/pins/resolve.ts';

const TZ = 'America/Los_Angeles';
const NOW = new Date('2026-10-21T10:00:00-07:00');
const C = '118200';

const course = (id: string, code: string, extra: Partial<Course> = {}): Course =>
  ({ id, name: `${code}-001: Something (Fall 2026)`, course_code: code, term: { id: '3405', name: 'Fall 2026', start_at: '2026-09-28T07:00:00Z', end_at: '2026-12-13T07:59:00Z' }, ...extra }) as Course;

const weekDue = (n: number, day: number) => new Date(Date.UTC(2026, 8, 28 + (n - 1) * 7 + day, 6, 59)).toISOString();
const weekMods = (name: (n: number) => string): Module[] =>
  Array.from({ length: 10 }, (_, i) => ({
    id: String(500 + i + 1),
    name: name(i + 1),
    position: i + 1,
    unlock_at: null,
    items: [
      { id: `${i}1`, title: `${name(i + 1)}: notes`, type: 'Page', html_url: `https://canvas.b2c-mock.test/courses/${C}/modules/items/${i}1` },
      ...(i < 4 ? [{ id: `${i}2`, title: `Lecture ${i + 1}.pdf`, type: 'File', html_url: `https://canvas.b2c-mock.test/courses/${C}/modules/items/${i}2` }] : []),
      { id: `${i}3`, title: `HW ${i + 1}`, type: 'Assignment', html_url: `/courses/${C}/modules/items/${i}3`, content_details: { due_at: weekDue(i + 1, 3) } },
      { id: `${i}4`, title: `Quiz ${i + 1}`, type: 'Quiz', html_url: `/courses/${C}/modules/items/${i}4`, content_details: { due_at: weekDue(i + 1, 5) } },
    ],
  }));

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return { ...emptySnapshot(NOW, TZ), courses: [course(C, 'MATH 401'), course('118214', 'CHEM 101')], ...over };
}
const pin = (target: Target, label = 'P'): Pin => ({ id: 'p1', label, target });

describe('model', () => {
  it('validates pins', () => {
    expect(isPin(pin({ kind: 'module', course: C, which: 'this-week' }))).toBe(true);
    expect(isPin(pin({ kind: 'module', course: C, which: 'pinned' }))).toBe(false);
    expect(isPin(pin({ kind: 'module', course: C, which: 'pinned', module: '501' }))).toBe(true);
    expect(isPin(pin({ kind: 'url', href: 'javascript:alert(1)' }))).toBe(false);
    expect(isPin(pin({ kind: 'url', href: '/courses/1/pages/x' }))).toBe(true);
    expect(isPin(pin({ kind: 'latest-file', course: C, match: '  ' }))).toBe(false);
    expect(isPin(pin({ kind: 'next-due' }))).toBe(true);
    expect(isPin({ ...pin({ kind: 'grades', course: 'abc' }) })).toBe(false);
    expect(isPinList([pin({ kind: 'grades', course: C }), pin({ kind: 'grades', course: C })])).toBe(false); // duplicate id
  });
});

describe('matcher', () => {
  it('substring, alternatives, regex', () => {
    expect(matcher('lecture')('Lecture 4 slides.pdf')).toBe(true);
    expect(matcher('lecture|slides')('Week 3 slides')).toBe(true);
    expect(matcher('/^lec(ture)? \\d+/')('Lecture 12.pdf')).toBe(true);
    expect(matcher('/^lec(ture)? \\d+/')('Old lecture 12')).toBe(false);
    expect(matcher('/[/')('anything')).toBe(false);
  });
});

describe('resolve: module', () => {
  const t: Target = { kind: 'module', course: C, which: 'this-week' };
  it('waits for data (pending) and needs courses + modules', () => {
    expect(resolve(pin(t), snap())).toMatchObject({ pending: true, href: `/courses/${C}/modules` });
    expect(needs(t)).toEqual([{ kind: 'courses' }, { kind: 'modules', course: C }]);
  });
  it('this week, with the rule that fired', () => {
    const r = resolve(pin(t), snap({ modules: { [C]: weekMods(n => `Week ${n}`) } }));
    expect(r).toMatchObject({ ok: true, href: `/courses/${C}/modules#module_504`, title: 'Week 4', detail: 'Week 4', rule: 'numbering', why: 'Oct 19–25 · by module name' });
  });
  it('topic names get the term week in front', () => {
    const topics = ['Atoms', 'Moles', 'Solutions', 'Gases', 'Heat', 'Quanta', 'Shells', 'Trends', 'Bonds', 'Shapes'];
    const r = resolve(pin(t), snap({ modules: { [C]: weekMods(n => topics[n - 1]!) } }));
    expect(r).toMatchObject({ ok: true, title: 'Gases', detail: 'Week 4 · Gases', rule: 'due' });
  });
  it('from Thursday (upcomingFrom) it also says what next week holds; the pin still opens this week', () => {
    const thu = snap({ now: new Date('2026-10-22T10:00:00-07:00'), modules: { [C]: weekMods(n => `Week ${n}`) } });
    expect(resolve(pin(t), thu)).toMatchObject({ title: 'Week 4', detail: 'Week 4 · next: Week 5', href: `/courses/${C}/modules#module_504`, next: { title: 'Week 5', href: `/courses/${C}/modules#module_505` } });
    expect(resolve(pin(t), { ...thu, upcomingFrom: 4 }).detail).toBe('Week 4');
    expect(resolve(pin(t), snap({ modules: { [C]: weekMods(n => `Week ${n}`) } })).next).toBeUndefined();
  });
  it('a week later, the same pin resolves to the next module', () => {
    const r = resolve(pin(t), snap({ now: new Date('2026-10-28T10:00:00-07:00'), modules: { [C]: weekMods(n => `Week ${n}`) } }));
    expect(r.title).toBe('Week 5');
  });
  it('next week, latest, and a module picked by hand', () => {
    const s = snap({ modules: { [C]: weekMods(n => `Week ${n}`) } });
    expect(resolve(pin({ ...t, which: 'next-week' }), s).title).toBe('Week 5');
    expect(resolve(pin({ ...t, which: 'latest' }), s).title).toBe('Week 4');
    expect(resolve(pin({ kind: 'module', course: C, which: 'pinned', module: '502' }), s)).toMatchObject({ ok: true, title: 'Week 2', rule: 'manual', href: `/courses/${C}/modules#module_502` });
    expect(resolve(pin({ kind: 'module', course: C, which: 'pinned', module: '999' }), s)).toMatchObject({ ok: false, state: 'gone', detail: 'Not found' });
  });
  it('flags a weaker rule that disagrees, in plain words', () => {
    const mods: Module[] = ['09-21', '09-28', '10-05', '10-12', '10-19', '10-26'].map((d, i) => ({ id: String(600 + i), name: `Week ${i + 1}`, position: i + 1, unlock_at: `2026-${d}T07:00:00Z`, items: [] }));
    const r = resolve(pin(t), snap({ modules: { [C]: mods } }));
    expect(r).toMatchObject({ title: 'Week 5', rule: 'unlock', flag: 'Unlock dates say Week 5; numbering says Week 4' });
  });
  it('topic courses with no dates fall back to this week\'s due items honestly', () => {
    const mods: Module[] = [
      { id: '1', name: 'Syllabus', position: 1, items: [] },
      { id: '2', name: 'Homeworks', position: 2, items: [{ id: 'h', title: 'HW', type: 'Assignment', content_details: { due_at: '2026-10-23T06:59:00Z' } }] },
    ];
    const r = resolve(pin(t), snap({ modules: { [C]: mods } }));
    expect(r).toMatchObject({ ok: false, state: 'fallback', href: `/courses/${C}/assignments`, detail: "This week's due items · fallback" });
    expect(r.why).toBe("Couldn't find a week in this course's modules; showing this week's due items (1).");
  });
  it('pseudo-modules link to their header', () => {
    const items = [
      { id: 's3', title: 'Week 3', type: 'SubHeader' },
      { id: 's4', title: 'Week 4', type: 'SubHeader' },
      { id: 'x', title: 'Reading', type: 'Page' },
    ];
    const r = resolve(pin(t), snap({ modules: { [C]: [{ id: '9', name: 'Course Content', position: 1, items }] } }));
    expect(r.href).toBe(`/courses/${C}/modules#context_module_item_s4`);
  });
});

describe('resolve: next due', () => {
  const item = (id: string, title: string, due: string, extra: Partial<PlannerItem> = {}): PlannerItem =>
    ({ course_id: C, plannable_id: id, plannable_type: 'assignment', plannable_date: due, plannable: { id, title, due_at: due }, planner_override: null, submissions: { submitted: false, excused: false, graded: false, late: false, missing: false, needs_grading: false, has_feedback: false }, new_activity: false, html_url: `https://canvas.b2c-mock.test/courses/${C}/assignments/${id}`, context_name: 'MATH 401', ...extra }) as PlannerItem;
  const planner = [
    item('1', 'Past', '2026-10-20T06:59:00Z'),
    item('2', 'Submitted', '2026-10-21T20:00:00Z', { submissions: { submitted: true, excused: false, graded: false, late: false, missing: false, needs_grading: true, has_feedback: false } }),
    item('3', 'Done', '2026-10-21T21:00:00Z', { planner_override: { id: 'o', plannable_type: 'assignment', plannable_id: '3', marked_complete: true, dismissed: false } }),
    item('4', 'Problem Set 4', '2026-10-22T06:59:00Z'),
    item('5', 'Other course', '2026-10-21T22:00:00Z', { course_id: '118214', context_name: 'CHEM 101' }),
  ];
  it('the soonest open item, in a course or anywhere', () => {
    expect(resolve(pin({ kind: 'next-due', course: C }), snap({ planner }))).toMatchObject({ ok: true, title: 'Problem Set 4', href: `/courses/${C}/assignments/4`, detail: 'due today 11:59 PM' });
    expect(resolve(pin({ kind: 'next-due' }), snap({ planner }))).toMatchObject({ title: 'Other course', detail: 'due today 3 PM · CHEM 101' });
  });
  it('nothing due', () => {
    expect(resolve(pin({ kind: 'next-due', course: C }), snap({ planner: [] }))).toMatchObject({ ok: false, detail: 'Nothing due soon' });
  });
});

describe('resolve: files and pages', () => {
  const files: CanvasFile[] = [
    { id: '64', display_name: 'Lecture 4 slides.pdf', created_at: '2026-10-19T14:00:00Z' },
    { id: '63', display_name: 'Lecture 3.pdf', created_at: '2026-10-12T14:00:00Z' },
    { id: '60', display_name: 'Syllabus.pdf', created_at: '2026-09-25T14:00:00Z' },
  ];
  const lt: Target = { kind: 'latest-file', course: C, match: 'lecture' };
  it('newest matching file', () => {
    expect(resolve(pin(lt), snap({ files: { [C]: files }, modules: { [C]: [] } }))).toMatchObject({ ok: true, title: 'Lecture 4 slides.pdf', href: `/courses/${C}/files/64`, detail: 'added Oct 19' });
  });
  it('files hidden: falls back to the newest matching file in modules', () => {
    const r = resolve(pin(lt), snap({ files: { [C]: 'hidden' }, modules: { [C]: weekMods(n => `Week ${n}`) } }));
    expect(r).toMatchObject({ ok: true, title: 'Lecture 4.pdf', href: `/courses/${C}/modules/items/32`, detail: 'in Week 4' });
  });
  it('nothing matching', () => {
    const r = resolve(pin({ ...lt, match: 'recording' }), snap({ files: { [C]: files }, modules: { [C]: [] } }));
    expect(r).toMatchObject({ ok: false, state: 'gone', detail: 'Not found', why: 'No file matching “recording”' });
  });
  const pages: WikiPage[] = [
    { url: 'week-4-notes', title: 'Week 4: notes', html_url: `https://canvas.b2c-mock.test/courses/${C}/pages/week-4-notes`, updated_at: '2026-10-20T15:00:00Z' },
    { url: 'syllabus', title: 'Syllabus', html_url: `https://canvas.b2c-mock.test/courses/${C}/pages/syllabus` },
  ];
  it('a page by title; the syllabus falls back to Canvas\'s syllabus tool', () => {
    const s = snap({ pages: { [C]: pages }, modules: { [C]: [] } });
    expect(resolve(pin({ kind: 'page', course: C, match: 'syllabus' }), s)).toMatchObject({ ok: true, title: 'Syllabus', href: `/courses/${C}/pages/syllabus` });
    expect(resolve(pin({ kind: 'page', course: C, match: 'syllabus' }), snap({ pages: { [C]: [] }, modules: { [C]: [] } }))).toMatchObject({ ok: true, href: `/courses/${C}/assignments/syllabus` });
    expect(resolve(pin({ kind: 'page', course: C, match: 'office hours' }), s)).toMatchObject({ ok: false, state: 'gone' });
  });
});

describe('resolve: plain targets', () => {
  it('assignments, grades, links', () => {
    expect(resolve(pin({ kind: 'grades', course: C }), snap())).toMatchObject({ ok: true, href: `/courses/${C}/grades`, detail: 'MATH 401' });
    expect(resolve(pin({ kind: 'assignments', course: C }), snap()).href).toBe(`/courses/${C}/assignments`);
    expect(resolve(pin({ kind: 'url', href: 'https://openstax.org/books' }), snap())).toMatchObject({ href: 'https://openstax.org/books', detail: 'openstax.org' });
    expect(pathOf('https://canvas.b2c-mock.test/courses/1/pages/x')).toBe('/courses/1/pages/x');
  });
  it('default labels use the course code', () => {
    const cs = [course(C, 'MATH 401')];
    expect(defaultLabel({ kind: 'module', course: C, which: 'this-week' }, cs)).toBe('MATH 401 this week');
    expect(defaultLabel({ kind: 'latest-file', course: C, match: 'lecture' }, cs)).toBe('MATH 401 lecture');
    expect(defaultLabel({ kind: 'next-due' }, cs)).toBe('Next due');
  });
});

describe('pin this page', () => {
  it('a modules page offers this week\'s module first', () => {
    const s = suggest('/courses/118200/modules', '', 'Modules: MATH 401-001: Abstract Algebra I (Fall 2026)');
    expect(s[0]!.target).toEqual({ kind: 'module', course: '118200', which: 'this-week' });
    expect(s[1]!.target).toEqual({ kind: 'url', href: '/courses/118200/modules' });
  });
  it('grades, assignments, syllabus, files and weekly pages become queries', () => {
    expect(suggest('/courses/1/grades')[0]!.target).toEqual({ kind: 'grades', course: '1' });
    expect(suggest('/courses/1/assignments')[0]!.target).toEqual({ kind: 'assignments', course: '1' });
    expect(suggest('/courses/1/assignments/syllabus')[0]!.target).toEqual({ kind: 'page', course: '1', match: 'syllabus' });
    expect(suggest('/courses/1/files/64', '', 'Lecture 4 slides.pdf: MATH 401')[0]!.target).toEqual({ kind: 'latest-file', course: '1', match: 'lecture' });
    expect(suggest('/courses/1/pages/week-4-notes', '', 'Week 4: notes: MATH 401')[0]!.target).toEqual({ kind: 'module', course: '1', which: 'this-week' });
    expect(suggest('/courses/1/pages/office-hours', '', 'Office Hours: MATH 401')).toEqual([{ title: 'This page', target: { kind: 'url', href: '/courses/1/pages/office-hours' }, label: 'Office Hours' }]);
  });
  it('elsewhere: the page itself; nothing on the dashboard', () => {
    expect(suggest('/calendar', '?view=week', 'Calendar')[0]!.target).toEqual({ kind: 'url', href: '/calendar?view=week' });
    expect(suggest('/')).toEqual([]);
  });
});
