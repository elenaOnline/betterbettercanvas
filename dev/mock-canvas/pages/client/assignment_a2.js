// mock-canvas: Assignments 2 student view (ui/features/assignments_show_student) post-hydration DOM,
// approximated: the component tree, data-testids, ids and text follow the source; InstUI emotion
// classes are css-mock-*. Data comes from window.__mockCourse.a2 (what the GraphQL query returns).
(function () {
  var C = window.__mockC, h = C.h, D = C.cfg.a2
  if (!D) return
  var a = D.assignment, s = D.submission
  var content = document.getElementById('content')

  function text(t, style, attrs) { return h('span', Object.assign({class: 'css-mock-text', style: style || null}, attrs || {}), typeof t === 'string' ? [t] : t) }
  function flex(kids, style, attrs) { return h('span', Object.assign({class: 'css-mock-flex', style: style || null}, attrs || {}), kids) }

  function gradeDisplay() {
    var html
    if (s && s.gradingStatus === 'excused') html = 'Excused'
    else if (s && s.grade != null && s.gradingStatus === 'graded') {
      if (a.gradingType === 'points') html = '<span class="points-value"><strong>' + s.score + '/' + a.pointsPossible + '</strong> Points</span>'
      else if (a.gradingType === 'pass_fail') html = s.grade === 'complete' ? 'Complete' : 'Incomplete'
      else html = String(s.grade)
    } else if (a.gradingType === 'points') html = '<span class="points-value">' + a.pointsPossible + '</span> Points Possible'
    else html = ''
    var srText = (s && s.grade != null) ? (a.gradingType === 'points' ? s.score + '/' + a.pointsPossible : s.grade) : 'Ungraded, ' + a.pointsPossible + ' Possible Points'
    return h('div', {}, [C.sr(srText), h('span', {class: 'css-mock-flex', 'aria-hidden': 'true', style: 'flex-direction:column;text-align:end'}, [
      h('span', {}, [h('span', {class: 'css-mock-text', 'data-testid': 'grade-display', style: 'font-size:1.75rem;line-height:1;text-transform:capitalize', html: html})]),
    ])])
  }

  function statusPill() {
    if (!s) return null
    if (s.missing && !s.submittedAt) return h('span', {class: 'submission-missing-pill'}, [h('span', {class: 'css-mock-pill danger', 'data-testid': 'missing-pill', text: 'Missing'})])
    if (s.late) return h('span', {class: 'submission-late-pill'}, [h('span', {class: 'css-mock-pill danger', 'data-testid': 'late-pill', text: 'Late'})])
    return null
  }

  function header() {
    var details = h('span', {class: 'css-mock-flex', style: 'flex-direction:column'}, [
      h('div', {style: 'line-height: 1.05;'}, [h('span', {style: 'padding:.125rem 0 0'}, [text(a.name, 'font-size:2rem;font-weight:300;word-wrap:break-word', {'data-testid': 'title'})])]),
      a.dueAt ? h('span', {}, [h('div', {style: 'line-height: 1;'}, [text([C.friendly(a.dueAt, C.fullWithWeekday(a.dueAt), 'Due:', {'data-testid': 'due-date'})], 'font-size:.875rem;font-weight:700', {'data-testid': 'assignment-sub-header'})])]) : null,
    ])
    return h('div', {'data-testid': 'assignment-student-header', id: 'assignments-2-student-header'}, [
      h('h1', {class: 'css-mock-heading', style: 'margin:0'}, [C.sr(' ' + a.name + ' ')]),
      h('span', {class: 'css-mock-flex', id: 'assignment-student-header-content', style: 'align-items:flex-start;padding:0 0 2.25rem 0'}, [
        h('span', {style: 'flex:1 1 auto;min-width:0'}, [details]),
        h('span', {}, [flex([h('span', {style: 'margin:0 .5rem 0 0'}, [statusPill()]), h('span', {}, [flex([h('span', {style: 'padding:0 .75rem 0 0'}, [gradeDisplay()])], 'flex-wrap:wrap;align-items:center')])], 'align-items:center')]),
      ]),
    ])
  }

  function tracker() {
    var submitted = s && s.submittedAt
    var graded = s && s.gradingStatus === 'graded'
    var title = graded ? 'Review Feedback' : submitted ? null : 'In Progress'
    var sub = graded ? 'This assignment is complete!' : submitted ? 'NEXT UP: Review Feedback' : 'NEXT UP: Submit Assignment'
    var titleEl = submitted && !graded
      ? text([C.friendly(s.submittedAt, C.MONTHS[C.laParts(new Date(s.submittedAt)).m - 1] + ' ' + C.laParts(new Date(s.submittedAt)).d + ', ' + C.laParts(new Date(s.submittedAt)).y + ' ' + C.timeFull(s.submittedAt), 'Submitted on')])
      : text(title)
    var pct = graded ? 100 : submitted ? 66 : 33
    return h('div', {'data-testid': 'submission-workflow-tracker', style: 'display:flex;align-items:center;gap:.5rem'}, [
      h('span', {role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemax': '100', 'aria-label': 'Submission Progress', style: 'display:inline-block;width:2rem;height:2rem;border-radius:50%;background:conic-gradient(#03893D ' + pct + '%, #C7CDD1 0)'}, [h('span', {style: 'display:block;margin:4px;width:24px;height:24px;border-radius:50%;background:#fff'})]),
      h('div', {}, [h('div', {'data-testid': 'submission-workflow-tracker-title'}, [titleEl]), h('div', {'data-testid': 'submission-workflow-tracker-subtitle'}, [text(sub, 'font-size:.875rem;font-weight:700;color:#03893D')])]),
    ])
  }

  function attemptInfo() {
    var attempt = (s && s.attempt) || 1
    var select = h('span', {'data-testid': 'attemptSelect', style: 'display:inline-block;width:14rem'}, [
      h('label', {for: 'attempt-select', class: 'css-1sr5vj2-screenReaderContent', text: 'Attempt'}),
      h('span', {class: 'css-mock-select', style: 'width:100%'}, [h('input', {id: 'attempt-select', readonly: true, role: 'combobox', value: 'Attempt ' + attempt, style: 'border:0;outline:0;background:transparent;font:inherit;width:100%;margin:0;padding:0;box-shadow:none'}), C.iconEl('arrow-open-down')]),
    ])
    var score = s && s.gradingStatus === 'graded' && s.score != null ? s.score + '/' + a.pointsPossible : s && s.excused ? 'Excused' : 'N/A'
    var fb = h('button', {type: 'button', class: 'css-mock-btn', 'data-testid': 'view_feedback_button'}, [C.iconEl('compose'), s && s.commentCount ? 'View Feedback' : 'Add Comment'])
    if (s && s.unreadCommentCount) fb.appendChild(h('span', {'data-testid': 'unread_comments_badge', class: 'css-mock-badge', style: 'margin-left:.25rem'}, [C.sr(s.unreadCommentCount + ' unread comments')]))
    return flex([
      h('span', {style: 'flex:1 1 auto'}, [flex([h('span', {style: 'margin-right:.75rem'}, [select]), tracker()], 'align-items:center;flex-wrap:wrap;gap:.5rem')]),
      h('span', {}, [flex([
        h('span', {class: 'selected-submission-grade', style: 'text-align:end;margin-right:.75rem'}, [text('Attempt ' + attempt + ' Score:', 'display:block;font-size:.875rem'), text(score, 'display:block;font-size:.875rem')]),
        fb,
      ], 'align-items:center')]),
    ], 'align-items:center;margin:0 0 1.5rem')
  }

  function availability() {
    var lines = []
    if (a.expectsSubmission) lines.push(text('Unlimited Attempts Allowed', 'display:block;font-size:.875rem;font-weight:700'))
    if (a.unlockAt) lines.push(text('Available after ' + C.MONTHS[C.laParts(new Date(a.unlockAt)).m - 1] + ' ' + C.laParts(new Date(a.unlockAt)).d + ', ' + C.laParts(new Date(a.unlockAt)).y + ' ' + C.timeFull(a.unlockAt), 'display:block;font-size:.875rem'))
    return h('div', {style: 'margin:0 0 1.5rem'}, lines)
  }

  function toggleDetails() {
    var body = h('div', {class: 'description user_content enhanced', 'data-testid': 'assignments-2-assignment-toggle-details-text', html: a.description || 'No additional details were added for this assignment.', style: 'padding:0 .75rem'})
    var arrow = C.iconEl('arrow-open-down')
    var btn = h('button', {type: 'button', class: 'css-mock-togglebtn', 'aria-expanded': 'true', style: 'padding:.5rem 0'}, [arrow, text('Details', 'font-weight:700')])
    btn.addEventListener('click', function () { var e = btn.getAttribute('aria-expanded') === 'true'; btn.setAttribute('aria-expanded', String(!e)); body.style.display = e ? 'none' : '' })
    return h('div', {class: 'a2-toggle-details-container', 'data-testid': 'assignments-2-assignment-toggle-details'}, [btn, body])
  }

  function attemptTab() {
    if (s && s.submittedAt) {
      var rows = s.submissionType === 'online_text_entry'
        ? [h('div', {'data-testid': 'read-only-content', class: 'user_content', html: '<p>(text entry submission)</p>'})]
        : [h('table', {'data-testid': 'uploaded_files_table', class: 'css-mock-table', style: 'width:100%;border-collapse:collapse;background:#F5F5F5'}, [
            h('thead', {}, [h('tr', {}, [h('th', {id: 'thumbnail', style: 'width:4rem'}, [C.sr('Thumbnail')]), h('th', {id: 'filename', style: 'text-align:start;padding:.75rem', text: 'File Name'}), h('th', {id: 'upload-progress', style: 'text-align:start', text: 'Size'}), h('th', {id: 'upload-success'}), h('th', {id: 'delete'})])]),
            h('tbody', {}, [h('tr', {}, [h('td', {style: 'padding:.75rem'}, [C.iconEl('document')]), h('td', {style: 'padding:.75rem'}, [h('a', {href: '#', class: 'css-mock-view-link', text: a.name.replace(/\s+/g, '_') + '.pdf'})]), h('td', {text: '412 KB'}), h('td', {}, [C.iconEl('check')]), h('td')])]),
          ])]
      return h('div', {'data-testid': 'attempt-tab'}, [h('div', {id: 'file-upload-container', 'data-testid': 'upload-pane', style: 'margin:1.5rem 0'}, rows)])
    }
    if (!a.expectsSubmission) return null
    return h('div', {'data-testid': 'attempt-tab'}, [
      h('div', {'data-testid': 'submission-type-selector', style: 'margin:1.5rem 0 .75rem'}, [text('Choose a submission type', 'font-weight:700')]),
      h('div', {id: 'file-upload-container', 'data-testid': 'upload-pane'}, [
        h('div', {'data-testid': 'upload-box', style: 'border:1px dashed #C7CDD1;border-radius:.25rem;padding:2.25rem;text-align:center'}, [
          h('input', {id: 'inputFileDrop', 'data-testid': 'input-file-drop', type: 'file', style: 'position:absolute;opacity:0;width:1px;height:1px'}),
          h('label', {for: 'inputFileDrop'}, [C.iconEl('paperclip'), h('div', {}, [text('Drag a file here, or', 'font-size:1.375rem')]), h('div', {}, [text('Choose a file to upload', 'color:var(--ic-link-color);font-size:1.375rem')])]),
        ]),
      ]),
    ])
  }

  function footer() {
    var submitted = s && s.submittedAt
    var btn = submitted
      ? h('button', {type: 'button', class: 'css-mock-btn primary', 'data-testid': 'new-attempt-button', text: 'New Attempt'})
      : a.expectsSubmission ? h('button', {type: 'button', class: 'css-mock-btn primary', id: 'submit-button', 'data-testid': 'submit-button', disabled: true, text: 'Submit Assignment'}) : null
    return h('div', {'data-testid': 'student-footer', id: 'assignments-student-footer', style: 'position:fixed;bottom:0;right:0;left:0;background:#fff;border-top:1px solid #C7CDD1;padding:.5rem 1rem;display:flex;justify-content:flex-end;z-index:5'}, [btn])
  }

  window.__mockLater(function () {
    content.appendChild(h('div', {'data-testid': 'assignments-2-student-view'}, [
      header(),
      h('div', {'data-testid': 'student-content-flex-container', style: 'padding-bottom:4rem'}, [attemptInfo(), availability(), toggleDetails(), attemptTab(), h('div', {id: 'assignment_external_tools'})]),
      footer(),
    ]))
  })
})()
