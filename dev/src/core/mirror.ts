// The pre-paint mirror: a copy of the state that must apply before Canvas's
// first paint, kept in the Canvas origin's localStorage so boot.js can read it
// synchronously. chrome.storage stays the source of truth; main.js rewrites
// this whenever settings change. Keep this module tiny: boot.js bundles it.

import type { CondAttr, MirrorPart } from './feature.ts';
import { suppressedAttrs } from './suppress.ts';

export const MIRROR_KEY = 'b2c:mirror';
export const VARS_STYLE_ID = 'b2c-vars';
/** Infrastructure attributes on <html> that the mirror never owns. */
export const RESERVED_ATTRS = new Set(['data-b2c', 'data-b2c-instance', 'data-b2c-env']);

export interface MirrorBody {
  attrs: Record<string, string>;
  vars: Record<string, string>;
  cond: CondAttr[];
  /** Pre-paint CSS text by feature id. */
  sheets?: Record<string, string>;
}

export interface Mirror extends MirrorBody {
  v: 1;
  /** What applies on quiz-taking pages (quiz-safe-mode). */
  quiz?: MirrorBody;
}

function merge(parts: MirrorPart[]): MirrorBody {
  const m: MirrorBody = { attrs: {}, vars: {}, cond: [], sheets: {} };
  for (const p of parts) {
    Object.assign(m.attrs, p.attrs);
    Object.assign(m.vars, p.vars);
    Object.assign(m.sheets!, p.sheets);
    if (p.cond) m.cond.push(...p.cond);
  }
  return m;
}

export function mergeParts(parts: MirrorPart[], quizParts: MirrorPart[] = []): Mirror {
  return { v: 1, ...merge(parts), quiz: merge(quizParts) };
}

/** The body that applies at `path`: the quiz subset on quiz-taking routes. */
export function forPath(m: Mirror, path: string, isQuiz: (p: string) => boolean): MirrorBody {
  return isQuiz(path) ? m.quiz ?? { attrs: {}, vars: {}, cond: [] } : m;
}

export function readMirror(): Mirror | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Mirror;
    return m && m.v === 1 ? m : null;
  } catch {
    return null;
  }
}

export function writeMirror(m: Mirror): void {
  try {
    const raw = JSON.stringify(m);
    if (localStorage.getItem(MIRROR_KEY) !== raw) localStorage.setItem(MIRROR_KEY, raw);
  } catch {
    /* storage disabled: we lose only pre-paint, main.js still applies */
  }
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
};

/** Is `now` inside the daily window [start, end)? Windows may wrap midnight. */
export function inWindow(start: string, end: string, now: Date): boolean {
  const s = minutes(start), e = minutes(end), t = now.getHours() * 60 + now.getMinutes();
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export function holds(c: CondAttr, now: Date): boolean {
  const w = c.when;
  if ('media' in w) return typeof matchMedia === 'function' && matchMedia(w.media).matches;
  return inWindow(w.start, w.end, now);
}

/** Resolve conditional attrs against the clock and media into plain attrs. */
export function resolveAttrs(m: MirrorBody, now: Date): Record<string, string> {
  const attrs = { ...m.attrs };
  for (const c of m.cond ?? []) if (holds(c, now)) attrs[c.attr] = c.value;
  return attrs;
}

/**
 * Apply a mirror to <html>. Removes `data-b2c-*` attributes the mirror no
 * longer has, so it is also how live setting changes reach the page.
 */
export function applyMirror(m: MirrorBody, now = new Date(), root = document.documentElement): void {
  const attrs = resolveAttrs(m, now);
  // Per-tab, per-page overrides ("Show original on this page", sessionStorage).
  for (const a of suppressedAttrs(location.pathname)) delete attrs[a];
  for (const a of Array.from(root.attributes)) {
    if (a.name.startsWith('data-b2c-') && !(a.name in attrs) && !RESERVED_ATTRS.has(a.name)) {
      root.removeAttribute(a.name);
    }
  }
  for (const [k, v] of Object.entries(attrs)) if (root.getAttribute(k) !== v) root.setAttribute(k, v);

  let css = '';
  for (const [k, v] of Object.entries(m.vars)) css += `${k}:${v};`;
  let style = document.getElementById(VARS_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = VARS_STYLE_ID;
    // At document_start there is no <head> yet; <html> accepts the node and
    // the browser applies it all the same.
    (document.head ?? root).appendChild(style);
  }
  const text = css ? `:root{${css}}` : '';
  if (style.textContent !== text) style.textContent = text;

  // Pre-paint sheets: one <style> per feature, created, updated or removed.
  const sheets = m.sheets ?? {};
  for (const el of Array.from(document.querySelectorAll<HTMLStyleElement>('style[data-b2c-sheet]'))) {
    if (!(el.dataset.b2cSheet! in sheets)) el.remove();
  }
  for (const [id, cssText] of Object.entries(sheets)) {
    let el = document.querySelector<HTMLStyleElement>(`style[data-b2c-sheet="${id}"]`);
    if (!el) {
      el = document.createElement('style');
      el.setAttribute('data-b2c-sheet', id);
      el.setAttribute(`data-b2c-${id}`, '');
      (document.head ?? root).appendChild(el);
    }
    if (el.textContent !== cssText) el.textContent = cssText;
  }
}
