// Canvas anchors the pins dock mounts on (shared by the definition and the runtime).
export const anchors = {
  /** Classic dashboard: the dock sits just above the card grid. */
  dashboardClassic: '#DashboardCard_Container',
  /** New dashboard, Courses tab (the owner's): first thing in the tab. */
  dashboardCourses: '[data-testid="courses-tab-content"]',
  /** Course pages: under the course navigation. */
  courseNav: '#section-tabs',
};
