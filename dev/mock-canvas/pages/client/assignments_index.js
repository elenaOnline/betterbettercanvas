// mock-canvas: ui/features/assignment_index for a student — IndexView.handlebars, the InstUI search
// TextInput and ToggleShowByView RadioInputGroup, then AssignmentGroupList / AssignmentGroupListItem /
// AssignmentListItem / _assignmentListItemScore handlebars output with the DateDue / DateAvailable
// React components (ui/shared/assignments/react) mounted into [data-view=date-due|date-available].
// Note: current Canvas renders due dates with FriendlyDatetime (<time>), not the old
// `span[data-html-tooltip-title]` partial, so that bc selector does not match production.
(function () {
  var C = window.__mockC, h = C.h, CFG = C.cfg, ENV = window.ENV
  var api = window.__mockApi
  var content = document.getElementById('content')
  var courseId = CFG.courseId

  // cache.js key: prefix '' + JSON.stringify(each arg) joined by '|'
  function cacheKey(parts) { return parts.map(function (p) { return JSON.stringify(p) }).join('|') }
  var showByKey = cacheKey(['course', String(courseId), 'user', ENV.current_user_id, 'assignments_show_by_date'])
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)) } catch (e) { return null } }
  if (store(showByKey) == null) store(showByKey, true)
  function showByDate() { var v = store(showByKey); return v == null ? true : !!v }

  var groupsReq = api('/api/v1/courses/' + courseId + '/assignment_groups?exclude_response_fields%5B%5D=description&exclude_response_fields%5B%5D=rubric&include%5B%5D=assignments&include%5B%5D=discussion_topic&override_assignment_dates=true&per_page=50')
  var subsReq = api(ENV.URLS.course_student_submissions_url + '?per_page=50')

  // the handlebars template's own stylesheet (app/stylesheets/jst/assignments/AssignmentGroupListItem.scss),
  // which Canvas loads as a jst brandable_css link when the template is first used
  var jst = document.createElement('style')
  jst.setAttribute('data-mock-jst', 'jst/assignments/AssignmentGroupListItem')
  jst.textContent = 'button.element_toggler{border:none;background:none;font-weight:bold;font-size:1rem;border-radius:3px;outline:none}'
  document.head.appendChild(jst)

  function renderIndex() {
    var frag = C.fromHtml(
      '<h1 class="screenreader-only">Assignments</h1>' +
      '<div class="header-bar">' +
      '<div class="header-bar-left ic-Form-control assignment-search">' +
      '<div class="ic-Multi-input">' +
      '<label for="search_term" class="screenreader-only">Search for Assignment</label>' +
      '<span id="search_input_container"></span>' +
      '<input class="ic-Input" id="search_term" type="hidden" name="search_term" data-view="inputFilter" value="" disabled placeholder="Search for Assignment">' +
      '</div></div>' +
      '<div class="header-bar-right ">' +
      '<div style="display:inline-block" data-view="showBy"></div>' +
      '</div></div>' +
      '<div data-view="assignmentGroups" class="item-group-container" id="ag-list"><div class="loadingIndicator"></div></div>' +
      '<div id="copy-to-mount-point"></div><div id="send-to-mount-point"></div><div id="external-tool-mount-point"></div>'
    )
    content.appendChild(frag)
    // InstUI TextInput (IndexView.tsx)
    var input = h('input', {type: 'text', id: 'TextInput_mock_ag', placeholder: 'Search...', 'data-testid': 'assignment-search-input', class: 'css-mock-ti__input', 'aria-invalid': null})
    var ti = h('span', {class: 'css-mock-textInput-facade', style: {display: 'inline-block', width: '16rem'}}, [
      h('label', {for: 'TextInput_mock_ag', class: 'css-mock-formField'}, [
        h('span', {class: 'css-1sr5vj2-screenReaderContent', text: 'Search assignments. As you type in this field, the list of assignments will be automatically filtered to only include those whose names match your input.'}),
      ]),
      h('span', {class: 'css-mock-ti', style: {width: '16rem'}}, [C.iconEl('search'), input]),
    ])
    document.getElementById('search_input_container').appendChild(ti)
    input.addEventListener('input', function () {
      document.getElementById('search_term').value = input.value
      filter(input.value)
    })
    // ToggleShowByView RadioInputGroup variant="toggle"
    var byDate = showByDate()
    var fs = h('fieldset', {class: 'css-mock-toggle-group', role: 'radiogroup'}, [
      h('legend', {class: 'css-1sr5vj2-screenReaderContent', text: 'Show By'}),
    ])
    ;[['show_by_date', 'Show by Date', 'date'], ['show_by_type', 'Show by Type', 'type']].forEach(function (o) {
      var r = h('input', {type: 'radio', id: o[0], name: 'show_by', value: o[2], checked: (o[2] === 'date') === byDate ? true : null})
      r.addEventListener('change', function () { if (r.checked) { store(showByKey, o[2] === 'date'); renderGroups() } })
      fs.appendChild(h('span', {class: 'css-mock-toggle'}, [r, h('label', {for: o[0], text: o[1]})]))
    })
    document.querySelector('[data-view=showBy]').appendChild(fs)
  }

  var DATA = null
  function sortingDue(a) { return a.due_at ? Date.parse(a.due_at) : 0 }
  function hasSubmission(s) { return !!(s && s.submission_type) }
  function isGraded(s) { return !!(s && s.grade != null) }
  function allowedToSubmit(a) {
    var st = a.submission_types || []
    var expects = st.length > 0 && st.every(function (t) { return ['', 'none', 'not_graded', 'on_paper', 'external_tool'].indexOf(t) < 0 })
    return expects && !a.locked_for_user && st.indexOf('online_quiz') < 0 && st.indexOf('attendance') < 0
  }
  function dateGroup(a) {
    if (!a.due_at) return 'undated'
    if (C.NOW < new Date(a.due_at)) return 'upcoming'
    var s = a.submission
    if (allowedToSubmit(a) && !hasSubmission(s) && !isGraded(s)) return 'overdue'
    return 'past'
  }

  function iconType(a) {
    var st = a.submission_types || []
    if (st.indexOf('online_quiz') >= 0) return ['quiz', 'Quiz']
    if (st.indexOf('discussion_topic') >= 0) return ['discussion', 'Discussion Topic']
    if (st.indexOf('wiki_page') >= 0) return ['document', 'Page']
    return ['assignment', 'Assignment']
  }

  function scoreHtml(a) {
    var pp = a.points_possible
    if (a.grading_type === 'not_graded') return '<span class="non-screenreader" aria-hidden="true">\n</span>\n<span class="screenreader-only">This assignment will not be assigned a grade.</span>'
    var s = a.submission
    var vis, srText
    if (s && s.excused) { vis = 'Excused'; srText = 'This assignment has been excused.' }
    else if (s && (hasSubmission(s) || isGraded(s))) {
      if (s.notYetGraded) {
        vis = '<span class="score-display">-/' + pp + ' pts</span>\n&nbsp;&#124;&nbsp;\n<span class="grade-display">Not Yet Graded</span>'
        srText = 'Assignment not yet graded. ' + pp + ' points possible.'
      } else {
        var grade = s.grade, gd = null, gdsr = ''
        var pf = {incomplete: 'Incomplete', complete: 'Complete'}
        if (a.grading_type === 'pass_fail') { gd = pf[grade] || String(grade); gdsr = 'Grade: ' + gd }
        else if (a.grading_type === 'percent') { gd = grade + '%'; gdsr = 'Grade: ' + grade + '%' }
        else if (a.grading_type === 'letter_grade' || a.grading_type === 'gpa_scale') { gd = String(grade); gdsr = 'Grade: ' + grade }
        var score = s.score == null ? '' : Math.round(s.score * 100) / 100
        vis = '<span class="score-display"><b>' + score + '</b>/' + pp + ' pts</span>' + (gd && pp ? '\n&nbsp;&#124;&nbsp;\n' : '') + (gd ? '<span class="grade-display"><strong>' + gd + '</strong></span>' : '')
        srText = 'Score: ' + score + ' out of ' + pp + ' points. ' + gdsr
      }
    } else {
      vis = '<span data-tooltip="" class="score-display" title="No Submission">-/' + pp + ' pts</span>'
      srText = 'No submission for this assignment. ' + pp + ' points possible.'
    }
    return '<span class="non-screenreader" aria-hidden="true">\n' + vis + '\n</span>\n\n<span class="screenreader-only">\n' + srText + '\n</span>'
  }

  function dateText(label, iso) {
    return [h('span', {class: 'css-mock-text css-mock-text-x-small css-mock-text-bold', 'data-weight': 'bold', text: label}), ' ', C.friendly(iso, C.dateAtTime(iso))]
  }

  function rowEl(a) {
    var it = iconType(a)
    var url = a.html_url
    var unlock = a.unlock_at ? new Date(a.unlock_at) : null, lock = a.lock_at ? new Date(a.lock_at) : null
    var pending = unlock && unlock > C.NOW
    var closed = lock && lock < C.NOW
    var open = lock && !pending && !closed
    var available = !unlock && !lock || (!lock && unlock && unlock <= C.NOW)
    var details = h('div', {class: 'ig-details'})
    if (!available) {
      var avail = h('div', {class: 'ig-details__item assignment-date-available', 'data-view': 'date-available'})
      var dd = h('span', {class: 'default-dates'})
      if (pending) dd.append.apply(dd, dateText('Not available until', a.unlock_at))
      else if (open) dd.append.apply(dd, dateText('Available until', a.lock_at))
      else if (closed) dd.appendChild(h('span', {class: 'css-mock-text css-mock-text-x-small css-mock-text-bold', text: 'Closed'}))
      avail.appendChild(dd)
      details.appendChild(avail)
    }
    if (a.due_at) {
      var due = h('div', {class: 'ig-details__item assignment-date-due', 'data-view': 'date-due'})
      due.append.apply(due, dateText('Due', a.due_at))
      details.appendChild(due)
    }
    if (a.points_possible) details.appendChild(h('div', {class: 'ig-details__item js-score', html: scoreHtml(a)}))
    else details.appendChild(h('span', {class: 'js-score screenreader-only', html: scoreHtml(a)}))
    var row = h('div', {id: 'assignment_' + a.id, class: 'ig-row  ', 'data-item-id': String(a.id)}, [
      h('div', {class: 'ig-row__layout'}, [
        h('div', {class: 'ig-type-icon'}, [h('i', {'aria-hidden': 'true', class: 'icon-' + it[0]}), h('span', {class: 'screenreader-only', text: it[1]})]),
        h('div', {class: 'ig-info'}, [h('a', {href: url, class: 'ig-title', 'aria-live': 'polite', text: a.name}), details]),
      ]),
    ])
    var li = h('li', {class: 'assignment sort-disabled'}, [
      row,
      h('div', {id: 'assignment_student_checkpoints_' + a.id}),
      h('div', {id: 'assignment_student_peer_review_' + a.id}, [h('div', {id: 'assign-to-mount-point'}), h('div', {id: 'create-edit-mount-point'})]),
    ])
    li.__name = a.name
    return li
  }

  function groupEl(g) {
    var listId = 'assignment_group_' + g.id + '_assignments'
    var expKey = cacheKey(['course', String(courseId), 'user', ENV.current_user_id, 'ag', String(g.id), 'expanded'])
    var collapsed = store(expKey) === true // toggleCache stores !current; true after one collapse
    var pills = []
    if (g.showWeight) pills.push(h('li', {text: (Math.round(g.group_weight * 100) / 100) + '% of Total'}))
    var rules = g.rules || {}
    var nRules = (rules.drop_lowest ? 1 : 0) + (rules.drop_highest ? 1 : 0) + ((rules.never_drop || []).length ? 1 : 0)
    if (nRules) pills.push(h('li', {}, [h('span', {id: 'ag_' + g.id + '_rules_tooltip_mount_point'}, [h('span', {class: 'css-mock-tooltip-trigger', tabindex: '0', 'data-testid': 'rules-tooltip', text: nRules + ' Rule' + (nRules === 1 ? '' : 's')})])]))
    var arrow = h('i', {class: collapsed ? 'icon-mini-arrow-right' : 'icon-mini-arrow-down', 'aria-hidden': 'true'})
    var btn = h('button', {class: 'element_toggler accessible-toggler', 'aria-controls': listId, 'aria-expanded': collapsed ? 'false' : 'true', 'aria-label': g.name + ' toggle assignment visibility', tabindex: '0'}, [arrow, '\n          ' + g.name + '\n        '])
    var ul = h('ul', {class: 'collectionViewItems ig-list draggable'})
    if (g.assignments.length) g.assignments.forEach(function (a) { ul.appendChild(rowEl(a)) })
    else ul.appendChild(h('li', {}, [h('div', {class: 'ig-row ig-row-empty'}, [h('div', {class: 'ig-empty-msg', text: 'No assignments in this group'})])]))
    var list = h('div', {id: listId, class: 'assignment-list', style: collapsed ? {display: 'none'} : null}, [ul])
    btn.addEventListener('click', function () {
      var exp = btn.getAttribute('aria-expanded') === 'true'
      btn.setAttribute('aria-expanded', exp ? 'false' : 'true')
      arrow.className = exp ? 'icon-mini-arrow-right' : 'icon-mini-arrow-down'
      list.style.display = exp ? 'none' : ''
      store(expKey, !store(expKey))
    })
    return h('li', {class: 'item-group-condensed'}, [
      h('div', {id: 'assignment_group_' + g.id, 'data-id': String(g.id), class: 'assignment_group'}, [
        h('div', {class: 'ig-header'}, [
          h('h2', {class: 'ig-header-title'}, [btn]),
          h('div', {class: 'ag-header-controls'}, pills.length ? [h('ul', {class: 'pill'}, pills)] : []),
        ]),
        list,
        h('div', {id: 'create-edit-mount-point'}),
      ]),
    ])
  }

  function renderGroups() {
    if (!DATA) return
    var agl = document.getElementById('ag-list')
    var groups
    if (showByDate()) {
      var b = {overdue: [], upcoming: [], undated: [], past: []}
      DATA.forEach(function (g) { g.assignments.forEach(function (a) { b[dateGroup(a)].push(a) }) })
      b.overdue.sort(function (x, y) { return sortingDue(x) - sortingDue(y) })
      b.upcoming.sort(function (x, y) { return sortingDue(x) - sortingDue(y) })
      b.past.sort(function (x, y) { return sortingDue(y) - sortingDue(x) })
      groups = [['overdue', 'Overdue Assignments'], ['upcoming', 'Upcoming Assignments'], ['undated', 'Undated Assignments'], ['past', 'Past Assignments']]
        .map(function (x) { return {id: x[0], name: x[1], assignments: b[x[0]], group_weight: null} })
        .filter(function (g) { return g.assignments.length })
    } else {
      groups = DATA.filter(function (g) { return g.assignments.length || (CFG.weighted && g.group_weight > 0) })
        .map(function (g) { return Object.assign({}, g, {showWeight: CFG.weighted && g.group_weight != null}) })
    }
    var ul = h('ul', {class: 'collectionViewItems ig-list'})
    if (!groups.length) ul.appendChild(h('li', {}, [h('div', {class: 'ig-row ig-row-empty'}, [h('div', {class: 'ig-empty-msg', text: 'No Assignment Groups found'})])]))
    groups.forEach(function (g) { ul.appendChild(groupEl(g)) })
    agl.replaceChildren(ul)
    var q = document.getElementById('search_term')
    if (q && q.value) filter(q.value)
  }

  function filter(term) {
    var re = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null
    document.querySelectorAll('#ag-list li.assignment').forEach(function (li) {
      var hide = re && !re.test(li.__name)
      li.classList.toggle('hidden', !!hide)
      li.style.display = hide ? 'none' : ''
    })
  }

  window.__mockLater(function () {
    renderIndex()
    return Promise.all([groupsReq, subsReq]).then(function (r) {
      var subs = {}
      ;(r[1] || []).forEach(function (s) {
        if (s.grade != null) { var g = parseFloat(s.grade); if (!isNaN(g)) s.grade = g } else s.notYetGraded = true
        subs[s.assignment_id] = s
      })
      DATA = (r[0] || []).sort(function (a, b) { return a.position - b.position }).map(function (g) {
        g.assignments = (g.assignments || []).sort(function (a, b) { return a.position - b.position })
        g.assignments.forEach(function (a) { a.submission = subs[a.id] || null })
        return g
      })
      renderGroups()
    })
  })
})()
