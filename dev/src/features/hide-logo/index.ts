import { defineFeature } from '../../core/feature.ts';
import { bool } from '../../core/settings/schema.ts';

export const anchors = {"logo": ".ic-app-header__logomark-container", "sidebarLogo": ".ic-sidebar-logo"};

export default defineFeature({
  id: 'hide-logo',
  settings: { enabled: bool(false) },
  pages: "all",
  anchors,
});
