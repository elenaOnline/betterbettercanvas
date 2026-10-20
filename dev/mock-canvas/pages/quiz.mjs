// Classic quizzes (Quizzes 1), student:
//   show: GET /courses/:id/quizzes/:quiz       app/views/quizzes/quizzes/show.html.erb
//         (#quiz_show > header.quiz-header > h1#quiz_title, _quiz_show_student -> _quiz_details
//          ul#quiz_student_details + Instructions, .take_quiz_button a#take_quiz_link) and
//         _quiz_right_side "Submission Details" table when there is a completed submission.
//   take: GET /courses/:id/quizzes/:quiz/take  app/views/quizzes/quizzes/take_quiz.html.erb
//         (body.assessing, h3.loading / div.loaded > header.quiz-header, form#submit_quiz_form >
//          #questions.assessing > .question_holder > .display_question.question.multiple_choice_question,
//          #last_saved_indicator, #submit_quiz_button) + _take_quiz_right_side (ul#question_list,
//          #quiz-time-elapsed). The take_quiz bundle reveals .loaded and hides .loading; the mock does
//          that after mock_delay.
// Canvas really GETs /take via a data-method="post" link (POST .../take creates the submission and
// redirects); the mock serves GET directly. Real Canvas has no `#quiz-taking` or `#quiz_form`
// element on these pages (bc's quiz-safe-mode selectors); we do not invent them.
// Questions are generated (the data model has none). The `quizzes` css bundle is not compiled in
// vendor-built, so these pages render with common.css only (approximation of styling).
import {esc} from '../lib/html.mjs'
import {datetimeString} from '../lib/time.mjs'
import {courseCrumbs, courseEnv, lookupCourse, notFoundPage} from './course_home.mjs'

function findQuiz(c, qid) { return c.assignments.find(a => a.is_quiz && a.quiz_id === String(qid)) }

function questions(a) {
  const n = Math.max(3, Math.min(10, Math.round(a.points_possible / (a.points_possible >= 100 ? 10 : 2))))
  const per = Math.round((a.points_possible / n) * 100) / 100
  const base = +a.quiz_id * 10
  return Array.from({length: n}, (_, i) => ({
    id: String(base + i + 1), name: `Question ${i + 1}`, points: per,
    text: `<p>Which of the following statements about item ${i + 1} is correct?</p>`,
    answers: ['It always holds', 'It holds only in the finite case', 'It never holds', 'None of the above'].map((t, j) => ({id: String((base + i + 1) * 10 + j), text: t})),
  }))
}

function crumbsFor(S, c, a) {
  return courseCrumbs(S, c, [['Quizzes', `/courses/${c.id}/quizzes`], [a.name, `/courses/${c.id}/quizzes/${a.quiz_id}`]])
}

function availableText(S, a) {
  // shared/_available_dates.html.erb
  if (a.lock_at && a.unlock_at) return `${datetimeString(a.unlock_at, S.now)} - ${datetimeString(a.lock_at, S.now)}`
  if (a.lock_at) return `until ${datetimeString(a.lock_at, S.now)}`
  return `after ${datetimeString(a.unlock_at, S.now)}`
}

function details(S, a, nq) {
  return `<base target="_top" />
<ul id="quiz_student_details">
  <li>
    <span class="title">Due</span>
    <span class="value">
${a.due_at ? `        <span data-tooltip data-html-tooltip-title="${esc(datetimeString(a.due_at, S.now))}">
          ${esc(datetimeString(a.due_at, S.now))}
        </span>` : '        No due date'}
    </span>
  </li>

  <li style="">
    <span class="title">Points</span>
    <span class="value">${a.points_possible}</span>
  </li>

  <li>
    <span class="title">Questions</span>
    <span class="value">${nq}</span>
  </li>
${a.unlock_at ? `  <li>
    <span class="title">Available</span>
    <span class="value">${esc(availableText(S, a))}</span>
  </li>
` : ''}  <li>
    <span class="title">Time Limit</span>
    <span class="value">
        None
    </span>
  </li>

</ul>`
}

export function show(S, ctx, params) {
  const c = lookupCourse(S, params)
  if (!c) return notFoundPage(S, 'course')
  const a = findQuiz(c, params.quiz)
  if (!a) return {...notFoundPage(S, 'quiz'), course: c, activeTab: 'assignments'}
  const s = c.submissions.get(a.id)
  const qs = questions(a)
  const completed = s && (s.submitted_at || s.workflow_state === 'graded') && !s.excused
  const takeHref = `/courses/${c.id}/quizzes/${a.quiz_id}/take?user_id=${S.user.id}`
  let action
  if (s?.excused) action = `      <div class="lock_explanation">
        This quiz has been excused
      </div>`
  else action = `        <div class="take_quiz_button">
          <a class="btn btn-primary" id="take_quiz_link" data-method="post" role="button" href="${takeHref}">${completed ? 'Take the Quiz Again' : 'Take the Quiz'}</a>
        </div>`
  const right = completed ? `  <div>
    <div style="border-bottom: 1px solid #888; font-size: 1.1em; font-weight: bold;">
        Submission Details:
    </div>
    <div>
    <table class="summary" style="font-size: 1.1em;">
${s.workflow_state === 'pending_review' ? `      <tfoot>
        <tr style="">
          <td colspan="2" class="footnote">
            *
              Some questions not yet graded
          </td>
        </tr>
      </tfoot>
` : ''}      <tbody>
        <tr>
          <th>Time:</th>
          <td>14 minutes</td>
        </tr>
${s.posted_at ? `        <tr style="">
          <th>Current Score:</th>
          <td>${s.score} out of ${a.points_possible}</td>
        </tr>
        <tr style="">
          <th>Kept Score:</th>
          <td>${s.score} out of ${a.points_possible}</td>
        </tr>
` : ''}      </tbody>
    </table>
    </div>
  </div>` : ''
  const content = `<div id="quiz_show">
  <header class="quiz-header">

    <h1 id="quiz_title">
      ${esc(a.name)}
    </h1>

    <div class="row-fluid">
        <div id="quiz_details_wrapper" data-submitted-count=""></div>
    </div>
    <div class="row-fluid">
${details(S, a, qs.length)}
    <h2>Instructions</h2>
    <div class="description user_content" role="region" aria-label="Quiz Instructions">
      ${a.description}
    </div>
    </div>

${action}

    <div id="quiz-submission-version-table"></div>

  </header>

  <div id="direct-share-mount-point"></div>
  <div id="assign-to-mount-point"></div>

  <div id="module_sequence_footer"></div>

</div>`
  return {
    title: `${a.name}: ${c.name}`,
    content,
    rightSide: right ? `<div id="sidebar_content" class="rs-margin-bottom">
      <ul class="page-action-list" style="display:none;">
        <h2>Related Items</h2>
      </ul>
    </div>
${right}` : '',
    course: c,
    activeTab: 'assignments', // Quizzes tab is hidden in the pilot school course nav; Canvas falls back to no active tab
    crumbs: crumbsFor(S, c, a),
    env: courseEnv(S, c, {QUIZ_SUBMISSION_EVENTS_URL: null, IS_SURVEY: false, QUIZ: {id: a.quiz_id, title: a.name, points_possible: a.points_possible}}),
  }
}

export function take(S, ctx, params) {
  const c = lookupCourse(S, params)
  if (!c) return notFoundPage(S, 'course')
  const a = findQuiz(c, params.quiz)
  if (!a) return {...notFoundPage(S, 'quiz'), course: c, activeTab: 'assignments'}
  const qs = questions(a)
  const started = S.now
  const qHtml = qs.map(q => `<div role="region" aria-label="Question" class="quiz_sortable question_holder " id="" style="" data-group-id="">
  <div style="display: block; height: 1px; overflow: hidden;">&nbsp;</div>
  <a name="question_${q.id}"></a>
  <div class="display_question question multiple_choice_question   " id="question_${q.id}">
      <a href="#" class="flag_question" role="checkbox" aria-checked="false">
        <span class="screenreader-only">
          Flag question: ${q.name}
        </span>
      </a>
    <div class="header" >
      <span class="name question_name" role="heading" aria-level="2">${q.name}</span>
      <span class="question_points_holder" style="">
        <div class="user_points" >
        </div>
        <span class="points question_points">${q.points}</span> pts
      </span>
      <span class="ui-helper-hidden-accessible"> </span>
    </div>
    <div class="links" style="display: none;">
    </div>
    <div id="question_${q.id}_question_text" class="question_text user_content">
      ${q.text}
    </div>
    <div class="text">
      <div class="answers">
              <fieldset>
                <legend class="screenreader-only">
                  Group of answer choices
                </legend>
${q.answers.map(ans => `<div class="answer">
    <label class="answer_row user_content">
      <span class="answer_input">
          <input type="radio"  class="question_input" name="question_${q.id}" value="${ans.id}" id="question_${q.id}_answer_${ans.id}" aria-labelledby="question_${q.id}_answer_${ans.id}_label" />
      </span>
      <div class="answer_label" id="question_${q.id}_answer_${ans.id}_label">
        ${esc(ans.text)}
      </div>
    </label>
</div>`).join('\n')}
              </fieldset>
      </div>
    </div>
    <div class="clear"></div>
  </div>
</div>`).join('\n')
  const content = `<h3 class="loading">Loading...</h3>
<div class="loaded" style="display:none">
  <header class="quiz-header">
    <h1>${esc(a.name)}</h1>
    Started:
    ${esc(datetimeString(started, S.now))}
    <h2>Quiz Instructions</h2>
    <div id="quiz-instructions" class="user_content">
      ${a.description}
    </div>

  </header>

  <form id="submit_quiz_form" class="" action="/courses/${c.id}/quizzes/${a.quiz_id}/submissions?user_id=${S.user.id}" method="post">

  <div id="questions" class="assessing">
    <input type="hidden" name="attempt" value="1"/>
    <input type="hidden" name="validation_token" value="mock-validation-token"/>
    <div style="display: none;" id="quiz_urls">
      <a href="/courses/${c.id}/quizzes/${a.quiz_id}/submissions/backup?user_id=${S.user.id}" class="backup_quiz_submission_url">&nbsp;</a>
      <span class="started_at">${started.toISOString()}</span>
      <span class="now">${S.now.toISOString()}</span>
      <span class="end_at"></span>
      <span class="end_at_without_time_limit">${a.due_at ? a.due_at.toISOString() : ''}</span>
      <span class="due_at">${a.due_at ? a.due_at.toISOString() : ''}</span>
      <span class="time_limit">&nbsp;</span>
      <span class="timer_autosubmit_disabled">false</span>
      <span class="time_left"></span>
    </div>

${qHtml}

    <div class="button-container clearfix">
    </div>
  </div>

  <div style="font-size: 1.2em; display: none;" id="times_up_dialog">
    Time's Up!  Submitting results in:
    <div style="text-align: center; font-size: 1.2em; margin: 10px;" class="countdown_seconds"></div>
    <div class="button-container">
      <button type="submit" class="submit_quiz_button btn quiz_submit">
        Ok, fine
      </button>
    </div>
  </div>

  <div class=form-actions>
    <span id="last_saved_indicator">Not saved</span>
    <button type="submit" class="btn submit_button quiz_submit btn-secondary" id="submit_quiz_button" data-action="/courses/${c.id}/quizzes/${a.quiz_id}/submissions?user_id=${S.user.id}">
      Submit Quiz
    </button>
  </div>

  </form>

  <form id="deauthorized_dialog"
    class="hide"
    title="Login Required"
    action="/courses/${c.id}/quizzes/${a.quiz_id}"
    method="get">
    <div class="text-center">
      <strong>You have been logged out of canvas.</strong><br /> To continue please log in
    </div>
  </form>
</div>`
  const right = `<div>
<h3 style="margin: 0px;">Questions</h3>
<ul id="question_list" style="max-height: 200px; overflow: auto;" class="">
${qs.map(q => `    <li id="list_question_${q.id}" class="list_question">
        <a class="jump_to_question_link" href="#question_${q.id}">
          <i class="placeholder icon-question"><span class="screenreader-only icon-text">Haven't Answered Yet</span></i>${q.name}
          <span class="screenreader-only marked-status"></span>
        </a>
    </li>`).join('\n')}
</ul>
  <div id="quiz-time-elapsed">
    <div style="display: flex; align-items: center;">
      <span class="time_header">
          Time Elapsed:
      </span>
      <span style="padding-left: 10px;">
        <a style="font-size: 0.8em; padding: 3px 6px" href="#" role="button" class="btn hide_time_link">Hide Time</a>
      </span>
    </div>
${a.due_at ? `      <div style="font-size: 0.8em;">
        Attempt due:
        ${esc(datetimeString(a.due_at, S.now))}
      </div>
` : ''}    <div class="clear"></div>
    <div class="time_running"></div>
  </div>
</div>`
  // take_quiz bundle: swap .loading for .loaded, start the elapsed timer, mark answered questions
  const script = `window.__mockLater(function () {
  var l = document.querySelector('h3.loading'); if (l) l.style.display = 'none'
  var d = document.querySelector('div.loaded'); if (d) d.style.display = ''
  var start = Date.now(), tr = document.querySelector('#quiz-time-elapsed .time_running')
  function tick() { var s = Math.floor((Date.now() - start) / 1000); if (tr) tr.textContent = (s >= 60 ? Math.floor(s / 60) + ' Minutes, ' : '') + (s % 60) + ' Seconds' }
  tick(); setInterval(tick, 1000)
  document.addEventListener('change', function (e) {
    var inp = e.target.closest && e.target.closest('.question_input'); if (!inp) return
    var qid = inp.name.replace('question_', '').split('_')[0]
    var li = document.getElementById('list_question_' + qid)
    if (li) { li.classList.add('answered'); var i = li.querySelector('i.placeholder'); if (i) { i.className = 'placeholder icon-check'; i.querySelector('.icon-text').textContent = 'Answered' } }
    var ind = document.getElementById('last_saved_indicator'); if (ind) ind.textContent = 'Quiz saved at ' + new Date().toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles'}).toLowerCase().replace(' ', '')
  })
})`
  return {
    title: `Quiz: ${a.name}`,
    content,
    rightSide: right,
    course: c,
    activeTab: 'assignments',
    crumbs: crumbsFor(S, c, a),
    bodyClass: ['assessing'],
    env: courseEnv(S, c, {QUIZ_SUBMISSION_EVENTS_URL: `/api/v1/courses/${c.id}/quizzes/${a.quiz_id}/submissions/mock/events`, IS_PREVIEW: false}),
    scripts: [script],
  }
}

export default show
