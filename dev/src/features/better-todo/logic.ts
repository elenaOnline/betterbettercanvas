// Pure to-do logic: which planner items go in To do, Done and Announcements,
// in what order, grouped how, and with what state. No DOM, no chrome.*.
//
// Behaviour: research/features.md §5 D11 (bc 5.12.6) and Design's
// design/spec/surfaces/better-todo.md, noted inline where they differ.

import type { PlannerItem, PlannerOverride } from '../../core/canvas/data.ts';
import type { TodoMarks } from '../../core/settings/shared.ts';
import { stateOf } from '../../core/agent/model.ts';
import type { State } from '../../core/agent/anchors.ts';

/** Canvas states (core/agent stateOf, the agent contract's order) that mean the work is finished. */
const FINISHED: ReadonlySet<string> = new Set(['excused', 'graded', 'submitted', 'done']);
/** States that put a not-finished row under Overdue, each with its own words. */
const PAST_DUE: ReadonlySet<string> = new Set(['missing', 'late', 'overdue', 'past']);

/** Planner types that are to-dos. bc kept only assignment / quiz /
 *  discussion; b²c adds the ones Canvas's own To Do shows (planner notes are
 *  where add-your-own items live). Calendar events are not to-dos. */
export const TODO_TYPES: ReadonlySet<string> = new Set(['assignment', 'quiz', 'discussion_topic', 'sub_assignment', 'wiki_page', 'planner_note']);

/** Design: the due time is bold within 24 h, and reads "in 2h 10m" under 3 h. */
export const DUE_SOON_MS = 24 * 3_600_000;
export const URGENT_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;
/** Sync on: a mark bridges until every tab and cache has the planner write
 *  (same as card-assignments). Sync off: kept 14 days past the item's date. */
export const BRIDGE_MS = 10 * 60_000;
export const LOCAL_KEEP_MS = 14 * DAY_MS;

export type Mark = TodoMarks[string];
export type Marks = TodoMarks;

export const keyOf = (it: { plannable_type: string; plannable_id: string | number }) => `${it.plannable_type}:${it.plannable_id}`;

/** How long a new mark lives (core.todoMarks `until`). */
export function markUntil(sync: boolean, date: Date | null, now: Date): number {
  return sync ? now.getTime() + BRIDGE_MS : Math.max(date?.getTime() ?? 0, now.getTime()) + LOCAL_KEEP_MS;
}

/** An add-your-own item kept in b²c (planner sync off). With sync on they're
 *  Canvas planner notes instead. */
export interface CustomItem {
  id: string;
  title: string;
  courseId: string | null;
  due: string; // ISO
  at: number;
}

export interface Label { text: string; at: number }
export type Labels = Record<string, Label>;

export interface Row {
  key: string;
  type: string;
  id: string;
  title: string;
  url: string | null;
  courseId: string | null;
  date: Date | null;
  submitted: boolean;
  /** Marked done (Canvas override or b²c mark), or submitted / excused. */
  complete: boolean;
  markedDone: boolean;
  /**
   * The item's state from core/agent's stateOf (the same function describe()
   * uses, so the panel and an agent can't disagree), with b²c's own tick on
   * top: a b²c-ticked overdue / past / upcoming item reads `done`.
   */
  state: State;
  /** When it was marked done (b²c mark or Canvas override time), if known. */
  doneAt: number | null;
  removed: boolean;
  overdue: boolean;
  dueSoon: boolean;
  urgent: boolean;
  unread: boolean;
  points: number | null;
  /** 'canvas' = a planner item; 'local' = a b²c-only custom item. */
  source: 'canvas' | 'local';
  item: PlannerItem | null;
  override: PlannerOverride | null;
}

export interface ViewOpts {
  showOverdue: boolean;
  hideCompleted: boolean;
}

export interface Lists {
  todo: Row[];
  done: Row[];
  announcements: Row[];
  /** Every to-do row (any state, removed too): what the views count from. */
  all: Row[];
}

const time = (s: string | null | undefined) => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
};

const live = (m: Mark | undefined, now: Date) => (m && (m.until === undefined || m.until > now.getTime()) ? m : undefined);

/** Canvas state for one item, with a live b²c mark on top. */
export function effective(item: PlannerItem, marks: Marks, now: Date): { done: boolean; removed: boolean } {
  const o = item.planner_override;
  const m = live(marks[keyOf(item)], now);
  return { done: m?.done ?? !!o?.marked_complete, removed: m?.removed ?? !!o?.dismissed };
}

function timing(date: Date | null, complete: boolean, todo: boolean, now: Date) {
  const t = date?.getTime() ?? Infinity;
  const n = now.getTime();
  const ahead = todo && !complete && t >= n;
  return {
    overdue: todo && !complete && t < n,
    dueSoon: ahead && t - n <= DUE_SOON_MS,
    urgent: ahead && t - n <= URGENT_MS,
  };
}

function fromItem(item: PlannerItem, marks: Marks, now: Date): Row {
  const st = effective(item, marks, now);
  const m = live(marks[keyOf(item)], now);
  const oAt = Date.parse(String((item.planner_override as { updated_at?: string } | null)?.updated_at ?? ''));
  const doneAt = !st.done ? null : m?.done ? m.at : Number.isFinite(oAt) ? oAt : null;
  const date = time(item.plannable_date);
  const subs = item.submissions;
  const canvas = stateOf(item, now.getTime());
  const state: State = st.done && (canvas === 'overdue' || canvas === 'past' || canvas === 'upcoming') ? 'done' : !st.done && canvas === 'done' ? (date && date.getTime() < now.getTime() ? 'overdue' : 'upcoming') : canvas;
  // Canvas-owned completion (can't be unticked in b²c): excused, graded, submitted, or submitted late.
  const submitted = state === 'excused' || state === 'graded' || state === 'submitted' || (state === 'late' && !!subs && subs.submitted);
  const complete = st.done || submitted || FINISHED.has(state);
  const isTodo = TODO_TYPES.has(item.plannable_type);
  const t = timing(date, complete, isTodo, now);
  return {
    key: keyOf(item),
    type: item.plannable_type,
    id: String(item.plannable_id),
    title: item.plannable?.title ?? '',
    url: item.plannable_type === 'planner_note' ? null : item.html_url || null,
    courseId: item.course_id != null ? String(item.course_id) : null,
    date,
    submitted,
    complete,
    markedDone: st.done,
    state,
    doneAt,
    removed: st.removed,
    ...t,
    // Overdue (the group and the danger due text) follows the state: missing, late, overdue or past, and not finished.
    overdue: isTodo && !complete && PAST_DUE.has(state),
    unread: !!item.new_activity,
    points: typeof item.plannable?.points_possible === 'number' ? item.plannable.points_possible : null,
    source: 'canvas',
    item,
    override: item.planner_override,
  };
}

function fromCustom(c: CustomItem, marks: Marks, now: Date): Row {
  const key = `local:${c.id}`;
  const m = live(marks[key], now);
  const date = time(c.due);
  const done = !!m?.done;
  return {
    key,
    type: 'planner_note',
    id: c.id,
    title: c.title,
    url: null,
    courseId: c.courseId,
    date,
    submitted: false,
    complete: done,
    markedDone: done,
    state: done ? 'done' : date && date.getTime() < now.getTime() ? 'past' : 'upcoming',
    doneAt: done ? (m?.at ?? null) : null,
    removed: !!m?.removed,
    ...timing(date, done, true, now),
    unread: false,
    points: null,
    source: 'local',
    item: null,
    override: null,
  };
}

const asc = (a: Row, b: Row) =>
  (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity) || a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
const desc = (a: Row, b: Row) => -asc(a, b);

/**
 * Split planner items (plus b²c-local items) into the lists.
 *
 * To do (bc D11, exactly): hidden if removed; hidden if complete and
 * hideCompleted; hidden if past due unless showOverdue, and then shown only
 * while not complete. b²c: "complete" is submitted or marked done (bc hid
 * Canvas-marked-complete items always and struck through only its own).
 *
 * `keep`: rows that stay where they are whatever their state. Polish item B:
 * a row ticked this session stays in place, crossed off, until the next load
 * (removed rows are let go unless they're still settling out).
 *
 * Done (Design): complete or removed, newest first.
 * Announcements: newest first, not removed.
 * All: every to-do row, for the views' counts.
 */
export function classify(
  items: readonly PlannerItem[],
  custom: readonly CustomItem[],
  marks: Marks,
  opts: ViewOpts,
  now: Date,
  keep: { session?: ReadonlySet<string>; settling?: ReadonlySet<string> } | ReadonlySet<string> = {},
): Lists {
  const k = keep instanceof Set ? { settling: keep as ReadonlySet<string> } : (keep as { session?: ReadonlySet<string>; settling?: ReadonlySet<string> });
  const session = k.session ?? new Set<string>();
  const settling = k.settling ?? new Set<string>();
  const todo: Row[] = [], done: Row[] = [], announcements: Row[] = [], all: Row[] = [];
  const seen = new Set<string>();
  const n = now.getTime();

  const place = (r: Row) => {
    all.push(r);
    const past = (r.date?.getTime() ?? Infinity) < n;
    if (r.removed || r.complete) done.push(r);
    if (settling.has(r.key) || (session.has(r.key) && !r.removed)) return void todo.push(r);
    if (r.removed) return;
    if (r.complete && opts.hideCompleted) return;
    if (past && (!opts.showOverdue || r.complete)) return;
    todo.push(r);
  };

  for (const it of items) {
    const isTodo = TODO_TYPES.has(it.plannable_type);
    if (!isTodo && it.plannable_type !== 'announcement') continue;
    const r = fromItem(it, marks, now);
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    if (isTodo) place(r);
    else if (!r.removed || settling.has(r.key)) announcements.push(r);
  }
  for (const c of custom) place(fromCustom(c, marks, now));

  todo.sort(asc);
  done.sort(desc);
  announcements.sort(desc);
  all.sort(asc);
  return { todo, done, announcements, all };
}

/**
 * "Done today" (polish item B): complete, not removed, and done today, from
 * the mark's or the override's time. Where Canvas gives no time (a submission,
 * an override without updated_at), an item due today counts.
 */
export function isDoneToday(r: Row, now: Date, day: (d: Date) => number): boolean {
  if (!r.complete || r.removed) return false;
  const today = day(now);
  if (r.doneAt != null) return day(new Date(r.doneAt)) === today;
  return !!r.date && day(r.date) === today;
}

/** Drop lapsed marks. */
export function pruneMarks(marks: Marks, now: Date): Marks {
  const out: Marks = {};
  for (const [k, m] of Object.entries(marks)) if (live(m, now)) out[k] = m;
  return out;
}

/** Drop b²c-local items 14 days past their date. */
export function pruneCustom(custom: readonly CustomItem[], now: Date): CustomItem[] {
  return custom.filter(c => {
    const d = Date.parse(c.due);
    return !(Number.isFinite(d) && now.getTime() - d > LOCAL_KEEP_MS);
  });
}

/** Labels not touched in 120 days go. */
export function pruneLabels(labels: Labels, now: Date): Labels {
  const out: Labels = {};
  for (const [k, l] of Object.entries(labels)) if (l.text && now.getTime() - l.at <= 120 * DAY_MS) out[k] = l;
  return out;
}

export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type GroupId = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';
export interface Group { id: GroupId; label: string; rows: Row[] }
const GROUP_LABEL: Record<GroupId, string> = { overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow', week: 'This week', later: 'Later' };

/**
 * Group sorted To do rows by day (Design): Overdue, Today, Tomorrow, This week
 * (the next 7 days), Later. Empty groups are left out. `day` maps a date to a
 * day number in the Canvas time zone.
 */
export function groupByDay(rows: readonly Row[], now: Date, day: (d: Date) => number): Group[] {
  const today = day(now);
  const groups = new Map<GroupId, Row[]>();
  for (const r of rows) {
    let g: GroupId;
    if (!r.date) g = 'later';
    // Past-dated rows stay under Overdue even once ticked (polish B: a ticked
    // row stays where it is), so a tick never moves a row between groups.
    else if (r.overdue || r.date.getTime() < now.getTime()) g = 'overdue';
    else {
      const d = day(r.date) - today;
      g = d <= 0 ? 'today' : d === 1 ? 'tomorrow' : d < 7 ? 'week' : 'later';
    }
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(r);
  }
  return (['overdue', 'today', 'tomorrow', 'week', 'later'] as GroupId[]).filter(g => groups.has(g)).map(id => ({ id, label: GROUP_LABEL[id], rows: groups.get(id)! }));
}

/** Canvas's own words for the item's state (hover preview), from the shared state. */
export function submissionWords(r: Row, score?: { score?: number | null; points?: number | null } | null): string | null {
  switch (r.state) {
    case 'excused':
      return 'Excused';
    case 'missing':
      return 'Missing';
    case 'graded':
      return typeof score?.score === 'number' ? `Graded ${+score.score.toFixed(2)}${typeof score.points === 'number' ? `/${score.points}` : ''}` : 'Graded';
    case 'late':
      return r.submitted ? 'Submitted late' : 'Late';
    case 'submitted':
      return 'Submitted';
    default:
      return null;
  }
}

/** A planner item for a planner note we just created, so it shows (and is
 *  patched into the shared cache) before the planner returns it. */
export function noteItem(n: { id: string | number; title: string; todo_date: string; course_id?: string | number | null; details?: string | null }, contextName?: string): PlannerItem {
  const course = n.course_id != null && n.course_id !== '' ? String(n.course_id) : undefined;
  return {
    plannable_type: 'planner_note',
    plannable_id: String(n.id),
    plannable_date: n.todo_date,
    plannable: { id: String(n.id), title: n.title, todo_date: n.todo_date, details: n.details ?? null },
    planner_override: null,
    submissions: false,
    new_activity: false,
    html_url: `/api/v1/planner_notes/${n.id}`,
    ...(course ? { context_type: 'Course' as const, course_id: course, context_name: contextName } : { context_type: 'User' as const }),
  };
}

/** A course's short code for row chips: "MATH 301" from "MATH-301-002 Fall 2026",
 *  "ENV 410" from "ENV-410/510-001". Falls back to the first word. */
export function shortCode(code: string): string {
  const m = code.match(/^\s*([A-Za-z&]{2,6})[\s\-_.]*(\d{2,4}[A-Za-z]?)/);
  if (m) return `${m[1]!.toUpperCase()} ${m[2]}`;
  return code.trim().split(/\s+/)[0]?.slice(0, 12) ?? '';
}
