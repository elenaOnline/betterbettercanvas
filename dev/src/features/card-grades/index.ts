// card-grades (D2): Canvas's current score as a chip on each card's hero.
// Runtime (start) lives in run.ts, loaded only on the dashboard.

import { defineFeature } from '../../core/feature.ts';
import { bool } from '../../core/settings/schema.ts';
import { CARD_ANCHORS } from '../card-assignments/anchors.ts';

export default defineFeature({
  id: 'card-grades',
  settings: {
    enabled: bool(true),
    /** Hide the chip until the card is hovered or focused. */
    hoverOnly: bool(false),
  },
  pages: ['dashboard'],
  anchors: CARD_ANCHORS,
  mirror: s => (s.hoverOnly ? { attrs: { 'data-b2c-card-grades-hover': '' } } : {}),
});
