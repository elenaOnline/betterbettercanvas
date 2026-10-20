// card-colors (D3): recolour every card at once by writing Canvas's own
// per-course colours, so the change shows everywhere Canvas (and its apps)
// use them. The settings UI files a request; the first Canvas tab that sees it
// applies it once. Optimistic: cards repaint at once and roll back per course
// if Canvas refuses. Runtime (start) lives in run.ts, loaded on demand.

import { defineFeature } from '../../core/feature.ts';
import { json, str } from '../../core/settings/schema.ts';
import { CARD_ANCHORS } from '../card-assignments/anchors.ts';
import { isColorRequest, type ColorRequest } from './palettes.ts';

interface Previous { at: number; colors: Record<string, string> }
const isPrevious = (v: unknown): v is Previous | null =>
  v === null || (!!v && typeof v === 'object' && typeof (v as Previous).at === 'number' && !!(v as Previous).colors && typeof (v as Previous).colors === 'object');

export default defineFeature({
  id: 'card-colors',
  settings: {
    /** Written by the settings UI ("Set all…"); see palettes.ts makeColorRequest. */
    request: json<ColorRequest | null>(null, { check: isColorRequest }),
    /** Id of the last request applied (by any tab). */
    applied: str('', { area: 'local' }),
    /** Colours before the last change, for 24 h, so it can be reverted. */
    previous: json<Previous | null>(null, { check: isPrevious }),
  },
  pages: 'all',
  anchors: CARD_ANCHORS,
});
