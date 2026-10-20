// Page variants shared by check-selectors.mjs, export.mjs and screenshots.mjs.
// Page variants. `pages` = bc-selectors.json page tags this variant counts for.
const C = '118207' // MATH 301 in the default scenario (has quizzes, discussions, comments)
export const VARIANTS = [
  {name: 'dashboard-cards', url: '/', pages: ['dashboard', 'any']},
  {name: 'dashboard-cards-nicknames', url: '/', scenario: 'nicknames', pages: ['dashboard']},
  {name: 'dashboard-nav-tray', url: '/', interact: 'courses-tray', pages: ['any']},
  {name: 'dashboard-cards-legacy-todo', url: '/', cookies: {legacyTodo: 1}, pages: ['dashboard']},
  {name: 'dashboard-planner', url: '/', cookies: {view: 'planner'}, pages: ['dashboard']},
  {name: 'dashboard-activity', url: '/', cookies: {view: 'activity'}, pages: ['dashboard']},
  {name: 'dashboard-widget-courses', url: '/', cookies: {view: 'widget', tab: 'courses'}, pages: ['dashboard']},
  {name: 'dashboard-widget-dashboard', url: '/', cookies: {view: 'widget', tab: 'dashboard'}, pages: ['dashboard']},
  {name: 'dashboard-widget-todo', url: '/', cookies: {view: 'widget', tab: 'dashboard', widgetLayout: 'todo'}, pages: ['dashboard']},
  {name: 'courses', url: '/courses', pages: ['courses', 'any']},
  {name: 'course_home', url: `/courses/${C}`, pages: ['course_home', 'any']},
  {name: 'assignments', url: `/courses/${C}/assignments`, pages: ['assignments', 'any']},
  {name: 'assignment', url: `/courses/${C}/assignments/${C}01`, pages: ['assignment', 'any']},
  {name: 'quiz_take', url: `/courses/${C}/quizzes/${+C * 100 + 2 + 5000}/take`, pages: ['assignment']},
  {name: 'syllabus', url: `/courses/${C}/assignments/syllabus`, pages: ['any']},
  {name: 'grades', url: `/courses/${C}/grades`, pages: ['grades', 'any']},
  {name: 'modules', url: `/courses/${C}/modules`, pages: ['modules', 'course_home', 'any']},
  {name: 'announcements', url: `/courses/${C}/announcements`, pages: ['any']},
  {name: 'discussions', url: `/courses/${C}/discussion_topics`, pages: ['discussions', 'any']},
  {name: 'calendar', url: '/calendar', pages: ['calendar', 'any']},
  {name: 'inbox', url: '/conversations', pages: ['inbox', 'any'], interact: 'compose'},
  {name: 'profile_settings', url: '/profile/settings', pages: ['profile_settings', 'any']},
  {name: 'all_grades', url: '/grades', pages: ['any']},
  {name: 'login', url: '/login/canvas', pages: ['login']},
]

