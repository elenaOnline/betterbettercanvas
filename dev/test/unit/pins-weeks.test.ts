import { describe, expect, it } from 'vitest';
import type { Module } from '../../src/core/canvas/data.ts';
import { dayFromYMD, dayOf, fmtSpan, parseName, pickModule, prepare, rules, termWeek, weekStart, type PickOpts } from '../../src/features/pins/weeks.ts';

const TZ = 'America/Los_Angeles';
const TERM = { termStart: '2026-09-28T00:00:00-07:00', termEnd: '2026-12-12T23:59:00-08:00' };
/** Wed of week 4 (Oct 19–25), like the mock's MOCK_NOW. */
const NOW = '2026-10-21T10:00:00-07:00';
const opts = (now = NOW, extra: Partial<PickOpts> = {}): PickOpts => ({ now: new Date(now), tz: TZ, ...TERM, ...extra });

/** Monday 00:00 PT of week n of the Fall 2026 term, plus `days`, at `hour`. */
function wk(n: number, days = 0, hour = 23): string {
  const d = new Date(Date.UTC(2026, 8, 28 + (n - 1) * 7 + days, hour + 7, 59));
  return d.toISOString();
}

let seq = 0;
function mod(name: string, position: number, o: { unlock?: string; due?: string[]; done?: boolean[]; items?: Module['items'] } = {}): Module {
  const id = String(1000 + position);
  return {
    id,
    name,
    position,
    unlock_at: o.unlock ?? null,
    items: o.items ?? (o.due ?? []).map((d, i) => ({
      id: String(++seq),
      title: `${name} item ${i + 1}`,
      type: 'Assignment',
      html_url: `/courses/1/modules/items/${seq}`,
      content_details: { due_at: d },
      ...(o.done?.[i] ? { completion_requirement: { type: 'must_submit', completed: true } } : {}),
    })),
  } as Module;
}
const NUMS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
/** Ten week modules, each with items due Wed and Fri of its week. */
const weekly = (name: (n: number) => string, extra: (n: number) => Partial<Parameters<typeof mod>[2]> = () => ({})) =>
  Array.from({ length: 10 }, (_, i) => mod(name(i + 1), i + 1, { due: [wk(i + 1, 2), wk(i + 1, 4)], ...extra(i + 1) }));

describe('days and weeks', () => {
  it('works in the given time zone, not UTC', () => {
    // Sun Nov 1 23:30 PST is already Monday in UTC.
    const t = '2026-11-02T07:30:00Z';
    expect(dayOf(t, TZ)).toBe(dayFromYMD(2026, 11, 1));
    expect(dayOf(t, 'UTC')).toBe(dayFromYMD(2026, 11, 2));
    expect(weekStart(dayOf(t, TZ))).toBe(dayFromYMD(2026, 10, 26));
    // Bad zone names fall back to the runtime's zone instead of throwing.
    expect(() => dayOf(t, 'Not/AZone')).not.toThrow();
  });
  it('Monday starts the week', () => {
    expect(weekStart(dayFromYMD(2026, 10, 21))).toBe(dayFromYMD(2026, 10, 19));
    expect(weekStart(dayFromYMD(2026, 10, 19))).toBe(dayFromYMD(2026, 10, 19));
    expect(weekStart(dayFromYMD(2026, 10, 25))).toBe(dayFromYMD(2026, 10, 19));
  });
  it('counts weeks of the term (the pilot school Fall 2026: Oct 21 is week 4)', () => {
    expect(termWeek(opts())).toBe(4);
    expect(termWeek(opts('2026-09-28T08:00:00-07:00'))).toBe(1);
    expect(termWeek(opts('2026-09-20T08:00:00-07:00'))).toBeNull();
    expect(termWeek({ now: new Date(NOW), tz: TZ })).toBeNull();
    // A term starting on a weekend counts from the next Monday.
    expect(termWeek({ now: new Date(NOW), tz: TZ, termStart: '2026-09-26T00:00:00-07:00' })).toBe(4);
  });
  it('formats spans', () => {
    expect(fmtSpan(dayFromYMD(2026, 10, 19), dayFromYMD(2026, 10, 26))).toBe('Oct 19–25');
    expect(fmtSpan(dayFromYMD(2026, 10, 26), dayFromYMD(2026, 11, 2))).toBe('Oct 26 – Nov 1');
  });
});

describe('parseName', () => {
  const week = (from: number, to = from) => ({ kind: 'week', from, to });
  it.each([
    ['Week 3', week(3)],
    ['Week 3: Groups and subgroups', week(3)],
    ['week 2: Document architecture', week(2)],
    ['WEEK 03', week(3)],
    ['Wk 3', week(3)],
    ['Wk. 3 – Rings', week(3)],
    ['W3 – Rings', week(3)],
    ['Week #3', week(3)],
    ['Week Three', week(3)],
    ['Week Twelve', week(12)],
    ['Third Week', week(3)],
    ['3rd week: ideals', week(3)],
    ['Weeks 3–4', week(3, 4)],
    ['Week 3-4', week(3, 4)],
    ['Week 1–2', week(1, 2)],
    ['Week 3 & 4', week(3, 4)],
    ['Weeks 3 and 4', week(3, 4)],
    ['Week 3/4', week(3, 4)],
  ])('%s', (name, want) => expect(parseName(name)).toEqual(want));

  it.each([
    ['Unit 3', { kind: 'unit', from: 3, to: 3 }],
    ['Module 0 – Start Here', { kind: 'unit', from: 0, to: 0 }],
    ['Module 8 – Midterm Integration Week', { kind: 'unit', from: 8, to: 8 }],
    ['Lesson 4: Titration', { kind: 'unit', from: 4, to: 4 }],
  ])('%s', (name, want) => expect(parseName(name)).toEqual(want));

  it.each([
    ['Week of Oct 14', { m: 10, d: 14 }, undefined, true],
    ['Week of October 14th', { m: 10, d: 14 }, undefined, true],
    ['Week of 10/14', { m: 10, d: 14 }, undefined, true],
    ['Oct 14–20', { m: 10, d: 14 }, { m: 10, d: 20 }, false],
    ['Oct 26 - Nov 1', { m: 10, d: 26 }, { m: 11, d: 1 }, false],
    ['Oct 28–3', { m: 10, d: 28 }, { m: 11, d: 3 }, false],
    ['10/14–10/20', { m: 10, d: 14 }, { m: 10, d: 20 }, false],
    ['10/14 - 10/20/2026', { m: 10, d: 14 }, { m: 10, d: 20, y: 2026 }, false],
    ['Sept. 29 to Oct. 3', { m: 9, d: 29 }, { m: 10, d: 3 }, false],
    ['Week 3 (Jan 22 - Jan 28)', { m: 1, d: 22 }, { m: 1, d: 28 }, false],
    ['Quarter break week (Nov 20 - Nov 26)', { m: 11, d: 20 }, { m: 11, d: 26 }, false],
  ])('%s has dates', (name, from, to, weekOf) => {
    expect(parseName(name)).toEqual({ kind: 'dates', from, ...(to ? { to } : {}), weekOf });
  });

  it.each(['Syllabus', 'Homework 3', 'HW3', 'Chapter 3', 'Lecture 3', 'Session 3', 'Weekly quizzes', 'Network 3', 'Weekend 3', 'Video Lectures', 'Investigation 3: Kinetics', 'Week 45'])(
    '%s says nothing about weeks',
    name => expect(parseName(name)).toBeNull(),
  );
});

describe('rule 1: dates in names', () => {
  const mods = [
    mod('Week of Sep 28', 1),
    mod('Oct 5–Oct 11', 2),
    mod('10/12–10/18', 3),
    mod('Week 4 (Oct 19 - Oct 25)', 4),
    mod('Oct 26 – Nov 1', 5),
  ];
  it('picks the range containing today', () => {
    const p = pickModule(mods, 'this-week', opts());
    expect(p).toMatchObject({ module: { name: 'Week 4 (Oct 19 - Oct 25)' }, rule: 'dates' });
    expect(p!.span).toEqual({ from: dayFromYMD(2026, 10, 19), to: dayFromYMD(2026, 10, 26) });
  });
  it('next week and latest', () => {
    expect(pickModule(mods, 'next-week', opts())!.module.name).toBe('Oct 26 – Nov 1');
    expect(pickModule(mods, 'latest', opts())!.module.name).toBe('Week 4 (Oct 19 - Oct 25)');
  });
  it('a pin follows the calendar: a week later it is the next module', () => {
    expect(pickModule(mods, 'this-week', opts('2026-10-28T10:00:00-07:00'))!.module.name).toBe('Oct 26 – Nov 1');
  });
  it('ties go to the later start (Evergreen: "Mar 4 - Mar 11", "Mar 11 - Mar 17")', () => {
    const ms = [mod('Week 8 (Mar 4 - Mar 11)', 1), mod('Week 9 (Mar 11 - Mar 17)', 2)];
    const p = pickModule(ms, 'this-week', { now: new Date('2027-03-11T09:00:00-08:00'), tz: TZ });
    expect(p!.module.name).toBe('Week 9 (Mar 11 - Mar 17)');
  });
  it('rolls the year across New Year from the term', () => {
    const ms = [mod('Dec 28 - Jan 3', 1), mod('Jan 4 - Jan 10', 2)];
    const p = pickModule(ms, 'this-week', { now: new Date('2026-12-30T09:00:00-08:00'), tz: TZ, termStart: '2026-12-28T00:00:00-08:00' });
    expect(p!.module.name).toBe('Dec 28 - Jan 3');
  });
  it('in a gap: the next module from Thursday on, else the last one as a stand-in', () => {
    const gap = [mod('Oct 5–11', 1), mod('Oct 26 – Nov 1', 2)];
    const thu = pickModule(gap, 'this-week', opts('2026-10-22T10:00:00-07:00'));
    expect(thu).toMatchObject({ module: { name: 'Oct 26 – Nov 1' }, fallback: 'upcoming' });
    const tue = pickModule(gap, 'this-week', opts('2026-10-20T10:00:00-07:00'));
    expect(tue).toMatchObject({ module: { name: 'Oct 5–11' }, fallback: 'last' });
    expect(pickModule(gap, 'this-week', opts('2026-10-22T10:00:00-07:00', { upcomingFrom: 7 }))!.fallback).toBe('last');
  });
  it('one dated module is not a schedule', () => {
    expect(rules([mod('Midterm (Oct 14)', 1), mod('Rings', 2)], opts()).map(r => r.rule)).not.toContain('dates');
  });
});

describe('rule 2: unlock_at', () => {
  const topics = ['Syllabus', 'Stoichiometry', 'Gases', 'Thermochemistry', 'Atoms', 'Bonding', 'Shapes', 'Liquids', 'Solutions', 'Kinetics'];
  const mods = topics.map((t, i) => mod(t, i + 1, { unlock: wk(i + 1, 0, 0).replace(/T.*/, 'T07:00:00Z') }));
  it('the latest unlock on or before today', () => {
    expect(pickModule(mods, 'this-week', opts())).toMatchObject({ module: { name: 'Thermochemistry' }, rule: 'unlock' });
    expect(pickModule(mods, 'next-week', opts())!.module.name).toBe('Atoms');
    expect(pickModule(mods, 'this-week', opts('2026-10-26T09:00:00-07:00'))!.module.name).toBe('Atoms');
    // Sunday night is still the old week; Monday morning is the new one.
    expect(pickModule(mods, 'this-week', opts('2026-10-25T23:30:00-07:00'))!.module.name).toBe('Thermochemistry');
  });
  it('needs 3 modules', () => {
    const two = [mod('A', 1, { unlock: '2026-10-05T07:00:00Z' }), mod('B', 2, { unlock: '2026-10-19T07:00:00Z' }), mod('C', 3)];
    expect(rules(two, opts()).map(r => r.rule)).not.toContain('unlock');
  });
  it('must rise with position', () => {
    const jumbled = [mod('A', 1, { unlock: '2026-10-19T07:00:00Z' }), mod('B', 2, { unlock: '2026-10-05T07:00:00Z' }), mod('C', 3, { unlock: '2026-10-12T07:00:00Z' })];
    expect(rules(jumbled, opts()).map(r => r.rule)).not.toContain('unlock');
  });
  it('all unlocking on one day is a publish date, not a schedule', () => {
    const same = ['A', 'B', 'C'].map((n, i) => mod(n, i + 1, { unlock: '2026-09-28T07:00:00Z' }));
    expect(rules(same, opts()).map(r => r.rule)).not.toContain('unlock');
  });
});

describe('rule 3: week numbering', () => {
  it('digits, placed from the term start (MATH 401 pattern)', () => {
    const p = pickModule(weekly(n => `Week ${n}`), 'this-week', opts());
    expect(p).toMatchObject({ module: { name: 'Week 4' }, rule: 'numbering' });
    expect(fmtSpan(p!.span!.from, p!.span!.to)).toBe('Oct 19–25');
  });
  it('number words with no due dates (the owner\'s live "Week One…")', () => {
    const mods = [mod('Syllabus', 0), ...NUMS.map((w, i) => mod(`Week ${w}`, i + 1))];
    expect(pickModule(mods, 'this-week', opts())).toMatchObject({ module: { name: 'Week Four' }, rule: 'numbering' });
    expect(pickModule(mods, 'next-week', opts())!.module.name).toBe('Week Five');
  });
  it('positions out of order do not matter (desn368)', () => {
    const mods = [mod('week 1: Intro', 1), mod('week 2: Docs', 2), mod('week 4: Layout', 3), mod('week 5: Grids', 4), mod('week 3: Type', 5)];
    expect(pickModule(mods, 'this-week', opts())!.module.name).toBe('week 4: Layout');
  });
  it('"Weeks 3–4" covers both weeks (the mock default)', () => {
    const mods = [mod('Week 1–2', 1), mod('Week 3–4', 2), mod('Week 5–6', 3), mod('Week 7–8', 4)];
    expect(pickModule(mods, 'this-week', opts())!.module.name).toBe('Week 3–4');
    expect(pickModule(mods, 'next-week', opts())!.module.name).toBe('Week 5–6');
  });
  it('learns the anchor from due dates with no term start', () => {
    const p = pickModule(weekly(n => `Week ${n}`), 'this-week', { now: new Date(NOW), tz: TZ });
    expect(p!.module.name).toBe('Week 4');
  });
  it('a term start that is really registration day is corrected by due dates', () => {
    const early = opts(NOW, { termStart: '2026-09-14T00:00:00-07:00' });
    expect(termWeek(early)).toBe(6);
    expect(pickModule(weekly(n => `Week ${n}`), 'this-week', early)!.module.name).toBe('Week 4');
  });
  it('the course start wins when enrolment is restricted to course dates', () => {
    const o = opts(NOW, { courseStart: '2026-10-05T00:00:00-07:00' });
    const mods = NUMS.map((w, i) => mod(`Week ${w}`, i + 1));
    expect(pickModule(mods, 'this-week', o)!.module.name).toBe('Week Three');
  });
  it('"Week 14" cannot exist in a 10-week quarter', () => {
    const mods = [mod('Week 13', 1), mod('Week 14', 2)];
    expect(rules(mods, opts()).map(r => r.rule)).not.toContain('numbering');
  });
  it('units count only when they look weekly', () => {
    const units = Array.from({ length: 10 }, (_, i) => mod(`Unit ${i + 1}`, i + 1));
    expect(pickModule(units, 'this-week', opts())!.module.name).toBe('Unit 4'); // 10 units in a 10-week term
    const three = Array.from({ length: 3 }, (_, i) => mod(`Unit ${i + 1}`, i + 1));
    expect(rules(three, opts()).map(r => r.rule)).not.toContain('numbering');
    const dated = Array.from({ length: 4 }, (_, i) => mod(`Module ${i + 1}`, i + 1, { due: [wk(i + 1, 2), wk(i + 1, 4)] }));
    expect(pickModule(dated, 'this-week', opts())).toMatchObject({ module: { name: 'Module 4' }, rule: 'numbering' });
  });
  it('a stray "Week 9 (…)" among topics is not a scheme', () => {
    const mods = [mod('Syllabus', 1), mod('Handouts', 2), mod('Week 9 (review)', 3), mod('Homeworks', 4)];
    expect(rules(mods, opts()).map(r => r.rule)).not.toContain('numbering');
  });
});

describe('rule 4: due dates', () => {
  const topics = ['Essay basics', 'Sources', 'Annotated bibliography', 'Argument', 'Drafting', 'Peer review'];
  const mods = topics.map((t, i) => mod(t, i + 1, { due: [wk(i + 1, 2), wk(i + 1, 4)] }));
  it('the module whose next open due date is soonest', () => {
    expect(pickModule(mods, 'this-week', opts())).toMatchObject({ module: { name: 'Argument' }, rule: 'due' });
    expect(pickModule(mods, 'next-week', opts())!.module.name).toBe('Drafting');
  });
  it('skips items already done', () => {
    const ms = topics.map((t, i) => mod(t, i + 1, { due: [wk(i + 1, 2), wk(i + 1, 4)], done: i === 3 ? [true, true] : [] }));
    // Oct 21 10:00: Argument's items are done; the next open one is Drafting's (Wed Oct 28).
    expect(pickModule(ms, 'this-week', opts())!.module.name).toBe('Drafting');
  });
  it('a homework module spanning the term still answers "what is due now" (topic courses)', () => {
    const ms = [mod('Handouts', 1), mod('Homeworks', 2, { due: [wk(1, 4), wk(3, 4), wk(4, 4), wk(6, 4)] })];
    expect(pickModule(ms, 'this-week', opts())).toMatchObject({ module: { name: 'Homeworks' }, rule: 'due' });
  });
  it('needs two dated items', () => {
    expect(rules([mod('Only one', 1, { due: [wk(4, 2)] })], opts())).toEqual([]);
  });
  it('a locked module is not this week unless it opens within a day', () => {
    const ms = [
      mod('Open', 1, { due: [wk(4, 4), wk(4, 5)] }),
      mod('Locked', 2, { due: [wk(4, 2, 12), wk(4, 3)], unlock: '2026-10-30T07:00:00Z' }),
    ];
    expect(pickModule(ms, 'this-week', opts())!.module.name).toBe('Open');
  });
});

describe('order of rules and disagreement', () => {
  it('a stronger rule wins, and a weaker one that disagrees is flagged', () => {
    // Names say week 3 is Oct 19, numbering (from the term) says Week 4 is.
    const mods = [mod('Week 2 (Oct 12 - Oct 18)', 1), mod('Week 3 (Oct 19 - Oct 25)', 2), mod('Week 4 (Oct 26 - Nov 1)', 3)];
    // These have dates in names, so numbering never runs on them; build a numbering-only twin to disagree.
    const p = pickModule(mods, 'this-week', opts());
    expect(p).toMatchObject({ module: { name: 'Week 3 (Oct 19 - Oct 25)' }, rule: 'dates' });

    // Each week opens a week early: unlock dates say Week 5, numbering says Week 4.
    const unlock = ['09-21', '09-28', '10-05', '10-12', '10-19', '10-26'].map((d, i) => mod(`Week ${i + 1}`, i + 1, { unlock: `2026-${d}T07:00:00Z` }));
    const q = pickModule(unlock, 'this-week', opts());
    expect(q).toMatchObject({ module: { name: 'Week 5' }, rule: 'unlock', conflict: { rule: 'numbering', module: { name: 'Week 4' } } });
  });
  it('no rule applies to topic modules without dates', () => {
    const mods = ['Syllabus', 'Handouts', 'Video Lectures', 'Example Midterms'].map((n, i) => mod(n, i + 1));
    expect(pickModule(mods, 'this-week', opts())).toBeNull();
    expect(pickModule(mods, 'latest', opts())).toMatchObject({ module: { name: 'Example Midterms' }, rule: 'position' });
  });
  it('skips archived and hidden modules', () => {
    const mods = [...weekly(n => `Week ${n}`), mod('Week 4 (archived)', 11)];
    expect(prepare(mods).map(m => m.name)).not.toContain('Week 4 (archived)');
  });
  it('week SubHeaders inside one big module become pseudo-modules', () => {
    const items = [
      { id: 's1', title: 'Week 3', type: 'SubHeader' },
      { id: 'a1', title: 'Reading 3', type: 'Page' },
      { id: 's2', title: 'Week 4', type: 'SubHeader' },
      { id: 'a2', title: 'Reading 4', type: 'Page' },
      { id: 's3', title: 'Week 5', type: 'SubHeader' },
    ];
    const p = pickModule([mod('Course Content', 1, { items })], 'this-week', opts());
    expect(p).toMatchObject({ module: { id: '1001:s2', name: 'Week 4' }, rule: 'numbering' });
  });
});
