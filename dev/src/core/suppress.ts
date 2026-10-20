// Per-tab, per-page suppression of mirror attributes (e.g. dark mode's "Show
// original on this page", dark-mode.md §2). Held in sessionStorage so boot.js
// can read it synchronously before first paint. Keyed by path, so it lapses
// as soon as the tab navigates to another Canvas page.
//
// Format: sessionStorage['b2c:suppress'] = {"<html attribute>": "<pathname>"}.
// Generic on purpose: core's applyMirror can drop any suppressed attribute.
// Keep this module tiny; boot.js may bundle it.

export const SUPPRESS_KEY = 'b2c:suppress';

type Map = Record<string, string>;

function read(store: Storage): Map {
  try {
    const raw = store.getItem(SUPPRESS_KEY);
    const m = raw ? (JSON.parse(raw) as unknown) : null;
    return m && typeof m === 'object' ? (m as Map) : {};
  } catch {
    return {};
  }
}

function write(store: Storage, m: Map): void {
  try {
    if (Object.keys(m).length) store.setItem(SUPPRESS_KEY, JSON.stringify(m));
    else store.removeItem(SUPPRESS_KEY);
  } catch {
    /* storage disabled: the override just doesn't persist */
  }
}

const isTop = () => {
  try {
    return typeof window === 'undefined' || window === window.top;
  } catch {
    return false;
  }
};

/** Attributes suppressed on `path`. Drops entries for other paths (they have lapsed). */
export function suppressedAttrs(path: string, store: Storage = sessionStorage): string[] {
  const m = read(store);
  const keep: Map = {};
  for (const [attr, p] of Object.entries(m)) if (p === path) keep[attr] = p;
  // Only the top page prunes: same-origin subframes (RCE editor, previews)
  // share the tab's sessionStorage but have their own paths.
  if (Object.keys(keep).length !== Object.keys(m).length && isTop()) write(store, keep);
  return Object.keys(keep);
}

export function setSuppressed(attr: string, on: boolean, path: string, store: Storage = sessionStorage): void {
  const m = read(store);
  if (on) m[attr] = path;
  else delete m[attr];
  write(store, m);
}
