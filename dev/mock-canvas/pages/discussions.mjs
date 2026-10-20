// Discussions index: GET /courses/:id/discussion_topics
// app/views/discussion_topics/index.html.erb prefetches the topic pages and the
// discussion_topics_index bundle (ui/features/discussion_topics_index/react: DiscussionsIndex.tsx
// renderStudentView, IndexHeader.tsx, DiscussionContainer.tsx, DiscussionRow.tsx,
// DiscussionBackgrounds.tsx) renders everything into #content. pages/client/discussions.js builds
// that post-hydration DOM after mock_delay: pinned / "Discussions" / "Closed for Comments"
// ToggleDetails sections, rows as `.ic-item-row.ic-discussion-row`, and the empty-state SVGs.
// Approximations: InstUI emotion classes are css-mock-*; the empty-state SVGs are the real files
// from ui/features/discussion_topics_index/images, inlined as data: URIs instead of /dist/images
// URLs; graded-discussion due dates come from a second request (the mock's discussion_topics
// endpoint ignores include_assignment).
import fs from 'node:fs'
import path from 'node:path'
import {ROOT} from '../lib/html.mjs'
import {courseCrumbs, courseScripts, courseEnv, lookupCourse, notFoundPage} from './course_home.mjs'

const IMG_DIR = path.join(ROOT, '.vendor/canvas-lms/ui/features/discussion_topics_index/images')
let IMGS
function images() {
  if (IMGS) return IMGS
  IMGS = {}
  for (const n of ['pinned', 'unpinned', 'closed-comments']) {
    const f = path.join(IMG_DIR, n + '.svg')
    IMGS[n] = fs.existsSync(f) ? 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64') : ''
  }
  return IMGS
}

export default function render(S, ctx, params) {
  const c = lookupCourse(S, params)
  if (!c) return notFoundPage(S, 'course')
  return {
    title: `Discussions: ${c.name}`,
    content: '',
    course: c,
    activeTab: 'discussions',
    crumbs: courseCrumbs(S, c, [['Discussions', `/courses/${c.id}/discussion_topics`]]),
    cssBundles: ['discussions_index'],
    env: courseEnv(S, c, {
      permissions: {create: true, moderate: false, manage_content: false, change_settings: false, publish: false, read_as_admin: false, manage_course_content_add: false},
      DISCUSSION_TOPIC_MENU_TOOLS: [],
      DIRECT_SHARE_ENABLED: false,
      student_reporting_enabled: true,
      STUDENT_ID: S.user.id,
    }),
    scripts: courseScripts(S, c, {images: images()}, 'discussions'),
  }
}
