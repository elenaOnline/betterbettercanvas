// Hover preview (D12, design/spec/surfaces/better-todo.md §Hover preview).
//
// - Opens after the pointer rests on a title for --b2c-hover-delay (Design:
//   350 ms). Once one is open, moving to another title switches at once, with
//   no close/open flicker.
// - Closes when the pointer leaves both the title and the popover (a short
//   grace lets the pointer cross the gap into the popover).
// - Keyboard: Space on a focused row toggles it; Esc closes.
// - The fetch starts on pointer enter, not after the delay, so the text is
//   usually there when the delay ends. A spinner shows only after 150 ms.
// - Cached in memory here, and across loads by api.swr in chrome.storage.

import { rowMarksRead } from './rows.tsx';
import type { Row } from './logic.ts';

export interface PreviewContent {
  /** Sanitized description HTML; '' = none. */
  html: string;
  /** Extra header line, e.g. "Graded 18/20". */
  status?: string | null;
}

export interface PreviewDeps {
  row(key: string): Row | null;
  /** Header: title, course · due · points. */
  meta(row: Row): { title: string; sub: string; url: string | null };
  load(row: Row, cb: (c: PreviewContent) => void): Promise<void>;
  enabled(): boolean;
}

const GRACE_MS = 100;
const WARM_MS = 300;
const SPINNER_MS = 150;

export function createPreview(root: ShadowRoot, container: HTMLElement, deps: PreviewDeps) {
  const pop = document.createElement('div');
  pop.className = 'preview';
  pop.setAttribute('popover', 'manual');
  pop.id = 'b2c-todo-preview';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-live', 'polite');
  root.appendChild(pop);

  const cache = new Map<string, PreviewContent>();
  const loading = new Set<string>();
  let openKey: string | null = null;
  let wantKey: string | null = null;
  let anchor: HTMLElement | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let spinTimer: ReturnType<typeof setTimeout> | null = null;
  let closedAt = -Infinity;

  const delay = () => {
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--b2c-hover-delay'));
    return Number.isFinite(ms) ? ms : 350;
  };
  const clear = (t: ReturnType<typeof setTimeout> | null) => {
    if (t) clearTimeout(t);
  };
  const rowEl = (key: string) => container.querySelector<HTMLElement>(`li[data-key="${CSS.escape(key)}"]`);

  function prefetch(key: string) {
    if (cache.has(key) || loading.has(key)) return;
    const row = deps.row(key);
    if (!row) return;
    loading.add(key);
    deps
      .load(row, c => {
        cache.set(key, c);
        if (openKey === key) fill(key);
      })
      .catch(() => {
        if (!cache.has(key)) cache.set(key, { html: '' });
        if (openKey === key) fill(key);
      })
      .finally(() => loading.delete(key));
  }

  function fill(key: string) {
    const row = deps.row(key);
    if (!row) return;
    const m = deps.meta(row);
    const c = cache.get(key);
    clear(spinTimer);
    spinTimer = null;
    const head = document.createElement('div');
    head.className = 'pv-head';
    const t = document.createElement('div');
    t.className = 'pv-title';
    t.textContent = m.title;
    const sub = document.createElement('div');
    sub.className = 'pv-sub';
    sub.textContent = [m.sub, c?.status].filter(Boolean).join(' · ');
    head.append(t, sub);
    const body = document.createElement('div');
    body.className = 'pv-body';
    if (c === undefined) {
      body.classList.add('pending');
      spinTimer = setTimeout(() => body.classList.add('spin'), SPINNER_MS);
    } else if (c.html) body.innerHTML = c.html; // sanitized by sanitize.ts
    else {
      body.classList.add('none');
      body.textContent = 'No description.';
    }
    const parts: Node[] = [head, body];
    if (m.url) {
      const foot = document.createElement('a');
      foot.className = 'pv-open';
      foot.href = m.url;
      foot.textContent = 'Open';
      // CONTRACT.md §3: links whose navigation marks something read say so.
      if (document.documentElement.hasAttribute('data-b2c-agent') && rowMarksRead(row)) foot.setAttribute('data-b2c-marks-read', 'true');
      parts.push(foot);
    }
    pop.replaceChildren(...parts);
    requestAnimationFrame(() => {
      body.classList.toggle('clipped', body.scrollHeight > body.clientHeight + 1);
    });
    place();
  }

  function place() {
    if (!anchor) return;
    const li = anchor.closest('li') ?? anchor;
    const panel = container.getBoundingClientRect();
    const r = li.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const gap = 8;
    let left = panel.left - w - gap;
    let top = r.top - 8;
    if (left < gap) {
      // No room on the left (narrow window, panel stacked): below the row.
      left = Math.min(Math.max(gap, r.left), innerWidth - w - gap);
      top = r.bottom + gap;
    }
    top = Math.min(Math.max(gap, top), innerHeight - h - gap);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function show(key: string) {
    const el = rowEl(key);
    if (!el || !deps.row(key)) return;
    anchor?.removeAttribute('aria-describedby');
    anchor = el;
    openKey = key;
    if (!pop.matches(':popover-open')) pop.showPopover();
    el.setAttribute('aria-describedby', pop.id);
    fill(key);
  }

  function hide(now = false) {
    clear(showTimer);
    showTimer = null;
    const go = () => {
      hideTimer = null;
      clear(spinTimer);
      if (!openKey) return;
      anchor?.removeAttribute('aria-describedby');
      if (pop.matches(':popover-open')) pop.hidePopover();
      openKey = null;
      anchor = null;
      closedAt = performance.now();
    };
    clear(hideTimer);
    hideTimer = null;
    if (now) go();
    else hideTimer = setTimeout(go, GRACE_MS);
  }

  function enter(key: string) {
    if (!deps.enabled()) return;
    clear(hideTimer);
    hideTimer = null;
    if (wantKey === key && (openKey === key || showTimer)) return;
    wantKey = key;
    prefetch(key);
    clear(showTimer);
    showTimer = null;
    const warm = openKey !== null || performance.now() - closedAt < WARM_MS;
    if (warm) show(key);
    else
      showTimer = setTimeout(() => {
        showTimer = null;
        if (wantKey === key) show(key);
      }, delay());
  }

  function leave() {
    wantKey = null;
    hide();
  }

  const titleKey = (t: EventTarget | null) =>
    t instanceof Element && t.closest('[data-preview]') ? (t.closest<HTMLElement>('li[data-key]')?.dataset.key ?? null) : null;
  const inPop = (t: EventTarget | null) => t instanceof Node && pop.contains(t);

  const onOver = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const k = titleKey(e.target);
    if (k) enter(k);
  };
  const onOut = (e: PointerEvent) => {
    const from = titleKey(e.target);
    if (from && titleKey(e.relatedTarget) !== from && !inPop(e.relatedTarget)) leave();
  };
  const onPopOver = () => {
    clear(hideTimer);
    hideTimer = null;
  };
  const onPopOut = (e: PointerEvent) => {
    if (!inPop(e.relatedTarget) && titleKey(e.relatedTarget) !== openKey) leave();
  };
  const onScroll = (e: Event) => {
    if (openKey && !inPop(e.target)) hide(true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && openKey) {
      wantKey = null;
      hide(true);
    }
  };

  container.addEventListener('pointerover', onOver);
  container.addEventListener('pointerout', onOut);
  pop.addEventListener('pointerover', onPopOver);
  pop.addEventListener('pointerout', onPopOut);
  pop.addEventListener('keydown', onKey);
  document.addEventListener('keydown', onKey);
  addEventListener('scroll', onScroll, { passive: true, capture: true });

  return {
    /** Space on a focused row. */
    toggle(key: string) {
      if (openKey === key) {
        wantKey = null;
        hide(true);
        return;
      }
      wantKey = key;
      prefetch(key);
      show(key);
    },
    close() {
      wantKey = null;
      hide(true);
    },
    /** After a re-render: re-anchor, or close if the row is gone. */
    refresh() {
      if (!openKey) return;
      const el = rowEl(openKey);
      if (!el || !deps.row(openKey)) hide(true);
      else {
        anchor = el;
        place();
      }
    },
    destroy() {
      hide(true);
      clear(spinTimer);
      container.removeEventListener('pointerover', onOver);
      container.removeEventListener('pointerout', onOut);
      document.removeEventListener('keydown', onKey);
      removeEventListener('scroll', onScroll, { capture: true });
      pop.remove();
    },
    get openKey() {
      return openKey;
    },
  };
}

export type Preview = ReturnType<typeof createPreview>;
