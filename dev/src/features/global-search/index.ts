// global-search: ⌘K (Ctrl+K elsewhere) palette over a local index of every
// active course's modules, assignments, quizzes, pages, files, discussions and
// announcements, plus commands from ctx.commands.
//
// Weight (v2 budgets, lane brief): this definition is all that loads with
// main.js. Its start() only adds one keydown listener and reads one small
// localStorage entry. The runtime (run.ts → chunks/global-search.js: index,
// palette, built-in commands) is imported on the first ⌘K, or when an index
// that is in use has gone stale (one quiet background refresh per page load,
// throttled across tabs). A user who never presses ⌘K costs zero requests.

import { defineFeature } from '../../core/feature.ts';
import { bool } from '../../core/settings/schema.ts';

/** An index older than this is refreshed (on open, or quietly in the background). */
export const STALE_MS = 10 * 60_000;
/** Background refreshes stop when the palette hasn't been used for this long. */
export const IDLE_USER_MS = 14 * 86_400_000;
/** localStorage: { t: last complete refresh, used: last open } (ms). */
export const LS_STATE = 'b2c:search';
/** localStorage: when any tab last started a background refresh (ms). */
export const LS_BG = 'b2c:search:bg';

export const isMacPlatform = (platform: string) => /Mac|iPhone|iPad/.test(platform);

/** ⌘K on macOS, Ctrl+K elsewhere; no other modifiers. Layout-independent (code KeyK). */
export function isHotkey(e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>, mac: boolean): boolean {
  if (e.altKey || e.shiftKey) return false;
  if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return false;
  return e.code === 'KeyK' || e.key === 'k' || e.key === 'K';
}

export interface SearchState { t?: number; used?: number }

export function readState(ls: Pick<Storage, 'getItem'>): SearchState {
  try {
    const v = JSON.parse(ls.getItem(LS_STATE) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Should this page load start one quiet background refresh? */
export function wantsBackground(state: SearchState, lastBg: number, now: number): boolean {
  if (!state.t || !state.used) return false; // never built / never used: no work at all
  if (now - state.used > IDLE_USER_MS) return false;
  if (now - state.t < STALE_MS) return false;
  return now - lastBg >= STALE_MS;
}

type Runtime = Awaited<ReturnType<(typeof import('./run.ts'))['start']>>;

export default defineFeature({
  id: 'global-search',
  settings: {
    enabled: bool(true),
  },
  pages: 'all',
  start(ctx) {
    const mac = isMacPlatform(navigator.platform);
    let rt: Promise<Runtime> | null = null;
    let stopped = false;
    const load = () =>
      (rt ??= (import(/* @vite-ignore */ chrome.runtime.getURL('chunks/global-search.js')) as Promise<typeof import('./run.ts')>).then(m => m.start(ctx)));

    const onKey = (e: KeyboardEvent) => {
      if (!isHotkey(e, mac) || e.isComposing) return;
      // Rich-text editors own ⌘K (insert link).
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable) return;
      e.preventDefault();
      e.stopPropagation();
      void load().then(r => {
        if (!stopped) r.toggle();
      });
    };
    addEventListener('keydown', onKey, true);

    // One quiet background refresh per page load, only for an index in use
    // and stale, when the tab is visible and idle (Research: v2-weeks-search §C).
    let bgTimer: ReturnType<typeof setTimeout> | null = null;
    let idle: number | null = null;
    try {
      const now = ctx.now().getTime();
      if (wantsBackground(readState(localStorage), Number(localStorage.getItem(LS_BG)) || 0, now)) {
        const go = () => {
          idle = requestIdleCallback(() => {
            if (stopped || document.visibilityState !== 'visible') return;
            if (!wantsBackground(readState(localStorage), Number(localStorage.getItem(LS_BG)) || 0, ctx.now().getTime())) return;
            localStorage.setItem(LS_BG, String(ctx.now().getTime()));
            void load().then(r => {
              if (!stopped) void r.refreshQuietly();
            });
          }, { timeout: 10_000 });
        };
        // Jittered, so a class of students opening Canvas at 9:00 don't crawl at once.
        bgTimer = setTimeout(go, 3_000 + Math.random() * 7_000);
      }
    } catch {
      /* storage blocked: no background work */
    }

    return {
      stop() {
        stopped = true;
        removeEventListener('keydown', onKey, true);
        if (bgTimer) clearTimeout(bgTimer);
        if (idle !== null) cancelIdleCallback(idle);
        void rt?.then(r => r.stop());
        rt = null;
      },
    };
  },
});
