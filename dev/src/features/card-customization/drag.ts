// Drag to reorder (card-customization.md): press on a card's hero and drag.
// The other cards move to make room (180 ms), a 2 px insertion bar marks the
// drop point, Esc cancels, and on drop the order is written to Canvas.
// Everything visual goes through the CSS `order` mechanism Move uses; Canvas's
// React-owned DOM is never reordered.

import { widgetHost } from '../../core/dom.ts';

export interface DragHost {
  /** Visible course ids in the order she sees them. */
  order(): string[];
  /** The visible card element for a course id. */
  cardEl(id: string): HTMLElement | null;
  /** Show this order (animated unless reduced motion). */
  apply(ids: string[]): void;
  /** Write the order to Canvas (with rollback to `before` on failure). */
  commit(next: string[], before: string[]): void;
}

const THRESHOLD = 6;

const BAR_CSS = `:host { all: initial; position: fixed; z-index: 10002; width: 2px; background: var(--b2c-w-link, #0374b5); pointer-events: none; }`;

/** Where the dragged card should go, given the pointer and the other cards' boxes. */
export function dropIndex(order: readonly string[], dragged: string, rects: ReadonlyMap<string, { left: number; top: number; right: number; bottom: number }>, x: number, y: number): number {
  const others = order.filter(id => id !== dragged);
  // The card under the pointer (rows first, then columns), else the nearest one.
  let best = -1, bestD = Infinity;
  others.forEach((id, k) => {
    const r = rects.get(id);
    if (!r) return;
    const cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom));
    const d = (x - cx) ** 2 + (y - cy) ** 2 * 4; // prefer the same row
    if (d < bestD) (bestD = d), (best = k);
  });
  if (best < 0) return order.indexOf(dragged);
  const r = rects.get(others[best]!)!;
  return x < (r.left + r.right) / 2 ? best : best + 1;
}

/** A card's box where layout puts it, ignoring a glide (FLIP transform) in progress. */
export function layoutRect(el: HTMLElement): DOMRect {
  const r = el.getBoundingClientRect();
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return r;
  const m = new DOMMatrixReadOnly(t);
  return new DOMRect(r.left - m.m41, r.top - m.m42, r.width, r.height);
}

export function withAt(order: readonly string[], id: string, index: number): string[] {
  const rest = order.filter(x => x !== id);
  rest.splice(Math.max(0, Math.min(rest.length, index)), 0, id);
  return rest;
}

/** Make one card's hero a drag handle. Returns a detach function. */
export function attachDrag(card: HTMLElement, courseId: string, handle: HTMLElement, host: DragHost): () => void {
  let start: { x: number; y: number; pointerId: number } | null = null;
  let dragging = false;
  let before: string[] = [];
  let current: string[] = [];
  let bar: HTMLElement | null = null;

  const placeBar = () => {
    const el = host.cardEl(courseId);
    if (!bar || !el) return;
    const r = layoutRect(el);
    const gap = parseFloat(getComputedStyle(el).marginLeft) || 0;
    bar.style.left = `${Math.round(r.left - Math.max(2, gap / 2) - 1)}px`;
    bar.style.top = `${Math.round(r.top)}px`;
    bar.style.height = `${Math.round(r.height)}px`;
  };

  const suppressClick = () => {
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', stop, { capture: true }), 0);
  };

  const finish = (commit: boolean) => {
    removeEventListener('pointermove', onMove, true);
    removeEventListener('pointerup', onUp, true);
    removeEventListener('pointercancel', onCancel, true);
    removeEventListener('keydown', onKey, true);
    const wasDragging = dragging;
    dragging = false;
    start = null;
    card.removeAttribute('data-b2c-dragging');
    document.documentElement.removeAttribute('data-b2c-card-dragging');
    bar?.remove();
    bar = null;
    if (!wasDragging) return;
    const changed = current.join() !== before.join();
    if (commit && changed) host.commit(current, before);
    else if (changed) host.apply(before);
  };

  const onMove = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.pointerId || cancelled) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return;
      dragging = true;
      before = host.order();
      current = before;
      card.setAttribute('data-b2c-dragging', '');
      document.documentElement.setAttribute('data-b2c-card-dragging', '');
      bar = widgetHost('card-drop-bar', BAR_CSS).host;
      document.body.appendChild(bar);
      placeBar();
    }
    e.preventDefault();
    const rects = new Map<string, DOMRect>();
    for (const id of current) {
      const el = host.cardEl(id);
      if (el) rects.set(id, layoutRect(el));
    }
    const next = withAt(current, courseId, dropIndex(current, courseId, rects, e.clientX, e.clientY));
    if (next.join() !== current.join()) {
      current = next;
      host.apply(next);
    }
    requestAnimationFrame(placeBar);
  };

  let cancelled = false;
  const onUp = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.pointerId) return;
    // After a drag (or an Esc-cancelled one) the release must not "click" the hero.
    if (dragging || cancelled) suppressClick();
    cancelled = false;
    finish(true);
  };
  const onCancel = () => {
    cancelled = false;
    finish(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !dragging) return;
    e.preventDefault();
    e.stopPropagation();
    // Put everything back now, but keep watching for the release.
    dragging = false;
    cancelled = true;
    card.removeAttribute('data-b2c-dragging');
    document.documentElement.removeAttribute('data-b2c-card-dragging');
    bar?.remove();
    bar = null;
    if (current.join() !== before.join()) host.apply(before);
    current = before;
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary || start) return;
    start = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onCancel, true);
    addEventListener('keydown', onKey, true);
  };
  // Canvas marks cards draggable (its own HTML5 drag) and images are draggable
  // by default: either would steal a gesture that started on the hero.
  const noNative = (e: DragEvent) => {
    if (start) e.preventDefault();
  };
  handle.addEventListener('pointerdown', onDown);
  card.addEventListener('dragstart', noNative, true);
  return () => {
    handle.removeEventListener('pointerdown', onDown);
    card.removeEventListener('dragstart', noNative, true);
    finish(false);
  };
}
