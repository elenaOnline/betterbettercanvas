import { defineFeature } from '../../core/feature.ts';
import { bool } from '../../core/settings/schema.ts';
import { anchors } from './model.ts';

export { anchors, cardGradient, courseKey, rgb } from './model.ts';

// Runtime (start) lives in run.ts, loaded on demand.
export default defineFeature({
  id: 'gradient-cards',
  settings: { enabled: bool(false) },
  pages: ['dashboard'],
  anchors,
});
