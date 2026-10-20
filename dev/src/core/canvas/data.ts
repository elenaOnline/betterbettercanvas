// Shared Canvas data accessors. Features use these rather than raw paths so
// several features on one page share one request and one cache entry.
// Shapes follow Instructure's REST docs (only fields b²c uses are typed).
// Caveats from research/canvas-surface.md: planner/items defaults to ±2 weeks
// without dates; colours are keyed `course_<id>`; dashboard_cards is
// undocumented and capped at 50; grade fields live on enrollments[].

import type { Api } from './api.ts';

export interface Enrollment {
  type: string; // 'student' | 'StudentEnrollment' | …
  enrollment_state?: string;
  computed_current_score?: number | null;
  computed_current_grade?: string | null;
  computed_final_score?: number | null;
  current_period_computed_current_score?: number | null;
  current_period_computed_current_grade?: string | null;
  current_grading_period_id?: string | number | null;
  current_grading_period_title?: string | null;
  has_grading_periods?: boolean;
  multiple_grading_periods_enabled?: boolean;
}

export interface Course {
  id: string;
  name: string;
  course_code: string;
  original_name?: string; // present when the user set a nickname
  enrollment_term_id?: string;
  term?: { id: string; name: string; start_at: string | null; end_at: string | null };
  enrollments?: Enrollment[];
  hide_final_grades?: boolean;
  concluded?: boolean;
  image_download_url?: string | null;
  apply_assignment_group_weights?: boolean;
  /** Course time zone (IANA), e.g. 'America/Los_Angeles'. */
  time_zone?: string;
  start_at?: string | null;
  end_at?: string | null;
  restrict_enrollments_to_course_dates?: boolean;
  workflow_state?: string;
}

export interface Submission {
  score?: number | null;
  excused?: boolean;
  workflow_state?: string;
  late_policy_status?: string | null;
}

export interface GroupAssignment {
  id: string;
  name: string;
  points_possible?: number | null;
  omit_from_final_grade?: boolean;
  published?: boolean;
  due_at?: string | null;
  submission?: Submission | null;
}

export interface AssignmentGroup {
  id: string;
  name: string;
  group_weight?: number | null;
  rules?: { drop_lowest?: number; drop_highest?: number; never_drop?: string[] };
  assignments?: GroupAssignment[];
}

export interface ModuleItem {
  id: string;
  completion_requirement?: { type: string; completed?: boolean; min_score?: number };
  title: string;
  type: 'Page' | 'File' | 'Assignment' | 'Quiz' | 'Discussion' | 'ExternalUrl' | 'ExternalTool' | 'SubHeader' | string;
  html_url?: string;
  page_url?: string;
  content_id?: string;
  content_details?: { due_at?: string | null; unlock_at?: string | null; lock_at?: string | null; points_possible?: number | null };
}

export interface Module {
  id: string;
  name: string;
  position: number;
  published?: boolean;
  unlock_at?: string | null;
  items?: ModuleItem[];
}

export interface WikiPage {
  page_id?: string;
  url: string;
  title: string;
  html_url: string;
  updated_at?: string;
  front_page?: boolean;
}

export interface CanvasFile {
  id: string;
  display_name: string;
  filename?: string;
  url?: string;
  created_at?: string;
  updated_at?: string;
  'content-type'?: string;
}

export interface PlannerOverride {
  id: string;
  plannable_type: string;
  plannable_id: string;
  marked_complete: boolean;
  dismissed: boolean;
}

export interface PlannerItem {
  context_type?: 'Course' | 'Group' | 'User';
  course_id?: string;
  plannable_id: string;
  plannable_type: 'assignment' | 'quiz' | 'discussion_topic' | 'wiki_page' | 'planner_note' | 'calendar_event' | 'announcement' | 'assessment_request' | 'sub_assignment';
  plannable_date: string;
  plannable: { id: string; title: string; due_at?: string | null; todo_date?: string | null; points_possible?: number | null; [k: string]: unknown };
  planner_override: PlannerOverride | null;
  submissions:
    | false
    | { submitted: boolean; excused: boolean; graded: boolean; late: boolean; missing: boolean; needs_grading: boolean; has_feedback: boolean; redo_request?: boolean };
  new_activity: boolean;
  html_url: string;
  context_name?: string;
  context_image?: string | null;
}

export interface DashboardCard {
  id: string;
  shortName: string;
  originalName: string;
  courseCode: string;
  assetString: string; // 'course_123'
  href: string;
  term: string | null;
  image: string | null;
  color?: string;
  position: number | null;
  isFavorited?: boolean;
  enrollmentState?: string;
}

const iso = (d: Date) => d.toISOString();
const day = 24 * 60 * 60 * 1000;

/**
 * A change to one planner item, broadcast in-page so every feature showing it
 * (card rows, to-do panel) updates at once. Key is "<plannable_type>:<plannable_id>".
 */
export type PlannerPatch =
  | { key: string; planner_override: PlannerOverride | null }
  | { key: string; remove: true }
  | { key: string; add: PlannerItem };

export const plannerKey = (i: Pick<PlannerItem, 'plannable_type' | 'plannable_id'>) => `${i.plannable_type}:${i.plannable_id}`;

/** Apply a patch to a planner array (pure; returns a new array). */
export function applyPlannerPatch(items: PlannerItem[], p: PlannerPatch): PlannerItem[] {
  if ('add' in p) return [...items.filter(i => plannerKey(i) !== p.key), p.add];
  if ('remove' in p) return items.filter(i => plannerKey(i) !== p.key);
  return items.map(i => (plannerKey(i) === p.key ? { ...i, planner_override: p.planner_override } : i));
}

const PLANNER_CACHE = /^b2c:cache:[^:]*:\/planner\/items\?/;

export function createData(api: Api) {
  const bus = new EventTarget();

  /** Broadcast in this page and rewrite cached planner responses so the next load paints the patched state. */
  async function patchPlanner(p: PlannerPatch) {
    bus.dispatchEvent(new CustomEvent('patch', { detail: p }));
    try {
      const all = await chrome.storage.local.get(null);
      const writes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(all)) {
        if (!PLANNER_CACHE.test(k)) continue;
        const entry = v as { t: number; data: PlannerItem[] };
        if (Array.isArray(entry?.data)) writes[k] = { ...entry, data: applyPlannerPatch(entry.data, p) };
      }
      if (Object.keys(writes).length) await chrome.storage.local.set(writes);
    } catch {
      /* cache is an optimisation */
    }
  }

  return {
    patchPlanner,

    /** Subscribe to in-page planner patches. Returns an unsubscribe function. */
    onPlannerPatch(cb: (p: PlannerPatch) => void): () => void {
      const h = (e: Event) => cb((e as CustomEvent<PlannerPatch>).detail);
      bus.addEventListener('patch', h);
      return () => bus.removeEventListener('patch', h);
    },

    /** Active courses with current scores. */
    courses(onData: (c: Course[], fresh: boolean) => void) {
      return api.swr<Course[]>(
        '/courses?enrollment_state=active&include[]=total_scores&include[]=current_grading_period_scores&include[]=term&include[]=concluded&per_page=100',
        onData,
        { ttlMs: 5 * 60_000 },
      );
    },

    // ── Course content lists (read-safe list endpoints; never item views,
    // which mark things read or complete "must view" module steps). One path
    // per endpoint so search, pins and others share one request and cache. ──

    /** Modules with items (and due/unlock details). */
    modules(courseId: string, onData: (m: Module[], fresh: boolean) => void) {
      return api.swr<Module[]>(`/courses/${courseId}/modules?include[]=items&include[]=content_details&per_page=100`, onData, { ttlMs: 10 * 60_000 });
    },

    /** One module's items: Canvas omits inline items for big modules. */
    moduleItems(courseId: string, moduleId: string, onData: (i: ModuleItem[], fresh: boolean) => void) {
      return api.swr<ModuleItem[]>(`/courses/${courseId}/modules/${moduleId}/items?include[]=content_details&per_page=100`, onData, { ttlMs: 10 * 60_000 });
    },

    /** Wiki pages, most recently updated first. */
    pages(courseId: string, onData: (p: WikiPage[], fresh: boolean) => void) {
      return api.swr<WikiPage[]>(`/courses/${courseId}/pages?per_page=100&sort=updated_at&order=desc`, onData, { ttlMs: 10 * 60_000 });
    },

    /** Files, newest first. Rejects with ApiError 401/403 when the Files tab is hidden. */
    files(courseId: string, onData: (f: CanvasFile[], fresh: boolean) => void) {
      return api.swr<CanvasFile[]>(`/courses/${courseId}/files?per_page=100&sort=created_at&order=desc`, onData, { ttlMs: 10 * 60_000 });
    },

    /** A course's assignment groups with assignments and the user's submissions. */
    assignmentGroups(courseId: string, onData: (g: AssignmentGroup[], fresh: boolean) => void, opts: { gradingPeriodId?: string } = {}) {
      // With a grading period, Canvas itself decides which assignments belong
      // to it (overrides included).
      return api.swr<AssignmentGroup[]>(
        `/courses/${courseId}/assignment_groups?include[]=assignments&include[]=submission&per_page=100` +
          (opts.gradingPeriodId ? `&grading_period_id=${encodeURIComponent(opts.gradingPeriodId)}` : ''),
        onData,
        { ttlMs: 2 * 60_000 },
      );
    },

    /** Planner items in [start, end). Defaults: 14 days back (Design: overdue window) to 28 days ahead. */
    plannerItems(onData: (items: PlannerItem[], fresh: boolean) => void, range: { start?: Date; end?: Date; now?: Date } = {}) {
      const now = range.now ?? new Date();
      // Round to the hour so the cache key is stable across loads.
      const hour = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);
      const start = hour(range.start ?? new Date(now.getTime() - 14 * day));
      const end = hour(range.end ?? new Date(now.getTime() + 28 * day));
      return api.swr<PlannerItem[]>(
        `/planner/items?start_date=${encodeURIComponent(iso(start))}&end_date=${encodeURIComponent(iso(end))}&order=asc&per_page=100`,
        onData,
        { ttlMs: 60_000 },
      );
    },

    /** Canvas's per-user course colours: { 'course_123': '#hex' }. */
    colors(onData: (c: Record<string, string>, fresh: boolean) => void) {
      return api.swr<{ custom_colors: Record<string, string> }>('/users/self/colors', (d, fresh) => onData(d.custom_colors ?? {}, fresh), { ttlMs: 10 * 60_000, all: false });
    },

    /** Course colours as other tabs (or this one) refresh them. Returns unsubscribe. */
    watchColors(onData: (c: Record<string, string>) => void) {
      return api.watch<{ custom_colors: Record<string, string> }>('/users/self/colors', d => onData(d.custom_colors ?? {}));
    },

    /** Write a Canvas course colour, then update the cache so watchers in every tab repaint at once. */
    async setColor(courseId: string, hex: string) {
      const r = await api.put(`/users/self/colors/course_${courseId}`, { hexcode: hex.replace(/^#/, '') });
      const color = hex.startsWith('#') ? hex : `#${hex}`;
      await api.patchCache<{ custom_colors: Record<string, string> }>('/users/self/colors', d => ({
        ...d,
        custom_colors: { ...(d.custom_colors ?? {}), [`course_${courseId}`]: color },
      }));
      return r;
    },

    dashboardCards(onData: (c: DashboardCard[], fresh: boolean) => void) {
      return api.swr<DashboardCard[]>('/dashboard/dashboard_cards', onData, { ttlMs: 5 * 60_000, all: false });
    },

    /**
     * Canvas's own course nickname: shows everywhere in Canvas and the mobile
     * app. Empty string clears it. Schools can disable nicknames; callers
     * should treat a 401/403 as "not available here".
     */
    setNickname(courseId: string, nickname: string) {
      return nickname.trim()
        ? api.put<{ course_id: string; name: string; nickname: string }>(`/users/self/course_nicknames/${courseId}`, { nickname: nickname.trim() })
        : api.del(`/users/self/course_nicknames/${courseId}`);
    },

    /** Dashboard card order, as Canvas stores it ({ 'course_123': 0, … }). */
    setDashboardPositions(positions: Record<string, number>) {
      return api.put('/users/self/dashboard_positions', { dashboard_positions: positions });
    },

    /** Mark a planner item complete/incomplete in Canvas itself. */
    async setComplete(item: PlannerItem, complete: boolean) {
      const o = item.planner_override;
      // PUT resets `dismissed` if omitted (canvas-surface.md), so always send it.
      const saved = o
        ? await api.put<PlannerOverride>(`/planner/overrides/${o.id}`, { marked_complete: complete, dismissed: o.dismissed })
        : await api.post<PlannerOverride>('/planner/overrides', {
            plannable_type: item.plannable_type,
            plannable_id: item.plannable_id,
            marked_complete: complete,
            dismissed: false, // explicit (parity audit #10); PUT resets it if omitted
          });
      await patchPlanner({ key: plannerKey(item), planner_override: saved });
      return saved;
    },
  };
}

export type Data = ReturnType<typeof createData>;

/** Student enrollment's current score for a course, honouring grading periods. */
export function currentScore(c: Course): number | null {
  const e = c.enrollments?.find(x => /student/i.test(x.type));
  if (!e || c.hide_final_grades) return null;
  // Real Canvas may set either flag (the mock sets has_grading_periods only).
  const periods = e.multiple_grading_periods_enabled || e.has_grading_periods;
  const s = periods ? e.current_period_computed_current_score ?? e.computed_current_score : e.computed_current_score;
  return typeof s === 'number' ? s : null;
}
