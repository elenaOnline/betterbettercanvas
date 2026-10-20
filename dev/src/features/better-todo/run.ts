// better-todo runtime: loaded lazily (chunks/better-todo.js) on the dashboard.
import { h, render } from 'preact';
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import { applyPlannerPatch, type Course, type PlannerItem } from '../../core/canvas/data.ts';
import { widgetHost } from '../../core/dom.ts';
import type { Values } from '../../core/settings/schema.ts';
import { openSettings } from '../../core/settings-link.ts';
import { clearAttrs, regionAttr, setAttrs } from '../../core/agent/anchors.ts';
import { AGENT_ATTR } from '../../core/agent/hook.ts';
import { mountInSidePanel } from '../../core/side-panel.ts';
import { acquireToast, showToast, SYNC_HINT_KEY, toastUndo } from '../../core/toast.ts';
import { anchors } from './anchors.ts';
import { createNote, deleteNote, fetchPreview, setDone, writeOverride } from './canvas.ts';
import { dayIndex, dayText, shortDate, timeText, zonedToIso, type FmtOpts } from './format.ts';
import { classify, keyOf, type Lists, markUntil, noteItem, pruneCustom, pruneLabels, pruneMarks, sameJson, shortCode, submissionWords, type CustomItem, type Labels, type Marks, type Row } from './logic.ts';
import { Panel, type PanelProps } from './panel.tsx';
import type { ViewProps } from './types.ts';
import { countWords, progress, spanOf, type RangeId, type ViewId } from './views/model.ts';
import type { ComponentType } from 'preact';
import { createPreview, type Preview } from './preview.ts';
import css from './widget.css';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;
type Persisted = 'labels' | 'custom' | 'ui' | 'view';

/** Views load lazily: only the active one's code is ever fetched (todo-views.md). */
const VIEW_LOADERS: Record<Exclude<ViewId, 'list'>, () => Promise<{ default: ComponentType<ViewProps> }>> = {
  ring: () => import('./views/ring.tsx'),
  week: () => import('./views/week.tsx'),
  courses: () => import('./views/courses.tsx'),
};

const FALLBACK_ATTR = 'data-b2c-better-todo-fallback';
const MOUNT_TIMEOUT_MS = 1500;
const SETTLE_MS = 280;
const NARROW = '(max-width: 1139px)';

export function start(ctx: Ctx, initial: S): Instance<S> {
  let s: S = initial;
  let stopped = false;
  // Local state is applied at once, then persisted; storage echoes come
  // back through update() and must not undo a newer local change.
  let marks: Marks = s.marks;
  let labels: Labels = s.labels;
  let custom: CustomItem[] = s.custom;
  let ui = s.ui;
  const settling = new Set<string>();
  /** Ticked this page session: they stay in place, crossed off (polish B). */
  const session = new Set<string>();
  let view: ViewId = s.view;
  const viewComps = new Map<ViewId, ComponentType<ViewProps>>();
  let lastLists: Lists | null = null;
  const pending = new Map<string, string[]>();

  let items: PlannerItem[] | null = null;
  let colors: Record<string, string> = {};
  let courses: Course[] = [];
  let error: { cached: boolean; at: number | null } | null = null;
  let lastOk: number | null = null;
  let fmt: FmtOpts = { clock: s.clock, dates: s.dates, order: s.dateOrder };
  let rows = new Map<string, Row>();
  const narrowMq = matchMedia(NARROW);
  let narrow = narrowMq.matches;
  const sessionOpen: { todo?: boolean; announcements?: boolean } = {};

  const { host, root } = widgetHost('todo', css);
  host.setAttribute('data-b2c-feature', 'better-todo');
  const mountPoint = document.createElement('div');
  root.appendChild(mountPoint);
  let preview: Preview | null = null;
  let mounted = false;
  const releaseToast = acquireToast();

  // CONTRACT.md §3: anchors only while html[data-b2c-agent] is present; they
  // go live when the user turns the contract off (core.agentContract).
  let agent = document.documentElement.hasAttribute(AGENT_ATTR);
  const applyRegion = () => (agent ? setAttrs(host, regionAttr('todo')) : clearAttrs(host));
  applyRegion();
  const agentMo = new MutationObserver(() => {
    const on = document.documentElement.hasAttribute(AGENT_ATTR);
    if (on === agent) return;
    agent = on;
    applyRegion();
    draw();
  });
  agentMo.observe(document.documentElement, { attributes: true, attributeFilter: [AGENT_ATTR] });

  const persistKey = (key: string, value: unknown) => {
    pending.set(key, [...(pending.get(key) ?? []), JSON.stringify(value)]);
    void ctx.set({ [key]: value }).catch(e => console.error('[b2c] better-todo save', e));
  };
  const persist = (v: Partial<Record<Persisted, unknown>>) => {
    for (const [k, x] of Object.entries(v)) persistKey(`better-todo.${k}`, x);
  };
  const saveMarks = () => {
    marks = pruneMarks(marks, ctx.now());
    persistKey('core.todoMarks', marks);
  };

  let courseMap = new Map<string, Course>();
  /** Full label: the nickname if she set one (Canvas returns it as name), else the name. */
  const courseName = (id: string | null, r?: Row) => {
    if (!id) return '';
    return courseMap.get(id)?.name ?? (r?.item?.context_name as string | undefined) ?? '';
  };
  /** Row chip: the nickname if set, else the short course code. */
  const courseLabel = (id: string | null, r?: Row) => {
    if (!id) return '';
    const c = courseMap.get(id);
    if (c) return c.original_name ? c.name : shortCode(c.course_code || c.name);
    return shortCode((r?.item?.context_name as string | undefined) ?? '');
  };

  const collapsedNow = () => {
    const saved = ui.collapsed ?? {};
    if (!narrow) return saved;
    return { todo: !sessionOpen.todo, announcements: !sessionOpen.announcements };
  };

  function loadView(v: ViewId) {
    if (v === 'list' || viewComps.has(v)) return;
    VIEW_LOADERS[v]()
      .then(m => {
        viewComps.set(v, m.default);
        draw();
      })
      .catch(e => console.error('[b2c] better-todo view', v, e));
  }
  loadView(view); // start now, in parallel with the data, so it's ready by first paint

  /** "4 of 11 done this week": the count for the live region, in the view's range. */
  const countNow = () => {
    if (!lastLists) return '';
    const now = ctx.now();
    const day = (d: Date) => dayIndex(d, fmt.tz);
    const range: RangeId = view === 'ring' || view === 'courses' ? (ui.range ?? 'week') : 'week';
    const span = spanOf(range, day(now));
    return countWords(progress(lastLists.all, span, day, now), span);
  };

  function draw() {
    if (stopped || !mounted) return;
    const now = ctx.now();
    const lists = items ? classify(items, custom, marks, { showOverdue: s.showOverdue, hideCompleted: s.hideCompleted }, now, { session, settling }) : null;
    lastLists = lists;
    rows = new Map();
    if (lists) for (const r of [...lists.todo, ...lists.done, ...lists.announcements]) rows.set(r.key, r);
    const props: PanelProps = {
      lists,
      count: s.count,
      showAnnouncements: s.announcements,
      courseColors: s.courseColors,
      sync: s.plannerSync,
      labels,
      colors,
      courseLabel,
      courseName,
      courses: courses
        .filter(c => !c.concluded)
        .map(c => ({ id: String(c.id), label: c.original_name ? c.name : c.course_code || c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      fmt,
      now,
      error: error && { ...error, cached: !!lists },
      collapsed: collapsedNow(),
      narrow,
      agent,
      settling,
      session,
      view,
      range: ui.range ?? 'week',
      View: view === 'list' ? null : (viewComps.get(view) ?? null),
      on: handlers,
    };
    render(h(Panel, props), mountPoint);
    preview?.refresh();
  }

  // ── done / remove ──────────────────────────────────────────────────────
  const writes = new Map<string, Promise<unknown>>();
  const chain = <T,>(key: string, f: () => Promise<T>): Promise<T> => {
    const p = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(f);
    writes.set(key, p);
    return p;
  };

  const syncHint = (): string | undefined => {
    try {
      if (localStorage.getItem(SYNC_HINT_KEY)) return undefined;
      localStorage.setItem(SYNC_HINT_KEY, '1');
      return 'Change this in Settings → To-do';
    } catch {
      return undefined;
    }
  };

  function settle(key: string) {
    settling.add(key);
    setTimeout(() => {
      settling.delete(key);
      draw();
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SETTLE_MS);
  }

  /** Apply a done/removed change: optimistic mark, Canvas write when syncing, toast with Undo. */
  function change(r: Row, field: 'done' | 'removed', value: boolean, opts: { toast: boolean } = { toast: true }) {
    const sync = s.plannerSync && r.source === 'canvas';
    const prev = marks[r.key];
    marks = { ...marks, [r.key]: { ...prev, [field]: value, at: ctx.now().getTime(), until: markUntil(sync, r.date, ctx.now()) } };
    saveMarks();
    // Polish B: a ticked row stays where it is, crossed off, for the session;
    // a removed one fades out.
    if (field === 'done') session.add(r.key);
    else if (value) settle(r.key);
    draw();

    const verb = field === 'done' ? (value ? 'Marked done' : 'Marked not done') : value ? 'Removed from list' : 'Restored';
    const undo = () => {
      const cur = rows.get(r.key) ?? r;
      change(cur, field, !value, { toast: false });
    };
    if (opts.toast) {
      showToast({
        message: sync ? `${verb} in Canvas` : verb,
        sub: sync ? syncHint() : undefined,
        announce: `${r.title} ${verb.toLowerCase()}. ${field === 'done' ? countNow() + '. ' : ''}Undo available.`,
        action: { label: 'Undo', run: undo, undo: true },
      });
    }
    if (!sync) return;
    chain(r.key, () => {
      const cur = rows.get(r.key) ?? r; // the latest override (patched in-page)
      return field === 'done'
        ? setDone(ctx.data, ctx.api, cur, value)
        : writeOverride(ctx.data, ctx.api, cur, { marked_complete: cur.markedDone, dismissed: value });
    }).catch(e => {
      console.error('[b2c] better-todo planner write', e);
      const now = { ...marks };
      if (prev) now[r.key] = prev;
      else delete now[r.key];
      marks = now;
      saveMarks();
      settling.delete(r.key);
      draw();
      showToast({ message: `Couldn't save "${r.title}" to Canvas`, action: { label: 'Retry', run: () => change(rows.get(r.key) ?? r, field, value) } });
    });
  }

  // ── handlers ───────────────────────────────────────────────────────────
  const handlers: PanelProps['on'] = {
    toggleDone(r) {
      if (r.submitted && !r.markedDone) return;
      change(r, 'done', !r.markedDone);
    },
    toggleRemoved(r) {
      change(r, 'removed', !r.removed);
    },
    setLabel(r, text) {
      const next = { ...labels };
      if (text) next[r.key] = { text: text.slice(0, 24), at: ctx.now().getTime() };
      else delete next[r.key];
      if (sameJson(next, labels)) return;
      labels = next;
      persist({ labels });
      draw();
    },
    async remove(r) {
      if (r.source === 'local') {
        const was = custom.find(c => `local:${c.id}` === r.key);
        custom = custom.filter(c => c !== was);
        persist({ custom });
        draw();
        if (was)
          showToast({
            message: 'Deleted',
            action: {
              label: 'Undo',
              undo: true,
              run: () => {
                custom = [...custom, was];
                persist({ custom });
                draw();
              },
            },
          });
        return;
      }
      // A Canvas planner note.
      const item = r.item;
      if (!item) return;
      items = items?.filter(i => keyOf(i) !== r.key) ?? null;
      draw();
      try {
        await deleteNote(ctx.api, r.id);
        await ctx.data.patchPlanner({ key: r.key, remove: true });
        showToast({
          message: 'Deleted from your Canvas planner',
          action: {
            label: 'Undo',
            undo: true,
            run: () => {
              const p = item.plannable as Record<string, unknown>;
              void addNote({ title: r.title, todoDate: item.plannable_date, courseId: r.courseId, details: (p.details as string | null) ?? null });
            },
          },
        });
      } catch (e) {
        console.error('[b2c] better-todo delete note', e);
        if (items && !items.some(i => keyOf(i) === r.key)) items = [...items, item];
        draw();
        showToast({ message: `Couldn't delete "${r.title}" from Canvas`, action: { label: 'Retry', run: () => void handlers.remove(rows.get(r.key) ?? r) } });
      }
    },
    async add(v) {
      const due = zonedToIso(v.date, v.time, fmt.tz);
      if (!due) return false;
      if (!s.plannerSync) {
        const at = ctx.now().getTime();
        custom = [...custom, { id: `${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: v.title, courseId: v.courseId, due, at }];
        persist({ custom });
        draw();
        return true;
      }
      return addNote({ title: v.title, todoDate: due, courseId: v.courseId });
    },
    collapse(section, v) {
      if (narrow) sessionOpen[section] = !v;
      else {
        ui = { ...ui, collapsed: { ...ui.collapsed, [section]: v } };
        persist({ ui });
      }
      draw();
    },
    retry() {
      error = null;
      draw();
      load();
    },
    undo() {
      toastUndo()?.();
    },
    preview(key) {
      if (s.hoverPreview) preview?.toggle(key);
    },
    closePreview() {
      preview?.close();
    },
    openSettings() {
      openSettings('better-todo');
    },
    setView(v) {
      if (v === view) return;
      view = v;
      loadView(v);
      persist({ view: v });
      preview?.close();
      draw();
    },
    setRange(r) {
      ui = { ...ui, range: r };
      persist({ ui });
      draw();
    },
  };

  /** Create a planner note; it shows at once and is patched into the shared planner. */
  async function addNote(n: { title: string; todoDate: string; courseId: string | null; details?: string | null }): Promise<boolean> {
    const tmpKey = `planner_note:tmp-${Math.random().toString(36).slice(2)}`;
    const tmp = noteItem({ id: tmpKey.slice('planner_note:'.length), title: n.title, todo_date: n.todoDate, course_id: n.courseId });
    items = [...(items ?? []), tmp];
    draw();
    try {
      const note = await createNote(ctx.api, n);
      items = (items ?? []).filter(i => i !== tmp);
      await ctx.data.patchPlanner({ key: `planner_note:${note.id}`, add: noteItem(note, courseName(n.courseId)) });
      return true;
    } catch (e) {
      console.error('[b2c] better-todo add note', e);
      items = (items ?? []).filter(i => i !== tmp);
      draw();
      showToast({ message: `Couldn't add "${n.title}" to your Canvas planner`, action: { label: 'Retry', run: () => void addNote(n) } });
      return false;
    }
  }

  // ── data ───────────────────────────────────────────────────────────────
  const offPatch = ctx.data.onPlannerPatch(p => {
    if (!items) return;
    items = applyPlannerPatch(items, p);
    draw();
  });

  const tidy = () => {
    const now = ctx.now();
    const c = pruneCustom(custom, now);
    const l = pruneLabels(labels, now);
    if (!sameJson(c, custom)) persist({ custom: (custom = c) });
    if (!sameJson(l, labels)) persist({ labels: (labels = l) });
    const m = pruneMarks(marks, now);
    if (!sameJson(m, marks)) {
      marks = m;
      saveMarks();
    }
  };

  function load() {
    void ctx.env().then(env => {
      if (stopped) return;
      fmt = { ...fmt, tz: env?.TIMEZONE, locale: env?.LOCALE };
      ctx.data
        .plannerItems(
          (d, fresh) => {
            if (stopped) return;
            items = d;
            if (fresh) {
              lastOk = ctx.now().getTime();
              error = null;
            }
            draw();
          },
          // The shared default window (14 days back) is what the Done view
          // needs; one request and one cache entry with card-assignments.
          { now: ctx.now() },
        )
        .then(() => {
          if (stopped) return;
          lastOk = ctx.now().getTime();
          if (error) {
            error = null;
            draw();
          }
          tidy();
        })
        .catch(e => {
          console.error('[b2c] better-todo planner', e);
          error = { cached: false, at: lastOk };
          draw();
        });
      ctx.data
        .colors(c => {
          colors = c;
          draw();
        })
        .catch(() => {});
      ctx.data
        .courses(c => {
          courses = c;
          courseMap = new Map(c.map(x => [String(x.id), x]));
          draw();
        })
        .catch(() => {});
    });
  }

  // ── preview ────────────────────────────────────────────────────────────
  const previewMeta = (r: Row) => {
    const now = ctx.now();
    const when = r.date
      ? r.type === 'announcement'
        ? `Posted ${shortDate(r.date, now, fmt)}`
        : `Due ${dayText(r.date, now, fmt)} ${timeText(r.date, fmt)}`
      : '';
    const pts = r.points != null ? `${r.points} pts` : '';
    return { title: r.title, sub: [courseName(r.courseId, r), when, pts].filter(Boolean).join(' · '), url: r.url };
  };

  // ── mount ──────────────────────────────────────────────────────────────
  const offMount = mountInSidePanel(ctx.dom, host, 10, {
    onMount() {
      mounted = true;
      document.documentElement.removeAttribute(FALLBACK_ATTR);
      if (!preview)
        preview = createPreview(root, mountPoint, {
          enabled: () => s.hoverPreview,
          row: k => rows.get(k) ?? null,
          meta: previewMeta,
          load: (r, cb) => fetchPreview(ctx.api, r, location.origin, d => cb({ html: d.html, status: submissionWords(r, d.score) })),
        });
      draw();
    },
    onUnmount() {
      preview?.close();
    },
  });
  // Canvas's own list is hidden by CSS from the first paint; if the panel
  // can't mount, give it back.
  const fallbackTimer = setTimeout(() => {
    if (!mounted && !stopped && document.querySelector(anchors.rightSide)) document.documentElement.setAttribute(FALLBACK_ATTR, '');
  }, MOUNT_TIMEOUT_MS);

  const onNarrow = () => {
    narrow = narrowMq.matches;
    draw();
  };
  narrowMq.addEventListener('change', onNarrow);

  // ⌘Z / Ctrl+Z anywhere on the dashboard runs the toast's Undo (the shared
  // toast hands it to the first listener only).
  const onUndoKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
    const t = e.composedPath()[0] as HTMLElement | undefined;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !(t instanceof HTMLInputElement && t.type === 'checkbox')) return;
    const u = toastUndo();
    if (!u) return;
    e.preventDefault();
    u();
  };
  document.addEventListener('keydown', onUndoKey, true);

  load();

  return {
    update(next) {
      const prev = s;
      s = next;
      const adopt = <T,>(key: string, incoming: T, local: T): T => {
        const q = pending.get(key) ?? [];
        const i = q.indexOf(JSON.stringify(incoming));
        if (i >= 0) q.splice(0, i + 1);
        return q.length ? local : incoming; // newer local writes still in flight
      };
      marks = adopt('core.todoMarks', next.marks, marks);
      labels = adopt('better-todo.labels', next.labels, labels);
      custom = adopt('better-todo.custom', next.custom, custom);
      ui = adopt('better-todo.ui', next.ui, ui);
      const v = adopt<ViewId>('better-todo.view', next.view, view);
      if (v !== view) {
        view = v;
        loadView(v);
      }
      fmt = { ...fmt, clock: next.clock, dates: next.dates, order: next.dateOrder };
      if (!next.hoverPreview && prev.hoverPreview) preview?.close();
      draw();
    },
    stop() {
      stopped = true;
      agentMo.disconnect();
      clearTimeout(fallbackTimer);
      offPatch();
      offMount();
      preview?.destroy();
      preview = null;
      render(null, mountPoint);
      host.remove();
      narrowMq.removeEventListener('change', onNarrow);
      document.removeEventListener('keydown', onUndoKey, true);
      releaseToast();
      document.documentElement.removeAttribute(FALLBACK_ATTR);
    },
  };
}
