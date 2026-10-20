// The new student "widget dashboard" view of `/` (cookie mock_dashboard_view=widget).
// Server side = users_controller.rb#user_dashboard, should_show_widget_dashboard? branch
// (canvas-lms 1c9f0bb8013e, ~lines 405-475): js_bundle :widget_dashboard, css_bundle :dashboard_card,
// the ENV below, and `render html: "", layout: true` — so #content is EMPTY in the server HTML and
// there is no #right-side content. The React app (ui/features/widget_dashboard/index.tsx) mounts
// into #content; pages/client/dashboard_widget.js reproduces its post-hydration DOM, late.
//
// Mock-only switches (cookies):
//   mock_widget_layout=todo   add the To-do list widget (id "todo_list-widget-<uuid>", col 2 row 1)
//                             as if the student had added it with "Customize dashboard"
//   mock_widget_dark=1        account flag widget_dashboard_dark_mode on (shows the toggle)
//   mock_widget_dark=2        flag on and the student's dark-mode preference on
//   mock_dashboard_tab=courses|dashboard  initial tab (PREFERENCES.learner_dashboard_tab_selection);
//                             default is the saved preference, else "courses"
import fs from 'node:fs'
import path from 'node:path'
import {ROOT, instIcon, json} from '../lib/html.mjs'
import {dashboardCourses} from '../data/state.mjs'
import {sharedCourseData, buildWidgetDb, widgetGraphqlResolve, widgetPrefs} from '../api/extra-widget.mjs'

// true once server.mjs routes POST /api/graphql to the api/extra-*.mjs handlers
const GRAPHQL_ROUTED = () => /['"`]\/api\/graphql['"`]/.test(fs.readFileSync(path.join(ROOT, 'server.mjs'), 'utf8'))
const CLIENT_JS = () => fs.readFileSync(path.join(ROOT, 'pages/client/dashboard_widget.js'), 'utf8')

// InstUI SVGIcon markup for icons not in vendor-built/icons.json, read from @instructure/ui-icons svgs
let BUILT
const rawCache = new Map()
function icon(name, variant = 'Line') {
  BUILT ||= JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor-built/icons.json'), 'utf8'))
  if (BUILT[`${name}:${variant}`]) return instIcon(name, {variant})
  const key = `${name}:${variant}`
  if (!rawCache.has(key)) {
    const f = path.join(ROOT, '.tools/uiicons/package/svg', variant, `${name}.svg`)
    let out = ''
    if (fs.existsSync(f)) {
      const src = fs.readFileSync(f, 'utf8')
      const vb = (src.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 1920 1920'
      const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()
      const pascal = 'Icon' + name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')
      out = `<svg name="${pascal}" viewBox="${vb}" rotate="0" width="1em" height="1em" aria-hidden="true" role="presentation" focusable="false" class="css-1uh2md0-inlineSVG-svgIcon" style="width: 1em; height: 1em;"><g role="presentation">${inner}</g></svg>`
    }
    rawCache.set(key, out)
  }
  return rawCache.get(key)
}

const ICONS = [
  ['configure'], ['eye'], ['off'], ['more'], ['check-mark'], ['check-mark', 'Solid'], ['empty'], ['warning'],
  ['calendar-clock'], ['assignment'], ['quiz'], ['discussion'], ['document'], ['peer-review'], ['message'],
  ['arrow-open-down'], ['arrow-open-start'], ['arrow-open-end'], ['add'], ['check', 'Solid'], ['x', 'Solid'], ['x'],
  ['drag-handle'], ['trash'], ['check-plus'], ['check'], ['announcement'], ['folder'],
]

function iconMap() {
  const o = {}
  for (const [n, v = 'Line'] of ICONS) o[v === 'Line' ? n : `${n}:${v}`] = icon(n, v)
  return o
}

const TODO_WIDGET_ID = 'todo_list-widget-6f1c2b7e-3a94-4d1e-9b0a-52c8e7d4a1f3'

export default function render(S, ctx) {
  const prefs = widgetPrefs(S)
  const c = ctx.cookies || {}
  const darkFlag = c.mock_widget_dark === '1' || c.mock_widget_dark === '2'
  if (c.mock_widget_dark === '2' && prefs._darkSeeded !== true) { prefs.darkMode = true; prefs._darkSeeded = true }
  const config = prefs.config ? JSON.parse(JSON.stringify(prefs.config)) : {}
  if (c.mock_widget_layout === 'todo' && !config.layout) {
    config.layout = {
      columns: 2,
      widgets: [
        {id: 'course-work-combined-widget', type: 'course_work_combined', position: {col: 1, row: 1, relative: 1}, title: 'Course work'},
        {id: TODO_WIDGET_ID, type: 'todo_list', position: {col: 2, row: 1, relative: 2}, title: 'To-do list'},
        {id: 'announcements-widget', type: 'announcements', position: {col: 2, row: 2, relative: 3}, title: 'Announcements'},
        {id: 'course-grades-widget', type: 'course_grades', position: {col: 1, row: 2, relative: 4}, title: 'Course grades'},
        {id: 'people-widget', type: 'people', position: {col: 2, row: 3, relative: 5}, title: 'People'},
      ],
    }
  }
  // learner_dashboard_tab_selection: mock_dashboard_tab cookie > saved preference > "courses" (the owner's saved value)
  const tab = ['courses', 'dashboard'].includes(c.mock_dashboard_tab) ? c.mock_dashboard_tab : prefs.tab || 'courses'

  const env = {
    PREFERENCES: {
      dashboard_view: S.dashboardView || 'cards',
      hide_dashcard_color_overlays: S.settings?.hide_dashcard_color_overlays ?? null,
      custom_colors: S.colors,
      learner_dashboard_tab_selection: tab,
      widget_dashboard_config: config,
    },
    OBSERVED_USERS_LIST: [],
    OBSERVED_USER_ID: null,
    CAN_ADD_OBSERVEE: false,
    SHARED_COURSE_DATA: sharedCourseData(S),
    WIDGET_DASHBOARD_DARK_MODE: darkFlag && !!prefs.darkMode,
    DASHBOARD_FEATURES: {
      widget_dashboard_dark_mode: darkFlag,
      platform_ui_unified_widgets_dashboard: false,
      educator_dashboard: false,
    },
    // application_controller.rb:312 — set when the account flag allows the student to opt out
    widget_dashboard_overridable: true,
  }

  const cfg = {
    icons: iconMap(),
    // Courses tab renders the classic DashboardCard components from /api/v1/dashboard/dashboard_cards
    cardCount: dashboardCourses(S).length,
    // Fallback while server.mjs does not route POST /api/graphql to api/extra-*.mjs (see header there)
    fallbackDb: buildWidgetDb(S),
    graphqlRouted: GRAPHQL_ROUTED(),
  }

  return {
    title: 'Dashboard',
    content: '',
    rightSide: '',
    bodyClass: [],
    cssBundles: ['dashboard_card'],
    env,
    showFooter: true,
    crumbs: [],
    scripts: [
      `window.__mockWidgetDashboard = ${json(cfg)};\nwindow.__mockWidgetDashboard.resolve = ${widgetGraphqlResolve.toString()};\n${CLIENT_JS()}`,
    ],
  }
}

