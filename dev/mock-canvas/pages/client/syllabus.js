// mock-canvas: ui/features/syllabus — fills #syllabusTableBody (jst/Syllabus.handlebars via
// SyllabusView) and mounts the time tooltips (SyllabusView.mountTimezoneTooltips).
(function () {
  var C = window.__mockC, h = C.h, CFG = C.cfg
  if (!CFG.syllabus || !CFG.syllabus.summary) return
  var tbody = document.getElementById('syllabusTableBody')
  if (!tbody) return
  var cc = 'course_' + CFG.courseId
  var range = '&start_date=2000-01-01T00:00:00Z&end_date=2100-01-01T00:00:00Z' // see pages/syllabus.mjs
  var api = window.__mockApi

  Promise.all([
    api('/api/v1/calendar_events?type=event&context_codes%5B%5D=' + cc + '&all_events=1&per_page=100' + range),
    api('/api/v1/calendar_events?type=assignment&context_codes%5B%5D=' + cc + '&all_events=1&per_page=100' + range),
    api('/api/v1/courses/' + CFG.courseId + '/assignments?bucket=undated&per_page=100&include%5B%5D=submission'),
  ]).then(function (r) {
    var events = (r[0] || []).concat(r[1] || [])
    var undated = (r[2] || []).map(function (a) {
      return {id: 'assignment_' + a.id, type: 'assignment', title: a.name, html_url: a.html_url, start_at: null, end_at: null, assignment: a, workflow_state: 'published'}
    })
    return window.__mockLater(function () { render(events, undated) })
  })

  function subtype(ev) {
    var st = (ev.assignment && ev.assignment.submission_types) || []
    if (st.indexOf('discussion_topic') >= 0) return 'discussion_topic'
    if (st.indexOf('online_quiz') >= 0) return 'quiz'
    return null
  }

  function render(events, undated) {
    events.sort(function (a, b) { return new Date(a.start_at) - new Date(b.start_at) })
    var today = C.dayKey(C.NOW)
    var dates = [], last = null
    events.concat(undated).forEach(function (ev) {
      var key = ev.start_at ? C.dayKey(ev.start_at) : null
      if (!last || last.key !== key) {
        last = {key: key, orig: ev.start_at, passed: !!key && key < today, events: []}
        dates.push(last)
      }
      last.events.push(ev)
    })
    var out = []
    dates.forEach(function (d) {
      d.events.forEach(function (ev, i) {
        var st = subtype(ev)
        var isAssign = ev.type === 'assignment'
        var cls = 'date detail_list' + (d.passed ? ' date_passed' : '') + (d.key ? ' events_' + d.key : '') + ' syllabus_' + ev.type + ' ' + (st ? 'assignment_type_' + st : '') + ' related-' + ev.id
        var tr = h('tr', {class: cls, 'data-workflow-state': ev.workflow_state || 'active'})
        if (i === 0) tr.appendChild(h('th', {scope: 'row', rowspan: String(d.events.length), valign: 'top', class: 'day_date', 'data-date': d.key || ''}, d.orig ? [C.mediumWithWeekday(d.orig)] : []))
        var lastOne = i === d.events.length - 1
        var label = st === 'discussion_topic' ? ['Discussion Topic', 'discussion'] : st === 'quiz' ? ['Quiz', 'quiz'] : isAssign ? ['Assignment', 'assignment'] : ['Calendar Event', 'calendar-month']
        var name = h('td', {class: 'name' + (lastOne ? '' : ' not_last')}, [h('span', {class: 'screenreader-only', text: label[0]}), ' ', C.iconEl(label[1]), ' ', ev.html_url ? h('a', {href: ev.html_url.replace('https://canvas.example.edu', ''), text: ev.title}) : ev.title])
        var dts = h('td', {class: 'dates' + (lastOne ? '' : ' not_last')})
        if (ev.start_at) {
          if (isAssign) dts.appendChild(timeMount(ev.start_at, 'due by'))
          else {
            dts.appendChild(timeMount(ev.start_at))
            if (ev.end_at && ev.end_at !== ev.start_at) { dts.appendChild(h('br')); dts.appendChild(timeMount(ev.end_at, 'to')) }
          }
        } else dts.innerHTML = '&nbsp;'
        tr.appendChild(name); tr.appendChild(dts)
        out.push(tr)
      })
    })
    tbody.replaceChildren.apply(tbody, out)
    // SyllabusBehaviors: highlight today / the next upcoming date
    var todayRows = tbody.querySelectorAll('tr.events_' + today)
    todayRows.forEach(function (r) { r.classList.add('selected') })
  }

  function timeMount(iso, label) {
    var text = (label ? label + ' ' : '') + C.timeStr(iso)
    return h('span', {class: 'tooltip-time-mount', 'data-datetime': iso, 'data-time-text': C.timeStr(iso), 'data-label': label || null}, [
      h('button', {type: 'button', style: 'all: unset; cursor: pointer;', 'data-position-target': 'true', title: C.datetimeStr(iso), text: text}),
    ])
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.jump_to_today_link')
    if (!t) return
    e.preventDefault()
    var row = tbody.querySelector('tr.selected') || tbody.querySelector('tr:not(.date_passed)')
    if (row) row.scrollIntoView({block: 'center'})
  })
})()
