import { defineFeature } from '../../core/feature.ts';
import { bool } from '../../core/settings/schema.ts';

export const anchors = {"feedback": ".recent_feedback"};

export default defineFeature({
  id: 'hide-recent-feedback',
  settings: { enabled: bool(false) },
  pages: ["dashboard"],
  anchors,
});
