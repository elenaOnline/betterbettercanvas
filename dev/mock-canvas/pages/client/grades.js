// mock-canvas: what ui/features/grade_summary/jquery/index.jsx does on the student grades page:
// compute group subtotals and the total from ENV.assignment_groups + the row data, write them into
// the group_total / final_grade rows and the sidebar, then unhide #grade-summary-content and
// #student-grades-right-content. Supports What-If scores (click/Enter on a score) and
// "Calculate based only on graded assignments".
(function () {
  var ENV = window.ENV
  var whatIf = {} // assignment_id -> score

  function fmtPct(x) {
    // I18n.n(round(x, 2), {percentage: true})
    var r = Math.round(x * 100) / 100
    return String(r) + '%'
  }
  function fmtNum(x) { var r = Math.round(x * 100) / 100; return String(r) }

  function subScore(a) {
    if (a.id in whatIf) return {score: whatIf[a.id], excused: false, graded: true}
    var s = (ENV.submissions || []).filter(function (x) { return String(x.assignment_id) === String(a.id) })[0]
    if (!s) return {score: null, excused: false, graded: false}
    return {score: s.score, excused: s.excused, graded: s.score != null}
  }

  function groupTotals(g, onlyGraded) {
    var items = []
    g.assignments.forEach(function (a) {
      if (a.omit_from_final_grade) return
      var s = subScore(a)
      if (s.excused) return
      if (!s.graded && onlyGraded) return
      items.push([s.graded ? s.score : 0, a.points_possible || 0])
    })
    var ratio = function (x) { return x[1] ? x[0] / x[1] : 0 }
    var lo = (g.rules && g.rules.drop_lowest) || 0, hi = (g.rules && g.rules.drop_highest) || 0
    if (lo && items.length > lo) items = items.sort(function (a, b) { return ratio(a) - ratio(b) }).slice(lo)
    if (hi && items.length > hi) items = items.sort(function (a, b) { return ratio(b) - ratio(a) }).slice(hi)
    return items.reduce(function (acc, x) { return {score: acc.score + x[0], possible: acc.possible + x[1]} }, {score: 0, possible: 0})
  }

  function letter(pct) {
    var scheme = ENV.grading_scheme
    if (!scheme) return null
    for (var i = 0; i < scheme.length; i++) if (pct / 100 >= scheme[i][1] - 1e-9) return scheme[i][0]
    return 'F'
  }

  function calculate() {
    var onlyGraded = document.getElementById('only_consider_graded_assignments').checked
    var weighted = ENV.group_weighting_scheme === 'percent'
    var groups = ENV.assignment_groups.map(function (g) { return {g: g, t: groupTotals(g, onlyGraded)} })
    groups.forEach(function (x) {
      var row = document.getElementById('submission_group-' + x.g.id)
      if (!row) return
      var teaser = fmtNum(x.t.score) + ' / ' + fmtNum(x.t.possible)
      setGrade(row, x.t.possible > 0 ? fmtPct((x.t.score / x.t.possible) * 100) : 'N/A')
      row.querySelector('.score_teaser').textContent = teaser
      row.querySelector('.points_possible').textContent = teaser
    })
    var pct = null, score = 0, possible = 0
    if (weighted) {
      var tot = 0, w = 0
      groups.forEach(function (x) { if (x.t.possible > 0) { tot += (x.t.score / x.t.possible) * x.g.group_weight; w += x.g.group_weight } })
      if (w > 0) { pct = (tot / w) * 100; score = pct; possible = 100 }
    } else {
      groups.forEach(function (x) { score += x.t.score; possible += x.t.possible })
      if (possible > 0) pct = (score / possible) * 100
    }
    var finalText = pct == null ? 'N/A' : fmtPct(pct)
    var finalRow = document.querySelector('.student_assignment.final_grade#submission_final-grade')
    if (finalRow) {
      setGrade(finalRow, finalText)
      var teaser = finalRow.querySelector('.score_teaser')
      teaser.textContent = fmtNum(score) + ' / ' + fmtNum(possible)
      if (weighted) teaser.style.display = 'none'
      finalRow.querySelector('.points_possible').textContent = weighted ? '' : fmtNum(score) + ' / ' + fmtNum(possible)
    }
    var side = document.querySelector('#student-grades-right-content .final_grade .grade')
    if (side) side.textContent = finalText
    var l = pct == null ? null : letter(pct)
    document.querySelectorAll('.final_grade .letter_grade').forEach(function (e) { e.textContent = l ? l.replace('-', '−') : 'N/A' })
    var changed = document.querySelectorAll('#grades_summary .revert_score_link').length > 0
    document.getElementById('student-grades-revert').style.display = changed ? 'block' : 'none'
  }

  function setGrade(row, text) {
    var g = row.querySelector('.grade')
    // keep the tooltip + screenreader children, replace the trailing text node
    var kids = Array.prototype.slice.call(g.childNodes)
    kids.forEach(function (k) { if (k.nodeType === 3 && k.textContent.trim()) g.removeChild(k) })
    g.appendChild(document.createTextNode(text))
  }

  // ---------- What-If ----------
  var entry = document.getElementById('grade_entry')
  var editing = null
  function startEdit(cell) {
    if (editing) return
    var row = cell.closest('tr.student_assignment')
    if (!row || row.classList.contains('hard_coded')) return
    var grade = cell.querySelector('.grade')
    editing = {row: row, grade: grade, html: grade.innerHTML}
    var cur = row.querySelector('.what_if_score').textContent.trim()
    grade.innerHTML = ''
    grade.appendChild(entry)
    entry.style.display = ''
    entry.value = cur || '0'
    entry.focus(); entry.select()
    document.getElementById('aria-announcer').textContent = 'Enter a What-If score.'
  }
  function finishEdit(commit) {
    if (!editing) return
    var e = editing; editing = null
    var aid = e.row.querySelector('.assignment_id').textContent.trim()
    var val = entry.value.trim()
    entry.style.display = 'none'
    document.getElementById('grades_summary').parentNode.appendChild(entry)
    var original = e.row.querySelector('.original_score').textContent.trim()
    if (!commit || val === '' || isNaN(+val) || val === original) { e.grade.innerHTML = e.html; return }
    whatIf[aid] = +val
    e.row.querySelector('.what_if_score').textContent = val
    e.grade.innerHTML = e.html
    setGrade(e.row, val)
    e.grade.classList.add('changed')
    var holder = e.row.querySelector('.score_holder')
    if (!holder.querySelector('.revert_score_link')) {
      var rev = document.getElementById('revert_score_template').cloneNode(true)
      rev.removeAttribute('id'); rev.style.display = ''
      rev.addEventListener('click', function (ev) { ev.preventDefault(); revert(e.row, e.html) })
      holder.appendChild(rev)
    }
    e.row.querySelector('.score_teaser').textContent = 'This is a What-If score'
    calculate()
    var fg = document.querySelector('#submission_final-grade .grade')
    if (fg) document.getElementById('aria-announcer').textContent = 'Based on What-If scores, the new total is now ' + fg.lastChild.textContent
  }
  function revert(row, html) {
    var aid = row.querySelector('.assignment_id').textContent.trim()
    delete whatIf[aid]
    var g = row.querySelector('.grade')
    g.innerHTML = html; g.classList.remove('changed')
    row.querySelector('.what_if_score').textContent = row.querySelector('.original_score').textContent
    var rl = row.querySelector('.revert_score_link'); if (rl) rl.remove()
    row.querySelector('.score_teaser').textContent = 'Click to test a different score'
    calculate()
  }

  document.addEventListener('click', function (ev) {
    var cell = ev.target.closest && ev.target.closest('#grades_summary td.assignment_score')
    if (cell && !ev.target.closest('.revert_score_link') && ev.target !== entry) startEdit(cell)
    if (ev.target.closest && ev.target.closest('#revert-all-to-actual-score')) {
      ev.preventDefault()
      document.querySelectorAll('#grades_summary .revert_score_link').forEach(function (l) { l.click() })
    }
    if (ev.target.closest && ev.target.closest('#show_all_details_button')) {
      var btn = document.getElementById('show_all_details_button')
      var show = btn.textContent.indexOf('Show') === 0
      document.querySelectorAll('#grades_summary tr.comments, #grades_summary tr.rubric_assessments').forEach(function (r) { if (r.children.length) r.style.display = show ? '' : 'none' })
      btn.textContent = show ? 'Hide All Details' : 'Show All Details'
    }
    var tog = ev.target.closest && ev.target.closest('.toggle_comments_link, .toggle_score_details_link')
    if (tog) {
      ev.preventDefault()
      var id = tog.getAttribute('aria-controls') || ('comments_thread_' + tog.id.replace('assignment_comment_', ''))
      var r = document.getElementById(id)
      if (r) { var open = r.style.display === 'none'; r.style.display = open ? '' : 'none'; tog.setAttribute('aria-expanded', String(open)) }
    }
  })
  document.addEventListener('keydown', function (ev) {
    if (ev.target === entry) {
      if (ev.key === 'Enter') { ev.preventDefault(); finishEdit(true) }
      if (ev.key === 'Escape') { ev.preventDefault(); finishEdit(false) }
      return
    }
    if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('#grades_summary td.assignment_score .grade')) startEdit(ev.target.closest('td'))
  })
  entry.addEventListener('blur', function () { finishEdit(true) })
  document.getElementById('only_consider_graded_assignments').addEventListener('change', calculate)

  window.__mockLater(function () {
    // status pills (progress_pill bundle renders InstUI Pills into these spans)
    document.querySelectorAll('.submission-missing-pill, .submission-late-pill').forEach(function (s) {
      var missing = s.classList.contains('submission-missing-pill')
      s.innerHTML = '<div class="css-mock-pill ' + (missing ? 'css-mock-pill-danger' : 'css-mock-pill-info') + '"><div class="css-mock-pill__text">' + (missing ? 'missing' : 'late') + '</div></div>'
    })
    calculate()
    document.getElementById('student-grades-revert').style.display = 'none'
    document.getElementById('student-grades-whatif').style.display = 'none'
    document.getElementById('grade-summary-content').style.display = ''
    document.getElementById('student-grades-right-content').style.display = ''
  })
})()
