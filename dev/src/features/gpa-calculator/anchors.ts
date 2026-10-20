// Where the widget mounts. Default: the shared b²c side panel (core/side-panel.ts,
// order 30), which covers the classic dashboard and the new dashboard's Courses
// tab. "Show GPA above cards" puts it above the card grid instead.
export const ANCHORS = {
  panel: '#right-side-wrapper, [data-testid="courses-tab-content"]',
  cards: '#DashboardCard_Container',
  /** New dashboard: the Courses tab holds the card grid (no #DashboardCard_Container). */
  coursesTab: '[data-testid="courses-tab-content"]',
};
