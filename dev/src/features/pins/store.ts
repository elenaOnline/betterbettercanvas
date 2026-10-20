// pins runtime, part 1: the resolution store (one snapshot of Canvas data per
// page, shared by the dock, the editor and ⌘K), list writes, and the ⌘K hooks.

import { ApiError } from '../../core/canvas/api.ts';
import { applyPlannerPatch, type Module, type ModuleItem } from '../../core/canvas/data.ts';
import type { Ctx } from '../../core/ctx.ts';
import type { Result } from '../../core/commands.ts';
import { acquireToast, showToast } from '../../core/toast.ts';
import { suggest, type Suggestion } from './capture.ts';
import type { PinSettings } from './index.ts';
import { MAX_PINS, isPin, newId, pinCourse, targetSig, type Pin, type Target } from './model.ts';
import { defaultLabel, emptySnapshot, needKey, needs, resolve, type Need, type Resolved, type Snapshot } from './resolve.ts';
import { dayOf } from './weeks.ts';

export type GetS = () => PinSettings;

const UPCOMING = { thu: 3, fri: 4, never: 7 } as const;
/** Settings that shape resolution, copied onto the shared snapshot. */
export const tune = (store: PinStore, s: PinSettings) => (store.snap.upcomingFrom = UPCOMING[s.upcomingFrom]);

// ── Last resolutions, read synchronously so the dock paints with real links at once ──

const LAST_KEY = 'b2c:pins:last';
type Last = Record<string, { sig: string; day: number; r: Resolved }>;

function readLast(): Last {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Last;
  } catch {
    return {};
  }
}

// ── The store: one snapshot of Canvas data per page, shared by dock, editor and ⌘K ──

export interface PinStore {
  snap: Snapshot;
  ensure(ns: Need[]): void;
  /** Resolves once each need has its first answer (cache or network), or after `ms`. */
  ready(ns: Need[], ms: number): Promise<void>;
  resolveAll(pins: readonly Pin[]): Map<string, Resolved>;
  resolveOne(pin: Pin): Resolved;
  onChange(cb: () => void): () => void;
  dispose(): void;
}

const stores = new WeakMap<Ctx, PinStore>();
export const storeFor = (ctx: Ctx) => stores.get(ctx) ?? createStore(ctx);

function createStore(ctx: Ctx): PinStore {
  const snap = emptySnapshot(ctx.now());
  const firsts = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  let last = readLast();
  let queued = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const changed = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      snap.now = ctx.now();
      listeners.forEach(l => l());
    });
  };

  void ctx.env().then(e => {
    if (e?.TIMEZONE && e.TIMEZONE !== snap.tz) {
      snap.tz = e.TIMEZONE;
      changed();
    }
  });
  const offPatch = ctx.data.onPlannerPatch(p => {
    if (!snap.planner) return;
    snap.planner = applyPlannerPatch(snap.planner, p);
    changed();
  });

  // Big courses: Canvas leaves `items` out of the module list when it's too long.
  // Fetch those modules' items (only for a course being resolved, only when
  // missing), and publish the list once every missing module has an answer
  // (cache or network), so resolution never runs on half the evidence.
  const itemsKnown = new Map<string, ModuleItem[]>(); // "<course>:<module>"
  const itemsAsked = new Set<string>();
  const latest = new Map<string, () => void>(); // per course: re-merge the newest module list
  function withItems(course: string, mods: Module[], publish: (m: Module[]) => void) {
    const k = (m: Module) => `${course}:${m.id}`;
    const missing = () => mods.filter(m => m.items === undefined && !itemsKnown.has(k(m)));
    const settle = () => {
      if (missing().length) return;
      latest.delete(course);
      publish(mods.map(m => (m.items !== undefined ? m : { ...m, items: itemsKnown.get(k(m)) ?? [] })));
    };
    latest.set(course, settle);
    if (!missing().length) return settle();
    for (const m of missing()) {
      const key = k(m);
      if (itemsAsked.has(key)) continue;
      itemsAsked.add(key);
      const got = (items: ModuleItem[]) => {
        itemsKnown.set(key, items);
        latest.get(course)?.();
        // Fresh items after publishing (stale-while-revalidate): re-resolve.
        if (!latest.has(course) && snap.modules[course]) {
          snap.modules[course] = snap.modules[course]!.map(x => (`${course}:${x.id}` === key ? { ...x, items } : x));
          changed();
        }
      };
      ctx.data.moduleItems(course, m.id, got).catch(() => {
        if (!itemsKnown.has(key)) got([]);
      });
    }
  }

  function ensure(ns: Need[]) {
    for (const n of ns) {
      const key = needKey(n);
      if (firsts.has(key)) continue;
      let first!: () => void;
      firsts.set(key, new Promise<void>(r => (first = r)));
      const got = <T>(apply: (d: T) => void) => (d: T) => {
        apply(d);
        first();
        changed();
      };
      let run: Promise<unknown> = Promise.resolve();
      let failed: (e: unknown) => void = () => {};
      switch (n.kind) {
        case 'courses':
          run = ctx.data.courses(got(d => (snap.courses = d)));
          failed = () => (snap.courses ??= []);
          break;
        case 'modules':
          run = ctx.data.modules(n.course, d =>
            withItems(n.course, d, full => {
              snap.modules[n.course] = full;
              first();
              changed();
            }),
          );
          failed = () => (snap.modules[n.course] ??= []);
          break;
        case 'pages':
          run = ctx.data.pages(n.course, got(d => (snap.pages[n.course] = d)));
          failed = () => (snap.pages[n.course] ??= []);
          break;
        case 'files':
          run = ctx.data.files(n.course, got(d => (snap.files[n.course] = d)));
          // Files tab hidden: Canvas answers 401/403 (sometimes 404).
          failed = e => (snap.files[n.course] = e instanceof ApiError && [401, 403, 404].includes(e.status) ? 'hidden' : snap.files[n.course] ?? []);
          break;
        case 'planner':
          run = ctx.data.plannerItems(got(d => (snap.planner = d)), { now: ctx.now() });
          failed = () => (snap.planner ??= []);
          break;
        case 'colors':
          run = ctx.data.colors(got(d => (snap.colors = d)));
          failed = () => (snap.colors ??= {});
          break;
      }
      run.catch(e => failed(e)).finally(() => {
        first();
        changed();
      });
    }
  }

  const ready = async (ns: Need[], ms: number) => {
    ensure(ns);
    const all = Promise.all(ns.map(n => firsts.get(needKey(n))));
    await Promise.race([all, new Promise(r => setTimeout(r, ms))]);
  };

  function resolveOne(pin: Pin): Resolved {
    const r = resolve(pin, snap);
    if (!r.pending) return r;
    const prev = last[pin.id];
    return prev && prev.sig === targetSig(pin.target) ? { ...prev.r, pending: true } : r;
  }

  function resolveAll(pins: readonly Pin[]) {
    const out = new Map<string, Resolved>();
    let dirty = false;
    const day = dayOf(snap.now, snap.tz);
    for (const p of pins) {
      const r = resolveOne(p);
      out.set(p.id, r);
      if (r.pending) continue;
      const sig = targetSig(p.target);
      const prev = last[p.id];
      if (!prev || prev.sig !== sig || prev.day !== day || JSON.stringify(prev.r) !== JSON.stringify(r)) {
        last = { ...last, [p.id]: { sig, day, r } };
        dirty = true;
      }
    }
    if (dirty) {
      // Forget pins that no longer exist.
      const ids = new Set(pins.map(p => p.id));
      if (pins.length) for (const k of Object.keys(last)) if (!ids.has(k)) delete last[k];
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(LAST_KEY, JSON.stringify(last));
        } catch {
          /* an optimisation */
        }
      }, 50);
    }
    return out;
  }

  const store: PinStore = {
    snap,
    ensure,
    ready,
    resolveAll,
    resolveOne,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      offPatch();
      listeners.clear();
      stores.delete(ctx);
    },
  };
  stores.set(ctx, store);
  return store;
}

// ── Writing the list ──

export async function saveList(ctx: Ctx, list: Pin[]) {
  await ctx.set({ 'pins.list': list });
}

let releaseToast: (() => void) | null = null;
export function toast(o: Parameters<typeof showToast>[0]) {
  releaseToast ??= acquireToast();
  showToast(o);
}

export async function addPin(ctx: Ctx, getS: GetS, pin: Pin): Promise<boolean> {
  const list = pinsOf(getS());
  if (list.some(p => targetSig(p.target) === targetSig(pin.target))) {
    toast({ message: 'Already pinned', ms: 3000 });
    return false;
  }
  if (list.length >= MAX_PINS) {
    toast({ message: `You can keep up to ${MAX_PINS} pins`, ms: 4000 });
    return false;
  }
  await saveList(ctx, [...list, pin]);
  toast({
    message: `Pinned “${pin.label}”`,
    action: { label: 'Undo', undo: true, run: () => void saveList(ctx, pinsOf(getS()).filter(p => p.id !== pin.id)) },
  });
  return true;
}

async function labelFor(ctx: Ctx, t: Target, fallback: string): Promise<string> {
  if (t.kind === 'url') return fallback;
  const store = storeFor(ctx);
  await store.ready([{ kind: 'courses' }], 300);
  return defaultLabel(t, store.snap.courses).trim() || fallback;
}

/** Pin a suggestion for this page. */
export async function pinSuggestion(ctx: Ctx, getS: GetS, g: Suggestion): Promise<void> {
  const label = await labelFor(ctx, g.target, g.label);
  await addPin(ctx, getS, { id: newId(), label: label.slice(0, 80), target: g.target });
}

/** ⌘K: "Pin this page" ('page') or "Pin this week's module in this course" ('week'). */
export async function pinHere(ctx: Ctx, getS: GetS, which: 'page' | 'week'): Promise<void> {
  const sug = suggest(location.pathname, location.search, document.title);
  const isWeek = (g: Suggestion) => g.target.kind === 'module';
  const g = which === 'week' ? sug.find(isWeek) : (sug.find(x => !isWeek(x)) ?? sug[0]);
  if (g) await pinSuggestion(ctx, getS, g);
}

/** The stored list, keeping only well-formed pins (index.ts checks only the shape). */
export const pinsOf = (s: PinSettings): Pin[] => s.list.filter(isPin);

/** Pins shown on this page: on a course page, that course's (and course-less) ones unless scope is 'all'. */
export function visible(ctx: Ctx, s: PinSettings): Pin[] {
  const c = ctx.page.courseId;
  const all = pinsOf(s);
  if (ctx.page.kind === 'dashboard' || !c || s.scope === 'all') return all;
  return all.filter(p => {
    const pc = pinCourse(p);
    return pc === null || pc === c;
  });
}

// ── ⌘K results ──

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

function resultFor(p: Pin, r: Resolved): Result {
  const what = r.title && r.title !== p.label ? r.title : '';
  return { id: `pin:${p.id}`, title: p.label, detail: [what, r.why ?? r.detail].filter(Boolean).join(' · '), href: r.href, group: 'Pins' };
}

export async function searchPins(ctx: Ctx, getS: GetS, q: string): Promise<Result[]> {
  const list = pinsOf(getS());
  const store = storeFor(ctx);
  await store.ready(list.flatMap(p => needs(p.target)), 120);
  tune(store, getS());
  const rs = store.resolveAll(list);
  const w = words(q);
  return list
    .map(p => resultFor(p, rs.get(p.id)!))
    .filter(r => {
      const hay = `${r.title} ${r.detail ?? ''}`.toLowerCase();
      return w.every(x => hay.includes(x));
    });
}

/** Release page-level resources when the feature stops. */
export function dispose(ctx: Ctx) {
  stores.get(ctx)?.dispose();
  releaseToast?.();
  releaseToast = null;
}

