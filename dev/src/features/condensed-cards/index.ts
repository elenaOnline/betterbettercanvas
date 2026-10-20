import { defineFeature } from '../../core/feature.ts';
import { bool } from '../../core/settings/schema.ts';

export const anchors = {"hero": ".ic-DashboardCard__header_hero", "subtitle": ".ic-DashboardCard__header-subtitle", "term": ".ic-DashboardCard__header-term"};

export default defineFeature({
  id: 'condensed-cards',
  settings: { enabled: bool(false) },
  pages: ["dashboard"],
  anchors,
});
