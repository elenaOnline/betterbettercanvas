// Course home: GET /courses/:id
// app/views/courses/show.html.erb (+ courses/_course_show_secondary, courses/_to_do_list,
// shared/_event_list, courses/_recent_feedback, shared/_recent_activity), branching on the course's
// default_view the way courses_controller#show does:
//   modules  -> context_modules/_content_next (course_home: true), ERB, server-rendered
//   wiki     -> <div id="wiki_page_show"> filled by the wiki_page_show bundle from ENV.WIKI_PAGE (client)
//   syllabus -> assignments/_syllabus_content + _syllabus_right_side (table filled by the syllabus bundle)
//   ?view=feed -> shared/_recent_activity
// For a student, the right side is #course_show_secondary (buttons + `.todo-list.Sidebar__TodoListContainer`,
// which the planner ToDoSidebar fills client-side, scoped to the course) and Recent Feedback.
// "Coming Up" is NOT rendered for students (show.html.erb: `elsif !@context_enrollment&.student?`).
//
// Shared server helpers for the other course pages live here too (crumbs, client script bundling).
import fs from 'node:fs'
import path from 'node:path'
import {ROOT, esc, json} from '../lib/html.mjs'
import {findCourse, nickname} from '../data/state.mjs'
import {dashboardCardJson} from '../api/serializers.mjs'
import {iconMap} from './dashboard.mjs'
import {modulesContent, modulesClientData} from './modules.mjs'
import {syllabusContent, syllabusRightSide, syllabusClientCfg} from './syllabus.mjs'

// ---------------------------------------------------------------------------------------------
// shared helpers
// nickname_for(user, :short_name): nickname if set, else the course's short name (course_code)
export const courseShort = (S, c) => S.nicknames[c.id] || c.course_code
export const courseCrumbs = (S, c, extra = []) => [['Dashboard', '/'], [courseShort(S, c), `/courses/${c.id}`], ...extra]

export function notFoundPage(S, what = 'Page') {
  return {status: 404, title: 'Page Not Found', content: `<div class="ic-Error-page"><h1>Page Not Found</h1><p>Oops, we couldn't find that ${esc(what.toLowerCase())}.</p></div>`}
}

export function lookupCourse(S, params) {
  const c = findCourse(S, params.course)
  return c || null
}

const COURSE_ICONS = ['announcement', 'assignment', 'discussion', 'folder', 'calendar-month', 'document', 'quiz', 'x', 'more', 'note', 'check', 'search', 'arrow-open-down', 'arrow-open-up', 'arrow-open-end', 'arrow-open-start', 'reply', 'lock', 'unlock', 'empty', 'info', 'complete', 'add', 'peer-review', 'paperclip', 'warning', 'clock', 'link', 'compose', 'edit', 'settings', 'bookmark']

function plannerCourses(S) {
  return S.courses.map(c => {
    const {links, canChangeCoursePublishState, defaultView, pagesUrl, frontPageTitle, ...rest} = dashboardCardJson(S, c)
    return rest
  })
}

export function clientJs(name) {
  // read per request so edits show up without a restart (small files)
  const f = path.join(ROOT, 'pages/client', name + '.js')
  return fs.readFileSync(f, 'utf8')
}

/** scripts array for a course page: config, shared helpers, then page scripts */
export function courseScripts(S, c, cfg = {}, ...names) {
  const base = {
    courseId: c.id,
    courseName: c.name,
    courseShort: courseShort(S, c),
    nickname: nickname(S, c),
    color: S.colors[`course_${c.id}`] || null,
    icons: iconMap(COURSE_ICONS),
    iconsSmall: iconMap(['assignment', 'quiz', 'discussion', 'document', 'calendar-month'], {size: 'small'}),
    plannerCourses: plannerCourses(S),
    ...cfg,
  }
  return [`window.__mockCourse = ${json(base)};\n${clientJs('course_common')}`, ...names.map(clientJs)]
}

// Course-level ENV most course pages carry (js_env in the controllers)
export function courseEnv(S, c, extra = {}) {
  return {
    COURSE_ID: c.id,
    context_asset_string: `course_${c.id}`,
    PERMISSIONS: {read_grades: true, manage: false, manage_assignments_add: false, manage_assignments_edit: false, manage_assignments_delete: false, manage_course: false},
    ...extra,
  }
}

// courses/_course_show_secondary.html.erb for a student enrollment
function courseShowSecondary(S, c, view) {
  const p = `/courses/${c.id}`
  return `<div id="course_show_secondary">
${view !== 'feed' ? `  <div class="course-options">
    <a id="view_course_stream_btn" class="btn button-sidebar-wide" href="${p}?view=feed">
      <i class="icon-stats"></i>
      View Course Stream
    </a>
  </div>
` : ''}    <a class="btn button-sidebar-wide" href="/calendar?include_contexts=course_${c.id}">
      <i class="icon-calendar-day"></i>
      View Course Calendar
    </a>
    <a id="view_course_notifications_btn" class="btn button-sidebar-wide" href="${p}?view=notifications">
      <i class="icon-unmuted"></i>
      View Course Notifications
    </a>
    <div class="todo-list Sidebar__TodoListContainer"></div>
  </div>`
}

// user.recent_feedback(contexts: [course]) -> shared/_event_list (is_recent_feedback) + courses/_recent_feedback
export function recentFeedbackList(S, c) {
  const twoWeeksAgo = new Date(S.now.getTime() - 14 * 86400000)
  const fb = []
  for (const a of c.assignments) {
    const s = c.submissions.get(a.id)
    if (s?.workflow_state === 'graded' && s.posted_at && s.graded_at >= twoWeeksAgo && !s.excused) fb.push({a, s})
  }
  fb.sort((x, y) => y.s.graded_at - x.s.graded_at)
  const display = fb.length === 4 ? 4 : 3
  const items = fb.map(({a, s}, i) => {
    const cm = s.comments[0]
    // readable_grade: points -> "18 out of 20"; pass_fail -> "Complete"
    const grade = a.grading_type === 'points' ? `${s.score} out of ${a.points_possible}` : a.grading_type === 'pass_fail' ? (s.grade === 'complete' ? 'Complete' : 'Incomplete') : s.grade
    // a2_enabled? assignments link to the assignment page; quizzes/discussions/LTI to the submission page
    const a2 = !a.is_quiz && !a.is_discussion && !a.submission_types.includes('external_tool')
    const url = a2 ? `/courses/${c.id}/assignments/${a.id}` : `/courses/${c.id}/assignments/${a.id}/submissions/${S.user.id}`
    return `<li style="${i >= display ? 'display: none;' : ''}" class="event">

  <a
    data-track-category="dashboard"
    data-track-label="recent feedback"
    class="recent_feedback_icon" href="${url}"
  >
    <i class="icon-check"></i>
    <div class="event-details">
      <b class="event-details__title recent_feedback_title">
        ${esc(a.name)}
      </b>
        <p><strong>${esc(grade)}</strong></p>
${cm ? `        <p>"${esc(cm.comment)}"</p>\n` : ''}    </div>
    <div class="clear"></div>
  </a>
  <div class="clear"></div>

</li>`
  })
  const more = fb.length > display ? `
    <li>
      <a href="#" class="more_link">
        ${fb.length - display} more
        &hellip;</a>
    </li>` : ''
  return `<div class="events_list
  recent_feedback"
>
  <div class="h2 shared-space">
    <h2>Recent Feedback</h2>
  </div>
  <ul class="right-side-list events">
  ${items.length ? items.join('\n') + more : `<li>
      <small>
          Nothing for now
      </small>
    </li>`}
  </ul>
</div>`
}

// shared/_recent_activity.html.erb (course stream, ?view=feed)
function recentActivity(S, c) {
  const cats = []
  if (c.announcements.length) {
    const unread = c.announcements.filter(a => a.read_state === 'unread').length
    cats.push({cls: 'announcement', cat: 'Announcement', icon: 'icon-announcement', title: `<b class="count">${c.announcements.length}</b> Announcement${c.announcements.length === 1 ? '' : 's'}`, unread,
      rows: [...c.announcements].sort((a, b) => b.posted_at - a.posted_at).map(a => ({unread: a.read_state === 'unread', href: `/courses/${c.id}/discussion_topics/${a.id}`, state: '', summary: a.title, at: a.posted_at}))})
  }
  if (c.discussions.length) {
    const unread = c.discussions.filter(d => d.read_state === 'unread').length
    cats.push({cls: 'discussion_topic', cat: 'DiscussionTopic', icon: 'icon-discussion', title: `<b class="count">${c.discussions.length}</b> Discussion${c.discussions.length === 1 ? '' : 's'}`, unread,
      rows: [...c.discussions].sort((a, b) => b.last_reply_at - a.last_reply_at).map(d => ({unread: d.read_state === 'unread', href: `/courses/${c.id}/discussion_topics/${d.id}`, state: '', summary: d.title, at: d.last_reply_at}))})
  }
  const fmt = d => {
    const o = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}).formatToParts(d)
    const g = t => o.find(x => x.type === t)?.value
    return `${g('month')} ${g('day')} at ${g('hour')}:${g('minute')}${g('dayPeriod').toLowerCase()}`
  }
  return `<div class="page_header_container">
    <h2 class="recent-activity-header">
        Recent Activity in ${esc(courseShort(S, c))}
    </h2>
</div>

<ul class="recent_activity unstyled_list">
${cats.map(k => `    <li class="stream-category stream-${k.cls}" data-category="${k.cat}">
      <div class="stream_header">
        <div class="image-block">
          <div class=image-block-image>
            <i class="${k.icon}"></i>
          </div>
          <div class=image-block-content>
            <div class=title>
              ${k.title}
            </div>
${k.unread ? `            <strong class="unread-count">
                <span aria-hidden="true">${k.unread}</span>
                <span class="screenreader-only">${k.unread} <span>unread item${k.unread === 1 ? '' : 's'}</span>
                </span>
              </strong>
` : ''}            <div class="links">
            </div>
          </div>
        </div>
        <div class=header-right-side>
          <a href="#" role="button" class="toggle-details" aria-controls="details_container"></a>
        </div>
      </div>

      <div class='details_container' style="display: none;">
        <table id="${k.cls}-details" class="stream-details">
          <caption class="screenreader-only">${k.cat === 'Announcement' ? 'Announcement Details' : 'Discussion Details'}</caption>
          <thead class="screenreader-only">
            <tr>
              <th scope="col">Unread</th>
              <th scope="col">Message</th>
              <th scope="col">Date</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
${k.rows.map(r => `<tr>
  <td>
${r.unread ? `      <div class="unread">
        <span class="screenreader-only">Unread</span>
      </div>
` : ''}  </td>
  <td>
    <a href="${r.href}" class="content_summary">
      <span class="fake-link">${esc(c.name)}</span>
      <strong></strong>
      ${esc(r.summary)}
    </a>
  </td>
  <td class="date">
    <span data-tooltip="top" title="${esc(fmt(r.at))}">${esc(fmt(r.at))}</span>
  </td>
  <td class="remove">
    <a class="close ignore-item" href="#" data-url="/dashboard/ignore_stream_item/${r.href.split('/').pop()}" data-remove='tr' title="Ignore ${esc(r.summary)}" aria-label="Ignore ${esc(r.summary)}" role="button">
      <i class="icon-x" aria-hidden="true"></i>
    </a>
  </td>
</tr>`).join('\n')}
          </tbody>
        </table>
      </div>
    </li>`).join('\n')}
</ul>
`
}

// The front page body. The mock's data model has page titles only, so the body is generated
// (marked approximation); structure follows ui/features/wiki_page_show (WikiPageView.handlebars).
function frontPage(S, c) {
  const pg = c.pages.find(p => p.front_page) || c.pages[0]
  if (!pg) return null
  const body = c.is_advising
    ? `<h2>Welcome to CAS Advising</h2><p>Use this site to find your advisor, schedule appointments, and keep up with registration deadlines.</p><ul><li><a href="https://www.example.edu/clas/advising">Schedule an advising appointment</a></li><li><a href="https://www.example.edu/registration">Registration dates and deadlines</a></li><li><a href="https://www.example.edu/degree-maps">Degree maps</a></li></ul>`
    : `<h2>${esc(c.short_code)}: ${esc(c.title)}</h2><p>Welcome! This page is the home of our course. Start with the <a href="/courses/${c.id}/assignments/syllabus">Syllabus</a>, then work through the <a href="/courses/${c.id}/modules">Modules</a> week by week.</p><h3>Instructor</h3><p>${esc(c.prof)}<br>Office hours: Tuesdays 2&ndash;3pm, Fariborz Maseeh Hall</p><h3>This week</h3><ul><li>Read the assigned sections before lecture</li><li>Check <a href="/courses/${c.id}/assignments">Assignments</a> for due dates</li></ul>`
  return {
    url: pg.url, page_id: +c.id * 10 + 7, title: pg.title, created_at: c.created_at, updated_at: c.created_at,
    hide_from_students: false, editing_roles: 'teachers', last_edited_by: null, published: true, front_page: true,
    html_url: `https://canvas.example.edu/courses/${c.id}/pages/${pg.url}`, todo_date: null, publish_at: null,
    body, locked_for_user: false,
  }
}

export default function render(S, ctx, params) {
  const c = lookupCourse(S, params)
  if (!c) return notFoundPage(S, 'course')
  const q = ctx.query
  let view = c.default_view
  if (q.get('view') === 'feed') view = 'feed'
  const env = courseEnv(S, c, {
    COURSE: {id: c.id, long_name: `${c.name} - ${c.course_code}`, pages_url: `https://canvas.example.edu/courses/${c.id}/pages`, is_student: true, is_instructor: false, is_published: true,
      front_page_title: c.pages.find(p => p.front_page)?.title || null, default_view: c.default_view},
    STUDENT_PLANNER_ENABLED: true,
    STUDENT_PLANNER_COURSES: plannerCourses(S),
    STUDENT_PLANNER_GROUPS: [],
  })
  let content = '', extraRight = '', crumbs = courseCrumbs(S, c), activeTab = 'home', padless = false
  const cssBundles = ['dashboard', 'react_todo_sidebar', 'course_show']
  const cfg = {view}
  const pageScripts = ['course_home']
  if (view === 'wiki' && frontPage(S, c)) {
    const pg = frontPage(S, c)
    Object.assign(env, {WIKI_PAGE: pg, WIKI_PAGE_SHOW: `/courses/${c.id}/pages/${pg.url}`, COURSE_HOME: true, wiki_page_menu_tools: [], WIKI_RIGHTS: {read: true}, PAGE_RIGHTS: {read: true}})
    content = `<div id="course_home_content">
    <div id="wiki_page_show"></div>
</div>`
    padless = true
  } else if (view === 'modules') {
    crumbs = courseCrumbs(S, c, [['Modules', `/courses/${c.id}/modules`]])
    content = `<h1 class='screenreader-only'>${esc(nickname(S, c))}</h1>
<div id="course_home_content">
${modulesContent(S, c, {courseHome: true})}
</div>`
    cssBundles.push('context_modules2')
    Object.assign(env, modulesClientData(S, c).env)
    cfg.modules = modulesClientData(S, c).cfg
    pageScripts.push('modules')
  } else if (view === 'syllabus') {
    crumbs = courseCrumbs(S, c, [['Syllabus', `/courses/${c.id}/assignments/syllabus`]])
    activeTab = 'syllabus'
    content = `<div id="course_home_content">
${syllabusContent(S, c, {courseHome: true})}
</div>`
    extraRight = syllabusRightSide(S, c, {courseHome: true})
    cssBundles.push('syllabus')
    Object.assign(env, {SYLLABUS_PER_PAGE: 100, CAN_READ: true, SYLLABUS_BODY: c.syllabus_body})
    cfg.syllabus = syllabusClientCfg(S, c)
    pageScripts.push('syllabus')
  } else {
    // feed (or a wiki home with no front page -> default_home_page "feed")
    view = 'feed'
    cfg.view = 'feed'
    content = `<h1 class='screenreader-only'>${esc(nickname(S, c))}</h1>
<div id="course_home_content">
${recentActivity(S, c)}
</div>`
  }
  const rightSide = [courseShowSecondary(S, c, view), extraRight, recentFeedbackList(S, c)].filter(Boolean).join('\n')
  return {
    title: nickname(S, c),
    content,
    rightSide,
    course: c,
    activeTab,
    crumbs,
    cssBundles,
    padless,
    env,
    scripts: courseScripts(S, c, cfg, ...pageScripts),
  }
}
