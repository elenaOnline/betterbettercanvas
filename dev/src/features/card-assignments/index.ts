// card-assignments (D1): each course card lists its next N items.
// Renders from the shared planner cache on the first frame; its space is
// reserved pre-paint by style.css, so nothing shifts.
//
// Done state, shared with better-todo:
// - planner sync on  → Canvas planner overrides. Writes go through
//   ctx.data (setComplete / patchPlanner), which broadcast an in-page patch
//   and rewrite the planner cache, so the to-do panel, these rows and the next
//   warm load all agree at once.
// - planner sync off → `core.todoMarks` (local). A small in-page overlay
//   covers the moment between a tick and its storage echo.

import { defineFeature } from '../../core/feature.ts';
import { bool, int, oneOf } from '../../core/settings/schema.ts';
import { shared } from '../../core/settings/shared.ts';
import { CARD_ANCHORS } from './anchors.ts';

/** How many 28 px rows the Due block reserves for a view. */
export const dueRows = (view: 'rows' | 'next' | 'count', count: number) => (view === 'rows' ? count : view === 'next' ? 2 : 1);

export default defineFeature({
  id: 'card-assignments',
  settings: {
    enabled: bool(true),
    count: int(4, { min: 1, max: 8 }),
    overdue: bool(true),
    showCompleted: bool(false),
    assignments: bool(true),
    quizzes: bool(true),
    discussions: bool(true),
    /** The card due view (rice.md `views.cards`): every row, the next item only, or counts. */
    view: oneOf(['rows', 'next', 'count'], 'rows'),
    dates: shared.dates,
    dateOrder: shared.dateOrder,
    clock: shared.clock,
    /** the owner: a toggle, default on. On = ticks write Canvas planner overrides; off = b²c-local marks. */
    syncPlanner: shared.plannerSync,
    marks: shared.todoMarks,
  },
  pages: ['dashboard'],
  anchors: CARD_ANCHORS,
  // Reserved rows per card, pre-paint: rows view = "Number shown"; next = a
  // two-line block; count = one line.
  mirror: s => ({ vars: { '--b2c-due-n': String(dueRows(s.view, s.count)) } }),
});
