// Student grades. Server HTML follows app/views/gradebooks/grade_summary.html.erb (legacy table, the
// branch taken while site-admin flag student_grade_summary_upgrade is off), with
// GradeSummaryAssignmentPresenter#classes, gradebooks_helper#student_score_display_for and
// GradebooksController#group_as_assignment / #total_as_assignment for the pseudo rows.
// As in production, #grade-summary-content and #student-grades-right-content ship hidden and
// pages/client/grades.js (ui/features/grade_summary/jquery/index.jsx) computes group totals and the
// final grade, fills them in, and unhides both after the mock delay. What-if scores work.
// /grades (allGrades) follows app/views/users/grades.html.erb.
import fs from 'node:fs'
import path from 'node:path'
import {ROOT, esc, json} from '../lib/html.mjs'
import {findCourse, nickname} from '../data/state.mjs'
import {datetimeString} from '../lib/time.mjs'
import {DEFAULT_SCHEME, periodOf, currentPeriod} from '../data/scenarios.mjs'

const GRADES_JS = () => fs.readFileSync(path.join(ROOT, 'pages/client/grades.js'), 'utf8')
const WHATIF = 'You can view your grades based on What-If scores so that you know how grades will be affected by upcoming or resubmitted assignments. You can test scores for an assignment that already includes a score, or an assignment that has yet to be graded.'
const HIDDEN_TEXT = 'Instructor has not posted this grade'

function n(x) {
  // I18n.n(round_if_whole(x))
  if (x == null || x === '') return ''
  const r = Math.round(x * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r)
}

function scoreDisplay(a, s) {
  // gradebooks_helper#student_score_display_for(student_view: true)
  if (!s) return '-'
  if (s.excused) return 'EX'
  const posted = !!s.posted_at
  if (posted && s.grade != null && s.workflow_state !== 'pending_review') {
    switch (a.grading_type) {
      case 'pass_fail': {
        const pass = (s.score && s.score > 0) || s.grade === 'complete'
        return `<i class="graded_icon ${pass ? 'icon-check' : 'icon-x'}" aria-hidden="true"></i><span class="screenreader-only">${pass ? 'Complete' : 'Incomplete'}</span>`
      }
      case 'percent': return esc(s.grade)
      case 'points': return n(s.score)
      default: return ''
    }
  }
  if (s.submission_type) {
    const icon = {online_quiz: 'icon-quiz', discussion_topic: 'icon-discussion', online_upload: 'icon-document', online_text_entry: 'icon-text', online_url: 'icon-link', external_tool: 'icon-document'}[s.submission_type] || 'icon-document'
    const sr = {online_quiz: 'You took this quiz, but it has not been graded.', discussion_topic: 'You participated in this discussion, but it has not been graded.'}[s.submission_type] || 'You submitted this assignment, but it has not been graded.'
    return `<i class="submission_icon ${icon}" aria-hidden="true"></i><span class="screenreader-only">${sr}</span>`
  }
  return '-'
}

function assignmentRow(S, c, a, group, weighted) {
  const s = c.submissions.get(a.id)
  const graded = s?.workflow_state === 'graded' && s.posted_at && s.score != null
  const classes = ['student_assignment', graded ? 'assignment_graded' : null, 'editable', s?.excused ? 'excused' : null].filter(Boolean).join(' ')
  const excusedLabel = 'This assignment is excused and will not be considered in the total calculation'
  const hasComments = !!s?.comments?.length
  const displayScore = graded ? n(s.score) : s?.excused ? '' : ''
  const status = s?.missing ? '<span class="submission-missing-pill"></span>' : s?.late ? '<span class="submission-late-pill"></span>' : ''
  const unreadDot = graded && s.read_state === 'unread' ? `\n                        <span class="unread_dot grade_dot" id="submission_unread_dot_${s.id}" aria-label="This grade is unread">&nbsp;</span>` : ''
  const href = `/courses/${c.id}/assignments/${a.id}/submissions/${S.user.id}`
  return `            <tr class="${classes}"
                data-muted="false"
                data-pending_quiz="${s?.workflow_state === 'pending_review'}"
                id="submission_${a.id}"${s?.excused ? `\n                  aria-label="${excusedLabel}"\n                  title="${excusedLabel}"` : ''}
                >
                <th class="title" scope="row">
                      <a href="${href}">${esc(a.name)}</a>
                    <div class="context">${esc(group.name)}</div>
                </th>
                <td class="due">
                    ${a.due_at ? esc(datetimeString(a.due_at, S.now, 'due_date')) : ''}
                </td>
                <td class="submitted">
                    ${s?.submitted_at ? esc(datetimeString(s.submitted_at, S.now, 'event')) : ''}
                </td>
                <td class="status" scope="row">
                    ${status}
                </td>
                <td class="assignment_score" title="Click to test a different score">
                  <div style="position: relative; height: 100%;" class="score_holder">
                      <span class="assignment_presenter_for_submission" style="display: none;"></span>
                      <span class="react_pill_container"></span>
                    <span class="tooltip">
                      <span
                        class="grade"
                          tabindex="0"
                      >
                        <span class="tooltip_wrap right">
                            <span class="tooltip_text score_teaser">
                                ${s?.workflow_state === 'pending_review' ? HIDDEN_TEXT : 'Click to test a different score'}
                            </span>
                        </span>
                          <span class="screenreader-only" role="button">
                            Click to test a different score
                          </span>
                          ${scoreDisplay(a, s)}
                      </span>${a.grading_type === 'points' ? `\n                        <span>/ ${n(a.points_possible)}</span>` : ''}${unreadDot}
                    </span>
                    <div style="display: none;">
                      <!-- Store the original points so we don't need to parse and guess at locale -->
                      <span class="original_points">
                        ${graded ? s.score : ''}
                      </span>
                      <!-- Store the original score so that we can retrieve it after any "What-If" calculations -->
                      <span class="original_score">
                        ${displayScore}
                      </span>
                      <!-- Store the current score so that it can persist between multiple "What-If" calculations -->
                      <span class="what_if_score">
                        ${displayScore}
                      </span>
                      <!-- Load any previously saved "What-If" scores -->
                      <span class="student_entered_score">
                        ${s?.student_entered_score ?? ''}
                      </span>
                      <span class="submission_status">
                        ${!s ? 'none' : s.workflow_state}
                      </span>
                      <span class="assignment_group_id">${a.assignment_group_id}</span>
                      <span class="assignment_id">${a.id}</span>
                      <span class="group_weight">${weighted ? group.group_weight : ''}</span>
                      <span class="rules">${esc(JSON.stringify(group.rules || {}).replace(/^\{\}$/, ''))}</span>
                    </div>
                  </div>
                </td>
                <td class="asset_processors_cell" data-assignment-id="${a.id}" data-submission-id="${s?.id || ''}" data-assignment-name="${esc(a.name)}"></td>
                <td class="details">
                  <a href="#"
                      class="toggle_final_grade_info tooltip"
                      aria-label="This assignment does not count toward the final grade."
                        aria-hidden='true'
                        role='presentation'
                        tabindex='-1'
                        style='visibility: hidden;'>
                    <span class="tooltip_wrap right">
                      <span class="tooltip_text">Grade Info</span>
                    </span>
                    <i class="icon-warning standalone-icon"></i>
                  </a>
                  <a href="#"
                    class="toggle_score_details_link tooltip"
                    aria-label="See scoring details"${graded && a.grading_type === 'points' ? `
                    aria-expanded="false"
                    aria-controls="grade_info_${a.id}"` : `
                    aria-hidden='true'
                    role='presentation'
                    tabindex='-1'
                    style='visibility: hidden;'`}
                  >
                    <span class="tooltip_wrap right">
                      <span class="tooltip_text">See scoring details</span>
                    </span>
                    <i class="icon-check-plus standalone-icon"></i>
                  </a>
                  <a href="#"
                    role="button"
                    class="toggle_rubric_assessments_link tooltip"
                    aria-label="See rubric results"
                    aria-expanded='false'
                    aria-controls="rubric_${a.id}"
                    tabindex='0'
                    style="visibility: hidden;">
                    <span class="tooltip_wrap right">
                      <span class="tooltip_text">See rubric results</span>
                    </span>
                    <i class="icon-rubric"></i>
                  </a>
                  <a href="#"
                    id="assignment_comment_${a.id}"
                    class="toggle_comments_link tooltip"
                    aria-label="Read comments"
                    aria-haspopup="true"
                    aria-describedby="comment_count_for_assignment_${a.id}"${hasComments ? `
                      aria-expanded="false"
                      role="button"` : `
                      aria-hidden='true'
                      role='presentation'
                      tabindex='-1'
                      style='visibility: hidden;'`}>
                    <span class="tooltip_wrap right">
                      <span class="tooltip_text" id="comment_count_for_assignment_${a.id}">
                        ${hasComments ? s.comments.length : 0} comment${hasComments && s.comments.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    <i class="icon-discussion standalone-icon"></i>
                    <span class="comment_count">
                      ${hasComments ? s.comments.length : ''}
                    </span>
                  </a>
                </td>
                <td></td>
              </tr>
              <tr id="final_grade_info_${a.id}"
                  class="comments ${graded ? 'assignment_graded' : ''}"
                  style="display: none;">
              </tr>
              <tr id="grade_info_${a.id}" class="comments grade_details ${graded ? 'assignment_graded' : ''}" style="display: none;">
${graded && a.grading_type === 'points' ? gradeDistribution(a) : ''}
              </tr>
${hasComments ? commentsRow(a, s, graded) : ''}
              <tr id="rubric_${a.id}" class="rubric_assessments ${graded ? 'assignment_graded' : ''}" style="display: none;">
              </tr>`
}

function gradeDistribution(a) {
  const p = a.points_possible
  const r = v => Math.round(v * 10) / 10
  return `                  <td colspan="6" style="padding-bottom: 20px;">
                      <table id="score_details_${a.id}" class="ic-Table ic-Table--condensed score_details_table">
                        <thead>
                          <tr>
                            <th colspan="5">
                              Score Details
                            </th>
                            <th>
                              <a href="#" data-aria="grade_info_${a.id}" aria-label="Close score details" class="screenreader-toggle pull-right">Close</a>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                              <td>
                                Mean:
                                ${r(p * 0.81)}
                              </td>
                              <td>
                                High:
                                ${r(p)}
                              </td>
                              <td>
                                Low:
                                ${r(p * 0.42)}
                              </td>
                              <td colspan="3">
                                <div style="cursor: pointer; float: right; height: 30px; margin-left: 20px; width: 160px; position: relative; margin-right: 30px;" aria-hidden="true" title="Mean: ${r(p * 0.81)}, High: ${r(p)}, Low: ${r(p * 0.42)}">
                                </div>
                              </td>
                          </tr>
                        </tbody>
                      </table>
                  </td>`
}

function commentsRow(a, s, graded) {
  return `              <tr id="comments_thread_${a.id}" class="comments comments_thread ${graded ? 'assignment_graded' : ''}" style="display: none;">
                  <td colspan="6">
                    <table class="score_details_table ic-Table ic-Table--condensed">
                      <thead>
                        <tr>
                          <th colspan="3">Comments</th>
                          <th>
                            <a href="#" data-aria="comments_thread_${a.id}" aria-label="Close comments" class="screenreader-toggle pull-right">Close</a>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
${s.comments.map(cm => `                          <tr>
                            <td colspan="3">
                              <span style="white-space: pre-wrap;">${esc(cm.comment)}</span>
                              <div style="text-align: right; font-size: 0.8em; margin-right: 10px; clear: both;">
                                ${esc(cm.author_name)},
                              </div>
                            </td>
                          </tr>`).join('\n')}
                      </tbody>
                    </table>
                  </td>
              </tr>`
}

function pseudoRow(id, title, special, pointsPossible, extraHidden = '') {
  return `            <tr class="student_assignment hard_coded ${special}"
                data-muted="false"
                data-pending_quiz="false"
                id="submission_${id}"
                >
                <th class="title" scope="row">
                    ${esc(title)}
                </th>
                <td class="due">
                </td>
                <td class="submitted">
                </td>
                <td class="status" scope="row">
                </td>
                <td class="assignment_score" >
                  <div style="position: relative; height: 100%;" class="score_holder">
                    <span class="tooltip">
                      <span
                        class="grade"
                      >
                        <span class="tooltip_wrap right">
                            <span class="tooltip_text score_teaser">
                                Total
                            </span>
                        </span>
                          <span class="screenreader-only" role="button">
                          </span>
                          -
                      </span>${pointsPossible !== '' ? `\n                        <span>/ ${esc(pointsPossible)}</span>` : ''}
                    </span>
                    <div style="display: none;">
                      <span class="original_points">
                      </span>
                      <span class="original_score">
                      </span>
                      <span class="what_if_score">
                      </span>
                      <span class="student_entered_score">
                      </span>
                      <span class="submission_status">
                        none
                      </span>
                      ${extraHidden}
                    </div>
                  </div>
                </td>
                <td class="asset_processors_cell" data-assignment-id="${id}" data-submission-id="" data-assignment-name="${esc(title)}"></td>
                <td class="details">
                  <span class="possible points_possible"></span>
                </td>
                <td></td>
              </tr>`
}

export default function render(S, ctx, params) {
  const c = findCourse(S, params.course)
  if (!c) return {status: 404, title: 'Page Not Found', content: '<h1>Page Not Found</h1>'}
  const weighted = c.apply_assignment_group_weights
  const groupsById = Object.fromEntries(c.groups.map(g => [g.id, g]))
  const scheme = c.scheme || DEFAULT_SCHEME
  const excludeTotal = !!c.hide_final_grades
  // grading periods: ?grading_period_id=<id>|0 (0 = All Grading Periods); default is the current period
  const gps = c.gradingPeriods || null
  const qp = ctx.query.get('grading_period_id')
  const selPeriod = gps ? (qp === '0' ? null : gps.find(g => g.id === qp) || currentPeriod(c, S.now) || null) : null
  const selPeriodId = gps ? (selPeriod ? selPeriod.id : '0') : null
  const assignments = c.assignments.filter(a => a.published && (!selPeriod || periodOf(c, a)?.id === selPeriod.id))
    .sort((x, y) => (x.due_at?.getTime() ?? 9e15) - (y.due_at?.getTime() ?? 9e15) || x.position - y.position)
  const rows = assignments.map(a => assignmentRow(S, c, a, groupsById[a.assignment_group_id], weighted))
  const groupRows = c.groups.map(g => pseudoRow(`group-${g.id}`, g.name, 'group_total', weighted ? `${n(g.group_weight)}%` : '',
    `<span class="assignment_group_id">${g.id}</span>\n                      <span class="assignment_id">group-${g.id}</span>\n                      <span class="group_weight">${weighted ? g.group_weight : ''}</span>\n                      <span class="rules">${esc(JSON.stringify(g.rules || {}).replace(/^\{\}$/, ''))}</span>`))
  const finalRow = excludeTotal ? '' : pseudoRow('final-grade', 'Total', 'final_grade', '100%', '<span class="assignment_id">final-grade</span>')
  // GradeSummarySelectMenuGroup (React): grading period + course selects. Approximation of its DOM.
  const selectMenus = `<div id="GradeSummarySelectMenuGroup"><span class="css-mock-view--flex-flex" style="justify-content: flex-start; gap: 1rem; margin-bottom: 1.5rem">${gps ? `
    <span class="css-mock-view-flexItem"><label class="css-mock-select-label" for="grading_period_select_menu">Grading Period</label>
      <select id="grading_period_select_menu" data-testid="select-menu-grading-period" onchange="location.search='?grading_period_id='+this.value">
        ${c.gradingPeriodSet.display_totals_for_all_grading_periods ? `<option value="0"${selPeriodId === '0' ? ' selected' : ''}>All Grading Periods</option>` : ''}
        ${gps.map(g => `<option value="${g.id}"${g.id === selPeriodId ? ' selected' : ''}>${esc(g.title)}</option>`).join('')}
      </select></span>` : ''}
    <span class="css-mock-view-flexItem"><label class="css-mock-select-label" for="course_select_menu">Course</label>
      <select id="course_select_menu" data-testid="select-menu-course" onchange="location.href='/courses/'+this.value+'/grades'">
        ${S.courses.map(x => `<option value="${x.id}"${x.id === c.id ? ' selected' : ''}>${esc(nickname(S, x))}</option>`).join('')}
      </select></span>
  </span></div>`
  const student = S.user.name

  const content = `<div id="grade-summary-content" style="display: none;">
  <div id="print-grades-container" class="ic-Action-header" style="margin-bottom: 2.25rem">
    <div class="ic-Action-header__Primary">
        <h1 class="ic-Action-header__Heading">
          Grades for ${esc(student)}
        </h1>
    </div>
    <div id="print-grades-button-container" class="ic-Action-header__Secondary">
      <a role="button" id="print-grades-button" class="Button print-grades icon-printer" href="javascript:window.print()">
        Print Grades
      </a>
    </div>
      <div id="ClearBadgeCountsButton" class="ic-Action-header__Secondary"></div>
  </div>
  ${selectMenus}
  <div id="assignments">
      <span id="aria-announcer" class="hide-text affix" aria-live="polite"></span>
      <table
        id="grades_summary"
        class="editable ic-Table ic-Table--hover-row ic-Table--grades-summary-table"
      >
          <caption class="screenreader-only">${WHATIF}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Due</th>
            <th scope="col">Submitted</th>
            <th scope="col" class="status">Status</th>
            <th scope="col" class="assignment_score">Score</th>
            <th scope="col" id="asset_processors_header"> <!-- React content --></th>
            <th scope="col"><span class="screenreader-only">Details</span></th>
            <th scope="col"><span class="screenreader-only">Submission Progress Status</span></th>
          </tr>
        </thead>
${rows.join('\n')}
${groupRows.join('\n')}
${finalRow}
      </table>
  </div>
  <input type="text" style="width: 40px; display: none;" id="grade_entry" title="Enter a score to test"/>
  <a href="#" id="revert_score_template" class="revert_score_link" title="Revert to original score"><i class="icon-reply-2"></i></a>
  <a href="/courses/${c.id}/assignments/{{ assignment_id }}/submissions/${S.user.id}" class="update_submission_url" style="display: none;">&nbsp;</a>
</div>`

  const weightTable = weighted
    ? `  <h2>Assignments are weighted by group:</h2>
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
          <td>${n(g.group_weight)}%</td>
        </tr>`).join('\n')}
      <tr style="font-weight: bold;">
        <th scope='row'>Total</th>
        <td>${n(c.groups.reduce((t, g) => t + (g.group_weight || 0), 0))}%</td>
      </tr>
    </tbody>
  </table>`
    : '  <h2>Course assignments are not weighted.</h2>'

  const rightSide = `    <div id="student-grades-right-content" style="display: none;">
${excludeTotal ? `        <div id="student-grades-final" class="student_assignment final_grade" style="font-size: 1.2em;">
          Calculation of totals has been disabled
        </div>` : `        <div class="student_assignment final_grade">
          Total:
            <span class="grade"></span>${c.grading_standard_enabled ? `
              (<span class="letter_grade" id="final_letter_grade_text">–</span>)` : ''}
        </div>`}
          <div id="student-grades-whatif" class="show_guess_grades student-grades-revert-guess-button">
            <button type="button" class="btn button-sidebar-wide show_guess_grades_link"> <i class="icon-check-plus"></i> Show Saved "What-If" Scores</button>
          </div>
          <div id="student-grades-revert" class="revert_all_scores student-grades-revert-guess-button">
            *NOTE*: This is NOT your official score.<br/>
            <button href="#" id="revert-all-to-actual-score" class="btn revert_all_scores_link"><i class="icon-reply-2"></i> Revert to Actual Score</button>
          </div>
      <div id="student-grades-show-all" class="show_all_details">
        <button type="button" class="Button" id="show_all_details_button">Show All Details</button>
      </div>
      <div id="assignments-not-weighted">
<div aria-label="Assignment Weights">
${weightTable}
</div>
          <div id="only_consider_graded_assignments_wrapper" class="ic-Form-control ic-Form-control--checkbox">
            <input type="checkbox" id="only_consider_graded_assignments" checked="true"/>
            <label class="ic-Label" for="only_consider_graded_assignments">Calculate based only on graded assignments</label>
          </div>
      </div>
        <div id="whatif-score-description">
          ${WHATIF}
        </div>
    </div>`

  // GradebooksController#grade_summary js_env (student view)
  const env = {
    assignments_2_student_enabled: false,
    restrict_quantitative_data: false,
    submissions: assignments.map(a => {
      const s = c.submissions.get(a.id)
      return {assignment_id: a.id, score: s?.posted_at ? s.score : null, excused: !!s?.excused, workflow_state: s?.workflow_state || 'unsubmitted'}
    }),
    assignment_groups: c.groups.map(g => ({
      id: g.id, rules: g.rules || {}, group_weight: g.group_weight, position: g.position, name: g.name,
      assignments: assignments.filter(a => a.assignment_group_id === g.id).map(a => ({id: a.id, points_possible: a.points_possible, submission_types: a.submission_types, omit_from_final_grade: !!a.omit_from_final_grade, muted: false, anonymize_students: false, due_at: a.due_at, grading_type: a.grading_type})),
    })),
    group_weighting_scheme: weighted ? 'percent' : 'equal',
    show_total_grade_as_points: false,
    grading_scheme: c.grading_standard_enabled ? scheme : null,
    course_active_grading_scheme: c.grading_standard_enabled ? {id: c.scheme ? `${c.id}01` : '1', title: c.schemeTitle || 'Default Canvas Grading Scheme', data: scheme.map(([name, value]) => ({name, value})), points_based: false, scaling_factor: 1} : null,
    grading_period_set: gps ? {...c.gradingPeriodSet, grading_periods: gps.map(g => ({id: g.id, title: g.title, start_date: g.start_date, end_date: g.end_date, close_date: g.close_date, is_closed: g.is_closed, is_last: g === gps[gps.length - 1], weight: g.weight}))} : null,
    current_grading_period_id: selPeriodId,
    student_id: S.user.id,
    students: [{id: S.user.id, name: S.user.name, sortable_name: S.user.sortable_name}],
    context_asset_string: `course_${c.id}`,
    effective_final_score: null,
    final_override_custom_grade_status_id: null,
    custom_grade_statuses: [],
    exclude_total: excludeTotal,
    outcome_proficiency: null,
    gradebook_non_scoring_rubrics_enabled: false,
    save_assignment_order_url: `/courses/${c.id}/save_assignment_order`,
    current_user: undefined,
  }
  delete env.current_user

  return {
    title: `Grades for ${student}: ${c.name}`,
    course: c,
    activeTab: 'grades',
    crumbs: [['Dashboard', '/'], [c.course_code, `/courses/${c.id}`], ['Grades', `/courses/${c.id}/grades`], [student, `/courses/${c.id}/grades/${S.user.id}`]],
    content,
    rightSide,
    cssBundles: ['grade_summary'],
    env,
    scripts: [GRADES_JS()],
  }
}

export function allGrades(S) {
  const rows = S.courses.map(c => {
    const pct = c.hide_final_grades ? '--' : c.scores?.current_score != null ? `${n(c.scores.current_score)}%` : 'no grade'
    return `  <tr>
    <td class="course"><a href="/courses/${c.id}/grades/${S.user.id}">${esc(nickname(S, c))}</a></td>
    <td class="percent">
      ${pct}
    </td>
    <td style="display: none;"><a href="#" title="Send a Message to the Teacher" class="no-hover"><img alt="Send a Message to the Teacher" src="/dist/images/email-9a971ebcbe.png" /></a></td>
    <td class="grading_period_dropdown">
    </td>
  </tr>`
  })
  return {
    title: 'Grades',
    crumbs: [['Dashboard', '/'], ['Grades', '/grades']],
    cssBundles: ['user_grades'],
    content: `<h1 class='screenreader-only'>Grades</h1>
${S.courses.length ? `<h2>Courses I'm Taking</h2>
<table class="course_details student_grades">
${rows.join('\n')}
</table>` : ''}`,
  }
}

export {json}
