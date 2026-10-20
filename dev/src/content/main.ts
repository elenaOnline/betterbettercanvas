// main.js: document_start, isolated world. Loads settings, keeps the pre-paint
// mirror current, and runs features for this page with live updates.

import { createCtx, type Ctx } from '../core/ctx.ts';
import { featureKeys, featureValues, isEnabled, mirrorOf, preloadRuntime, runtimeLoadMs, type AnyFeature, type Instance } from '../core/feature.ts';
import { applyMirror, forPath, mergeParts, writeMirror, type Mirror } from '../core/mirror.ts';
import { QUIZ_TAKING } from '../core/canvas/page.ts';
import { nextBoundaryMs } from '../core/schedule.ts';
import { allFeatures, schema } from '../core/registry.ts';
import { createStore, type Flat } from '../core/settings/store.ts';
import { probe } from '../core/probe.ts';
import { agentMirror, createAgentHook } from '../core/agent/hook.ts';
import { reportError } from '../features/diagnostics/client.ts';
import type { Phase } from '../features/diagnostics/model.ts';

const TEARDOWN = 'b2c:teardown';
const instanceId = Math.random().toString(36).slice(2);
const root = document.documentElement;

// An older instance (orphaned by an extension reload) is still on the page:
// ask it to clean up, then take over.
if (root.hasAttribute('data-b2c-instance')) document.dispatchEvent(new CustomEvent(TEARDOWN));
root.setAttribute('data-b2c-instance', instanceId);

// Listen for our own replacement *now*, synchronously: a newer instance can
// arrive while this one is still awaiting settings or a feature's start().
// After teardown nothing may start; `cleanups` holds what exists so far.
// Start fetching the runtime chunks of features the pre-paint state already
// shows as on (their gate attribute is set by boot.js from the mirror), before
// settings are even loaded. Wrong guesses only cost an unused fetch.
for (const f of allFeatures) {
  if (f.runtimeChunk && root.hasAttribute(`data-b2c-${f.id}`)) void preloadRuntime(f.id, f.runtimeChunk).catch(() => {});
}

let tornDown = false;
const cleanups: (() => void)[] = [];
document.addEventListener(
  TEARDOWN,
  () => {
    tornDown = true;
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch {
        /* orphaned: chrome.* may be gone */
      }
    }
  },
  { once: true },
);

const store = createStore(schema);
const running = new Map<string, Instance<unknown>>();
/** ms per feature start() (incl. lazy chunk load); reported by the health probe. */
const timings: Record<string, number> = {};
let ctx: Ctx | null = null;
let current: Flat = {};
let mirror: Mirror | null = null;
let condTimer: ReturnType<typeof setTimeout> | null = null;
let mediaOff: (() => void) | null = null;

const paused = (all: Flat) => all['core.paused'] === true;

function fail(feature: string, phase: Phase, e: unknown) {
  console.error(`[b2c] ${feature} ${phase} failed`, e);
  reportError(feature, e, ctx?.page.kind ?? 'other', phase, ctx?.now().getTime() ?? Date.now());
}

function computeMirror(all: Flat): Mirror {
  if (paused(all)) return mergeParts([]);
  const quiz = all['core.quizSafe'] === 'colours' ? allFeatures.filter(f => f.quizSafe) : [];
  // The agent contract's attribute is never in the quiz subset (§1).
  return mergeParts([...allFeatures.map(f => mirrorOf(f, all)), agentMirror(all)], quiz.map(f => mirrorOf(f, all)));
}

const here = (m: Mirror) => forPath(m, location.pathname, p => QUIZ_TAKING.test(p));

function syncMirror(all: Flat) {
  mirror = computeMirror(all);
  applyMirror(here(mirror), ctx?.now() ?? new Date());
  writeMirror(mirror);
  // Conditional attributes (scheduled / device dark mode) flip while the page
  // stays open.
  const reapply = () => mirror && applyMirror(here(mirror), ctx?.now() ?? new Date());
  if (condTimer) clearTimeout(condTimer);
  condTimer = null;
  mediaOff?.();
  mediaOff = null;
  const body = here(mirror);
  // One timer to the next window boundary (no polling); re-armed each time.
  const arm = () => {
    const ms = nextBoundaryMs(body.cond, ctx?.now() ?? new Date());
    condTimer = ms === null ? null : setTimeout(() => (reapply(), arm()), ms + 50);
  };
  arm();
  const mqls = body.cond.flatMap(c => ('media' in c.when ? [matchMedia(c.when.media)] : []));
  for (const q of mqls) q.addEventListener('change', reapply);
  if (mqls.length) mediaOff = () => mqls.forEach(q => q.removeEventListener('change', reapply));
}

// quiz-safe-mode: no feature code ever runs on a quiz-taking page.
const wants = (f: AnyFeature, all: Flat, c: Ctx) =>
  !paused(all) && c.page.kind !== 'quiz-taking' && !!f.start && isEnabled(f, all) && (f.pages === 'all' || f.pages.includes(c.page.kind));

async function startFeature(f: AnyFeature, all: Flat) {
  if (!ctx || tornDown || running.has(f.id)) return;
  try {
    // Timed for the weight budget (dev/budgets.json): includes loading the
    // feature's lazy chunk. Visible to tests as performance measures.
    const t0 = performance.now();
    const inst = (await f.start!(ctx, featureValues(f, all))) ?? { stop() {} };
    timings[f.id] = Math.round((performance.now() - t0) * 10) / 10;
    // Replaced while start() was in flight: undo at once, never register.
    if (tornDown) return inst.stop();
    running.set(f.id, inst as Instance<unknown>);
  } catch (e) {
    fail(f.id, 'start', e);
  }
}

function stopFeature(id: string) {
  const inst = running.get(id);
  running.delete(id);
  try {
    inst?.stop();
  } catch (e) {
    fail(id, 'stop', e);
  }
}

async function reconcile(all: Flat, changed: string[] | null) {
  if (!ctx) return;
  // Stops and updates are synchronous; starts run concurrently (a lazy chunk
  // load must not hold up every feature after it). Reconciles themselves stay
  // serialized by the queue in init().
  const starts: Promise<void>[] = [];
  for (const f of allFeatures) {
    const want = wants(f, all, ctx);
    const keys = featureKeys(f);
    const touched = changed === null || changed.includes('core.paused') || changed.some(k => keys.includes(k));
    const inst = running.get(f.id);
    if (!want) {
      if (inst) stopFeature(f.id);
    } else if (!inst) {
      starts.push(startFeature(f, all));
    } else if (touched) {
      if (inst.update) {
        try {
          inst.update(featureValues(f, all));
        } catch (e) {
          fail(f.id, 'update', e);
        }
      } else {
        stopFeature(f.id);
        starts.push(startFeature(f, all));
      }
    }
  }
  await Promise.all(starts);
}

async function init() {
  ctx = createCtx(store);
  const agent = createAgentHook(ctx);
  cleanups.push(() => {
    agent.stop();
    for (const id of [...running.keys()]) stopFeature(id);
    ctx?.dom.stopAll();
    if (condTimer) clearTimeout(condTimer);
    mediaOff?.();
  });

  const onMessage = (msg: { type?: string }, _s: unknown, reply: (r: unknown) => void) => {
    if (msg?.type === 'b2c:ping') reply(instanceId);
    if (msg?.type === 'b2c:health') {
      reply(ctx ? { ...probe(ctx.page, allFeatures, [...running.keys()], __B2C_BUILD_ID__), timings, loads: runtimeLoadMs } : null);
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  cleanups.push(() => chrome.runtime.onMessage.removeListener(onMessage));

  // Every settings load-and-apply goes through one queue: start() is async,
  // and a write touching both storage areas fires onChanged twice, so
  // unserialized reconciles could start a feature twice (and leak the first
  // instance) or apply updates out of order. Settings are re-read inside the
  // queue, and we subscribe before the first load so no change is missed.
  let queue: Promise<void> = Promise.resolve();
  const apply = (changed: string[] | null) => {
    queue = queue
      .then(async () => {
        if (tornDown) return;
        const all = await store.load();
        if (tornDown) return;
        current = all;
        syncMirror(all);
        agent.sync(all);
        await reconcile(all, changed);
      })
      .catch(e => fail('core', changed ? 'update' : 'init', e));
    return queue;
  };
  cleanups.push(store.subscribe((_all, changed) => void apply(changed)));
  await apply(null);
  // Every feature that wants this page has run start(). Invisible to users;
  // tests wait on it instead of guessing (performance timeline is per page).
  performance.mark('b2c:started');
  // Tell the toolbar this tab is live (undoes the "not allowed" grey icon).
  chrome.runtime.sendMessage({ type: 'b2c:running' }).catch(() => {});
}

init().catch(e => fail('core', 'init', e));
