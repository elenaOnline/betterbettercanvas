// Assignment page: GET /courses/:id/assignments/:aid  (assignments_controller#show, student)
// Order of decisions follows the controller:
//  1. A2 student view (a2_enabled?: the pilot school has "Assignment enhancements" on; not quizzes, discussions,
//     external tools) unless ?assignments_2=false or cookie mock_assignment_view=legacy:
//     `render html: "", layout: true` + assignments_show_student bundle (React, GraphQL). The server
//     ships an empty #content; pages/client/assignment_a2.js renders the post-hydration DOM
//     (Header.jsx, AssignmentDetails.jsx, GradeDisplay.jsx, AttemptInformation.tsx,
//     SubmissionWorkflowTracker.jsx, AssignmentToggleDetails, AttemptTab/FileUpload, StudentFooter.jsx)
//     from data embedded as the GraphQL response would deliver it (transport approximation).
//  2. quiz -> 302 /courses/:id/quizzes/:quiz_id ; graded discussion -> 302 /courses/:id/discussion_topics/:id
//     (with cookie mock_quiz_engine=new, the first quiz of each course is a New Quizzes LTI assignment
//     instead: lti/_lti_message launch with form[data-tool-id="Quizzes 2"] + iframe.tool_launch).
//  3. external_tool -> LTI launch page (lti/_lti_message.html.erb + lti/_launch_iframe.html.erb).
//  4. legacy ERB student view: assignments/show.html.erb (#assignment_show, .assignment-title,
//     _student_assignment_overview ul.student-assignment-overview, .description.user_content) with
//     _assignment_sidebar / _submission_sidebar on the right.
import {esc} from '../lib/html.mjs'
import {iso, dateString, timeString, datetimeString} from '../lib/time.mjs'
import {courseCrumbs, courseScripts, courseEnv, lookupCourse, notFoundPage} from './course_home.mjs'

export function isNewQuiz(c, a, ctx) {
  if (ctx.cookies.mock_quiz_engine !== 'new' || !a.is_quiz) return false
  return c.assignments.find(x => x.is_quiz)?.id === a.id
}

function readableTypes(a) {
  const map = {online_upload: 'a file upload', online_text_entry: 'a text entry box', online_url: 'a website url', media_recording: 'a media recording', external_tool: 'an external tool', online_quiz: 'an online quiz', discussion_topic: 'a discussion post'}
  const parts = a.submission_types.map(t => map[t] || t)
  return parts.length <= 1 ? parts.join('') : parts.slice(0, -1).join(', ') + ' or ' + parts[parts.length - 1]
}

function ltiPage(S, c, a, {quizzes = false} = {}) {
  const toolId = quizzes ? 'Quizzes 2' : 'pearson_mastering'
  const linkText = quizzes ? 'Quizzes 2' : 'Mastering Chemistry'
  const resource = quizzes ? 'https://b2c-mock-school.quiz-lti-b2c-mock-school-prod.instructure.com/lti/launch' : 'https://mlm.pearson.com/lti/launch'
  return `<div id="assignment_external_tools"></div>
<div class="tool_content_wrapper
  "
  data-tool-wrapper-id="mock-${a.id}"
  >
  <form action="${resource}"
      class="hide"
      method="POST"
      target="tool_content"
      id="tool_form"
      data-tool-launch-type="${quizzes ? 'full_width' : 'iframe'}"
      data-tool-id="${toolId}"
      data-tool-path="/lti/launch"
      data-message-type="basic-lti-launch-request">
      <input type="hidden" name="lti_message_type" id="lti_message_type" value="basic-lti-launch-request" />
      <input type="hidden" name="resource_link_title" id="resource_link_title" value="${esc(a.name)}" />
  <div style="margin-bottom: 20px;">
      <div class="load_tab">
          This tool needs to be loaded in a new browser window
          <div style="margin: 10px 0;">
              <button class="btn" type="submit"
                      data-expired_message="The session for this tool has expired. Please reload the page to access the tool again">
                  Load ${esc(linkText)} in a new window
              </button>
          </div>
      </div>
      <div class="tab_loaded" style="display: none;">
          This tool was successfully loaded in a new browser window. Reload the page to access the tool again.
      </div>
  </div>
  </form>

    <iframe src="about:blank" name="tool_content" id="tool_content" class="tool_launch" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" tabindex="0" title="${esc(linkText)}" srcdoc="${esc(`<body style='font-family:Lato,sans-serif;color:#6B7780;display:flex;align-items:center;justify-content:center;height:90vh;margin:0'><p>${linkText} (LTI tool content is not part of mock-canvas)</p></body>`)}" style="height:100%;width:100%;" allow="geolocation *; microphone *; camera *; midi *; encrypted-media *; autoplay *; clipboard-write *; display-capture *" data-lti-launch="true"></iframe>
</div>`
}

// external_tools_show bundle: sizes .tool_content_wrapper to the viewport (ToolLaunchResizer)
const LTI_RESIZE = `window.__mockLater(function () {
  var w = document.querySelector('.tool_content_wrapper'); if (!w) return
  w.style.height = Math.max(450, window.innerHeight - w.getBoundingClientRect().top - 20) + 'px'
})`

function availableText(S, a) {
  // shared/_available_dates.html.erb
  if (a.lock_at && a.unlock_at) return `${datetimeString(a.unlock_at, S.now)} - ${datetimeString(a.lock_at, S.now)}`
  if (a.lock_at) return `until ${datetimeString(a.lock_at, S.now)}`
  return `after ${datetimeString(a.unlock_at, S.now)}`
}

function legacyOverview(S, c, a) {
  return `<ul class='student-assignment-overview'>
  <li>
    <span class='title'>Due</span>
    <span class='value'>
          <span class="date_text">
${a.due_at ? `                <span class="display_date">${esc(dateString(a.due_at, S.now))}</span> by
                <span class="display_time">${esc(timeString(a.due_at))}</span>` : '              No Due Date'}
          </span><!--
        --></span>
  </li>
    <li>
      <span class='title'>Points</span>
      <span class='value'>${a.points_possible}</span>
    </li>
    <li>
      <span class='title'>Submitting</span>
      <span class='value'>${esc(readableTypes(a))}</span>
    </li>
${a.unlock_at || a.lock_at ? `    <li>
      <span class="title">Available</span>
      <span class="value">${esc(availableText(S, a))}</span>
    </li>
` : ''}  <div class="clear"></div>
</ul>`
}

function legacySidebar(S, c, a, s) {
  if (!s || (!s.submission_type && s.workflow_state !== 'graded' && !s.excused)) return '<div id="sidebar_content">\n</div>'
  const header = s.excused ? 'Excused!' : s.submitted_at ? '<i class="icon-check" aria-hidden="true"></i>\n        Submitted!' : '<i class="icon-x" aria-hidden="true"></i>\n        Not Submitted!'
  const grade = s.posted_at && s.grade != null && !s.excused
    ? `<div>Grade: ${esc(a.grading_type === 'pass_fail' ? (s.grade === 'complete' ? 'Complete' : 'Incomplete') : s.grade)} <span style="font-size: 0.8em;">(${a.points_possible} pts possible)</span></div>
          <div>Graded Anonymously: no</div>` : ''
  const comments = s.comments.length
    ? s.comments.map(cm => `<div class="comment">\n          <span class="signature">${esc(cm.author_name)}, ${esc(datetimeString(cm.created_at, S.now))}</span>\n          ${esc(cm.comment)}\n        </div>`).join('\n')
    : 'No Comments'
  return `<div id="sidebar_content">
<div class="details">
  <h2>Submission</h2>
    <div class="header">
      ${header}
    </div>
  <div class="content">
    <span class="${s.late ? 'late' : ''}">
      ${s.submitted_at ? esc(datetimeString(s.submitted_at, S.now)) + (s.late ? ' (late)' : '') : ''}
    </span>

    <div>
      <a href="/courses/${c.id}/assignments/${a.id}/submissions/${S.user.id}">
        Submission Details
      </a>
    </div>

    <div class="module">
      ${grade}
    </div>

    <div class="comments module">
        <h3>Comments: </h3>
        ${comments}
    </div>
  </div>
</div>
</div>`
}

function legacyPage(S, c, a, s) {
  const hasSub = !!s?.submission_type
  const expects = !a.submission_types.some(t => ['none', 'on_paper', 'external_tool', 'online_quiz', 'discussion_topic'].includes(t))
  const button = expects ? `<button type="button" class="Button Button--primary submit_assignment_link ${s?.late ? 'late' : ''}">${hasSub ? 'New Attempt' : 'Start Assignment'}</button>` : ''
  return `<div id="assignment_show" class="assignment content_underline_links" data-lti-page-content="true">
    <!--Student View-->
    <div class='assignment-title'>
      <div class='title-content'>
        <h1 class="title">
          ${esc(a.name)}
        </h1>
      </div>
      <div class='assignment-buttons'>
        ${button}
      </div>
    </div>
    ${legacyOverview(S, c, a)}

  <div class="clear"></div>

  <div class="clear"></div>

  <div class="description user_content " data-resource-type="assignment.body" data-resource-id=${a.id}>${a.description || 'No additional details were added for this assignment.'}</div>

  <div style="display: none;">
    <span class="timestamp">${a.due_at ? Math.floor(a.due_at.getTime() / 1000) : ''}</span>
    <span class="due_date_string">${a.due_at ? iso(a.due_at).slice(5, 7) + '/' + iso(a.due_at).slice(8, 10) + '/' + iso(a.due_at).slice(0, 4) : ''}</span>
    <span class="due_time_string"></span>
  </div>
</div>
${expects ? `<div id="submit_assignment" data-show-immediately="false" style="display: none;">
  <div class="content" id="submit_assignment_tabs">
    <ul>
${a.submission_types.includes('online_upload') ? '      <li><a href="#submit_online_upload_form" class="submit_online_upload_option">File Upload</a></li>\n' : ''}${a.submission_types.includes('online_text_entry') ? '      <li><a href="#submit_online_text_entry_form" class="submit_online_text_entry_option">Text Entry</a></li>\n' : ''}    </ul>
  </div>
</div>` : ''}
<div id="rubrics" class="rubric_container" style="display: none;"></div>`
}

/** what the A2 GraphQL queries would return, flattened (see pages/client/assignment_a2.js) */
function a2Data(S, c, a, s) {
  return {
    assignment: {
      _id: a.id, name: a.name, description: a.description, dueAt: iso(a.due_at), unlockAt: iso(a.unlock_at), lockAt: iso(a.lock_at),
      pointsPossible: a.points_possible, gradingType: a.grading_type, submissionTypes: a.submission_types, allowedAttempts: null,
      expectsSubmission: !a.submission_types.some(t => ['none', 'on_paper', 'external_tool'].includes(t)),
      groupName: c.groups.find(g => g.id === a.assignment_group_id)?.name || null,
    },
    submission: s ? {
      _id: s.id, attempt: s.attempt || (s.submitted_at ? 1 : 0), state: s.workflow_state, submittedAt: iso(s.submitted_at),
      grade: s.posted_at ? s.grade : null, score: s.posted_at ? s.score : null, excused: s.excused, late: s.late, missing: s.missing,
      gradingStatus: s.excused ? 'excused' : s.workflow_state === 'graded' && s.posted_at ? 'graded' : s.submitted_at ? 'needs_grading' : null,
      submissionType: s.submission_type, unreadCommentCount: s.read_state === 'unread' ? s.comments.length : 0, commentCount: s.comments.length,
      latePolicyStatus: s.late_policy_status, deductedPoints: s.points_deducted,
    } : null,
  }
}

export default function render(S, ctx, params) {
  const c = lookupCourse(S, params)
  if (!c) return notFoundPage(S, 'course')
  const a = c.assignments.find(x => x.id === params.assignment)
  if (!a) return {...notFoundPage(S, 'assignment'), course: c, activeTab: 'assignments', crumbs: courseCrumbs(S, c, [['Assignments', `/courses/${c.id}/assignments`]])}
  const s = c.submissions.get(a.id)
  const crumbs = courseCrumbs(S, c, [['Assignments', `/courses/${c.id}/assignments`], [a.name, `/courses/${c.id}/assignments/${a.id}`]])
  const base = {course: c, activeTab: 'assignments', crumbs, title: a.name}
  const q = ctx.query
  const legacy = ctx.cookies.mock_assignment_view === 'legacy' || q.get('assignments_2') === 'false'

  if (isNewQuiz(c, a, ctx)) {
    return {...base, content: ltiPage(S, c, a, {quizzes: true}), rightSide: '', bodyClass: ['ic-framed-lti-tool'], scripts: [LTI_RESIZE],
      env: courseEnv(S, c, {LTI_TOOL: 'true', LTI_TOOL_ID: '7001', ASSIGNMENT_POINTS_POSSIBLE: a.points_possible, ASSIGNMENT_ID: a.id})}
  }
  if (a.is_quiz) return {redirect: `/courses/${c.id}/quizzes/${a.quiz_id}`}
  if (a.is_discussion && a.discussion_topic_id) return {redirect: `/courses/${c.id}/discussion_topics/${a.discussion_topic_id}`}
  if (a.submission_types.includes('external_tool')) {
    return {...base, content: ltiPage(S, c, a), rightSide: '', scripts: [LTI_RESIZE],
      env: courseEnv(S, c, {LTI_TOOL: 'true', LTI_TOOL_ID: '7002', ASSIGNMENT_POINTS_POSSIBLE: a.points_possible, ASSIGNMENT_ID: a.id})}
  }
  if (!legacy) {
    const data = a2Data(S, c, a, s)
    return {
      ...base,
      content: '',
      rightSide: '',
      cssBundles: ['assignments_2_student'],
      env: courseEnv(S, c, {
        a2_student_view: true, peer_review_mode_enabled: false, peer_review_available: false, restrict_quantitative_data: false,
        ASSIGNMENT_ID: a.id, COURSE_ID: c.id, ISOBSERVER: false, PREREQS: {}, CONFETTI_ENABLED: false, EMOJIS_ENABLED: false,
        SUBMISSION_ID: s ? Buffer.from(`Submission-${s.id}`).toString('base64') : null, enrollment_state: 'active',
        can_submit_assignment_from_section: true, stickers_enabled: false,
      }),
      scripts: courseScripts(S, c, {a2: data}, 'assignment_a2'),
    }
  }
  return {
    ...base,
    content: legacyPage(S, c, a, s),
    rightSide: legacySidebar(S, c, a, s),
    cssBundles: ['assignments'],
    env: courseEnv(S, c, {ASSIGNMENT_ID: a.id, SUBMISSION_ID: s?.id || null, FIRST_ANNOTATION_SUBMISSION: false}),
  }
}

