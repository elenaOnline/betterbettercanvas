// card-customization (D4), flow A: ONE ⋮ menu per card, in Canvas's ⋮ spot,
// a superset of Canvas's own (_dashboard.md §1a). Canvas's items are rebuilt
// on Canvas's own APIs, so they stay Canvas state and show everywhere:
//   Color      → PUT /users/self/colors/course_<id>         (ctx.data.setColor)
//   Rename     → PUT/DELETE /users/self/course_nicknames/<id> (ctx.data.setNickname)
//   Move       → PUT /users/self/dashboard_positions         (ctx.data.setDashboardPositions)
//   Unfavorite → DELETE/POST /users/self/favorites/courses/<id>
// b²c's own additions are local JSON keyed by course id: image, links, hidden.
//
// Canvas's native ⋮ is hidden only on cards carrying [data-b2c-card], which
// is set after our ⋮ is in place, so if b²c fails Canvas's menu is still there.
//
// Pending decision, implemented both ways (the owner chose Canvas nicknames):
//   renameVia = 'canvas' → Rename writes the real Canvas nickname.
//   renameVia = 'b2c'    → Rename sets a b²c-only label on the card.

import { defineFeature } from '../../core/feature.ts';
import { int, json, bool, oneOf } from '../../core/settings/schema.ts';
import { CARD_ANCHORS, SEL } from '../card-assignments/anchors.ts';
import { isCards, type Cards } from './model.ts';

// Runtime (start, the ⋮ menu, card decorations) lives in run.ts / menu.ts,
// loaded on demand. To add an item to the ⋮ menu, import registerCardMenuItem
// from './menu.ts' in a runtime module (never from this definition).

/** Canvas's card geometry; the radius default is the --b2c-corner token (2 px). */
export const LAYOUT = { cardWidth: 262, cardGap: 36, cardRadius: 2 } as const;

interface PendingOrder { ids: string[]; at: number }
const isPendingOrder = (v: unknown): v is PendingOrder | null =>
  v === null || (!!v && typeof v === 'object' && Array.isArray((v as PendingOrder).ids) && (v as PendingOrder).ids.every(x => typeof x === 'string') && typeof (v as PendingOrder).at === 'number');

export default defineFeature({
  id: 'card-customization',
  settings: {
    enabled: bool(true),
    /** Pending decision; the owner chose 'canvas' (real nicknames, shown everywhere). */
    renameVia: oneOf(['canvas', 'b2c'], 'canvas'),
    cardWidth: int(LAYOUT.cardWidth, { min: 220, max: 360 }),
    cardGap: int(LAYOUT.cardGap, { min: 8, max: 48 }),
    /** Default = the --b2c-corner token; only a changed value is written as a var. */
    cardRadius: int(LAYOUT.cardRadius, { min: 0, max: 16 }),
    /** Per course id: image, links, hidden, label. */
    cards: json<Cards>({}, { check: isCards }),
    /** The order last written to Canvas from a card menu, held until a later load confirms it (internal). */
    order: json<PendingOrder | null>(null, { check: isPendingOrder }),
  },
  pages: ['dashboard'],
  anchors: { ...CARD_ANCHORS, cardHeader: SEL.header, cardActions: SEL.actions, canvasCardMenu: '.ic-DashboardCard__header-button' },
  mirror(s) {
    const vars: Record<string, string> = {};
    const attrs: Record<string, string> = {};
    if (s.cardRadius !== LAYOUT.cardRadius) vars['--b2c-card-radius-set'] = `${s.cardRadius}px`;
    if (s.cardWidth !== LAYOUT.cardWidth || s.cardGap !== LAYOUT.cardGap) {
      attrs['data-b2c-card-layout'] = '';
      vars['--b2c-card-w'] = `${s.cardWidth}px`;
      vars['--b2c-card-gap'] = `${s.cardGap}px`;
    }
    return { attrs, vars };
  },
});
