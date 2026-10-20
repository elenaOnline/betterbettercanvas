// Announcements index: GET /courses/:id/announcements
// app/views/announcements/index.html.erb renders nothing into #content; the announcements bundle
// (ui/features/announcements/index.ts -> react/components/AnnouncementsIndex.tsx, IndexHeader.tsx
// renderOldHeader since instui_nav is off at the pilot school, and @canvas/announcements AnnouncementRow ->
// CourseItemRow) renders the list from
// GET /api/v1/courses/:id/discussion_topics?only_announcements=true&per_page=40&page=1&filter_by=all...
// pages/client/announcements.js builds that post-hydration DOM after mock_delay. InstUI emotion
// classes are approximated with css-mock-* names (hashes are not stable across Canvas deploys anyway).
import {courseCrumbs, courseScripts, courseEnv, lookupCourse, notFoundPage} from './course_home.mjs'

export default function render(S, ctx, params) {
  const c = lookupCourse(S, params)
  if (!c) return notFoundPage(S, 'course')
  return {
    title: `Announcements: ${c.name}`,
    content: '',
    course: c,
    activeTab: 'announcements',
    crumbs: courseCrumbs(S, c, [['Announcements', `/courses/${c.id}/announcements`]]),
    cssBundles: ['announcements_index'],
    env: courseEnv(S, c, {
      permissions: {create: false, manage_course_content_edit: false, manage_course_content_delete: false, moderate: false},
      atom_feed_url: `/feeds/announcements/enrollment_mock${c.id}.atom`,
      ANNOUNCEMENTS_LOCKED: false,
      BLUEPRINT_COURSES_DATA: {isMasterCourse: false, isChildCourse: false, accountId: '1003', masterCourse: null},
    }),
    scripts: courseScripts(S, c, {}, 'announcements'),
  }
}
