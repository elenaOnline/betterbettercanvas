// Pure model for the to-do views (design/spec/surfaces/todo-views.md): ranges,
// honest progress counts, the week's columns and per-course blocks. Every view
// counts from the same rows (Lists.all), so a tick in one is a tick in all.
// No DOM; unit-tested.

import type { Row } from '../logic.ts';

export const VIEWS = ['list', 'ring', 'week', 'courses'] as const;
export type ViewId = (typeof VIEWS)[number];
export const VIEW_NAME: Record<ViewId, string> = { list: 'List', ring: 'Ring', week: 'Week', courses: 'Courses' };
export const VIEW_LABEL: Record<ViewId, string> = { list: 'List', ring: 'Progress ring', week: 'Week', courses: 'By course' };

export type RangeId = 'today' | 'week' | 'next7';
export const RANGE_LABEL: Record<RangeId, string> = { today: 'Today', week: 'This week', next7: 'Next 7 days' };

/** A span of whole days in the Canvas time zone: [start, end) as day numbers. */
export interface Span {
  start: number;
  end: number;
  /** For sentences: "this week", "today", "the next 7 days", "next week". */
  noun: string;
  /** For the bar: "This week", "Next week", "Oct 26 – Nov 1". */
  label: string;
}

/** Monday = 0 … Sunday = 6, for a day number (1970-01-01, day 0, was a Thursday). */
export const weekday = (d: number) => (((d + 3) % 7) + 7) % 7;

export function spanOf(range: RangeId, today: number, weekOffset = 0, dayLabel?: (d: number) => string): Span {
  if (range === 'today') return { start: today, end: today + 1, noun: 'today', label: 'Today' };
  if (range === 'next7') return { start: today, end: today + 7, noun: 'in the next 7 days', label: 'Next 7 days' };
  const start = today - weekday(today) + 7 * weekOffset;
  const named: Record<number, [string, string]> = { 0: ['this week', 'This week'], 1: ['next week', 'Next week'], [-1]: ['last week', 'Last week'] };
  const [noun, label] = named[weekOffset] ?? [`the week of ${dayLabel?.(start) ?? ''}`.trim(), dayLabel ? `${dayLabel(start)} – ${dayLabel(start + 6)}` : `Week ${weekOffset > 0 ? '+' : ''}${weekOffset}`];
  return { start, end: start + 7, noun, label };
}

const inSpan = (r: Row, s: Span, day: (d: Date) => number) => !!r.date && day(r.date) >= s.start && day(r.date) < s.end;
/** Rows a view counts: not removed. */
const counted = (rows: readonly Row[]) => rows.filter(r => !r.removed);

export interface CourseProgress {
  courseId: string | null;
  done: number;
  total: number;
  /** In-range rows, soonest first. */
  rows: Row[];
  /** Not-complete rows from before the range (listed, never counted). */
  overdue: Row[];
}

export interface Progress {
  done: number;
  total: number;
  /** One entry per course with something in range or overdue; Personal (no course) last. */
  courses: CourseProgress[];
  inRange: Row[];
  /** Not-complete rows dated before the range: listed first, kept out of the counts. */
  before: Row[];
}

export function progress(all: readonly Row[], span: Span, day: (d: Date) => number, now: Date): Progress {
  const rows = counted(all);
  const inRange = rows.filter(r => inSpan(r, span, day));
  const before = rows.filter(r => !r.complete && r.date && day(r.date) < span.start && r.date.getTime() < now.getTime());
  const by = new Map<string, CourseProgress>();
  const get = (id: string | null) => {
    const k = id ?? '';
    let c = by.get(k);
    if (!c) by.set(k, (c = { courseId: id, done: 0, total: 0, rows: [], overdue: [] }));
    return c;
  };
  for (const r of inRange) {
    const c = get(r.courseId);
    c.total++;
    if (r.complete) c.done++;
    c.rows.push(r);
  }
  for (const r of before) get(r.courseId).overdue.push(r);
  const first = (c: CourseProgress) => Math.min(...[...c.rows, ...c.overdue].map(r => r.date?.getTime() ?? Infinity));
  const courses = [...by.values()].sort((a, b) => (a.courseId === null ? 1 : 0) - (b.courseId === null ? 1 : 0) || first(a) - first(b));
  return { done: inRange.filter(r => r.complete).length, total: inRange.length, courses, inRange, before };
}

/** The ring / summary sentence parts. Honest: never a percentage, never 0/0. */
export function summary(p: Pick<Progress, 'done' | 'total'>, span: Pick<Span, 'noun'>, range: RangeId): { big: string; small: string; state: 'empty' | 'done' | 'progress' } {
  if (p.total === 0) return { big: `Nothing due ${span.noun}`, small: '', state: 'empty' };
  if (p.done === p.total) {
    const big = range === 'week' && span.noun === 'this week' ? 'Week done' : range === 'today' ? 'Day done' : 'All done';
    return { big, small: `${p.done} of ${p.total}`, state: 'done' };
  }
  return { big: `${p.done} of ${p.total}`, small: `done ${span.noun}`, state: 'progress' };
}

/** "4 of 11 done this week", for the live region and summary lines. */
export function countWords(p: Pick<Progress, 'done' | 'total'>, span: Pick<Span, 'noun'>): string {
  return p.total === 0 ? `Nothing due ${span.noun}` : `${p.done} of ${p.total} done ${span.noun}`;
}

export interface Column {
  id: string; // 'late' or the day number
  day: number | null;
  rows: Row[];
  done: number;
  total: number;
  today: boolean;
}

/** LATE (not-complete rows before the week), then Monday … Sunday. */
export function weekColumns(all: readonly Row[], span: Span, day: (d: Date) => number, now: Date): Column[] {
  const p = progress(all, span, day, now);
  const today = day(now);
  const cols: Column[] = [{ id: 'late', day: null, rows: p.before, done: 0, total: p.before.length, today: false }];
  for (let d = span.start; d < span.end; d++) {
    const rows = p.inRange.filter(r => day(r.date!) === d);
    cols.push({ id: String(d), day: d, rows, done: rows.filter(r => r.complete).length, total: rows.length, today: d === today });
  }
  return cols;
}

/**
 * Split a block's rows for display (polish item B): rows ticked this session
 * stay in place; other complete rows go under a collapsed "N done" line.
 */
export function splitDone(rows: readonly Row[], session: ReadonlySet<string>): { open: Row[]; done: Row[] } {
  const open: Row[] = [], done: Row[] = [];
  for (const r of rows) (r.complete && !session.has(r.key) ? done : open).push(r);
  return { open, done };
}

/** Arc geometry for the ring: per course, its share of the track and the done part (pathLength = 100). */
export function arcs(courses: readonly CourseProgress[], total: number, gap = 1.2): { courseId: string | null; offset: number; length: number; doneLength: number }[] {
  if (!total) return [];
  const n = courses.filter(c => c.total > 0).length;
  let off = 0;
  const out: { courseId: string | null; offset: number; length: number; doneLength: number }[] = [];
  for (const c of courses) {
    if (!c.total) continue;
    const share = (c.total / total) * 100;
    const length = Math.max(0, share - (n > 1 ? gap : 0));
    out.push({ courseId: c.courseId, offset: off, length, doneLength: (length * c.done) / c.total });
    off += share;
  }
  return out;
}
