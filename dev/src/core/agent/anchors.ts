// agentkit/CONTRACT.md §3: the contract's element attributes, for b²c's own
// widgets. Lanes spread these onto their rows and controls (inside the shadow
// root) so agents can target "the row for assignment X" and tell state-changing
// controls apart. Tiny (only read-safety.ts): safe to import from any chunk.
//
//   <li {...anchorAttrs({ id: 'assignment:1', courseId: '118200', due, state })}>
//   <button {...actionAttr('mark-done')}>       setAttrs(host, regionAttr('todo'))
//
// Canvas's own elements are anchored by core (canvas-anchors.ts) after a
// describe call; b²c's rows carry these always.

import { marksRead } from './read-safety.ts';

/** §2 states, in first-match order. */
export const STATES = ['excused', 'missing', 'graded', 'late', 'submitted', 'done', 'overdue', 'past', 'upcoming'] as const;
export type State = (typeof STATES)[number];

export const ATTR = {
  id: 'data-b2c-id',
  courseId: 'data-b2c-course-id',
  due: 'data-b2c-due',
  state: 'data-b2c-state',
  marksRead: 'data-b2c-marks-read',
  action: 'data-b2c-action',
  region: 'data-b2c-region',
} as const;

/** Verbs for controls that change state (Canvas or b²c). Agents never click these unprompted. */
export type ActionVerb =
  | 'mark-done' | 'mark-undone' | 'dismiss' | 'restore' | 'set-color' | 'set-nickname' | 'move-card' | 'hide-card'
  | 'apply-theme' | 'add-item' | 'delete-item' | 'edit-note' | 'set-goal' | 'pin' | 'unpin' | (string & {});

export type RegionName = 'panel' | 'todo' | 'card-due' | 'pins' | 'search' | 'notes' | 'gpa' | (string & {});

export interface AnchorItem {
  /** `type:id` (e.g. `assignment:11820001`, `course:118200`). */
  id: string;
  /** Canvas course id, bare (`118200`) or prefixed (`course:118200`). */
  courseId?: string | number | null;
  /** ISO 8601 with offset (core/agent/time.ts `isoInZone`). Omitted when null. */
  due?: string | null;
  /** A §2 state; anything else is dropped. */
  state?: State | string | null;
  /** The element is (or wraps) a link whose navigation marks something read. */
  marksRead?: boolean;
}

/** `data-b2c-id`, `-course-id`, `-due`, `-state` (and `-marks-read`) for one row. */
export function anchorAttrs(item: AnchorItem): Record<string, string> {
  const a: Record<string, string> = { [ATTR.id]: item.id };
  if (item.courseId != null && item.courseId !== '') {
    const c = String(item.courseId);
    a[ATTR.courseId] = c.startsWith('course:') ? c : `course:${c}`;
  }
  if (item.due) a[ATTR.due] = item.due;
  if (item.state && (STATES as readonly string[]).includes(item.state)) a[ATTR.state] = item.state;
  if (item.marksRead) a[ATTR.marksRead] = 'true';
  return a;
}

/** `data-b2c-action` for a control that changes state. */
export const actionAttr = (verb: ActionVerb): Record<string, string> => ({ [ATTR.action]: verb });

/** `data-b2c-region` for a b²c shadow host or region root. */
export const regionAttr = (name: RegionName): Record<string, string> => ({ [ATTR.region]: name });

/** `data-b2c-marks-read="true"` for a link, if its href marks something read (path rule only). */
export { marksRead } from './read-safety.ts';

/**
 * §2 marksRead for a row, the same rule describe uses: "opening this changes
 * state in Canvas". `mustView`: b²c knows an open must-view module requirement
 * on it. `unread`: for announcements and discussions only, the planner's
 * `new_activity` (false = known read, so opening it changes nothing).
 */
export function marksReadFor(url: string | null | undefined, known: { unread?: boolean | null; mustView?: boolean } = {}): boolean {
  if (!url) return false;
  if (known.mustView) return true;
  if (!marksRead(url)) return false;
  return known.unread !== false;
}

/** Apply attributes to a DOM element (for code that doesn't render through JSX). */
export function setAttrs(el: Element, attrs: Record<string, string>): void {
  for (const [k, v] of Object.entries(attrs)) if (el.getAttribute(k) !== v) el.setAttribute(k, v);
}

/** Remove every contract attribute from an element. */
export function clearAttrs(el: Element): void {
  for (const k of Object.values(ATTR)) el.removeAttribute(k);
}
