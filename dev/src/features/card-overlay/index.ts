import { defineFeature } from '../../core/feature.ts';
import { bool } from '../../core/settings/schema.ts';
export const anchors = { hero: '.ic-DashboardCard__header_hero', image: '.ic-DashboardCard__header_image' };
export default defineFeature({
  id: 'card-overlay', settings: { overlay: bool(true) }, pages: ['dashboard'], anchors,
  mirror: s => ({ attrs: { 'data-b2c-card-overlay': s.overlay ? 'on' : 'off' } }),
});
