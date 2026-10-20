// Syllabus: GET /courses/:id/assignments/syllabus
// app/views/assignments/syllabus.html.erb -> _syllabus_content.html.erb (ERB: header, #course_syllabus
// user content, empty #syllabus table with a loading row) + _syllabus_right_side.html.erb (mini
// calendar + weighting table). The ui/features/syllabus bundle then fills #syllabusTableBody from
// calendar_events (event / assignment / sub_assignment), appointment groups and planner items,
// rendering jst/Syllabus.handlebars (rows: tr.date.detail_list ... th.day_date / td.name / td.dates).
// Transport approximation: the mock's /api/v1/calendar_events ignores all_events=1, so the client
// asks for an explicit wide start/end range instead; undated assignments come from
// /api/v1/courses/:id/assignments?bucket=undated (the real bundle gets them from all_events).
// Course Summary is on by default (Canvas default); a course with `syllabus_course_summary: false`
// renders without the table and right side, as MATH 301 at the pilot school does (2026-10-19 capture).
import {esc} from '../lib/html.mjs'
import {laParts, monthName} from '../lib/time.mjs'
import {courseCrumbs, courseScripts, courseEnv, lookupCourse, notFoundPage} from './course_home.mjs'
import {nickname} from '../data/state.mjs'

const showSummary = c => c.syllabus_course_summary !== false

export function syllabusContent(S, c, {courseHome = false} = {}) {
  const header = courseHome ? esc(nickname(S, c)) : 'Course Syllabus'
  const summary = showSummary(c)
  return `<div class="ic-Action-header">
  <div class="ic-Action-header__Primary">
    <h1 class="ic-Action-header__Heading">${header}</h1>
  </div>
  <div class="ic-Action-header__Secondary">
${summary ? '    <a href="#" class="jump_to_today_link">Jump to Today</a>\n' : ''}  </div>
</div>

<div id="course_syllabus" style="margin-bottom: 10px;" class="user_content" data-resource-type="syllabus.body" data-resource-id="${c.id}">
  ${c.syllabus_body || ''}
</div>
<div id="course_syllabus_details" style="display: none;">
  The syllabus page shows a table-oriented view of the course schedule, and the basics of
course grading.  You can add any other comments, notes, or thoughts you have about the course
structure, course policies or anything else.

To add some comments, click the "Edit" link at the top.
</div>
${summary ? `
<h2>Course Summary:</h2>

<div id="syllabusContainer">
  <div id="syllabus_links">
  </div>
  <table id="syllabus" class="ic-Table ic-Table--condensed">
    <caption class="screenreader-only">
      Course Summary
    </caption>
    <thead>
      <tr>
        <th scope="col">Date</th>
        <th scope="col">Details</th>
        <th scope="col" class='due'>Due</th>
      </tr>
    </thead>
    <tbody id="syllabusTableBody">
      <tr>
        <td scope="row" colspan="3">
          <div id="loading_indicator" />
        </td>
      </tr>
    </tbody>
  </table>
</div>
` : ''}`
}

function miniCalendar(S) {
  const n = laParts(S.now)
  const first = new Date(Date.UTC(n.year, n.month - 1, 1))
  const lastPrev = new Date(first.getTime() - 86400000)
  let day = new Date(lastPrev.getTime() - lastPrev.getUTCDay() * 86400000)
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const pad = x => String(x).padStart(2, '0')
  let rows = ''
  for (let w = 0; w < 6; w++) {
    rows += '      <tr class="mini_calendar_week">\n'
    for (let d = 0; d < 7; d++) {
      const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, dd = day.getUTCDate()
      const cur = m === n.month
      const isToday = y === n.year && m === n.month && dd === n.day
      const cls = cur ? 'current_month' : `other_month ${m === (n.month % 12) + 1 ? 'next_month' : 'previous_month'}`
      rows += `          <td id="mini_day_${y}_${pad(m)}_${pad(dd)}" class="mini_calendar_day day ${cls}${isToday ? ' today' : ''} date_${pad(m)}_${pad(dd)}_${y}">
            <div class="day_wrapper">
              <span class="screenreader-only">${String(dd).padStart(2, ' ')} ${monthName(m)} ${y}</span>
              <span class="day_number" aria-hidden="true">
                ${dd}
              </span>
              <span class="screenreader-only previous_month_text">Previous month</span>
              <span class="screenreader-only next_month_text">Next month</span>
              <span class="screenreader-only today_text">Today</span>
              <span class="screenreader-only event_link_text">Click to view event details</span>
            </div>
          </td>
`
      day = new Date(day.getTime() + 86400000)
    }
    rows += '      </tr>\n'
  }
  return `<div class="mini_month">
  <div class="mini-cal-header">
    <button class="prev_month_link Button Button--icon-action"><i class="icon-arrow-open-left"></i><span class="screenreader-only">Prev month</span></button>
    <button class="next_month_link Button Button--icon-action"><i class="icon-arrow-open-right"></i><span class="screenreader-only">Next month</span></button>
    <span class="mini-cal-month-and-year">
      <span class="month_name">${monthName(n.month)}</span>
      <span class="year_number">${n.year}</span>
    </span>
  </div>
  <div style="display: none;">
    <span class="month_number">${n.month}</span>
  </div>
  <table class="mini_calendar" cellspacing="0">
    <caption class="screenreader-only">Calendar</caption>
    <thead>
      <tr>
${DAYS.map(d => `        <th scope="col">
            <span class="screenreader-only">
              ${d}
            </span>
          </th>`).join('\n')}
      </tr>
    </thead>
    <tbody>
${rows}    </tbody>
  </table>
</div>`
}

function weighting(c) {
  if (!c.apply_assignment_group_weights) return `<div aria-label="Assignment Weights">
  <h2>Course assignments are not weighted.</h2>
</div>`
  const tally = c.groups.reduce((s, g) => s + (g.group_weight || 0), 0)
  const pct = x => `${Math.round(x * 100) / 100}%`
  return `<div aria-label="Assignment Weights">
  <h2>Assignments are weighted by group:</h2>

  <table class="summary">
    <thead>
    <tr>
      <th scope='col'>Group</th>
      <th scope='col'>Weight</th>
    </tr>
    </thead>
    <tbody>
${c.groups.map(g => `        <tr>
          <th scope='row'>${esc(g.name)}</th>
          <td>${g.group_weight ? pct(g.group_weight) : 'none'}</td>
        </tr>`).join('\n')}
      <tr style="font-weight: bold;">
        <th scope='row'>Total</th>
        <td>${pct(tally)}</td>
      </tr>
    </tbody>
  </table>
</div>`
}

export function syllabusRightSide(S, c) {
  return `<div id="sidebar_content">
${showSummary(c) ? `${miniCalendar(S)}
${weighting(c)}` : ''}
</div>`
}

export function syllabusClientCfg(S, c) {
  return {summary: showSummary(c)}
}

export default function render(S, ctx, params) {
  const c = lookupCourse(S, params)
  if (!c) return notFoundPage(S, 'course')
  return {
    title: `Syllabus for ${c.name}`,
    content: syllabusContent(S, c),
    rightSide: syllabusRightSide(S, c),
    course: c,
    activeTab: 'syllabus',
    crumbs: courseCrumbs(S, c, [['Syllabus', `/courses/${c.id}/assignments/syllabus`]]),
    cssBundles: ['syllabus'],
    env: courseEnv(S, c, {SYLLABUS_PER_PAGE: 100, CAN_READ: true, SYLLABUS_BODY: c.syllabus_body}),
    scripts: courseScripts(S, c, {syllabus: syllabusClientCfg(S, c)}, 'syllabus'),
  }
}
