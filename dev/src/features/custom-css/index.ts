// Runtime (start) lives in run.ts, loaded on demand.
import { defineFeature } from '../../core/feature.ts';
import { bool, str } from '../../core/settings/schema.ts';
import { scopedCss } from './model.ts';

export default defineFeature({
  id: 'custom-css',
  settings: { enabled: bool(false), css: str('', { area: 'local', multiline: true }) },
  pages: 'all', anchors: { head: 'head' },
  // Pre-paint: core's mirror carries the scoped sheet, and boot.js inserts it
  // as <style data-b2c-sheet="custom-css" data-b2c-custom-css> before <body>.
  mirror: s => ({ css: s.css.trim() ? scopedCss(s.css) : '' }),
});
