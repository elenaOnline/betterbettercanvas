import { defineFeature } from '../../core/feature.ts';
import { oneOf } from '../../core/settings/schema.ts';
export const anchors = { wrapper: '.ic-Layout-wrapper', content: '.user_content' };
export const widths = { standard: '1366px', wide: '1680px', full: 'none' } as const;
export default defineFeature({
  id: 'full-width', settings: { width: oneOf(['standard', 'wide', 'full'], 'standard') }, pages: 'all', anchors,
  mirror: s => ({ attrs: { 'data-b2c-full-width': s.width }, vars: { '--b2c-page-max': widths[s.width] } }),
});
