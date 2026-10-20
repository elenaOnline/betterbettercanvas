// Assignments index: GET /courses/:id/assignments
// app/views/assignments/new_index.html.erb ships nothing but `<div id="hidden">`; the
// assignment_index bundle (ui/features/assignment_index/index.tsx) renders IndexView.handlebars
// into #content, then AssignmentGroupListView / AssignmentGroupListItemView / AssignmentListItemView
// (Backbone + handlebars jst) from GET /api/v1/courses/:id/assignment_groups (prefetched XHR) and
// GET /api/v1/courses/:id/students/submissions (AssignmentGroupCollection#getGrades).
// Students get ToggleShowByView (RadioInputGroup "Show by Date / Show by Type", default by date,
// remembered in localStorage under the cache.js key) — so the server ships only the empty shell
// and pages/client/assignments_index.js builds the post-hydration DOM after mock_delay.
import {courseCrumbs, courseScripts, courseEnv, lookupCourse, notFoundPage} from './course_home.mjs'

export default function render(S, ctx, params) {
  const c = lookupCourse(S, params)
  if (!c) return notFoundPage(S, 'course')
  const base = `/courses/${c.id}`
  const env = courseEnv(S, c, {
    URLS: {
      new_assignment_url: `${base}/assignments/new`,
      new_quiz_url: `${base}/quizzes/new?fresh=1`,
      course_url: `/api/v1/courses/${c.id}`,
      sort_url: `${base}/assignments/reorder`,
      assignment_sort_base_url: `${base}/assignment_groups`,
      context_modules_url: `/api/v1/courses/${c.id}/modules`,
      course_student_submissions_url: `/api/v1/courses/${c.id}/students/submissions`,
    },
    POST_TO_SIS: false,
    PERMISSIONS: {manage: false, manage_assignments_add: false, manage_assignments_edit: false, manage_assignments_delete: false, manage_course: false, read_grades: true, by_assignment_id: {}},
    apply_assignment_group_weights: c.apply_assignment_group_weights,
    HAS_GRADING_PERIODS: false,
    MODERATED_GRADING_ENABLED: false,
    current_user_has_been_observer_in_this_course: false,
    observed_student_ids: [],
    SHOW_SPEED_GRADER_LINK: false,
    QUIZ_LTI_ENABLED: false,
    FLAGS: {newquizzes_on_quiz_page: false, show_additional_speed_grader_link: false},
    PEER_REVIEW_ALLOCATION_AND_GRADING_ENABLED: false,
    DIRECT_SHARE_ENABLED: false,
    SIS_NAME: 'SIS',
    assignment_menu_tools: [], discussion_topic_menu_tools: [], quiz_menu_tools: [],
    restrict_quantitative_data: false,
  })
  return {
    title: `Assignments: ${c.name}`,
    content: `<div id="hidden"></div>
`,
    course: c,
    activeTab: 'assignments',
    crumbs: courseCrumbs(S, c, [['Assignments', `${base}/assignments`]]),
    cssBundles: ['new_assignments'],
    bodyClass: ['with_item_groups'],
    env,
    scripts: courseScripts(S, c, {weighted: c.apply_assignment_group_weights, userId: S.user.id}, 'assignments_index'),
  }
}

