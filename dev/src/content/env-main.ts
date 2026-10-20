// env-main.js: runs in the PAGE world (manifest "world": "MAIN") at
// document_end. Copies the few window.ENV fields b²c needs onto <html> so the
// isolated-world content script can read them. Never writes anything else.
import { ENV_ATTR } from '../core/ctx.ts';
import { QUIZ_TAKING } from '../core/canvas/page.ts';
import { installB2cAgent } from '../core/agent/wrapper.js';

declare global {
  interface Window { ENV?: Record<string, unknown> }
}

try {
  const E = window.ENV;
  if (E) {
    const u = E.current_user as Record<string, unknown> | undefined;
    const pick = {
      current_user_id: E.current_user_id != null ? String(E.current_user_id) : null,
      current_user: u ? { id: String(u.id), display_name: u.display_name, avatar_image_url: u.avatar_image_url } : undefined,
      TIMEZONE: E.TIMEZONE,
      LOCALE: E.LOCALE,
      context_asset_string: E.context_asset_string,
      // Grades page only (gradebooks_controller#grade_summary):
      // { id, title, data: [{ name: 'A', value: 0.94 }, …], points_based?, scaling_factor? } or null.
      course_active_grading_scheme: E.course_active_grading_scheme,
      DOMAIN_ROOT_ACCOUNT_ID: E.DOMAIN_ROOT_ACCOUNT_ID != null ? String(E.DOMAIN_ROOT_ACCOUNT_ID) : undefined,
      // Structural flags for the health report (no personal data).
      probe: {
        // Classic preference; stale on the new dashboard (see learnerTab).
        dashboardView: (E.PREFERENCES as Record<string, unknown> | undefined)?.dashboard_view ?? null,
        learnerTab: (E.PREFERENCES as Record<string, unknown> | undefined)?.learner_dashboard_tab_selection ?? null,
        widgetDashboard: 'DASHBOARD_FEATURES' in E,
        widgetDarkMode: E.WIDGET_DASHBOARD_DARK_MODE ?? null,
        highContrast: E.use_high_contrast ?? null,
        // null = the ENV key is absent (not "planner off"); features detect via the API.
        plannerEnvFlag: E.STUDENT_PLANNER_ENABLED ?? null,
      },
    };
    document.documentElement.setAttribute(ENV_ATTR, JSON.stringify(pick));
  }
} catch {
  /* not a Canvas page */
}

// Agent contract §2 (agentkit/CONTRACT.md): window.b2cAgent, only where the
// contract is on (data-b2c-agent, set pre-paint from the mirror) and never on
// quiz-taking routes. On a first visit (no mirror yet) main.js sets the
// attribute moments later, so wait for it with a one-attribute observer.
try {
  const root = document.documentElement;
  const AGENT = 'data-b2c-agent';
  if (!QUIZ_TAKING.test(location.pathname)) {
    if (root.hasAttribute(AGENT)) installB2cAgent();
    else {
      const mo = new MutationObserver(() => {
        if (root.hasAttribute(AGENT)) {
          mo.disconnect();
          installB2cAgent();
        }
      });
      mo.observe(root, { attributes: true, attributeFilter: [AGENT] });
    }
  }
} catch {
  /* never break the page */
}
