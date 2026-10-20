// better-todo (D11, with D12 hover preview): the To do / Done list and
// Announcements, as the first section of b²c's side panel (core side-panel:
// classic dashboard's right column, or a right column on the new dashboard's
// Courses tab). Replaces Canvas's own To Do and Coming Up on the classic
// dashboard. Renders from the shared planner cache on the first frame and
// updates in place.
//
// State is Canvas's where it can be: with core.plannerSync on (the owner:
// "toggle", default on), done / remove write planner overrides and
// add-your-own items are planner notes. Off, they live in core.todoMarks and
// better-todo.custom. Either way core.todoMarks carries the optimistic state,
// so a tick here shows on the card rows (card-assignments) and in other tabs.
//
// Runtime (start, the panel, preview) lives in run.ts, loaded on demand.

import { defineFeature } from '../../core/feature.ts';
import { bool, int, json, oneOf } from '../../core/settings/schema.ts';
import { shared } from '../../core/settings/shared.ts';
import { SIDE_PANEL_MIRROR } from '../../core/side-panel.ts';
import { anchors } from './anchors.ts';
import type { CustomItem, Labels } from './logic.ts';

const isObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);

const settings = {
  enabled: bool(true),
  /** Rows per section before "Show N more" (which adds this many again). */
  count: int(8, { min: 3, max: 20 }),
  announcements: bool(true),
  /** bc todo_overdues: unsubmitted past-due items stay in To do. */
  showOverdue: bool(true),
  /** bc hide_completed: submitted / done items leave To do. */
  hideCompleted: bool(true),
  /** Course colour on each row's marker and checkbox. */
  courseColors: bool(true),
  /** D12: description preview on hover (Space on a focused row). */
  hoverPreview: bool(true),
  /** Pending decision (the owner: "toggle"), shared with card-assignments. */
  plannerSync: shared.plannerSync,
  dates: shared.dates,
  clock: shared.clock,
  dateOrder: shared.dateOrder,
  /** To-do view (todo-views.md; the theme's views.todo maps to it). List is the default; the last one used is remembered. */
  view: oneOf(['list', 'ring', 'week', 'courses'], 'list'),
  /** Done / removed marks, shared with card-assignments. */
  marks: shared.todoMarks,
  /** Free-text label per item (b²c only: Canvas has no labels). */
  labels: json<Labels>({}, { check: isObj }),
  /** Add-your-own items while planner sync is off. */
  custom: json<CustomItem[]>([], { check: Array.isArray }),
  /** Collapsed sections and the Ring / By course range, remembered. */
  ui: json<{ collapsed?: { todo?: boolean; announcements?: boolean }; range?: 'today' | 'week' | 'next7' }>({}, { check: isObj }),
};
export default defineFeature({
  id: 'better-todo',
  settings,
  pages: ['dashboard'],
  anchors,
  mirror: () => ({ attrs: { ...SIDE_PANEL_MIRROR } }),
});
