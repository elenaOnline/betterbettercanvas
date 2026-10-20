// Agent contract runtime (chunks/agent.js), loaded on the first describe call.
// agentkit/CONTRACT.md §2 (describe) and §3 (anchors on Canvas's elements).
//
// READ SAFETY: refresh: false reads only chrome.storage.local (b²c's SWR
// caches), no network at all. refresh: true may revalidate the two read-safe
// lists b²c already fetches (courses, planner/items), at most once per 60 s.
// Nothing here ever writes, views an item, or fetches a body.

import type { Ctx } from '../ctx.ts';
import type { Course, DashboardCard, Module, ModuleItem, PlannerItem } from '../canvas/data.ts';
import type { Flat } from '../settings/store.ts';
import type { TodoMarks } from '../settings/shared.ts';
import { anchorCanvas, collectOnPage } from './canvas-anchors.ts';
import { changeFacts, describeFrom, windowOf, type Cached, type DescribeRequest, type Described, type PlannerEntry, type Snapshot } from './model.ts';
import { validZone } from './time.ts';

export const DESCRIBED = 'b2c:described';
export const DESCRIBE_SCRIPT_ID = 'b2c-describe';
export const REFRESH_EVERY_MS = 60_000;
const CACHE_PREFIX = 'b2c:cache:';
const DAY = 86_400_000;

export interface Agent {
  /** Answer one `b2c:describe` (detail = the request as a JSON string). */
  handle(detail: string, settings: Flat): Promise<void>;
  /** Remove anchors and the describe script (contract turned off, or teardown). */
  stop(): void;
}

let seq = 0;

async function storageKeys(): Promise<string[]> {
  const local = chrome.storage.local as typeof chrome.storage.local & { getKeys?: () => Promise<string[]> };
  if (typeof local.getKeys === 'function') return local.getKeys();
  return Object.keys(await local.get(null));
}

const plannerWindow = (path: string): { start: number; end: number } => {
  const q = new URLSearchParams(path.slice(path.indexOf('?') + 1));
  const s = Date.parse(q.get('start_date') ?? ''), e = Date.parse(q.get('end_date') ?? '');
  return { start: Number.isFinite(s) ? s : -Infinity, end: Number.isFinite(e) ? e : Infinity };
};

/** The item page a module item opens (besides /modules/items/:id), for must-view matching. */
export function moduleItemPath(courseId: string, it: ModuleItem): string | null {
  const c = `/courses/${courseId}`;
  const id = it.content_id != null ? String(it.content_id) : null;
  switch (it.type) {
    case 'Assignment': return id && `${c}/assignments/${id}`;
    case 'Quiz': return id && `${c}/quizzes/${id}`;
    case 'Discussion': return id && `${c}/discussion_topics/${id}`;
    case 'File': return id && `${c}/files/${id}`;
    case 'Page': return it.page_url ? `${c}/pages/${it.page_url}` : null;
    default: return null;
  }
}

/** Paths with an open must-view requirement, from cached module lists. */
export function mustViewPaths(lists: { courseId: string; items: ModuleItem[] }[]): Set<string> {
  const out = new Set<string>();
  for (const { courseId, items } of lists) {
    for (const it of items) {
      const r = it.completion_requirement;
      if (!r || r.type !== 'must_view' || r.completed) continue;
      const p = moduleItemPath(courseId, it);
      if (p) out.add(p);
    }
  }
  return out;
}

/** Read b²c's caches for this user. Storage only: never the network. */
export async function readCaches(userId: string | null, win: { from: number; to: number }) {
  const prefix = `${CACHE_PREFIX}${userId ?? 'anon'}:`;
  const keys = (await storageKeys()).filter(k => k.startsWith(prefix));
  const coursesKeys = keys.filter(k => k.startsWith(prefix + '/courses?') && k.includes('enrollment_state=active'));
  const plannerKeys = keys.filter(k => {
    if (!k.startsWith(prefix + '/planner/items?')) return false;
    const w = plannerWindow(k.slice(prefix.length));
    return w.start < win.to && w.end > win.from;
  });
  // Module lists (any course; shared by search, pins and others): must-view requirements.
  const moduleKeys = keys.filter(k => /^\/courses\/[^/]+\/modules(\/[^/]+\/items)?\?/.test(k.slice(prefix.length)));
  const cardsKey = prefix + '/dashboard/dashboard_cards';
  const colorsKey = prefix + '/users/self/colors';
  const got = (await chrome.storage.local.get([...coursesKeys, ...plannerKeys, ...moduleKeys, cardsKey, colorsKey])) as Record<string, Cached<unknown> | undefined>;
  const ok = <T,>(v: Cached<unknown> | undefined): Cached<T> | null => (v && typeof v.t === 'number' && v.data != null ? (v as Cached<T>) : null);
  const courses = coursesKeys.map(k => ok<Course[]>(got[k])).filter(Boolean).sort((a, b) => b!.t - a!.t)[0] ?? null;
  const colors = ok<{ custom_colors?: Record<string, string> }>(got[colorsKey]);
  return {
    courses: courses && Array.isArray(courses.data) ? courses : null,
    cards: ((c => (c && Array.isArray(c.data) ? c : null))(ok<DashboardCard[]>(got[cardsKey]))),
    colors: colors ? { t: colors.t, data: colors.data.custom_colors ?? {} } : null,
    mustView: mustViewPaths(
      moduleKeys.flatMap(k => {
        const e = ok<(Module | ModuleItem)[]>(got[k]);
        const courseId = k.slice(prefix.length).split('/')[2]!;
        if (!e || !Array.isArray(e.data)) return [];
        const items = /\/items\?/.test(k) ? (e.data as ModuleItem[]) : (e.data as Module[]).flatMap(m => m.items ?? []);
        return [{ courseId, items }];
      }),
    ),
    planner: plannerKeys.flatMap(k => {
      const e = ok<PlannerItem[]>(got[k]);
      return e && Array.isArray(e.data) ? [{ ...e, ...plannerWindow(k.slice(prefix.length)) } satisfies PlannerEntry] : [];
    }),
  };
}

function parse(detail: string): DescribeRequest | null {
  try {
    const r = JSON.parse(detail) as unknown;
    return r && typeof r === 'object' && !Array.isArray(r) ? (r as DescribeRequest) : null;
  } catch {
    return null;
  }
}

function writeScript(json: string) {
  let el = document.getElementById(DESCRIBE_SCRIPT_ID);
  if (!el) {
    el = document.createElement('script');
    el.setAttribute('type', 'application/json');
    el.id = DESCRIBE_SCRIPT_ID;
    (document.head ?? document.documentElement).appendChild(el);
  }
  // < keeps "</script>" in a title from ending the element if the DOM is serialized.
  el.textContent = json.replace(/</g, '\\u003c');
}

export function createAgent(ctx: Ctx): Agent {
  let lastRefresh = -Infinity;
  let unanchor: (() => void) | null = null;
  let stopped = false;

  async function revalidate(win: { from: number; to: number }, now: Date) {
    if (performance.now() - lastRefresh < REFRESH_EVERY_MS) return;
    lastRefresh = performance.now();
    const noop = () => {};
    // The planner window every feature shares (14 days back, 28 ahead) when
    // it covers the request: one request and cache entry with them.
    const shared = win.from >= now.getTime() - 14 * DAY && win.to <= now.getTime() + 28 * DAY;
    await Promise.allSettled([
      ctx.data.courses(noop),
      ctx.data.plannerItems(noop, shared ? { now } : { start: new Date(win.from), end: new Date(win.to), now }),
    ]);
  }

  async function handle(detail: string, settings: Flat) {
    const req = parse(detail);
    if (!req) return;
    stopped = false;
    const id = req.id != null ? String(req.id) : `b2c-${Date.now().toString(36)}-${seq++}`;
    let out: Described | { $b2c: 'describe'; v: 1; id: string; error: string };
    try {
      const env = await ctx.env();
      const tz = validZone(env?.TIMEZONE);
      const now = ctx.now();
      const win = windowOf(req, now.getTime(), tz);
      if (req.refresh === true) await revalidate(win, now);
      const caches = await readCaches(env?.current_user_id ?? null, win);
      const snap: Snapshot = {
        build: __B2C_BUILD_ID__,
        origin: location.origin,
        tz,
        userId: env?.current_user_id ?? null,
        now: now.getTime(),
        page: ctx.page,
        path: location.pathname + location.search,
        docTitle: document.title,
        ...caches,
        marks: (settings['core.todoMarks'] as TodoMarks | undefined) ?? {},
      };
      const facts = changeFacts(snap);
      const base = describeFrom(snap, req, id, [], facts);
      if (stopped) return;
      // §3: anchor Canvas's elements with this answer's facts (replacing any
      // earlier call's), then list everything on the page that carries an id.
      unanchor?.();
      unanchor = anchorCanvas(ctx.dom, { origin: snap.origin, page: ctx.page, due: base.due, facts });
      out = { ...base, onPage: collectOnPage() };
    } catch (e) {
      // Answer anyway, so the caller gets an error now instead of a 2 s timeout.
      out = { $b2c: 'describe', v: 1, id, error: e instanceof Error ? e.message : String(e) };
    }
    if (stopped) return;
    const json = JSON.stringify(out);
    if (!('error' in out)) writeScript(json);
    document.dispatchEvent(new CustomEvent(DESCRIBED, { detail: json }));
  }

  return {
    handle,
    stop() {
      stopped = true;
      unanchor?.();
      unanchor = null;
      document.getElementById(DESCRIBE_SCRIPT_ID)?.remove();
    },
  };
}
