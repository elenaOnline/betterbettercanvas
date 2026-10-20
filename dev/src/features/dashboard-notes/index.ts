// dashboard-notes (D9): a plain notes box in the b²c side panel. Autosaves
// 500 ms after the last keystroke and on blur; no save button. Local first,
// mirrored to sync for her other devices (sync.ts). Runtime (start) lives in
// run.ts, loaded on demand.

import { defineFeature } from '../../core/feature.ts';
import { SIDE_PANEL_MIRROR } from '../../core/side-panel.ts';
import { bool, num, str } from '../../core/settings/schema.ts';

export default defineFeature({
  id: 'dashboard-notes',
  settings: {
    enabled: bool(false),
    text: str('', { area: 'local', multiline: true }),
    /** When `text` last changed (ms), to reconcile with other devices. */
    at: num(0, { area: 'local' }),
    collapsed: bool(false),
  },
  pages: ['dashboard'],
  anchors: { sidePanel: '#right-side-wrapper, [data-testid="courses-tab-content"]' },
  mirror: () => ({ attrs: { ...SIDE_PANEL_MIRROR } }),
});
