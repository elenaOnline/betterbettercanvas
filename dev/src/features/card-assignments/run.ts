// card-assignments runtime: loaded lazily (chunks/card-assignments.js) on the dashboard.
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import type { Values } from '../../core/settings/schema.ts';
import { ApiError } from '../../core/canvas/api.ts';
import { applyPlannerPatch, type PlannerItem, type PlannerOverride } from '../../core/canvas/data.ts';
import type { TodoMarks } from '../../core/settings/shared.ts';
import { SYNC_HINT_KEY, acquireToast, hideToast, showToast, toastUndo } from '../../core/toast.ts';
import { SEL, cardCourseId } from './anchors.ts';
import { AGENT_ATTR } from '../../core/agent/hook.ts';
import { byCourse, counts, dueOf, isLocal, itemKey, pick, type DateOpts, type Row } from './logic.ts';
import { DueWidget } from './widget.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;

const DAY = 86_400_000;
const CUSTOM_KEY = 'better-todo.custom';

/** better-todo's b²c-local custom items (planner sync off), as planner-shaped
 *  items, so they merge into the card lists by date. Key: "local:<id>". */
interface LocalCustom { id: string; title: string; courseId: string | null; due: string }
export function localItems(v: unknown): PlannerItem[] {
  if (!Array.isArray(v)) return [];
  return (v as LocalCustom[])
    .filter(c => c && typeof c.id === 'string' && typeof c.title === 'string' && c.courseId && typeof c.due === 'string')
    .map(c => ({
      plannable_type: 'local' as PlannerItem['plannable_type'],
      plannable_id: c.id,
      plannable_date: c.due,
      plannable: { id: c.id, title: c.title, todo_date: c.due },
      planner_override: null,
      submissions: false,
      new_activity: false,
      html_url: '',
      context_type: 'Course' as const,
      course_id: String(c.courseId),
    }));
}

/** Keys hidden by local marks (done or removed, not expired). */
export function markedKeys(marks: TodoMarks, now: number): Set<string> {
  const out = new Set<string>();
  for (const [k, m] of Object.entries(marks)) {
    if (!m || typeof m !== 'object') continue;
    if ((m.done || m.removed) && (m.until === undefined || m.until > now)) out.add(k);
  }
  return out;
}

export function start(ctx: Ctx, initial: S): Instance<S> {
  let s = initial;
  let items: PlannerItem[] | null = null;
  let grouped = new Map<string, PlannerItem[]>();
  let status: 'loading' | 'ok' | 'error' | 'unavailable' = 'loading';
  let stale = false;
  let lastOk: number | null = null;
  let timeZone: string | undefined;
  let stopped = false;
  // Local-path overlay until the core.todoMarks echo arrives.
  const pending = new Set<string>();
  const undone = new Set<string>();
  // Per-item write queue, so an Undo waits for the tick's own write.
  const writes = new Map<string, Promise<unknown>>();
  const chain = <T>(key: string, f: () => Promise<T>): Promise<T> => {
    const p = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(f);
    writes.set(key, p);
    return p;
  };
  const widgets = new Set<DueWidget>();
  const releaseToast = acquireToast();
  // Rows she has seen undone in this page. If one becomes done (a tick here,
  // in the to-do panel, or Canvas) it stays, struck through, until the next
  // load (card-assignments.md "Done").
  const seen = new Set<string>();
  let locals: PlannerItem[] = [];

  const types = () =>
    new Set([s.assignments && 'assignment', s.quizzes && 'quiz', s.discussions && 'discussion_topic'].filter(Boolean) as string[]);
  let locale: string | undefined;
  const dateOpts = (): DateOpts => ({ timeZone, clock: s.clock, mode: s.dates, order: s.dateOrder, locale });
  const doneSet = () => {
    const d = markedKeys(s.marks, ctx.now().getTime());
    for (const k of pending) d.add(k);
    return d;
  };

  // agentkit/CONTRACT.md §3 anchors follow html[data-b2c-agent] live.
  const agentOn = () => document.documentElement.hasAttribute(AGENT_ATTR);
  let agentWas = agentOn();
  const agentMo = new MutationObserver(() => {
    if (agentOn() !== agentWas) {
      agentWas = agentOn();
      renderAll();
    }
  });
  agentMo.observe(document.documentElement, { attributes: true, attributeFilter: [AGENT_ATTR] });

  function render(w: DueWidget, done = doneSet(), ty = types()) {
    const now = ctx.now();
    const list = grouped.get(w.courseId) ?? [];
    const opts = { count: s.count, overdue: s.overdue, showCompleted: s.showCompleted, types: ty, done, undone, crossed: seen };
    const picked = pick(list, opts, now);
    if (status === 'ok') for (const r of picked.rows) if (!r.done) seen.add(r.key);
    w.render({
      status,
      stale,
      lastOk,
      count: s.count,
      view: s.view,
      counts: s.view === 'count' ? counts(list, opts, now, timeZone) : { overdue: 0, week: 0, total: 0 },
      dates: dateOpts(),
      now,
      courseId: w.courseId,
      courseLabel: w.courseLabel,
      agent: agentOn(),
      picked,
    });
  }

  function renderAll() {
    if (stopped) return;
    const done = doneSet(), ty = types();
    for (const w of widgets) {
      // Canvas re-renders its cards wholesale; forget widgets it threw away.
      if (!w.host.isConnected) widgets.delete(w);
      else render(w, done, ty);
    }
  }

  const setItems = (d: PlannerItem[]) => {
    items = d;
    grouped = byCourse([...d, ...locals]);
  };
  // better-todo's local custom items (another feature's setting: read-only here).
  const setLocals = (v: unknown) => {
    locals = localItems(v);
    if (items) setItems(items);
    else grouped = byCourse(locals);
    renderAll();
  };
  void chrome.storage.local.get(CUSTOM_KEY).then(r => !stopped && setLocals(r[CUSTOM_KEY]));
  const onLocal = (ch: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && CUSTOM_KEY in ch) setLocals(ch[CUSTOM_KEY]!.newValue);
  };
  chrome.storage.onChanged.addListener(onLocal);

  // ── data ──
  ctx.data
    .plannerItems(
      (d, fresh) => {
        setItems(d);
        status = 'ok';
        if (fresh) {
          stale = false;
          lastOk = Date.now();
        }
        renderAll();
      },
      { now: ctx.now() },
    )
    .catch((e: unknown) => {
      if (items) stale = true;
      // Feature-detect: a school with the planner off answers 403/404.
      else status = e instanceof ApiError && (e.status === 403 || e.status === 404) ? 'unavailable' : 'error';
      renderAll();
    });
  const offPatch = ctx.data.onPlannerPatch(p => {
    if (!items) return;
    setItems(applyPlannerPatch(items, p));
    renderAll();
  });
  void ctx.env().then(e => {
    const tz = e?.TIMEZONE;
    const loc = e?.LOCALE;
    if ((tz && tz !== timeZone) || (loc && loc !== locale)) {
      timeZone = tz ?? timeZone;
      locale = loc ?? locale;
      renderAll();
    }
  });

  const current = (key: string) => items?.find(i => itemKey(i) === key);

  // ── done / undo ──
  const saveMarks = (f: (m: TodoMarks) => TodoMarks) => ctx.set({ 'core.todoMarks': f({ ...s.marks }) });

  const optimistic = (item: PlannerItem, complete: boolean): PlannerOverride => ({
    id: item.planner_override?.id ?? '',
    plannable_type: item.plannable_type,
    plannable_id: String(item.plannable_id),
    dismissed: item.planner_override?.dismissed ?? false,
    marked_complete: complete,
  });

  function hint(): string | undefined {
    try {
      if (localStorage.getItem(SYNC_HINT_KEY)) return undefined;
      localStorage.setItem(SYNC_HINT_KEY, '1');
      return 'Change this in Settings → To-do';
    } catch {
      return undefined;
    }
  }

  function tick(row: Row, _li: HTMLElement) {
    const key = row.key;
    // Local custom items have no planner entry: always b²c marks.
    const sync = s.syncPlanner && !isLocal(row.item);
    seen.add(key);

    if (sync) {
      const before = current(key) ?? row.item;
      void ctx.data.patchPlanner({ key, planner_override: optimistic(before, true) });
      chain(key, () => ctx.data.setComplete(before, true)).catch(() => {
        void ctx.data.patchPlanner({ key, planner_override: before.planner_override });
        showToast({ message: "Couldn't save to Canvas", action: { label: 'Retry', run: () => retick(key) } });
      });
    } else {
      undone.delete(key);
      pending.add(key);
      const due = dueOf(row.item)?.getTime() ?? ctx.now().getTime();
      const now = ctx.now().getTime();
      void saveMarks(m => ({ ...m, [key]: { ...m[key], done: true, at: now, until: Math.max(due, now) + 14 * DAY } }));
      renderAll();
    }

    showToast({
      message: sync ? 'Marked done in Canvas' : 'Marked done',
      sub: sync ? hint() : undefined,
      announce: `${row.item.plannable.title} marked done. Undo available.`,
      action: { label: 'Undo', undo: true, run: () => untick(key, sync) },
    });
  }

  function retick(key: string) {
    const item = current(key);
    if (!item) return;
    void ctx.data.patchPlanner({ key, planner_override: optimistic(item, true) });
    chain(key, () => ctx.data.setComplete(item, true)).catch(() => {
      void ctx.data.patchPlanner({ key, planner_override: item.planner_override });
      showToast({ message: "Couldn't save to Canvas", action: { label: 'Retry', run: () => retick(key) } });
    });
  }

  function untick(key: string, sync: boolean) {
    if (sync) {
      // Wait for the tick's write, so we PUT the override Canvas created.
      void chain(key, async () => {
        const item = current(key);
        if (!item) return;
        const saved = item.planner_override;
        void ctx.data.patchPlanner({ key, planner_override: optimistic(item, false) });
        try {
          await ctx.data.setComplete(item, false);
        } catch {
          void ctx.data.patchPlanner({ key, planner_override: saved });
          showToast({ message: "Couldn't save to Canvas", action: { label: 'Retry', run: () => untick(key, true) } });
        }
      });
    } else {
      pending.delete(key);
      undone.add(key);
      void saveMarks(m => {
        const { done: _d, ...rest } = m[key] ?? { at: 0 };
        if (rest.removed) m[key] = rest;
        else delete m[key];
        return m;
      });
      renderAll();
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
    const t = e.composedPath()[0] as HTMLElement | undefined;
    if (t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t instanceof HTMLInputElement && t.type !== 'checkbox'))) return;
    const u = toastUndo();
    if (!u) return;
    e.preventDefault();
    u();
  };
  document.addEventListener('keydown', onKey, true);

  // ── mount ──
  const off = ctx.dom.each(SEL.card, el => {
    const courseId = cardCourseId(el);
    if (!courseId) return;
    const w = new DueWidget(courseId, { tick, untick: row => untick(row.key, s.syncPlanner && !isLocal(row.item)) });
    w.courseLabel = (el.querySelector(SEL.subtitle)?.textContent ?? el.getAttribute('aria-label') ?? '').trim();
    render(w);
    el.appendChild(w.host);
    widgets.add(w);
    return () => {
      w.destroy();
      widgets.delete(w);
    };
  });

  return {
    update(next) {
      s = next;
      // Drop overlay entries once storage reflects them.
      const marked = markedKeys(s.marks, ctx.now().getTime());
      for (const k of pending) if (marked.has(k)) pending.delete(k);
      for (const k of undone) if (!marked.has(k)) undone.delete(k);
      renderAll();
    },
    stop() {
      stopped = true;
      agentMo.disconnect();
      off();
      offPatch();
      try {
        chrome.storage.onChanged.removeListener(onLocal);
      } catch {
        /* orphaned */
      }
      for (const w of widgets) w.destroy();
      widgets.clear();
      document.removeEventListener('keydown', onKey, true);
      hideToast();
      releaseToast();
    },
  };
}
