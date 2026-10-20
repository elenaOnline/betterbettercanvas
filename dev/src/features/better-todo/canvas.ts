// Canvas reads and writes that only better-todo needs: planner overrides with
// `dismissed`, planner notes, and preview text. (Shared accessors live in
// core/canvas/data.ts; see the requests in the lane report.)

import { ApiError, type Api } from '../../core/canvas/api.ts';
import type { Data, PlannerOverride } from '../../core/canvas/data.ts';
import type { Row } from './logic.ts';
import { isEmptyHtml, sanitize, textToHtml } from './sanitize.ts';

export interface OverrideState { marked_complete: boolean; dismissed: boolean }

/**
 * Write an item's planner override directly (for `dismissed`, which the shared
 * setComplete doesn't set). PUT when there's an override, else POST. Canvas
 * answers 400 when one already exists (made elsewhere since our data loaded):
 * then find it and PUT. Both fields always go, because PUT resets an omitted
 * `dismissed` (canvas-surface.md §3.2). Patches the shared planner afterwards.
 */
export async function writeOverride(data: Data, api: Api, row: Row, st: OverrideState): Promise<PlannerOverride> {
  const put = (id: string | number) => api.put<PlannerOverride>(`/planner/overrides/${id}`, st);
  let saved: PlannerOverride;
  if (row.override) saved = await put(row.override.id);
  else {
    try {
      saved = await api.post<PlannerOverride>('/planner/overrides', { plannable_type: row.type, plannable_id: row.id, ...st });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 400) throw e;
      const all = await api.get<PlannerOverride[]>('/planner/overrides');
      const o = all.find(x => x.plannable_type === row.type && String(x.plannable_id) === row.id);
      if (!o) throw e;
      saved = await put(o.id);
    }
  }
  await data.patchPlanner({ key: row.key, planner_override: saved });
  return saved;
}

/** Mark done / not done through the shared `data.setComplete` (one code path
 *  with card-assignments; it patches the shared planner). */
export async function setDone(data: Data, api: Api, row: Row, done: boolean): Promise<PlannerOverride> {
  if (!row.item) return writeOverride(data, api, row, { marked_complete: done, dismissed: row.removed });
  try {
    return (await data.setComplete(row.item, done)) as PlannerOverride;
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) return writeOverride(data, api, row, { marked_complete: done, dismissed: row.removed });
    throw e;
  }
}

export interface PlannerNote { id: string | number; title: string; todo_date: string; course_id: string | number | null; details?: string | null }

export const createNote = (api: Api, n: { title: string; todoDate: string; courseId: string | null }) =>
  api.post<PlannerNote>('/planner_notes', { title: n.title, todo_date: n.todoDate, ...(n.courseId ? { course_id: n.courseId } : {}) });

export const deleteNote = (api: Api, id: string) => api.del<PlannerNote>(`/planner_notes/${id}`);

// ── previews ────────────────────────────────────────────────────────────────
//
// READ-SAFETY (Dev lead's hazard 3; checked in canvas-lms source,
// dev/mock-canvas/.vendor/canvas-lms). Canvas marks things read, completes
// "must view" module requirements, and logs page views on view. A hover must
// do none of that, so previews use only list endpoints:
//
// - Assignments (and quizzes / graded discussions via their assignment):
//   GET /courses/:c/assignments?assignment_ids[]=… (AssignmentsApiController
//   #index → get_assignments). It only calls log_api_asset_access, which
//   returns early for in-app (session cookie) requests. NOT the show endpoint
//   /assignments/:id: #show calls `@assignment.context_module_action(user,
//   :read)`, which completes a module's "view" requirement.
// - Announcements: GET /announcements?context_codes[]=… (AnnouncementsApi
//   Controller#index). Serializes `read_state` with DiscussionTopic#read_state,
//   a plain read (`.pick(:workflow_state)`); nothing is written.
// - Ungraded discussions: GET /courses/:c/discussion_topics?search_term=…
//   (DiscussionTopicsController#index, API branch: log_api_asset_access only).
//   NOT /discussion_topics/:id: #show calls log_asset_access unconditionally.
// - Pages: no fetch. WikiPagesApiController#show logs an asset access, and the
//   index has no body. The planner's own summary shows instead.

const PREVIEW_TTL = 30 * 60_000;

export interface PreviewData {
  html: string;
  /** From the assignment, when there is one. */
  score?: { score?: number | null; points?: number | null; grade?: string | null } | null;
}

const byId = (id: string) => (list: unknown) =>
  Array.isArray(list) ? ((list as Record<string, unknown>[]).find(a => String(a.id) === id) ?? null) : null;

/** The read-safe API path for an item's description, and how to pick it out. */
export function previewSource(row: Row): { path: string; pick: (d: unknown) => { raw: string | null; score?: PreviewData['score'] } } | null {
  const it = row.item;
  const c = row.courseId;
  const p = (it?.plannable ?? {}) as Record<string, unknown>;
  if (row.type === 'planner_note' || row.type === 'wiki_page' || row.type === 'calendar_event') return null;
  if (!c || !it) return null;
  const assignmentId = row.type === 'assignment' || row.type === 'sub_assignment' ? String(p.assignment_id ?? row.id) : p.assignment_id != null ? String(p.assignment_id) : null;
  if (assignmentId) {
    return {
      path: `/courses/${c}/assignments?assignment_ids[]=${encodeURIComponent(assignmentId)}&include[]=submission&per_page=50`,
      pick: list => {
        const a = byId(assignmentId)(list);
        if (!a) return { raw: null };
        const sub = a.submission as Record<string, unknown> | undefined;
        return {
          raw: typeof a.description === 'string' ? a.description : null,
          score: { score: (sub?.score as number | null | undefined) ?? null, grade: (sub?.grade as string | null | undefined) ?? null, points: (a.points_possible as number | null | undefined) ?? null },
        };
      },
    };
  }
  if (row.type === 'discussion_topic') {
    return {
      path: `/courses/${c}/discussion_topics?search_term=${encodeURIComponent(row.title.slice(0, 100))}&per_page=50`,
      pick: list => {
        const t = byId(row.id)(list);
        return { raw: typeof t?.message === 'string' ? t.message : null };
      },
    };
  }
  if (row.type === 'announcement') {
    const d = row.date ?? new Date();
    const iso = (t: number) => new Date(t).toISOString();
    return {
      path:
        `/announcements?context_codes[]=course_${c}` +
        `&start_date=${encodeURIComponent(iso(d.getTime() - 86_400_000))}&end_date=${encodeURIComponent(iso(d.getTime() + 86_400_000))}&per_page=50`,
      pick: list => {
        const a = byId(row.id)(list);
        return { raw: typeof a?.message === 'string' ? a.message : null };
      },
    };
  }
  return null;
}

/** Preview HTML from the item alone, without the network (notes). */
export function inlinePreview(row: Row): string | null {
  if (row.type !== 'planner_note') return null;
  const d = (row.item?.plannable as Record<string, unknown> | undefined)?.details as string | undefined;
  return d && d.trim() ? textToHtml(d.trim()) : '';
}

/**
 * Fetch a preview, cached per item (stale-while-revalidate, so a second hover,
 * even on a later page load, is instant). Calls back with sanitized HTML ('' =
 * no description).
 */
export function fetchPreview(api: Api, row: Row, origin: string, onData: (d: PreviewData) => void): Promise<void> {
  const inline = inlinePreview(row);
  const src = inline === null ? previewSource(row) : null;
  if (!src) {
    onData({ html: inline ?? '' });
    return Promise.resolve();
  }
  return api
    .swr<unknown>(
      src.path,
      d => {
        const { raw, score } = src.pick(d);
        const html = raw ? sanitize(raw, origin) : '';
        onData({ html: isEmptyHtml(html) ? '' : html, score });
      },
      { ttlMs: PREVIEW_TTL },
    )
    .then(() => undefined);
}
