// Pure logic for card-assignments: which items a card shows, in what order,
// and how their due dates read. No DOM, no chrome.*: unit-tested.

import type { PlannerItem } from '../../core/canvas/data.ts';

export type ItemType = 'assignment' | 'quiz' | 'discussion_topic';
export const ITEM_TYPES: readonly ItemType[] = ['assignment', 'quiz', 'discussion_topic'];

export interface PickOpts {
  count: number;
  overdue: boolean;
  showCompleted: boolean;
  types: ReadonlySet<string>;
  /** Items marked done in b²c (local, or optimistically while syncing). */
  done: ReadonlySet<string>;
  /** Items un-done in this page: wins over any done source until the next tick. */
  undone?: ReadonlySet<string>;
  /** Done items to keep in place, struck through, for the rest of this page
   *  (spec: "The row stays, crossed off, until the next page load"). */
  crossed?: ReadonlySet<string>;
}

/** Types that are always shown when they belong to a course: planner notes
 *  (better-todo "+ Add" with sync on) and b²c-local custom items. */
export const CUSTOM_TYPES: ReadonlySet<string> = new Set(['planner_note', 'local']);

/** A b²c-local custom item (its plannable_type is 'local', outside Canvas's union). */
export const isLocal = (i: { plannable_type: string }) => i.plannable_type === 'local';

export interface Row {
  key: string;
  item: PlannerItem;
  due: Date;
  overdue: boolean;
  completed: boolean;
  /** Ticked in this page: shown struck through, in place. */
  done: boolean;
}

export interface Picked {
  rows: Row[];
  /** Everything still to do (crossed-off rows excluded), so the header can say "Due · 7". */
  total: number;
  /** Rows not shown ("+3 more"). */
  more: number;
}

export const itemKey = (i: Pick<PlannerItem, 'plannable_type' | 'plannable_id'>) => `${i.plannable_type}:${String(i.plannable_id)}`;

export function dueOf(i: PlannerItem): Date | null {
  const s = i.plannable?.due_at ?? i.plannable_date;
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Canvas's state: submitted, excused or graded counts as completed work. */
export function isCompleted(i: PlannerItem): boolean {
  const s = i.submissions;
  return !!s && (s.submitted || s.excused || s.graded);
}

export function isDone(i: PlannerItem, done: ReadonlySet<string>, undone?: ReadonlySet<string>): boolean {
  const k = itemKey(i);
  if (undone?.has(k)) return false;
  return !!i.planner_override?.marked_complete || done.has(k);
}

/** Group planner items by course id (string). */
export function byCourse(items: readonly PlannerItem[]): Map<string, PlannerItem[]> {
  const m = new Map<string, PlannerItem[]>();
  for (const i of items) {
    if (i.course_id == null) continue;
    const id = String(i.course_id);
    let l = m.get(id);
    if (!l) m.set(id, (l = []));
    l.push(i);
  }
  return m;
}

/**
 * One card's rows: overdue first (oldest first), then upcoming (soonest
 * first). Done items never show; completed ones only with showCompleted and
 * only while still upcoming. With more items than rows, the last row becomes
 * "+N more".
 */
export function pick(items: readonly PlannerItem[], o: PickOpts, now: Date): Picked {
  const t = now.getTime();
  const overdue: Row[] = [];
  const upcoming: Row[] = [];
  for (const item of items) {
    if (!o.types.has(item.plannable_type) && !CUSTOM_TYPES.has(item.plannable_type)) continue;
    const key = itemKey(item);
    const done = isDone(item, o.done, o.undone);
    if (done && !o.crossed?.has(key)) continue;
    const due = dueOf(item);
    if (!due) continue;
    const completed = isCompleted(item);
    const row: Row = { key, item, due, overdue: false, completed, done };
    if (due.getTime() < t) {
      if (!done && (!o.overdue || completed)) continue;
      row.overdue = !done;
      overdue.push(row);
    } else {
      if (!done && completed && !o.showCompleted) continue;
      upcoming.push(row);
    }
  }
  const asc = (a: Row, b: Row) => a.due.getTime() - b.due.getTime() || a.key.localeCompare(b.key);
  overdue.sort(asc);
  upcoming.sort(asc);
  const all = [...overdue, ...upcoming];
  const total = all.filter(r => !r.done).length;
  const n = Math.max(1, o.count);
  if (all.length <= n) return { rows: all, total, more: 0 };
  const shown = n > 1 ? n - 1 : 1;
  return { rows: all.slice(0, shown), total, more: all.length - shown };
}

/** The "count" card view: overdue, due within 7 days, and everything left. */
export function counts(items: readonly PlannerItem[], o: PickOpts, now: Date, timeZone?: string): { overdue: number; week: number; total: number } {
  const all = pick(items, { ...o, count: Number.MAX_SAFE_INTEGER, crossed: undefined }, now).rows;
  let overdue = 0, week = 0;
  for (const r of all) {
    if (r.overdue) overdue++;
    else if (!r.completed && dayDiff(r.due, now, timeZone) < 7) week++;
  }
  return { overdue, week, total: all.filter(r => !r.completed).length };
}

// ── Dates ───────────────────────────────────────────────────────────────────

export interface DateOpts {
  /** IANA zone (Canvas's ENV.TIMEZONE); undefined = the browser's. */
  timeZone?: string;
  /** 'system' follows the locale. */
  clock: 'system' | '12' | '24';
  mode: 'relative' | 'absolute';
  /** Day/month order for dates: auto follows `locale` (Canvas's ENV.LOCALE). */
  order?: 'auto' | 'md' | 'dm';
  locale?: string;
}

interface Parts { y: number; m: number; d: number; wd: number }

function parts(d: Date, timeZone?: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday ?? '');
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), wd };
}

/** Whole calendar days from `now` to `d` in the zone (0 = same day). */
export function dayDiff(d: Date, now: Date, timeZone?: string): number {
  const a = parts(d, timeZone), b = parts(now, timeZone);
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
}

const hour12 = (o: DateOpts) => (o.clock === 'system' ? undefined : o.clock === '12');

export function timeText(d: Date, o: DateOpts): string {
  return new Intl.DateTimeFormat(o.locale ?? 'en-US', { timeZone: o.timeZone, hour: 'numeric', minute: '2-digit', hour12: hour12(o) }).format(d);
}

function dateText(d: Date, now: Date, o: DateOpts): string {
  const sameYear = parts(d, o.timeZone).y === parts(now, o.timeZone).y;
  const order = o.order ?? 'auto';
  if (order === 'auto') {
    return new Intl.DateTimeFormat(o.locale ?? 'en-US', { timeZone: o.timeZone, month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' }).format(d);
  }
  const p = parts(d, o.timeZone);
  const mon = new Intl.DateTimeFormat(o.locale ?? 'en-US', { timeZone: o.timeZone, month: 'short' }).format(d);
  const md = order === 'dm' ? `${p.d} ${mon}` : `${mon} ${p.d}`;
  return sameYear ? md : `${md}, ${p.y}`;
}

function ago(ms: number): string {
  const min = Math.max(1, Math.floor(ms / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * The due text on a row.
 *   overdue:   "Overdue 2d"
 *   relative:  "Today 5:00 PM", "Tomorrow 11:59 PM", "Fri 11:59 PM" (within 7 days), else "Oct 28"
 *   absolute:  "Oct 21 11:59 PM"
 */
export function dueText(d: Date, now: Date, o: DateOpts): string {
  return dueInfo(d, now, o).text;
}

const SOON_MS = 24 * 3_600_000;
const VERY_SOON_MS = 3 * 3_600_000;

/**
 * Due text plus emphasis (card-assignments.md "Due soon"): within 24 h the
 * text is emphasised, and under 3 h it counts down ("Due in 2h 10m").
 */
export function dueInfo(d: Date, now: Date, o: DateOpts): { text: string; soon: boolean; overdue: boolean } {
  const ms = d.getTime() - now.getTime();
  if (ms < 0) return { text: `Overdue ${ago(-ms)}`, soon: false, overdue: true };
  if (ms < VERY_SOON_MS) {
    const min = Math.max(1, Math.ceil(ms / 60_000));
    const h = Math.floor(min / 60), m = min % 60;
    return { text: `Due in ${h ? `${h}h ${m}m` : `${m}m`}`, soon: true, overdue: false };
  }
  return { text: plainDue(d, now, o), soon: ms < SOON_MS, overdue: false };
}

function plainDue(d: Date, now: Date, o: DateOpts): string {
  const t = timeText(d, o);
  if (o.mode === 'absolute') return `${dateText(d, now, o)} ${t}`;
  const days = dayDiff(d, now, o.timeZone);
  if (days === 0) return `Today ${t}`;
  if (days === 1) return `Tomorrow ${t}`;
  if (days < 7) {
    const wd = new Intl.DateTimeFormat(o.locale ?? 'en-US', { timeZone: o.timeZone, weekday: 'short' }).format(d);
    return `${wd} ${t}`;
  }
  return dateText(d, now, o);
}

/** Tooltip: "Wednesday, October 21, 2026 at 11:59 PM". */
export function fullDate(d: Date, o: DateOpts): string {
  return new Intl.DateTimeFormat(o.locale ?? 'en-US', { timeZone: o.timeZone, dateStyle: 'full', timeStyle: 'short', hour12: hour12(o) }).format(d);
}

export const TYPE_LABEL: Record<string, string> = {
  assignment: 'Assignment',
  quiz: 'Quiz',
  discussion_topic: 'Discussion',
};

/** Prune expired local done marks. */
export function pruneDone(done: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, until] of Object.entries(done)) if (typeof until === 'number' && until > now) out[k] = until;
  return out;
}

/** The due phrase in accessible names: "due Sat 24 Oct 11:59 pm" (24-hour when the clock says so). */
export function a11yDue(d: Date, o: DateOpts): string {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: o.timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: o.clock !== '24' });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  const time = `${p.hour}:${p.minute}${p.dayPeriod ? ' ' + p.dayPeriod.toLowerCase().replace(/\./g, '') : ''}`;
  return `due ${p.weekday} ${p.day} ${p.month} ${time}`;
}
