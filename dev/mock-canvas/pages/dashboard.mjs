// Dashboard. Server HTML = app/views/users/user_dashboard.html.erb + shared/_dashboard_card.html.erb
// (placeholder cards). Client script pages/client/dashboard.js then does what the React bundles do:
// header (ui/features/dashboard/react/DashboardHeader.jsx), cards
// (ui/shared/dashboard-card/react/DashboardCard*.tsx), sidebar via /dashboard-sidebar
// (app/views/users/dashboard_sidebar.html.erb) with the ToDoSidebar
// (ui/shared/planner/components/ToDoSidebar) rendered into .Sidebar__TodoListContainer, and the
// planner list view / recent activity when selected.
// mock_dashboard_view: cards (default) | planner | activity | widget
import fs from 'node:fs'
import path from 'node:path'
import {ROOT, esc, instIcon, json} from '../lib/html.mjs'
import {dashboardCourses, nickname} from '../data/state.mjs'
import {dashboardCardJson} from '../api/serializers.mjs'
import {datetimeString} from '../lib/time.mjs'

const PLACEHOLDER = `
      <div class="ic-DashboardCard">
        <svg xmlns="http://www.w3.org/2000/svg" class="ic-DashboardCard__placeholder-svg" version="1.1" x="0" y="0" viewBox="-1087 618 260 254" xml:space="preserve">
          <title>Empty Card</title>
          <g class="ic-DashboardCard__placeholder-animates">
            <path d="M-1087 618h260v126h-260V618z"/>
            <rect x="-1062" y="759.5" class="st0" width="184" height="16"/>
            <rect x="-1062" y="785.5" class="st0" width="106" height="9"/>
            <circle cx="-1054" cy="842.5" r="8"/>
            <circle cx="-989" cy="842.5" r="8"/>
            <circle cx="-924" cy="842.5" r="8"/>
            <circle cx="-859" cy="842.5" r="8"/>
          </g>
        </svg>
      </div>`

export const ICON_SET = ['announcement', 'assignment', 'discussion', 'folder', 'calendar-month', 'document', 'peer-review', 'note', 'quiz', 'x', 'more', 'add', 'plus', 'gradebook', 'warning', 'arrow-open-down', 'arrow-open-up', 'check', 'empty']
export function iconMap(names = ICON_SET, opts = {}) {
  const o = {}
  for (const n of names) o[n] = instIcon(n, opts)
  return o
}

function dashboardView(S, ctx) {
  const c = ctx.cookies.mock_dashboard_view
  if (['cards', 'card', 'planner', 'activity', 'widget'].includes(c)) return c === 'card' ? 'cards' : c
  return S.dashboardView || process.env.MOCK_DASHBOARD_VIEW || 'cards'
}

const DASHBOARD_JS = () => fs.readFileSync(path.join(ROOT, 'pages/client/dashboard.js'), 'utf8')

export default async function render(S, ctx) {
  const view = dashboardView(S, ctx)
  if (view === 'widget') {
    const f = path.join(ROOT, 'pages/dashboard_widget.mjs')
    if (fs.existsSync(f)) return (await import(f)).default(S, ctx)
  }
  const courses = dashboardCourses(S)
  const showPlanner = view === 'planner'
  const env = {
    PREFERENCES: {dashboard_view: view, hide_dashcard_color_overlays: !!S.settings?.hide_dashcard_color_overlays, custom_colors: S.colors},
    STUDENT_PLANNER_ENABLED: true,
    STUDENT_PLANNER_COURSES: courses.map(c => {
      const {links, canChangeCoursePublishState, defaultView, pagesUrl, frontPageTitle, ...rest} = dashboardCardJson(S, c)
      return rest
    }),
    STUDENT_PLANNER_GROUPS: [],
    ALLOW_ELEMENTARY_DASHBOARD: false,
    CREATE_COURSES_PERMISSIONS: {PERMISSION: null, RESTRICT_TO_MCC_ACCOUNT: false, VIEWABLE_ACCOUNT_IDS: []},
    OBSERVED_USERS_LIST: [{id: S.user.id, name: S.user.name, sortable_name: S.user.sortable_name, avatar_url: S.user.avatar_url}],
    CAN_ADD_OBSERVEE: false,
    widget_dashboard_overridable: false,
    K5_USER: false,
  }
  const cfg = {
    view,
    legacyTodo: ctx.cookies.mock_legacy_todo === '1',
    icons: iconMap(),
    iconsXSmall: iconMap(['announcement', 'assignment', 'discussion', 'folder'], {size: 'x-small'}),
    placeholdersCount: courses.length || 5,
  }
  const content = `<div id="dashboard" class="ic-dashboard-app">
  <h1 class="screenreader-only">Dashboard</h1>
<div id='announcementWrapper'>
</div>
    <div id="dashboard_header_container" class="ic-Dashboard-header" data-props="{}"></div>
      <div id="dashboard-planner" class="StudentPlanner__Container" style="display: ${showPlanner ? 'block' : 'none'}"></div>
    <div
      id="dashboard-activity"
      class="ic-Dashboard-Activity"
      style="display: ${view === 'activity' ? 'block' : 'none'}"
    >
      <!-- this will be populated via xhr from UsersController::dashboard_stream_items when someone selects the stream-items dashboard option -->
    </div>
<div id="DashboardCard_Container" style="display: ${view === 'cards' ? 'block' : 'none'}">
  <div class="ic-DashboardCard__box">
${Array.from({length: Math.min(cfg.placeholdersCount, 5)}, () => PLACEHOLDER).join('')}
    <br/>
  </div>
</div>
</div>`
  return {
    title: 'Dashboard',
    content,
    rightSide: showPlanner ? '' : '<div class="placeholder"></div>',
    bodyClass: showPlanner ? ['dashboard-is-planner'] : [],
    cssBundles: ['dashboard_card', 'react_todo_sidebar', 'dashboard', 'planner'],
    env,
    showFooter: true,
    crumbs: [],
    scripts: [`window.__mockDashboard = ${json(cfg)};\n${DASHBOARD_JS()}`],
  }
}

// GET /dashboard-sidebar — HTML fragment injected into #right-side (users/dashboard_sidebar.html.erb)
export function sidebar(S, ctx) {
  const legacy = ctx.cookies.mock_legacy_todo === '1'
  // Recent feedback: graded submissions in the last two weeks (users_controller#dashboard_sidebar)
  const twoWeeksAgo = new Date(S.now.getTime() - 14 * 86400000)
  const feedback = []
  for (const c of S.courses) for (const a of c.assignments) {
    const s = c.submissions.get(a.id)
    if (s?.workflow_state === 'graded' && s.posted_at && s.graded_at >= twoWeeksAgo && !s.excused) feedback.push({c, a, s})
  }
  feedback.sort((x, y) => y.s.graded_at - x.s.graded_at)
  const fbItems = feedback.slice(0, 20).map(({c, a, s}, i) => {
    const cm = s.comments[0]
    const grade = a.grading_type === 'points' ? `${s.score} out of ${a.points_possible}` : s.grade
    return `<li style="${i >= 3 ? 'display: none;' : ''}" class="event">
  <a
    data-track-category="dashboard"
    data-track-label="recent feedback"
    class="recent_feedback_icon" href="/courses/${c.id}/assignments/${a.id}/submissions/${S.user.id}"
  >
    <i class="icon-check"></i>
    <div class="event-details">
      <b class="event-details__title recent_feedback_title">
        ${esc(a.name)}
      </b>
        <p class="event-details__context">
          ${esc(S.nicknames[c.id] || c.course_code)}
        </p>
          <p><strong>${esc(grade)}</strong></p>
${cm ? `        <p>"${esc(cm.comment)}"</p>\n` : ''}    </div>
    <div class="clear"></div>
  </a>
  <div class="clear"></div>
</li>`
  })
  const moreFb = feedback.length > 4 ? `\n    <li>\n      <a href="#" class="more_link">\n        ${feedback.length - 3} more in the past two weeks\n      </a>\n    </li>` : ''
  const recentFeedback = S.courses.length
    ? `<div class="events_list
  recent_feedback"
>
  <div class="h2 shared-space">
    <h2>Recent Feedback</h2>
  </div>
  <ul class="right-side-list events">
  ${fbItems.length ? fbItems.join('\n') + moreFb : '<li>\n      <small>\n          Nothing for now\n      </small>\n    </li>'}
  </ul>
</div>`
    : ''
  let todo = '<div class="Sidebar__TodoListContainer"></div>'
  let comingUp = ''
  if (legacy) {
    todo = legacyTodoList(S)
    comingUp = comingUpList(S)
  }
  return {
    raw: `
${todo}
${comingUp}
${recentFeedback}
<div>
  <a href="/grades" class="Button button-sidebar-wide element_toggler_inst_focus_ring">
  View Grades
  </a>
</div>
`,
  }
}

function legacyTodoList(S) {
  const items = []
  for (const c of S.courses) for (const a of c.assignments) {
    const s = c.submissions.get(a.id)
    if (!a.due_at || a.due_at < S.now || a.due_at > new Date(S.now.getTime() + 7 * 86400000) || s?.submitted_at) continue
    items.push({c, a})
  }
  items.sort((x, y) => x.a.due_at - y.a.due_at)
  if (!items.length) return ''
  return `<h2 class="todo-list-header" tabindex="-1">
          To Do
      </h2>
      <ul class="right-side-list to-do-list">
${items.map(({c, a}, i) => `          <li class="todo" style="${i >= 7 ? 'display: none;' : ''}">
            <a
              class="item"
              href="/courses/${c.id}/assignments/${a.id}#submit"
              data-track-category="dashboard"
              data-track-label="todo needs submitting"
            >
              <div class="todo-badge-wrapper">
                <i class="icon-${a.is_quiz ? 'quiz' : 'assignment'}" aria-hidden="true"></i>
              </div>
              <div class="todo-details">
                <b class="todo-details__title">Turn in ${esc(a.name)}</b>
                <p class="todo-details__context">${esc(nickname(S, c))}</p>
                <p>${a.points_possible} points &bull; ${esc(datetimeString(a.due_at, S.now, 'due_date'))}</p>
              </div>
            </a>
            <div class="todo-ignore">
              <a href="/api/v1/users/self/todo/assignment_${a.id}/submitting?permanent=1" class="disable_item_link disable-todo-item-link" title="Ignore until new submission" role="button">
                <i class="icon-x" aria-hidden="true"></i>
                <span class="screenreader-only">Ignore ${esc(a.name)} until new submission</span>
              </a>
            </div>
          </li>`).join('\n')}
      </ul>`
}

function comingUpList(S) {
  const end = new Date(S.now.getTime() + 7 * 86400000)
  const evts = []
  for (const c of S.courses) for (const a of c.assignments) if (a.due_at && a.due_at >= S.now && a.due_at <= end) evts.push({title: a.name, when: a.due_at, url: `/courses/${c.id}/assignments/${a.id}`, ctx: S.nicknames[c.id] || c.course_code, icon: a.is_quiz ? 'icon-quiz' : 'icon-assignment', due: true, pts: a.points_possible})
  for (const e of S.calendarEvents) if (e.start_at >= S.now && e.start_at <= end) evts.push({title: e.title, when: e.start_at, url: `/calendar?event_id=${e.id}&include_contexts=${e.context_code}`, ctx: e.context_code.startsWith('user') ? S.user.name : nickname(S, S.courses.find(c => `course_${c.id}` === e.context_code) || {name: ''}), icon: 'icon-calendar-month', due: false})
  evts.sort((a, b) => a.when - b.when)
  return `<div class="events_list
  coming_up"
>
  <div class="h2 shared-space">
    <h2>Coming Up</h2>
      <a
        class='event-list-view-calendar icon-calendar-day standalone-icon element_toggler_inst_focus_ring'
        href='/calendar'
      >
        View Calendar
      </a>
  </div>
  <ul class="right-side-list events">
${evts.length ? evts.map((e, i) => `<li style="${i >= 3 ? 'display: none;' : ''}" class="event">
  <a
    data-track-category="dashboard"
    data-track-label="recent event"
    href="${e.url}"
  >
    <i class="${e.icon}" aria-label="${e.due ? 'Assignment' : 'Calendar Event'}"></i>
    <div class="event-details">
      <b class="event-details__title">${esc(e.title)}</b>
        <p>${esc(e.ctx)}</p>
      <p>
        ${e.due ? `${e.pts} points &bull; ` : ''}${esc(datetimeString(e.when, S.now, e.due ? 'due_date' : 'event'))}
      </p>
    </div>
  </a>
</li>`).join('\n') : '<li>\n      <small>\n          Nothing for the next week\n      </small>\n    </li>'}
${evts.length > 4 ? `    <li>\n      <a href="#" class="more_link">\n        ${evts.length - 3} more in the next week\n      </a>\n    </li>` : ''}
  </ul>
</div>`
}

export {legacyTodoList, comingUpList}
