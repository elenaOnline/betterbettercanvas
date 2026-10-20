// The b²c side panel column (design/spec/surfaces/_dashboard.md §5): one
// light-DOM <b2c-side-panel> per dashboard, holding each panel feature's
// shadow host in order (To do 10, Notes 20, GPA 30). Works on the classic
// dashboard (#right-side-wrapper) and the new dashboard's Courses tab, and
// puts itself back if Canvas's React re-render drops it.
//
// Shared by every panel feature (better-todo, dashboard-notes,
// gpa-calculator). A feature that mounts here must also put
// SIDE_PANEL_MIRROR in its mirror() so the column is reserved pre-paint
// (html[data-b2c-side], styled in src/content/base.css).

import type { Dom } from './dom.ts';

export const SIDE_HOSTS = {
  classic: '#right-side-wrapper',
  courses: '[data-testid="courses-tab-content"]',
} as const;

/** Spread into a panel feature's mirror attrs: `attrs: { ...SIDE_PANEL_MIRROR }`. */
export const SIDE_PANEL_MIRROR = { 'data-b2c-side': '' } as const;

export const PANEL_TAG = 'b2c-side-panel';
const SLOT_TAG = 'b2c-panel-slot';

// ── Layout memory: no section may move another ──────────────────────────────
// Panel features mount at different times (to-do waits for its cache, GPA for
// courses). Without care, a section mounting or filling above another pushes
// it down. So the column remembers each section's last height (per dashboard
// kind) and, the moment it's created, lays out placeholder slots in order at
// those heights. A section mounting takes its slot's place and keeps that
// height until its own content has rendered (RELEASE_MS); only a real change
// in content then moves what's below, once.
const MEM_KEY = 'b2c:panel-layout';
const RELEASE_MS = 1200;
const STALE_SLOT_MS = 3000;
type Memory = Record<string, Record<string, number>>;
const kindOf = (anchor: Element) => (anchor.matches(SIDE_HOSTS.classic) ? 'classic' : 'courses');

function readMem(): Memory {
  try {
    return JSON.parse(localStorage.getItem(MEM_KEY) ?? '{}') as Memory;
  } catch {
    return {};
  }
}
function writeMem(kind: string, order: number, height: number | null) {
  try {
    const m = readMem();
    const k = (m[kind] ??= {});
    if (height === null) delete k[order];
    else k[order] = Math.round(height);
    localStorage.setItem(MEM_KEY, JSON.stringify(m));
  } catch {
    /* memory is an optimisation */
  }
}

function column(anchor: Element): HTMLElement {
  let col = anchor.querySelector<HTMLElement>(`:scope > ${PANEL_TAG}`);
  if (!col) {
    col = document.createElement(PANEL_TAG);
    col.setAttribute('role', 'complementary');
    col.setAttribute('aria-label', 'b²c');
    const kind = kindOf(anchor);
    const remembered = Object.entries(readMem()[kind] ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
    for (const [order, h] of remembered) {
      const slot = document.createElement(SLOT_TAG);
      slot.dataset.b2cOrder = order;
      slot.style.cssText = `display:block;height:${h}px`;
      slot.setAttribute('aria-hidden', 'true');
      col.appendChild(slot);
    }
    if (remembered.length) {
      // A remembered section that never mounts (turned off elsewhere) gives its
      // space back and is forgotten.
      const c = col;
      setTimeout(() => {
        for (const slot of Array.from(c.querySelectorAll<HTMLElement>(`:scope > ${SLOT_TAG}`))) {
          writeMem(kind, Number(slot.dataset.b2cOrder), null);
          slot.remove();
        }
        dropIfEmpty(c);
      }, STALE_SLOT_MS);
    }
    if (anchor.matches(SIDE_HOSTS.classic)) anchor.prepend(col);
    else anchor.appendChild(col);
  }
  return col;
}

/** Remove a b²c column left empty (e.g. after the host moved to another anchor). */
function dropIfEmpty(el: Element | null) {
  if (el && el.tagName.toLowerCase() === PANEL_TAG && !el.children.length) el.remove();
}

/**
 * The classic right column only on the classic dashboard: the new (widget)
 * dashboard also ships an empty #right-side-wrapper, and mounting there first
 * would flash the panel in the wrong place before the Courses tab renders.
 * Classic has #dashboard_header_container (research/canvas-surface.md §1);
 * the widget dashboard doesn't. #content precedes #right-side-wrapper, so it
 * is already parsed when the wrapper appears.
 */
function eligible(anchor: Element): boolean {
  if (!anchor.matches(SIDE_HOSTS.classic)) return true;
  return !!document.getElementById('dashboard_header_container') && !document.querySelector(SIDE_HOSTS.courses);
}

function place(col: HTMLElement, host: HTMLElement, order: number) {
  host.dataset.b2cOrder = String(order);
  const prev = host.parentElement;
  const slot = col.querySelector<HTMLElement>(`:scope > ${SLOT_TAG}[data-b2c-order="${order}"]`);
  if (slot) {
    // Take the slot's place and height until our content has rendered.
    host.style.minHeight = slot.style.height;
    slot.replaceWith(host);
    setTimeout(() => host.style.removeProperty('min-height'), RELEASE_MS);
    if (prev !== col) dropIfEmpty(prev);
    return;
  }
  const next = Array.from(col.children).find(c => c !== host && Number((c as HTMLElement).dataset.b2cOrder ?? 0) > order);
  if (host.parentElement === col && host.nextElementSibling === (next ?? null)) return;
  col.insertBefore(host, next ?? null);
  if (prev !== col) dropIfEmpty(prev);
}

/**
 * Keep `host` in the side panel on every dashboard anchor that appears.
 * `onMount(el)` / `onUnmount()` fire as the host is attached and detached.
 */
export function mountInSidePanel(dom: Dom, host: HTMLElement, order: number, hooks: { onMount?(): void; onUnmount?(): void } = {}): () => void {
  let current: Element | null = null;
  const off = dom.each(`${SIDE_HOSTS.classic}, ${SIDE_HOSTS.courses}`, anchor => {
    // Courses-tab content inside a classic page can't happen; on the classic
    // dashboard the right column is the only anchor.
    if (!eligible(anchor)) return;
    const attach = () => {
      if (!anchor.isConnected) return;
      place(column(anchor), host, order);
    };
    attach();
    current = anchor;
    hooks.onMount?.();
    // Remember our natural height for the next load's placeholder.
    const kind = kindOf(anchor);
    const ro = new ResizeObserver(() => {
      if (host.isConnected && !host.style.minHeight) writeMem(kind, order, host.getBoundingClientRect().height);
    });
    ro.observe(host);
    // React may drop foreign children when it re-renders the container.
    const mo = new MutationObserver(() => {
      if (!host.isConnected || host.parentElement?.parentElement !== anchor) attach();
    });
    mo.observe(anchor, { childList: true });
    return () => {
      mo.disconnect();
      ro.disconnect();
      writeMem(kind, order, null); // turned off: don't hold space next time
      const col = host.parentElement;
      host.remove();
      dropIfEmpty(col);
      if (current === anchor) {
        current = null;
        hooks.onUnmount?.();
      }
    };
  });
  return off;
}
