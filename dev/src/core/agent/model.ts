// agentkit/CONTRACT.md §2: the describe response, built purely from b²c's
// caches. No DOM, no chrome.*, no network: run.ts gathers a Snapshot, this
// file turns it into JSON. Titles and metadata only, never bodies.

import type { Course, DashboardCard, PlannerItem } from '../canvas/data.ts';
import type { Page } from '../canvas/page.ts';
import type { TodoMarks } from '../settings/shared.ts';
import { MARKS_READ_PUBLISHED, READ_SAFE_API } from './read-safety.ts';
import { bound, isoInZone } from './time.ts';

export const CONTRACT_VERSION = 1;

import { marksReadFor, type State } from './anchors.ts';
export { STATES, type State } from './anchors.ts';

export interface DescribeRequest {
  v?: number;
  id?: string;
  from?: string;
  to?: string;
  refresh?: boolean;
}

export interface Cached<T> { t: number; data: T }
export interface PlannerEntry extends Cached<PlannerItem[]> { start: number; end: number }

/** Everything describe needs, read from caches by run.ts. */
export interface Snapshot {
  build: string;
  origin: string;
  /** The user's Canvas time zone (valid IANA). */
  tz: string;
  userId: string | null;
  now: number;
  page: Page;
  /** location.pathname + search. */
  path: string;
  /** document.title, used when nothing better names the page. */
  docTitle: string;
  courses: Cached<Course[]> | null;
  cards: Cached<DashboardCard[]> | null;
  colors: Cached<Record<string, string>> | null;
  planner: PlannerEntry[];
  marks: TodoMarks;
  /** Paths whose view would complete an open must-view module requirement (from b²c's modules caches). */
  mustView?: ReadonlySet<string>;
}

export interface OnPage { id: string; selector: string; shadowHost: string | null }

export interface CourseOut {
  id: string; name: string; nickname: string | null; code: string | null; term: string | null;
  color: string | null; url: string; favorite: boolean | null;
}

export interface DueOut {
  id: string; courseId: string | null; title: string; type: string;
  due: string | null; posted: string | null; points: number | null;
  state: State; doneInB2c: boolean; url: string | null; marksRead: boolean;
}

export interface Described {
  $b2c: 'describe'; v: number; id: string;
  build: string; at: string; origin: string; timeZone: string; userId: string | null;
  page: { kind: string; courseId: string | null; itemId: string | null; title: string; url: string; marksRead: boolean };
  courses: CourseOut[];
  due: DueOut[];
  onPage: OnPage[];
  fresh: { courses: string | null; due: string | null };
  readSafety: { marksReadPaths: string[]; readSafeApi: string[] };
}

const DAY = 86_400_000;
/** Default due window: 7 days back, 14 ahead. */
export const DEFAULT_BACK = 7 * DAY;
export const DEFAULT_AHEAD = 14 * DAY;


export const itemKey = (i: Pick<PlannerItem, 'plannable_type' | 'plannable_id'>) => `${i.plannable_type}:${i.plannable_id}`;

const ms = (s: unknown) => (typeof s === 'string' && s ? Date.parse(s) : NaN);

/** The instant the planner files the item under (due, to-do date, posted, start). */
export const plannerTime = (i: PlannerItem) => ms(i.plannable_date);

/** The item's due time, if it has one (announcements don't). */
export function dueOf(i: PlannerItem): string | null {
  const p = i.plannable ?? ({} as PlannerItem['plannable']);
  if (p.due_at) return p.due_at;
  if (p.todo_date) return p.todo_date;
  if (i.plannable_type === 'announcement') return null;
  return i.plannable_date || null;
}

/**
 * §2 States, first match wins: excused, missing, graded, late, submitted,
 * done (marked complete in Canvas's planner), overdue (past due and
 * submittable), past (past, nothing to submit), upcoming. `missing` beats
 * `graded` (a zero recorded for missing work is still missing); `late` beats
 * `submitted` (submitted late, not yet graded). Only planner `submissions`
 * and `planner_override`; "submittable" = Canvas sends a submissions object
 * (it sends `false` for announcements, events, notes, pages). The one
 * derivation: describe, card-assignments and better-todo all call this.
 */
export function stateOf(i: PlannerItem, now: number): State {
  const s = i.submissions;
  if (s && s.excused) return 'excused';
  if (s && s.missing) return 'missing';
  if (s && s.graded) return 'graded';
  if (s && s.late) return 'late';
  if (s && s.submitted) return 'submitted';
  if (i.planner_override?.marked_complete) return 'done';
  const t = ms(dueOf(i) ?? i.plannable_date);
  if (Number.isFinite(t) && t < now) return s ? 'overdue' : 'past';
  return 'upcoming';
}

/** What b²c knows about whether opening a path changes state in Canvas. */
export interface ChangeFacts {
  /** Paths with an open must-view module requirement. */
  mustView: ReadonlySet<string>;
  /** Announcement / discussion paths b²c has a read state for: true = unread. */
  unread: ReadonlyMap<string, boolean>;
}

const cleanPath = (p: string) => (p.split(/[?#]/)[0] ?? '').replace(/\/+$/, '') || '/';

/**
 * §2 marksRead: "opening this changes state in Canvas". True for an open
 * must-view requirement; for the always-hazardous paths, unless b²c knows the
 * announcement or discussion is already read.
 */
export function opensChange(path: string, f: ChangeFacts): boolean {
  const p = cleanPath(path);
  return marksReadFor(p, { mustView: f.mustView.has(p), unread: f.unread.get(p) });
}

const pathOfUrl = (url: string) => {
  try {
    return cleanPath(new URL(url).pathname);
  } catch {
    return cleanPath(url);
  }
};

/** Facts from a snapshot: its must-view set and the read state of planner announcements and discussions. */
export function changeFacts(snap: Pick<Snapshot, 'planner' | 'origin' | 'mustView'>, merged: readonly PlannerItem[] = mergePlanner(snap.planner)): ChangeFacts {
  const unread = new Map<string, boolean>();
  for (const i of merged) {
    if (i.plannable_type !== 'announcement' && i.plannable_type !== 'discussion_topic') continue;
    const u = absUrl(i.html_url, snap.origin);
    if (u) unread.set(pathOfUrl(u), !!i.new_activity);
  }
  return { mustView: snap.mustView ?? new Set(), unread };
}

/** Ticked in b²c: a live core.todoMarks mark, else Canvas's planner override (better-todo's `effective`). */
export function doneInB2c(i: PlannerItem, marks: TodoMarks, now: number): boolean {
  const m = marks[itemKey(i)];
  const live = m && (m.until === undefined || m.until > now) ? m : undefined;
  return live?.done ?? !!i.planner_override?.marked_complete;
}

/** An absolute URL on the page's origin (Canvas sometimes hands out relative or other-host links). */
export function absUrl(href: string | null | undefined, origin: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, origin);
    return origin + u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

/**
 * The item's page URL (contract: `url` is always a page, never an API address).
 * Planner notes have no page (null). Calendar events come with an API html_url
 * and map to the calendar; any other /api/ address is dropped.
 */
export function itemUrl(i: PlannerItem, origin: string, userId: string | null): string | null {
  if (i.plannable_type === 'planner_note') return null;
  if (i.plannable_type === 'calendar_event') {
    const raw = absUrl(i.html_url, origin);
    if (raw && !new URL(raw).pathname.startsWith('/api/')) return raw;
    const uid = (i as { user_id?: string | number }).user_id ?? userId;
    const ctx = i.course_id != null ? `course_${i.course_id}` : uid != null ? `user_${uid}` : null;
    return `${origin}/calendar?event_id=${encodeURIComponent(String(i.plannable_id))}${ctx ? `&include_contexts=${ctx}` : ''}`;
  }
  const u = absUrl(i.html_url, origin);
  return u && !new URL(u).pathname.startsWith('/api/') ? u : null;
}

/**
 * Merge cached planner windows (different features cache different ranges).
 * For any instant the newest entry covering it is authoritative, so an item
 * dropped by a newer fetch doesn't linger from an older one.
 */
export function mergePlanner(entries: readonly PlannerEntry[]): PlannerItem[] {
  const newest = [...entries].sort((a, b) => b.t - a.t);
  const out = new Map<string, PlannerItem>();
  newest.forEach((e, i) => {
    const newer = newest.slice(0, i);
    for (const it of e.data) {
      const k = itemKey(it);
      if (out.has(k)) continue;
      const t = plannerTime(it);
      if (Number.isFinite(t) && newer.some(n => t >= n.start && t < n.end)) continue;
      out.set(k, it);
    }
  });
  return [...out.values()];
}

/** The due window [from, to) for a request. */
export function windowOf(req: DescribeRequest, now: number, tz: string): { from: number; to: number } {
  return {
    from: bound(req.from, tz, 'from') ?? now - DEFAULT_BACK,
    to: bound(req.to, tz, 'to') ?? now + DEFAULT_AHEAD,
  };
}

/** `type:id` of the item this page shows, from the path. */
export function pageItemId(path: string): string | null {
  const p = path.split(/[?#]/)[0] ?? '';
  const m = p.match(/^\/courses\/[^/]+\/(assignments|quizzes|discussion_topics|announcements|files|modules\/items|pages)\/([^/]+)/);
  if (!m) return null;
  const [, section, id] = m;
  if (!id || id === 'syllabus' || (section === 'assignments' && !/^\d/.test(id))) return null;
  const type = { assignments: 'assignment', quizzes: 'quiz', discussion_topics: 'discussion_topic', announcements: 'announcement', files: 'file', 'modules/items': 'module_item', pages: 'wiki_page' }[section!]!;
  // Wiki pages are addressed by slug in the path; only a numeric id is a contract id.
  if (type === 'wiki_page' && !/^\d+$/.test(id)) return null;
  return `${type}:${id}`;
}

export function courseList(snap: Snapshot): CourseOut[] {
  const cards = new Map((snap.cards?.data ?? []).map(c => [String(c.id), c]));
  const colors = snap.colors?.data ?? {};
  const from = snap.courses?.data ?? [];
  const ids: string[] = from.length ? from.map(c => String(c.id)) : [...cards.keys()];
  const byId = new Map(from.map(c => [String(c.id), c]));
  // Dashboard order where Canvas has one; the rest keep the courses order.
  const pos = (id: string) => cards.get(id)?.position ?? Number.POSITIVE_INFINITY;
  const order = ids.map((id, i) => ({ id, i })).sort((a, b) => pos(a.id) - pos(b.id) || a.i - b.i).map(x => x.id);
  return order.map(id => {
    const c = byId.get(id);
    const card = cards.get(id);
    const real = c ? c.original_name ?? c.name : card?.originalName ?? card?.shortName ?? '';
    const nick = c?.original_name ? c.name : card && card.shortName && card.shortName !== card.originalName ? card.shortName : null;
    return {
      id: `course:${id}`,
      name: real,
      nickname: nick ?? null,
      code: c?.course_code ?? card?.courseCode ?? null,
      term: c?.term?.name ?? card?.term ?? null,
      color: colors[`course_${id}`] ?? card?.color ?? null,
      url: `${snap.origin}/courses/${id}`,
      favorite: card ? card.isFavorited ?? true : null,
    };
  });
}

export function dueList(snap: Snapshot, win: { from: number; to: number }, facts?: ChangeFacts, merged: readonly PlannerItem[] = mergePlanner(snap.planner)): DueOut[] {
  const tz = snap.tz;
  const f = facts ?? changeFacts(snap, merged);
  return merged
    .filter(i => {
      const t = plannerTime(i);
      return Number.isFinite(t) && t >= win.from && t < win.to;
    })
    .sort((a, b) => plannerTime(a) - plannerTime(b) || itemKey(a).localeCompare(itemKey(b)))
    .map(i => {
      const p = i.plannable ?? ({} as PlannerItem['plannable']);
      const url = itemUrl(i, snap.origin, snap.userId);
      return {
        id: itemKey(i),
        courseId: i.course_id != null ? `course:${i.course_id}` : null,
        title: p.title ?? '',
        type: i.plannable_type,
        due: isoInZone(dueOf(i), tz),
        posted: isoInZone((p.posted_at as string | undefined) ?? (p.created_at as string | undefined) ?? null, tz),
        points: typeof p.points_possible === 'number' ? p.points_possible : null,
        state: stateOf(i, snap.now),
        doneInB2c: doneInB2c(i, snap.marks, snap.now),
        url,
        marksRead: url ? opensChange(pathOfUrl(url), f) : false,
      };
    });
}

export function describeFrom(snap: Snapshot, req: DescribeRequest, id: string, onPage: OnPage[] = [], facts?: ChangeFacts): Described {
  const tz = snap.tz;
  const courses = courseList(snap);
  const win = windowOf(req, snap.now, tz);
  const merged = mergePlanner(snap.planner);
  facts ??= changeFacts(snap, merged);
  const due = dueList(snap, win, facts, merged);
  const itemId = pageItemId(snap.path);
  const known = itemId ? due.find(d => d.id === itemId) : undefined;
  const course = snap.page.courseId ? courses.find(c => c.id === `course:${snap.page.courseId}`) : undefined;
  // fresh.due: the oldest fetch behind the window (the stalest data the answer may rest on).
  const behind = snap.planner.filter(e => e.start < win.to && e.end > win.from);
  const plannerT = behind.length ? Math.min(...behind.map(e => e.t)) : null;
  return {
    $b2c: 'describe',
    v: CONTRACT_VERSION,
    id,
    build: snap.build,
    at: isoInZone(snap.now, tz)!,
    origin: snap.origin,
    timeZone: tz,
    userId: snap.userId,
    page: {
      kind: snap.page.kind,
      courseId: snap.page.courseId,
      itemId,
      title: known?.title ?? (snap.page.kind === 'course-home' && course ? course.nickname ?? course.name : snap.docTitle),
      url: snap.origin + snap.path,
      marksRead: opensChange(snap.path, facts),
    },
    courses,
    due,
    onPage,
    fresh: { courses: snap.courses ? isoInZone(snap.courses.t, tz) : snap.cards ? isoInZone(snap.cards.t, tz) : null, due: plannerT === null ? null : isoInZone(plannerT, tz) },
    readSafety: { marksReadPaths: [...MARKS_READ_PUBLISHED], readSafeApi: [...READ_SAFE_API] },
  };
}
