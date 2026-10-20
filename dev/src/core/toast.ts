// One undo toast for every dashboard feature (cards, to-do, …), bottom-left
// of the viewport, so one Undo and one ⌘Z serve them all.
// Shadow-rooted; also the polite live region that announces actions.

import { widgetHost } from './dom.ts';

/** localStorage key: the one-time "saved to Canvas" planner-sync hint, shared by all features. */
export const SYNC_HINT_KEY = 'b2c:sync-hint';

const STYLE = `
:host { all: initial; position: fixed; left: 16px; bottom: 16px; z-index: 10000; font-family: var(--b2c-font-canvas, inherit); }
.t { display: none; align-items: center; gap: 12px; min-height: 40px; padding: 8px 8px 8px 14px; border-radius: var(--b2c-radius-md, 2px);
  background: #2d3b45; color: #fff; font-size: 14px; line-height: 1.3; box-shadow: 0 4px 12px rgba(0,0,0,.2); max-width: 420px; }
.t.on { display: flex; }
.msg { flex: 1; }
.sub { display: block; font-size: 12px; opacity: .8; margin-top: 2px; }
button { font: inherit; font-weight: 600; color: #8fd0ff; background: none; border: 0; padding: 6px 8px; border-radius: var(--b2c-radius-sm, 2px); cursor: pointer; }
button:hover { background: rgba(255,255,255,.1); }
button:focus-visible { outline: 2px solid #8fd0ff; outline-offset: 1px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;

export interface ToastOpts {
  message: string;
  sub?: string;
  action?: { label: string; run: () => void; /** ⌘Z triggers it */ undo?: boolean };
  /** Spoken through the live region (defaults to message). */
  announce?: string;
  ms?: number;
}

let host: HTMLElement | null = null;
let box: HTMLElement | null = null;
let live: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let users = 0;
let current: ToastOpts | null = null;

function ensure() {
  if (host) return;
  const w = widgetHost('toast', STYLE);
  host = w.host;
  box = document.createElement('div');
  box.className = 't';
  box.setAttribute('role', 'status');
  live = document.createElement('div');
  live.className = 'sr';
  live.setAttribute('aria-live', 'polite');
  w.root.append(box, live);
  document.body.appendChild(host);
}

/** Features that may toast call acquire() on start and release() on stop. */
export function acquireToast(): () => void {
  users++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--users === 0) {
      if (timer) clearTimeout(timer);
      host?.remove();
      host = box = live = null;
      current = null;
    }
  };
}

export function showToast(o: ToastOpts): void {
  ensure();
  current = o;
  box!.replaceChildren();
  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.textContent = o.message;
  if (o.sub) {
    const s = document.createElement('span');
    s.className = 'sub';
    s.textContent = o.sub;
    msg.appendChild(s);
  }
  box!.appendChild(msg);
  if (o.action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.action.label;
    const run = o.action.run;
    b.addEventListener('click', () => {
      hideToast();
      run();
    });
    box!.appendChild(b);
  }
  box!.classList.add('on');
  live!.textContent = '';
  // A fresh text node after clearing makes screen readers re-announce.
  queueMicrotask(() => live && (live.textContent = o.announce ?? o.message));
  if (timer) clearTimeout(timer);
  timer = setTimeout(hideToast, o.ms ?? 6000);
}

export function hideToast(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  box?.classList.remove('on');
}

/** The toast's undo action, if one is showing (for ⌘Z). */
export function toastUndo(): (() => void) | null {
  const a = current?.action?.undo ? current.action.run : null;
  if (!a) return null;
  return () => {
    hideToast();
    a();
  };
}
