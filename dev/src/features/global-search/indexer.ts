// Builds and refreshes the search index from read-safe list endpoints only.
//
// READ SAFETY (research/canvas-live.md §0): Canvas marks things read, and
// ticks "must view" module steps, when an item is *viewed*. The index never
// fetches an item view or a page; it reads only the list endpoints below,
// through the shared ctx.data accessors (one request and cache per endpoint,
// shared with pins) or, for the two lists data.ts doesn't carry yet, ctx.api
// behind the READ_SAFE guard.

import type { Api } from '../../core/canvas/api.ts';
import type { Data } from '../../core/canvas/data.ts';
import { courseDoc, courseDocs, type CourseInfo, type CourseLists } from './model.ts';
import type { CourseRecord, IndexStore, Meta } from './store.ts';

import { STALE_MS } from './index.ts';

/**
 * Every API path the search index may request (pathname + query). Anything
 * else is refused before it reaches the network. Item views
 * (/assignments/:id, /pages/:url, /discussion_topics/:id, /files/:id,
 * /modules/:id/items/:id, …) can never match.
 */
export const READ_SAFE: readonly RegExp[] = [
  /^\/api\/v1\/courses(\?|$)/,
  /^\/api\/v1\/courses\/\d+\/modules(\?|$)/,
  /^\/api\/v1\/courses\/\d+\/modules\/\d+\/items(\?|$)/,
  /^\/api\/v1\/courses\/\d+\/assignment_groups(\?|$)/,
  /^\/api\/v1\/courses\/\d+\/assignments(\?|$)/,
  /^\/api\/v1\/courses\/\d+\/pages(\?|$)/,
  /^\/api\/v1\/courses\/\d+\/files(\?|$)/,
  /^\/api\/v1\/courses\/\d+\/discussion_topics(\?|$)/,
  /^\/api\/v1\/announcements(\?|$)/,
];

export const isReadSafe = (pathAndQuery: string) => READ_SAFE.some(r => r.test(pathAndQuery));

/** ctx.api.get, refusing anything outside READ_SAFE. */
function safeGet<T>(api: Api, path: string, maxPages = 10): Promise<T> {
  if (!isReadSafe('/api/v1' + path)) return Promise.reject(new Error(`global-search: refused non-list path ${path}`));
  return api.get<T>(path, { maxPages });
}

const statusOf = (e: unknown) => (e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : 0);
/** The course hides this tool (Files, Pages) or the list doesn't exist for the user. */
const hidden = (e: unknown) => [401, 403, 404].includes(statusOf(e));

const noop = () => {};

export interface Deps {
  data: Data;
  api: Api;
  store: IndexStore;
  now(): number;
}

export interface RefreshHooks {
  /** The course list arrived (fires before any course content). */
  onMeta?(meta: Meta): void;
  /** One course's docs were (re)built and stored. */
  onCourse?(rec: CourseRecord): void;
}

export interface RefreshResult {
  courses: number;
  refreshed: number;
  /** Courses whose lists failed (kept their previous docs). */
  failed: string[];
}

export function toCourseInfo(c: { id: string; name: string; course_code?: string; original_name?: string; term?: { start_at: string | null; end_at: string | null } | null }): CourseInfo {
  return {
    id: String(c.id),
    name: c.name,
    code: c.course_code ?? '',
    start: c.term?.start_at ?? null,
    end: c.term?.end_at ?? null,
    ...(c.original_name ? { original: c.original_name } : {}),
  };
}

/** At most `n` Canvas requests in flight (Canvas throttling: parallel requests carry a pre-flight cost). */
export function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>(r => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/** Run `fn` over items with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

type Limit = ReturnType<typeof limiter>;
type Topic = NonNullable<CourseLists['announcements']>[number];

/** Announcements for many courses in a few requests (10 courses each). */
async function announcements(api: Api, ids: string[], now: number, limit: Limit): Promise<Map<string, Topic[]> | null> {
  const day = 86_400_000;
  // Whole days, so the path is stable across a day.
  const iso = (t: number) => new Date(Math.floor(t / day) * day).toISOString();
  const out = new Map<string, Topic[]>(ids.map(id => [id, []]));
  try {
    for (let i = 0; i < ids.length; i += 10) {
      const codes = ids.slice(i, i + 10).map(id => `context_codes[]=course_${id}`).join('&');
      const list = await limit(() => safeGet<(Topic & { context_code?: string })[]>(api, `/announcements?${codes}&start_date=${iso(now - 180 * day)}&end_date=${iso(now + 2 * day)}&per_page=100`, 5));
      for (const a of list) {
        const id = a.context_code?.replace(/^course_/, '');
        if (id && out.has(id)) out.get(id)!.push(a);
      }
    }
    return out;
  } catch (e) {
    return hidden(e) ? out : null;
  }
}

/**
 * Refresh the index. Courses whose record is younger than STALE_MS are left
 * alone unless `force`. A list that fails for a reason other than "hidden"
 * keeps that course's previous docs, so a flaky request never empties results.
 */
export async function refresh(deps: Deps, prev: Map<string, CourseRecord>, hooks: RefreshHooks = {}, force = false): Promise<RefreshResult> {
  const { data, api, store } = deps;
  const now = deps.now();
  const raw = await data.courses(noop);
  const courses = raw.map(toCourseInfo);
  const meta: Meta = { courses, t: now };
  hooks.onMeta?.(meta);

  const ids = new Set(courses.map(c => c.id));
  await store.dropCourses([...prev.keys()].filter(id => !ids.has(id)));

  const due = courses.filter(c => force || !prev.get(c.id) || now - prev.get(c.id)!.t >= STALE_MS);
  // Research (v2-weeks-search §C): concurrency ≤ 3 across the whole crawl.
  const limit = limiter(3);
  const ann = due.length ? await announcements(api, due.map(c => c.id), now, limit) : new Map<string, Topic[]>();
  const failed: string[] = [];

  await pool(due, 2, async c => {
    const lists: CourseLists = {};
    let broken = false;
    const take = async <T>(p: () => Promise<T>, set: (v: T) => void) => {
      try {
        set(await limit(p));
      } catch (e) {
        if (!hidden(e)) broken = true;
      }
    };
    await Promise.all([
      take(() => data.modules(c.id, noop), v => (lists.modules = v as CourseLists['modules'])),
      take(() => data.assignmentGroups(c.id, noop), v => (lists.assignments = v.flatMap(g => g.assignments ?? []) as CourseLists['assignments'])),
      take(() => data.pages(c.id, noop), v => (lists.pages = v as CourseLists['pages'])),
      take(() => data.files(c.id, noop), v => (lists.files = v as CourseLists['files'])),
      take(() => safeGet<NonNullable<CourseLists['discussions']>>(api, `/courses/${c.id}/discussion_topics?per_page=100`), v => (lists.discussions = v)),
    ]);
    // Canvas omits module items when a module has too many; fetch those lists.
    for (const m of (lists.modules ?? []) as { id: string; items?: unknown[] | null; items_count?: number }[]) {
      if (!m.items && (m.items_count ?? 0) > 0) {
        await take(() => safeGet<unknown[]>(api, `/courses/${c.id}/modules/${m.id}/items?per_page=100`), v => (m.items = v));
      }
    }
    if (ann === null) broken = true;
    else lists.announcements = ann.get(c.id) ?? [];

    const old = prev.get(c.id);
    if (broken && old) {
      failed.push(c.id);
      return;
    }
    if (broken) failed.push(c.id);
    // A partial first build is stored with t = 0 so the next open retries it.
    const rec: CourseRecord = { id: c.id, t: broken ? 0 : deps.now(), docs: [courseDoc(c), ...courseDocs(c.id, lists)] };
    await store.putCourse(rec);
    hooks.onCourse?.(rec);
  });

  // Courses that needed nothing still get their course doc refreshed (renames, nicknames).
  for (const c of courses) {
    const old = prev.get(c.id);
    if (!old || due.includes(c)) continue;
    const cd = courseDoc(c);
    if (old.docs[0]?.title !== cd.title) {
      const rec = { ...old, docs: [cd, ...old.docs.filter(d => d.kind !== 'course')] };
      await store.putCourse(rec);
      hooks.onCourse?.(rec);
    }
  }
  await store.putMeta(meta);
  return { courses: courses.length, refreshed: due.length, failed };
}
