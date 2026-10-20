import { defineFeature } from '../../core/feature.ts';
import { bool } from '../../core/settings/schema.ts';
import { ITEM_SLOT_SELECTOR } from '../card-assignments/anchors.ts';

// Compact "−4.2 / +1.8" after the due text on each card row (design:
// surfaces/card-assignments.md, "Grade impact"). Runtime (start) lives in
// run.ts, loaded on demand.
export default defineFeature({
  id: 'grade-impact',
  settings: {
    // Opt-in (design: "Show grade impact" is off until asked for).
    enabled: bool(false),
  },
  pages: ['dashboard'],
  anchors: { slot: ITEM_SLOT_SELECTOR },
});
