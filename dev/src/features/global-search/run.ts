// global-search runtime (chunks/global-search.js), loaded on the first ⌘K or
// for a quiet background refresh of a stale index. Owns the in-memory index,
// ranking, the palette, and the built-in commands.

import type { Command, Result } from '../../core/commands.ts';
import type { Ctx } from '../../core/ctx.ts';
import { builtinCommands, type BuiltinState } from './builtins.ts';
import { LS_STATE, readState, STALE_MS } from './index.ts';
import { refresh } from './indexer.ts';
import {
  courseBoost, createSearcher, dateBoost, KIND_GROUP, prepare, pushRecent, recentBoost, score, shortDate, tokens,
  type CourseInfo, type Doc, type Hit, type Prepared,
} from './model.ts';
import { createPalette, type Palette, type Row, type RowGroup } from './palette.ts';
import { openStore, type CourseRecord, type IndexStore, type Meta } from './store.ts';

const KIND_WORD: Record<Doc['kind'], string> = {
  course: 'course', module: 'module', assignment: 'assignment', quiz: 'quiz', page: 'page',
  file: 'file', discussion: 'discussion', announcement: 'announcement', link: 'link',
};
const PER_GROUP = 4;
const MAX_GROUPS = 6;
const COMMAND_GROUP = 'Commands';

/** A ranked candidate; its row is built only if it is shown. */
interface Scored { score: number; group: string; row: () => Row }

function writeState(patch: { t?: number; used?: number }) {
  try {
    localStorage.setItem(LS_STATE, JSON.stringify({ ...readState(localStorage), ...patch }));
  } catch {
    /* storage blocked */
  }
}

export function start(ctx: Ctx) {
  const now = () => ctx.now().getTime();
  let palette: Palette | null = null;
  let store: IndexStore | null = null;
  let loaded: Promise<void> | null = null;
  let stopped = false;
  let userId: string | null = null;

  let meta: Meta | null = null;
  const courses = new Map<string, CourseInfo>();
  const recs = new Map<string, CourseRecord>();
  const prepared = new Map<string, Prepared<Doc>[]>();
  const byKey = new Map<string, Doc>();
  let recent: string[] = [];
  let searcher = createSearcher<Doc>([]);
  let dirty = true;

  let refreshing: Promise<void> | null = null;
  let failed = false;
  let timeZone: string | undefined;

  const builtinState: BuiltinState = {};
  const unregister = builtinCommands(ctx, { rebuild: () => void rebuild(), state: builtinState }).map(c => ctx.commands.register(c));

  // ── Index in memory ───────────────────────────────────────────────────────
  const contextOf = (d: Doc) => {
    const c = courses.get(d.course);
    return `${c?.code ?? ''} ${d.kind === 'course' ? c?.original ?? '' : c?.name ?? ''} ${d.module ?? ''} ${KIND_WORD[d.kind]}`;
  };
  const boostOf = (d: Doc, t: number) =>
    courseBoost(courses.get(d.course), t, ctx.page.courseId) + dateBoost(d, t) + recentBoost(recent.indexOf(d.key)) + (d.kind === 'course' ? 6 : 0);

  function setCourse(rec: CourseRecord) {
    const old = recs.get(rec.id);
    for (const d of old?.docs ?? []) byKey.delete(d.key);
    recs.set(rec.id, rec);
    const t = now();
    prepared.set(rec.id, rec.docs.map(d => {
      byKey.set(d.key, d);
      return prepare(d, d.title, contextOf(d), boostOf(d, t));
    }));
    dirty = true;
  }

  function setMeta(m: Meta) {
    meta = m;
    courses.clear();
    for (const c of m.courses) courses.set(c.id, c);
    for (const id of [...prepared.keys()]) {
      if (!courses.has(id)) {
        for (const d of recs.get(id)?.docs ?? []) byKey.delete(d.key);
        prepared.delete(id);
        recs.delete(id);
        dirty = true;
      }
    }
  }

  /** Recompute static boosts (recents and "now" move between opens). */
  function reboost() {
    const t = now();
    for (const list of prepared.values()) for (const p of list) p.boost = boostOf(p.item, t);
    dirty = true;
  }

  const getSearcher = () => {
    if (dirty) {
      searcher = createSearcher([...prepared.values()].flat());
      dirty = false;
    }
    return searcher;
  };

  async function load() {
    const env = await ctx.env();
    timeZone = env?.TIMEZONE;
    userId = env?.current_user_id ?? null;
    if (!userId || stopped) return;
    store = await openStore(userId);
    const saved = await store.load();
    if (stopped) return;
    recent = saved.recent;
    if (saved.meta) setMeta(saved.meta);
    for (const r of saved.courses) if (!saved.meta || courses.has(r.id)) setCourse(r);
  }
  const ensureLoaded = () => (loaded ??= load().catch(e => console.error('[b2c] search index load', e)));

  const isStale = () => {
    if (!meta) return true;
    const t = now();
    if (t - meta.t >= STALE_MS) return true;
    for (const c of courses.values()) {
      const r = recs.get(c.id);
      if (!r || t - r.t >= STALE_MS) return true;
    }
    return false;
  };

  // ── Refresh ───────────────────────────────────────────────────────────────
  let rerenderQueued = false;
  const rerender = () => {
    if (rerenderQueued || !palette?.isOpen) return;
    rerenderQueued = true;
    requestAnimationFrame(() => {
      rerenderQueued = false;
      if (palette?.isOpen) onQuery(palette.query);
    });
  };

  let loadDone = false;
  function updateStatus() {
    if (!palette) return;
    if (!loadDone) palette.setStatus('', 'loading');
    else if (!userId) palette.setStatus('Sign in to Canvas to search your courses');
    else if (refreshing) palette.setStatus(byKey.size ? 'Updating…' : 'Building the search index…', 'updating');
    else if (failed) palette.setStatus('Couldn’t update. Showing saved results.');
    else palette.setStatus('');
  }

  function runRefresh(force = false): Promise<void> {
    if (refreshing) return refreshing;
    if (!store || stopped) return Promise.resolve();
    const s = store;
    refreshing = (async () => {
      await Promise.resolve(); // `refreshing` is set before the first status update
      updateStatus();
      try {
        const res = await refresh({ data: ctx.data, api: ctx.api, store: s, now }, new Map(recs), {
          onMeta: m => {
            setMeta(m);
            rerender();
          },
          onCourse: rec => {
            if (stopped) return;
            setCourse(rec);
            rerender();
          },
        }, force);
        failed = res.failed.length > 0;
        writeState({ t: now() });
      } catch (e) {
        failed = true;
        console.warn('[b2c] search refresh failed', e);
      } finally {
        refreshing = null;
        updateStatus();
        rerender();
      }
    })();
    return refreshing;
  }

  async function rebuild() {
    await ensureLoaded();
    if (!store) return;
    await refreshing;
    await store.clear();
    for (const id of [...recs.keys()]) {
      for (const d of recs.get(id)!.docs) byKey.delete(d.key);
      recs.delete(id);
      prepared.delete(id);
    }
    meta = null;
    dirty = true;
    await runRefresh(true);
  }

  // ── Rows ──────────────────────────────────────────────────────────────────
  function detailOf(d: Doc): string {
    const c = courses.get(d.course);
    if (d.kind === 'course') {
      // Canvas course names usually carry the code already; show it only when they don't.
      const code = c?.code && !d.title.toLowerCase().includes(c.code.toLowerCase()) ? c.code : '';
      return [code, c?.original && c.original !== d.title ? c.original : ''].filter(Boolean).join(' · ');
    }
    const parts = [c?.code || c?.name, d.module];
    const date = shortDate(d.date, undefined, timeZone);
    if (date) parts.push(d.kind === 'announcement' ? `Posted ${date}` : `Due ${date}`);
    return parts.filter(Boolean).join(' · ');
  }

  const docRow = (d: Doc, marks: string[]): Row => ({ key: d.key, kind: d.kind, title: d.title, detail: detailOf(d), href: d.url, marks });
  const cmdRow = (c: Command, marks: string[]): Row => ({ key: `cmd:${c.id}`, kind: 'command', title: c.title, hint: c.hint, marks });
  const resultRow = (r: Result, marks: string[]): Row => ({ key: `res:${r.id}`, kind: 'result', title: r.title, detail: r.detail, href: r.href, marks });

  /** Results from other features' sources, per query (async ones fill in later). */
  let sourceQ = '';
  let sourceHits: Scored[] = [];

  function querySources(q: string, toks: string[], phrase: string) {
    if (q === sourceQ) return;
    sourceQ = q;
    sourceHits = [];
    for (const s of ctx.commands.sources()) {
      const take = (list: Result[]) => {
        for (const r of list) {
          const sc = score(prepare(r, r.title, r.detail ?? ''), toks, phrase) || 50;
          sourceHits.push({ score: sc + 10, group: r.group ?? s.group, row: () => resultRow(r, toks) });
        }
      };
      try {
        const out = s.search(q);
        if (Array.isArray(out)) take(out);
        else
          void out.then(list => {
            if (sourceQ !== q || stopped) return;
            take(list);
            rerender();
          }, () => {});
      } catch (e) {
        console.warn('[b2c] search source', s.id, e);
      }
    }
  }

  /** Prepared commands, rebuilt when the registry changes or on open (recents). */
  let cmdPrepared: Prepared<Command>[] | null = null;
  function commandHits(toks: string[], phrase: string): Scored[] {
    const out: Scored[] = [];
    cmdPrepared ??= ctx.commands.commands().map(c => prepare(c, c.title, (c.keywords ?? []).join(' '), recentBoost(recent.indexOf(`cmd:${c.id}`)) - 4));
    for (const p of cmdPrepared) {
      const c = p.item;
      const s = score(p, toks, phrase);
      if (s > 0) out.push({ score: s, group: COMMAND_GROUP, row: () => cmdRow(c, toks) });
    }
    return out;
  }

  function group(scored: Scored[]): RowGroup[] {
    scored.sort((a, b) => b.score - a.score);
    const groups = new Map<string, RowGroup>();
    for (const s of scored) {
      let g = groups.get(s.group);
      if (!g) {
        if (groups.size >= MAX_GROUPS) continue;
        groups.set(s.group, (g = { label: s.group, rows: [] }));
      }
      if (g.rows.length < PER_GROUP) g.rows.push(s.row());
    }
    return [...groups.values()];
  }

  function home(): RowGroup[] {
    const recentRows: Row[] = [];
    const cmds = new Map(ctx.commands.commands().map(c => [`cmd:${c.id}`, c]));
    for (const k of recent) {
      const d = byKey.get(k);
      if (d) recentRows.push(docRow(d, []));
      else if (cmds.has(k)) recentRows.push(cmdRow(cmds.get(k)!, []));
      if (recentRows.length >= 6) break;
    }
    const t = now();
    const here = ctx.page.courseId;
    const list = [...courses.values()]
      .filter(c => courseBoost(c, t, null) > 0 || c.id === here)
      .sort((a, b) => (a.id === here ? -1 : b.id === here ? 1 : a.name.localeCompare(b.name)))
      .slice(0, 8)
      .map(c => byKey.get(`course:${c.id}:${c.id}`))
      .filter((d): d is Doc => !!d)
      .map(d => docRow(d, []));
    return [{ label: 'Recent', rows: recentRows }, { label: 'Courses', rows: list }];
  }

  function onQuery(q: string) {
    if (!palette) return;
    const toks = tokens(q);
    if (!toks.length) {
      sourceQ = '';
      palette.render(home(), byKey.size ? '' : refreshing ? '' : 'Type to search courses, work and settings');
      return;
    }
    const phrase = toks.join(' ');
    const hits: Hit<Doc>[] = getSearcher().search(q, 120);
    const scored: Scored[] = hits.map(h => ({ score: h.score, group: KIND_GROUP[h.item.kind], row: () => docRow(h.item, toks) }));
    scored.push(...commandHits(toks, phrase));
    querySources(q, toks, phrase);
    scored.push(...sourceHits);
    palette.render(group(scored), refreshing && !byKey.size ? 'Searching as the index builds…' : `No matches for “${q.trim()}”`);
  }

  function activate(row: Row, newTab: boolean) {
    recent = pushRecent(recent, row.key);
    void store?.putRecent(recent).catch(() => {});
    close();
    if (row.kind === 'command') {
      const c = ctx.commands.commands().find(x => `cmd:${x.id}` === row.key);
      if (c) Promise.resolve().then(() => c.run()).catch(e => console.error('[b2c] command', c.id, e));
      return;
    }
    if (!row.href) return;
    if (newTab) window.open(row.href, '_blank', 'noopener');
    else location.assign(row.href);
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  const offChange = ctx.commands.onChange(() => {
    sourceQ = '';
    cmdPrepared = null;
    rerender();
  });

  function open() {
    if (stopped) return;
    palette ??= createPalette({ onQuery, onActivate: activate, onClose: close });
    palette.open();
    writeState({ used: now() });
    sourceQ = '';
    cmdPrepared = null;
    // Paint the shell and whatever is in memory now; the index fills in.
    onQuery('');
    updateStatus();
    void chrome.storage.sync.get('palette.useDark').then(v => {
      builtinState.darkMode = v['palette.useDark'] as string | undefined;
    }, () => {});
    void ensureLoaded().then(() => {
      if (stopped) return;
      loadDone = true;
      reboost();
      if (isStale()) void runRefresh();
      updateStatus();
      if (palette?.isOpen) onQuery(palette.query);
    });
  }

  function close() {
    palette?.close();
  }

  return {
    toggle() {
      if (palette?.isOpen) close();
      else open();
    },
    open,
    close,
    /** One quiet background refresh (stale index in use); no UI. */
    async refreshQuietly() {
      await ensureLoaded();
      if (isStale()) await runRefresh();
    },
    stop() {
      stopped = true;
      unregister.forEach(u => u());
      offChange();
      palette?.destroy();
      palette = null;
      store?.close();
      store = null;
    },
  };
}
