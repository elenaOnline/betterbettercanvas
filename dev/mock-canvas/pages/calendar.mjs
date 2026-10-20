// GET /calendar — Calendar 2. Server HTML = app/views/calendars/show.html.erb (CalendarsController#show
// builds ENV.CALENDAR.CONTEXTS). Everything inside #calendar_header, #calendar-app, #minical,
// #calendar-list-holder and #undated-events is rendered client-side in production by
// ui/features/calendar (index.jsx -> CalendarHeader / Calendar (FullCalendar 3.10.5 month view) /
// MiniCalendar / sidebar.jsx / UndatedEventsList). pages/client/calendar.js reproduces that
// post-hydration DOM after the mock delay, from /api/v1/calendar_events (type=event and
// type=assignment) and /api/v1/planner_notes, following FullCalendar 3.10.5's own HTML builders
// (DayGrid.renderDayRowHtml, DayTableMixin, DayGridEventRenderer.fgSegHtml, Toolbar) and Canvas's
// eventRender/eventAfterRender patches.
// ENV.FEATURES.instui_header is false at the pilot school, so the header is the handlebars one (calendarHeader.handlebars).
// Views: month (default), week (agendaWeek, simplified time grid), agenda (agendaView.handlebars).
import fs from 'node:fs'
import path from 'node:path'
import {ROOT, json, esc} from '../lib/html.mjs'
import {dashboardCourses} from '../data/state.mjs'
import {laParts} from '../lib/time.mjs'

const CLIENT_JS = () => fs.readFileSync(path.join(ROOT, 'pages/client/calendar.js'), 'utf8')
// CSS production loads with this page that vendor-built/css does not have: the handlebars template
// bundle jst/calendar/calendarApp (brandableCSSBundle of calendarApp.handlebars) and the
// agenda_view bundle (css_bundle :calendar2, :agenda_view). Precompiled from the canvas-lms SCSS
// into pages/client/calendar.css and inlined as a <style> (vendor-built is not ours to extend).
const EXTRA_CSS = () => fs.readFileSync(path.join(ROOT, 'pages/client/calendar.css'), 'utf8')
const BASE = 'https://canvas.example.edu'

function contextJson(S, c) {
  // subset of CalendarsController#show @contexts_json that the client uses
  const isUser = !c.course_code
  const asset = isUser ? `user_${c.id}` : `course_${c.id}`
  const url = isUser ? `${BASE}/users/${c.id}` : `${BASE}/courses/${c.id}`
  return {
    name: isUser ? c.name : (S.nicknames[c.id] || c.name),
    asset_string: asset,
    id: c.id,
    type: isUser ? 'user' : 'course',
    url,
    create_calendar_event_url: isUser ? `${BASE}/users/${c.id}/calendar_events` : `${BASE}/courses/${c.id}/calendar_events`,
    create_assignment_url: isUser ? '' : `${BASE}/api/v1/courses/${c.id}/assignments`,
    create_appointment_group_url: isUser ? '' : `${BASE}/api/v1/appointment_groups`,
    new_calendar_event_url: `${url}/calendar_events/new`,
    new_assignment_url: isUser ? '' : `${url}/assignments/new`,
    calendar_event_url: `${url}/calendar_events/{{ id }}`,
    assignment_url: isUser ? '' : `${BASE}/api/v1/courses/${c.id}/assignments/{{ id }}`,
    assignment_override_url: isUser ? '' : `${BASE}/api/v1/courses/${c.id}/assignments/{{ assignment_id }}/overrides/{{ id }}`,
    appointment_group_url: isUser ? '' : `${BASE}/api/v1/appointment_groups/{{ id }}`,
    can_create_calendar_events: isUser,
    can_create_assignments: false,
    assignment_groups: isUser ? [] : c.groups.map(g => ({id: g.id, name: g.name})),
    can_create_appointment_groups: false,
    user_is_student: !isUser,
    can_update_todo_date: false,
    can_update_discussion_topic: false,
    can_update_wiki_page: false,
    concluded: false,
    k5_course: false,
    k5_account: false,
    course_pacing_enabled: false,
    user_is_observer: false,
    default_due_time: isUser ? false : null,
    can_view_context: true,
    allow_observers_in_appointment_groups: false,
    default_allow_observer_signup: false,
    ...(isUser ? {} : {course_conclude_at: c.term?.end_at ? c.term.end_at.toISOString() : null, course_sections: [{id: String(+c.id + 1), asset_string: `course_section_${+c.id + 1}`, name: c.course_code}]}),
  }
}

export default function render(S, ctx) {
  // get_all_pertinent_contexts(favorites_first: true): the user, then favourite courses, then the rest
  const favs = dashboardCourses(S)
  const rest = S.courses.filter(c => !favs.includes(c))
  const contexts = [contextJson(S, S.user), ...[...favs, ...rest].map(c => contextJson(S, c))]
  const n = laParts(S.now)
  const today = `${n.year}-${String(n.month).padStart(2, '0')}-${String(n.day).padStart(2, '0')}`
  const q = ctx.query || new URLSearchParams()
  let selected = null
  if (q.get('include_contexts')) selected = q.get('include_contexts').split(',').filter(c => !c.startsWith('course_section_'))
  const env = {
    CALENDAR: {
      CONTEXTS: contexts,
      MANAGE_CONTEXTS: [`user_${S.user.id}`],
      // user preference :selected_calendar_contexts, saved by POST /api/v1/calendar_events/save_selected_contexts
      SELECTED_CONTEXTS: selected || S.calendarSelectedContexts || null,
      ACTIVE_EVENT: q.get('event_id') || null,
      VIEW_START: null,
      CAL2_ONLY: true,
      SHOW_SCHEDULER: false,
      MAX_GROUP_CONVERSATION_SIZE: 100,
      VISIBLE_CONTEXTS_LIMIT: 10,
      ACCOUNT_CALENDAR_EVENTS_SEEN: true,
      SHOW_CHECKPOINTS: false,
    },
    STUDENT_PLANNER_ENABLED: true,
    POST_TO_SIS: false,
    SIS_NAME: 'SIS',
    MAX_NAME_LENGTH_REQUIRED_FOR_ACCOUNT: false,
    MAX_NAME_LENGTH: 255,
    DUE_DATE_REQUIRED_FOR_ACCOUNT: false,
    conferences: {conference_types: []},
  }
  const feed = `${BASE}/feeds/calendars/user_mockfeedtoken${S.user.id}`
  const rightSide = `
  <div class="rs-section hidden-phone">
    <div id="minical"></div>
  </div>
  <div id="select-course-component" class="rs-section"></div>
  <div class="rs-section">
    <h2 tabindex="-1">
      <span role="button" id="calendar-toggle-button"   class="element_toggler" aria-controls="calendar-list-holder"   aria-expanded="true"
          aria-label="Calendars toggle list visibility" tabindex="0">
          <i class="icon-mini-arrow-down auto_rotate"></i> Calendars
      </span>
    </h2>
    <div id="calendar-list-holder"></div>
  </div>
  <div class="rs-section" id="undated-events-section">
    <h2 tabindex="-1">
      <span href="#" role="button" id="undated-events-button" class="element_toggler" aria-controls="undated-events" aria-expanded="false"
          aria-label="Undated items toggle list visibility" tabindex="0">
        <i class="icon-mini-arrow-right auto_rotate"></i> Undated
      </span>
    </h2>
    <div id="undated-events"></div>
  </div>
  <div class="rs-section" id="calendar-feed">
    <button id="calendar-feed-button" class="Button Button--link" data-dialog-opts='{"resizable":false, "width": 400}'>
      <i class="icon-calendar-days"></i> Calendar Feed
    </button>
  </div>
`
  const content = `<style id="mock-calendar-extra-css">\n${EXTRA_CSS()}</style>\n<h1 class="screenreader-only">Calendar</h1>

<div style="display: none" id="calendar_feed_box" title="Calendar Feed">
  <p id="calendar-feed-message">
    Copy the link below and paste it into any calendar app that takes iCal feeds (Google Calendar, iCal, Outlook, etc.)
  </p>
  <p id="calendar-feed-box-lower">
    <label for="calendar-feed-url-input" class="screenreader-only">Calendar Feed Url</label>
    <input id="calendar-feed-url-input" value="${esc(feed)}.ics"><br>
    <a href="${esc(feed)}.ics">Click to view Calendar Feed</a>
  </p>
</div>

<div id="calendar_header"></div>
<div id="calendar-app" role="tabpanel" class="inline-calendar-event-titles"></div>
<div id="calendar-drag-and-drop-container"></div>
`
  return {
    title: 'Calendar',
    content,
    rightSide,
    bodyClass: ['no-page-block'],
    cssBundles: ['calendar2'],
    env,
    crumbs: [],
    scripts: [`window.__mockCalendar = ${json({today, userId: S.user.id, userName: S.user.name})};\n${CLIENT_JS()}`],
  }
}
