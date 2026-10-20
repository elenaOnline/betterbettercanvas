// "Set grade goal…" from a dashboard card's ⋮ menu (design: grade-goals.md
// "Where it lives" 3): the same Goal box, in a small popover anchored to the
// menu button. Self-contained: the grade-goals feature itself only runs on the
// Grades page, so this reads and writes the goals setting directly.

import type { Ctx } from '../../core/ctx.ts';
import { widgetHost } from '../../core/dom.ts';
import { mountGoalBox } from './box.ts';
import { isGoalMap, type GoalMap } from './model.ts';
import { css, popoverCss } from './style.ts';

const KEY = 'grade-goals.goals';
const WIDTH = 300;

let current: { close(): void } | null = null;

/**
 * Open the Goal box for `courseId` as a popover under `anchor` (the ⋮ menu
 * button). Closes on Escape, an outside click, or when called again.
 * Returns a function that closes it. Only one popover is open at a time.
 * The caller decides whether to offer the item (hide it when `grade-goals.enabled` is off).
 */
export function openGoalPopover(ctx: Ctx, courseId: string, anchor: HTMLElement): () => void {
  current?.close();

  let goals: GoalMap = {};
  const { host, root } = widgetHost('grade-goal-popover', css + popoverCss);
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', 'Grade goal');
  host.style.width = `${WIDTH}px`;

  const place = () => {
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - WIDTH, document.documentElement.clientWidth - WIDTH - 8)) + window.scrollX;
    host.style.top = `${r.bottom + window.scrollY + 4}px`;
    host.style.left = `${left}px`;
  };

  const box = mountGoalBox(ctx, courseId, root, {
    goals: () => goals,
    save: next => {
      goals = next;
      box.refresh();
      void ctx.set({ [KEY]: next });
    },
  });

  // Current goals: read once, then follow storage (another tab, or the Grades page).
  void chrome.storage.local.get(KEY).then(r => {
    if (isGoalMap(r[KEY])) goals = r[KEY];
    box.refresh();
  });
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && KEY in changes && isGoalMap(changes[KEY]!.newValue)) {
      goals = changes[KEY]!.newValue;
      box.refresh();
    }
  };
  chrome.storage.onChanged.addListener(onChanged);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    try { chrome.storage.onChanged.removeListener(onChanged); } catch { /* orphaned */ }
    box.stop();
    host.remove();
    if (current === handle) current = null;
  };
  const handle = { close };
  const onPointer = (e: Event) => {
    const path = e.composedPath();
    if (!path.includes(host) && !path.includes(anchor)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      anchor.focus?.();
    }
  };

  document.body.appendChild(host);
  place();
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  current = handle;
  queueMicrotask(() => root.querySelector<HTMLElement>('select, input')?.focus());
  return close;
}
