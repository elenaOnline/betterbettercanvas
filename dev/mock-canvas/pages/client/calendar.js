// mock-canvas: client-side rendering of /calendar (Calendar 2), after the mock delay.
// Reproduces the post-hydration DOM of ui/features/calendar: CalendarHeader + CalendarNavigator
// (handlebars, instui_header off), Calendar (FullCalendar 3.10.5 month / agendaWeek views, with
// Canvas's eventRender/eventAfterRender), AgendaView, MiniCalendar, sidebar context list,
// UndatedEventsList, the calendar_color_style_overrides <style>, and the event-details popover.
// HTML strings follow FullCalendar 3.10.5's builders (DayGrid.renderDayRowHtml,
// DayTableMixin.renderHeadDateCellHtml/renderBgCellHtml, DayGrid.renderNumberCellHtml,
// DayGridEventRenderer.fgSegHtml + renderSegRow, Toolbar.renderSection).
(function () {
  var CFG = window.__mockCalendar
  var ENV = window.ENV
  var later = window.__mockLater
  var CONTEXTS = ENV.CALENDAR.CONTEXTS
  var USER_ASSET = 'user_' + CFG.userId
  var DAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  var DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  var MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
  }
  // FullCalendar's htmlEscape (also turns newlines into <br>)
  function fcEsc(s) { return esc(s).replace(/\n/g, '<br />') }

  // ---------- dates: "days" are {y, m (1-12), d}; instants are Date ----------
  var laFmt = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short'})
  function la(date) {
    var o = {}
    laFmt.formatToParts(date).forEach(function (p) { o[p.type] = p.value })
    return {y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second}
  }
  function day(y, m, d) { var t = new Date(Date.UTC(y, m - 1, d, 12)); return {y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate()} }
  function addDays(dd, n) { return day(dd.y, dd.m, dd.d + n) }
  function dow(dd) { return new Date(Date.UTC(dd.y, dd.m - 1, dd.d, 12)).getUTCDay() }
  function key(dd) { return dd.y + '-' + String(dd.m).padStart(2, '0') + '-' + String(dd.d).padStart(2, '0') }
  function parseKey(k) { var a = k.split('-'); return day(+a[0], +a[1], +a[2]) }
  function cmpDay(a, b) { return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0 }
  function dayOf(date) { var p = la(date); return day(p.y, p.m, p.d) }
  // LA midnight of a day as an instant
  function laMidnight(dd) {
    var guess = Date.UTC(dd.y, dd.m - 1, dd.d, 0, 0, 0)
    for (var off = 7; off <= 8; off++) {
      var t = new Date(guess + off * 3600000), p = la(t)
      if (p.y === dd.y && p.m === dd.m && p.d === dd.d && p.h === 0 && p.mi === 0) return t
    }
    return new Date(guess + 8 * 3600000)
  }
  // FullCalendar 'h(:mm)t' -> "4p", "11:59p"
  function fcTime(h, mi) { return (h % 12 === 0 ? 12 : h % 12) + (mi ? ':' + String(mi).padStart(2, '0') : '') + (h < 12 ? 'a' : 'p') }
  // Canvas "tiny" time: "4pm", "11:59pm"
  function tinyTime(date) { var p = la(date); return (p.h % 12 === 0 ? 12 : p.h % 12) + (p.mi ? ':' + String(p.mi).padStart(2, '0') : '') + (p.h < 12 ? 'am' : 'pm') }
  function fullDate(date) { var p = la(date), dd = day(p.y, p.m, p.d); return DAY_SHORT[dow(dd)] + ' ' + MON_SHORT[p.m - 1] + ' ' + p.d + ', ' + p.y }

  var TODAY = parseKey(CFG.today)

  // ---------- user settings (canvas user-settings: localStorage "_<userId>_<key>") ----------
  function getSetting(k) { try { return JSON.parse(localStorage.getItem('_' + CFG.userId + '_' + k)) } catch (e) { return null } }
  function setSetting(k, v) { try { localStorage.setItem('_' + CFG.userId + '_' + k, JSON.stringify(v)) } catch (e) {} }

  // ---------- state ----------
  var hash = new URLSearchParams(location.hash.slice(1))
  var currentView = hash.get('view_name') || getSetting('calendar_view') || 'month'
  if (['month', 'week', 'agenda'].indexOf(currentView) < 0) currentView = 'month'
  var currentDate = hash.get('view_start') ? parseKey(hash.get('view_start')) : TODAY
  var available = CONTEXTS.map(function (c) { return c.asset_string })
  var visible = (ENV.CALENDAR.SELECTED_CONTEXTS || getSetting('checked_calendar_codes') || available).filter(function (c) { return available.indexOf(c) >= 0 })
  visible = visible.slice(0, ENV.CALENDAR.VISIBLE_CONTEXTS_LIMIT)
  var ctxByAsset = {}
  CONTEXTS.forEach(function (c) { ctxByAsset[c.asset_string] = c })

  // ---------- data ----------
  function fetchAll(url) {
    var out = []
    function step(u) {
      return fetch(u, {credentials: 'same-origin', headers: {Accept: 'application/json+canvas-string-ids, application/json', 'X-Requested-With': 'XMLHttpRequest'}}).then(function (r) {
        var link = r.headers.get('Link') || ''
        return r.json().then(function (j) {
          out = out.concat(j || [])
          var m = link.match(/<([^>]+)>;\s*rel="next"/)
          if (m) { var nu = new URL(m[1]); return step(nu.pathname + nu.search) }
          return out
        })
      })
    }
    return step(url)
  }
  function qs(params) {
    var u = new URLSearchParams()
    Object.keys(params).forEach(function (k) {
      var v = params[k]
      if (Array.isArray(v)) v.forEach(function (x) { u.append(k + '[]', x) })
      else u.append(k, v)
    })
    return u.toString()
  }
  // EventDataSource.getEvents: calendar_events (event + assignment) and planner_notes
  function getEvents(start, end, contexts) {
    if (!contexts.length) return Promise.resolve([])
    var base = {context_codes: contexts, start_date: laMidnight(start).toISOString(), end_date: laMidnight(end).toISOString(), per_page: 50}
    var p1 = fetchAll('/api/v1/calendar_events?' + qs(Object.assign({type: 'event'}, base)))
    var p2 = fetchAll('/api/v1/calendar_events?' + qs(Object.assign({type: 'assignment'}, base)))
    var p3 = fetchAll('/api/v1/planner_notes?' + qs(base))
    return Promise.all([p1, p2, p3]).then(function (r) {
      var s = laMidnight(start), e = laMidnight(end)
      var notes = r[2].filter(function (n) {
        var t = new Date(n.todo_date)
        var code = n.course_id ? 'course_' + n.course_id : USER_ASSET
        return t >= s && t < e && contexts.indexOf(code) >= 0
      })
      return r[0].map(fromCalendarEvent).concat(r[1].map(fromAssignment), notes.map(fromNote))
    })
  }
  function fromCalendarEvent(o) {
    var start = new Date(o.start_at), end = new Date(o.end_at || o.start_at)
    var ctxCode = o.effective_context_code || o.context_code
    var ev = {id: 'calendar_event_' + o.id, eventType: 'calendar_event', title: o.title || 'Untitled', start: start, end: end, originalStart: start,
      allDay: !!o.all_day, contextCode: ctxCode, className: ['group_' + ctxCode], icon: 'calendar-month', object: o,
      editable: ctxCode === USER_ASSET, readable: 'Event', url: null, description: o.description, location_name: o.location_name}
    return ev
  }
  function fromAssignment(o) {
    var a = o.assignment || o
    var start = new Date(o.start_at || a.due_at)
    var st = (a.submission_types || [])[0]
    var icon = st === 'online_quiz' ? 'quiz' : st === 'discussion_topic' ? 'discussion' : 'assignment'
    return {id: o.id, eventType: 'assignment', title: o.title || a.name || 'Untitled', start: start, end: start, originalStart: start,
      allDay: false, contextCode: o.context_code, className: ['group_' + o.context_code, 'assignment'], icon: icon, object: o,
      editable: false, readable: {quiz: 'Quiz', discussion: 'Discussion', assignment: 'Assignment'}[icon], fullDetailsURL: o.html_url, description: o.description}
  }
  function fromNote(n) {
    var start = new Date(n.todo_date)
    var code = n.course_id ? 'course_' + n.course_id : USER_ASSET
    return {id: 'planner_note_' + n.id, eventType: 'planner_note', title: n.title, start: start, end: start, originalStart: start,
      allDay: false, contextCode: code, className: ['group_' + code], icon: 'note-light', object: n, editable: true, readable: 'To Do', description: n.details}
  }
  // CommonEvent midnight fudging (isDueAtMidnight / isDueStrictlyAtMidnight)
  function fudge(ev) {
    var p = la(ev.start)
    ev.dueAtMidnight = !ev.allDay && ((p.h === 23 && p.mi > 30) || (p.h === 0 && p.mi === 0))
    ev.strictMidnight = !ev.allDay && ((p.h === 23 && p.mi > 59) || (p.h === 0 && p.mi === 0))
    ev.fcStart = ev.dueAtMidnight ? {h: p.h, mi: 30} : {h: p.h, mi: p.mi}
    ev.day = dayOf(ev.start)
    return ev
  }

  // ---------- colors (Calendar#colorizeContexts) ----------
  var SLICER = ['#4E7FA5', '#B04FA0', '#3E8F6A', '#C1611F', '#7A5DB3', '#A8862B', '#2F8F9C', '#B4475A', '#5E7F2E', '#6F6FB8']
  function colorize() {
    return fetch('/api/v1/users/' + CFG.userId + '/colors/', {credentials: 'same-origin', headers: {Accept: 'application/json'}}).then(function (r) { return r.json() }).then(function (data) {
      var custom = (data && data.custom_colors) || {}
      var css = available.map(function (code, i) {
        var color = custom[code]
        if (!color) {
          color = SLICER[i % SLICER.length]
          window.__mockApi('/api/v1/users/self/colors/' + code, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({hexcode: color})})
        }
        return '\n            .group_' + esc(code) + ',\n            .group_' + esc(code) + ':hover,\n            .group_' + esc(code) + ':focus{\n              color: ' + esc(color) + ';\n              border-color: ' + esc(color) + ';\n              background-color: ' + esc(color) + ';\n            }\n          '
      }).join('')
      var holder = document.getElementById('calendar_color_style_overrides')
      if (!holder) { holder = document.createElement('div'); holder.id = 'calendar_color_style_overrides'; document.body.appendChild(holder) }
      holder.innerHTML = '<style>' + css + '</style>'
    })
  }

  // ---------- header (calendarHeader.handlebars + calendarNavigator.handlebars) ----------
  function renderHeader() {
    var nav = '<button class="navigate_today btn">Today</button>\n<span class="navigation_buttons">\n  <button class="navigate_prev btn">\n    <i class="icon-arrow-left" style="vertical-align: middle" aria-hidden="true"></i>\n    <span class="screenreader-only">Previous Month</span>\n  </button>\n  <button class="navigate_next btn">\n    <i class="icon-arrow-right" style="vertical-align: middle" aria-hidden="true"></i>\n    <span class="screenreader-only">Next Month</span>\n  </button>\n</span>\n<h2 class="navigation_title" tabindex="-1"><span role="button" class="navigation_title_text" tabindex="0"></span></h2>\n<span class="date_field_wrapper" style="display: none;">\n    <label class="screenreader-only" id="calendar_navigation_date_accessible_label">\n      Enter the date you would like to navigate to.\n      \n    </label>\n    <input type="text" name="start date"\n           style="width: 100px;" class="date_field datetime_field_enabled"\n           aria-labelledby="calendar_navigation_date_accessible_label"\n           data-tooltip title="YYYY-MM-DD"/><button type="button" class="ui-datepicker-trigger btn" aria-hidden="true" tabindex="-1"><i class="icon-calendar-month"></i></button>\n</span>\n'
    document.getElementById('calendar_header').innerHTML = '<div class="header-bar-outer-container calendar_header">\n    <div class="sticky-toolbar" data-sticky>\n        <div class="header-bar flex-container">\n            <div class="header-bar-left header-left-flex">\n                <div class="calendar_navigator">' + nav + '</div>\n            </div>\n\n            <div class="header-bar-right header-right-flex">\n                <div class="recommend_agenda screenreader-only">\n                    <button id="use_agenda" class="accessibility-warning">Warning: For improved accessibility, please use the "Agenda view" Calendar.</button>\n                </div>\n                <span id="refresh_calendar_link" title="Loading" data-tooltip>\n                    <span class="screenreader-only">Loading</span>\n                </span>\n                <span class="calendar_view_buttons btn-group" role="tablist">\n                    <button type="button" id="week" class="btn calendar-button" role="tab" aria-selected="false" aria-controls="calendar-app" tabindex="-1">\n                        Week\n                    </button>\n                    <button type="button" id="month" class="btn calendar-button" role="tab" aria-selected="false" aria-controls="calendar-app" tabindex="-1">\n                        Month\n                    </button>\n                    <button type="button" id="agenda" class="btn" role="tab" aria-selected="false" aria-controls="calendar-app" tabindex="-1">\n                        Agenda\n                    </button>\n                  </span>\n                <a href="#" id="create_new_event_link" class="btn" title="Create New Event" data-tooltip role="button">\n                    <i class="icon-plus"></i>\n                    <span class="screenreader-only">Create New Event</span>\n                </a>\n            </div>\n        </div>\n    </div>\n</div>\n'
    var hdr = document.getElementById('calendar_header')
    hdr.querySelector('.navigate_today').addEventListener('click', function () { gotoDate(TODAY) })
    hdr.querySelector('.navigate_prev').addEventListener('click', function () { step(-1) })
    hdr.querySelector('.navigate_next').addEventListener('click', function () { step(1) })
    ;['week', 'month', 'agenda'].forEach(function (v) {
      document.getElementById(v).addEventListener('click', function () { loadView(v) })
    })
    hdr.querySelector('#create_new_event_link').addEventListener('click', function (e) { e.preventDefault() })
  }
  function selectView(v) {
    // CalendarHeader.selectView
    ;['week', 'month', 'agenda'].forEach(function (id) {
      var b = document.getElementById(id)
      var on = id === v
      b.setAttribute('aria-selected', on ? 'true' : 'false')
      b.classList.toggle('active', on)
      b.setAttribute('tabindex', on ? '0' : '-1')
    })
    var labels = v === 'week' ? ['Previous Week', 'Next Week'] : v === 'month' ? ['Previous Month', 'Next Month'] : ['Previous', 'Next']
    document.querySelector('.navigate_prev .screenreader-only').textContent = labels[0]
    document.querySelector('.navigate_next .screenreader-only').textContent = labels[1]
    document.dispatchEvent(new CustomEvent('calendar:header:select_view', {detail: {viewName: v}}))
  }
  function setTitle(t) { document.querySelector('.navigation_title_text').textContent = t }
  function updateFragment() {
    var h = 'view_name=' + currentView + '&view_start=' + key(currentDate)
    history.replaceState(null, '', location.pathname + location.search + '#' + h)
  }

  // ---------- calendarApp.handlebars ----------
  function renderAppSkeleton() {
    document.getElementById('calendar-app').innerHTML = '<div class="scheduler-wrapper" style="display: none">\n  <div class="appointment-list">\n    <div class="list-wrapper"></div>\n  </div>\n</div>\n<div class="agenda-wrapper"></div>\n<div class="scheduler_navigator"></div>\n<div class="calendar fc fc-unthemed fc-ltr"><div class="fc-view-container"></div></div>\n'
  }

  // ---------- FullCalendar month grid ----------
  function monthRange(dd) {
    var first = day(dd.y, dd.m, 1)
    var last = day(dd.y, dd.m + 1, 0)
    var start = addDays(first, -dow(first))
    var end = addDays(last, 7 - dow(last)) // exclusive
    var weeks = Math.round((Date.UTC(end.y, end.m - 1, end.d) - Date.UTC(start.y, start.m - 1, start.d)) / 86400000 / 7)
    return {start: start, end: end, weeks: weeks, month: dd.m}
  }
  function dayClasses(dd, month, noHighlight) {
    var c = ['fc-' + DAY_IDS[dow(dd)]]
    if (month != null && dd.m !== month) c.push('fc-other-month')
    var cmp = cmpDay(dd, TODAY)
    if (cmp === 0) { c.push('fc-today'); if (!noHighlight) c.push('fc-state-highlight') } else if (cmp < 0) c.push('fc-past'); else c.push('fc-future')
    return c
  }
  function headRowHtml(cells) {
    return '<div class="fc-row fc-widget-header"><table class=""><thead><tr>' + cells + '</tr></thead></table></div>'
  }
  function monthHeadHtml() {
    var s = ''
    for (var i = 0; i < 7; i++) s += '<th class="fc-day-header fc-widget-header fc-' + DAY_IDS[i] + '"><span>' + DAY_SHORT[i] + '</span></th>'
    return headRowHtml(s)
  }
  function eventSegHtml(ev, view) {
    var cls = ['fc-day-grid-event', 'fc-h-event', 'fc-event', 'fc-start', 'fc-end'].concat(ev.className)
    if (ev.editable) cls.push('fc-draggable')
    var resizable = ev.editable && ev.allDay
    if (resizable) cls.push('fc-resizable')
    var timeHtml = ''
    if (!ev.allDay) {
      var t = fcTime(ev.fcStart.h, ev.fcStart.mi)
      var dataStart = ''
      if (ev.dueAtMidnight) {
        var p = la(ev.originalStart)
        t = t.replace(/^\d+:\d+\w?/, (p.h % 12 === 0 ? 12 : p.h % 12) + ':' + String(p.mi).padStart(2, '0') + (p.h < 12 ? 'a' : 'p'))
        dataStart = ' data-start="' + (p.h % 12 === 0 ? 12 : p.h % 12) + ':' + String(p.mi).padStart(2, '0') + '"'
      }
      if (ev.eventType === 'assignment' && ev.strictMidnight && view === 'month') t = ''
      timeHtml = '<span class="fc-time"' + dataStart + '>' + fcEsc(t) + '</span>'
    }
    var hint = ev.eventType === 'assignment' ? 'Assignment Title:' : ev.eventType === 'planner_note' ? 'To Do:' : 'Event Title:'
    var ctxName = (ctxByAsset[ev.contextCode] || {}).name || ''
    var titleHtml = '<span class="fc-title"><span class=\'screenreader-only\'>' + esc(hint) + ' </span>' + (fcEsc(ev.title) || '&nbsp;') + '</span>'
    return '<a class="' + cls.join(' ') + '" title="' + esc(ev.title) + '" data-mock-event-id="' + esc(ev.id) + '">' +
      '<div class="fc-content"><i class="icon-' + ev.icon + '"></i><span class=\'screenreader-only\'>' + esc('Calendar:') + ' ' + esc(ctxName) + '</span>' + timeHtml + ' ' + titleHtml + '</div>' +
      (resizable ? '<div class="fc-resizer fc-end-resizer"></div>' : '') + '</a>'
  }
  function sortSegs(list) {
    return list.slice().sort(function (a, b) {
      var sa = a.allDay ? 0 : a.fcStart.h * 60 + a.fcStart.mi, sb = b.allDay ? 0 : b.fcStart.h * 60 + b.fcStart.mi
      return (sa - sb) || ((b.allDay ? 1 : 0) - (a.allDay ? 1 : 0)) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)
    })
  }
  // renderSegRow: one <tr> per level; single-day segs; empty cells extend the lone cell above (rowspan)
  function segRowsHtml(weekDays, byDay, view) {
    var cols = weekDays.map(function (dd) { return sortSegs(byDay[key(dd)] || []) })
    var levels = Math.max(1, Math.max.apply(null, cols.map(function (c) { return c.length })))
    var cells = [] // cells[level][col] = {html, rowspan, owner}
    for (var i = 0; i < levels; i++) {
      cells.push([])
      for (var c = 0; c < 7; c++) {
        var ev = cols[c][i]
        if (ev) cells[i][c] = {html: eventSegHtml(ev, view), cls: 'fc-event-container', rowspan: 1}
        else if (i > 0) { var above = cells[i - 1][c]; var owner = above.owner || above; owner.rowspan++; cells[i][c] = {owner: owner} }
        else cells[i][c] = {html: '', cls: '', rowspan: 1}
      }
    }
    var out = ''
    for (i = 0; i < levels; i++) {
      out += '<tr>'
      for (c = 0; c < 7; c++) {
        var cell = cells[i][c]
        if (cell.owner) continue
        out += '<td' + (cell.cls ? ' class="' + cell.cls + '"' : '') + (cell.rowspan > 1 ? ' rowspan="' + cell.rowspan + '"' : '') + '>' + cell.html + '</td>'
      }
      out += '</tr>'
    }
    return '<tbody>' + out + '</tbody>'
  }
  function monthGridHtml(r, byDay, opts) {
    opts = opts || {}
    var rows = ''
    for (var w = 0; w < r.weeks; w++) {
      var days = []
      for (var i = 0; i < 7; i++) days.push(addDays(r.start, w * 7 + i))
      var bg = days.map(function (dd) { return '<td class="fc-day fc-widget-content ' + dayClasses(dd, r.month).join(' ') + '" data-date="' + key(dd) + '"></td>' }).join('')
      var nums = days.map(function (dd) { return '<td class="fc-day-top ' + dayClasses(dd, r.month).join(' ') + '" data-date="' + key(dd) + '"><span class="fc-day-number">' + dd.d + '</span></td>' }).join('')
      rows += '<div class="fc-row fc-week fc-widget-content"><div class="fc-bg"><table class=""><tbody><tr>' + bg + '</tr></tbody></table></div>' +
        '<div class="fc-content-skeleton"><table><thead><tr>' + nums + '</tr></thead>' + (opts.noEvents ? '<tbody><tr>' + '<td></td>'.repeat(7) + '</tr></tbody>' : segRowsHtml(days, byDay, 'month')) + '</table></div></div>'
    }
    return '<div class="fc-view fc-month-view fc-basic-view" style=""><table class=""><thead class="fc-head"><tr><td class="fc-head-container fc-widget-header">' + monthHeadHtml() + '</td></tr></thead>' +
      '<tbody class="fc-body"><tr><td class="fc-widget-content"><div class="fc-scroller fc-day-grid-container" style="overflow: hidden;"><div class="fc-day-grid fc-unselectable">' + rows + '</div></div></td></tr></tbody></table></div>'
  }
  // BasicView.updateSize / distributeHeight: rows share the height left after the header
  function sizeMonth(root, contentHeight) {
    var view = root.querySelector('.fc-view')
    if (!view) return
    var head = view.querySelector('.fc-head')
    var scroller = view.querySelector('.fc-day-grid-container')
    var rowsEls = [].slice.call(view.querySelectorAll('.fc-day-grid > .fc-row'))
    var avail = contentHeight - (head ? head.offsetHeight : 0)
    rowsEls.forEach(function (r) { r.style.height = '' })
    var min = Math.floor(avail / rowsEls.length)
    rowsEls.forEach(function (r, i) {
      var h = i === rowsEls.length - 1 ? avail - min * (rowsEls.length - 1) : min
      if (r.offsetHeight < h) r.style.height = h + 'px'
    })
    scroller.style.height = ''
  }

  // ---------- agendaWeek (FullCalendar AgendaView, Canvas head-cell patch) ----------
  function weekGridHtml(start, byDay) {
    var days = []
    for (var i = 0; i < 7; i++) days.push(addDays(start, i))
    var head = '<th class="fc-axis fc-widget-header" style="width:46px"></th>' + days.map(function (dd) {
      return '\n  \t\t\t<th class="fc-day-header fc-widget-header fc-' + DAY_IDS[dow(dd)] + '">\n        \t<div class="fc-day-header__week-number">' + dd.d + '</div>\n        \t<div class="fc-day-header__week-day">' + DAY_SHORT[dow(dd)] + '</div>\n        </th>'
    }).join('')
    var allDay = {}, timed = {}
    days.forEach(function (dd) {
      var k = key(dd)
      ;(byDay[k] || []).forEach(function (ev) { (ev.allDay ? (allDay[k] = allDay[k] || []) : (timed[k] = timed[k] || [])).push(ev) })
    })
    var bgCells = days.map(function (dd) { return '<td class="fc-day fc-widget-content ' + dayClasses(dd, null).join(' ') + '" data-date="' + key(dd) + '"></td>' }).join('')
    var adLevels = Math.max(1, Math.max.apply(null, days.map(function (dd) { return (allDay[key(dd)] || []).length })))
    var adRows = ''
    for (var l = 0; l < adLevels; l++) {
      adRows += '<tr>' + (l === 0 ? '<td class="fc-axis" style="width:46px"' + (adLevels > 1 ? ' rowspan="' + adLevels + '"' : '') + '><span>all-day</span></td>' : '') + days.map(function (dd) {
        var ev = (allDay[key(dd)] || [])[l]
        return ev ? '<td class="fc-event-container">' + eventSegHtml(ev, 'week') + '</td>' : '<td></td>'
      }).join('') + '</tr>'
    }
    var slats = ''
    for (var h = 0; h < 24; h++) {
      for (var half = 0; half < 2; half++) {
        var t = String(h).padStart(2, '0') + ':' + (half ? '30' : '00') + ':00'
        slats += '<tr data-time="' + t + '"' + (half ? ' class="fc-minor"' : '') + '><td class="fc-axis fc-time fc-widget-content" style="width:46px">' + (half ? '' : '<span>' + (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'am' : 'pm') + '</span>') + '</td><td class="fc-widget-content"></td></tr>'
      }
    }
    var cols = days.map(function (dd) {
      var evs = sortSegs(timed[key(dd)] || [])
      return '<td><div class="fc-content-col"><div class="fc-event-container fc-helper-container"></div><div class="fc-event-container">' + evs.map(function (ev) {
        var p = ev.fcStart, sMin = p.h * 60 + p.mi, eP = la(ev.end), eMin = eP.h * 60 + eP.mi
        // defaultTimedEventDuration 01:00:00 when there is no real end; clipped to the end of the day
        var endMin = Math.min(1440, eMin > sMin ? eMin : sMin + 60)
        var cls = ['fc-time-grid-event', 'fc-v-event', 'fc-event', 'fc-start', 'fc-end'].concat(ev.className)
        if (ev.editable) cls.push('fc-draggable', 'fc-resizable')
        var hint = ev.eventType === 'assignment' ? 'Assignment Title:' : ev.eventType === 'planner_note' ? 'To Do:' : 'Event Title:'
        var ctxName = (ctxByAsset[ev.contextCode] || {}).name || ''
        var title = (ev.eventType === 'assignment' ? fcTime(la(ev.originalStart).h, la(ev.originalStart).mi) : tinyTime(ev.start)) + '\n' + ev.title + '\n\nCalendar: ' + ctxName
        return '<a class="' + cls.join(' ') + '" title="' + esc(title) + '" data-mock-event-id="' + esc(ev.id) + '" data-mock-start="' + (p.h * 60 + p.mi) + '" data-mock-end="' + endMin + '"><div class="fc-content"><i class="icon-' + ev.icon + '"></i><span class=\'screenreader-only\'>Calendar: ' + esc(ctxName) + '</span><div class="fc-time" data-start="' + esc(fcTime(p.h, p.mi)) + '"><span>' + esc(fcTime(p.h, p.mi)) + '</span></div><div class="fc-title"><span class=\'screenreader-only\'>' + esc(hint) + ' </span>' + fcEsc(ev.title) + '</div></div><div class="fc-bg"></div>' + (ev.editable ? '<div class="fc-resizer fc-end-resizer"></div>' : '') + '</a>'
      }).join('') + '</div><div class="fc-highlight-container"></div><div class="fc-bgevent-container"></div><div class="fc-business-container"></div></div></td>'
    }).join('')
    return '<div class="fc-view fc-agendaWeek-view fc-agenda-view" style=""><table class=""><thead class="fc-head"><tr><td class="fc-head-container fc-widget-header">' + headRowHtml(head) + '</td></tr></thead>' +
      '<tbody class="fc-body"><tr><td class="fc-widget-content"><div class="fc-day-grid fc-unselectable"><div class="fc-row fc-week fc-widget-content"><div class="fc-bg"><table class=""><tbody><tr><td class="fc-axis fc-widget-content" style="width:46px"></td>' + bgCells + '</tr></tbody></table></div><div class="fc-content-skeleton"><table>' + adRows + '</table></div></div></div>' +
      '<hr class="fc-divider fc-widget-header"><div class="fc-scroller fc-time-grid-container" style="overflow-x: hidden; overflow-y: scroll; height: 560px;"><div class="fc-time-grid fc-unselectable">' +
      '<div class="fc-bg"><table class=""><tbody><tr><td class="fc-axis fc-widget-content" style="width:46px"></td>' + bgCells + '</tr></tbody></table></div>' +
      '<div class="fc-slats"><table class=""><tbody>' + slats + '</tbody></table></div><hr class="fc-divider fc-widget-header" style="display:none">' +
      '<div class="fc-content-skeleton"><table><tbody><tr><td class="fc-axis" style="width:46px"></td>' + cols + '</tr></tbody></table></div></div></div></td></tr></tbody></table></div>'
  }
  function positionWeekEvents(root) {
    var slat = root.querySelector('.fc-slats tr')
    if (!slat) return
    var slotH = slat.offsetHeight
    // TimeGridEventRenderer: overlapping events in a column share its width (simplified from
    // FullCalendar's forward-pressure layout: equal columns per overlap cluster)
    root.querySelectorAll('.fc-time-grid .fc-content-skeleton .fc-event-container:not(.fc-helper-container)').forEach(function (cont) {
      var evs = [].slice.call(cont.querySelectorAll('.fc-time-grid-event'))
      var clusters = [], cur = null, curEnd = -1
      evs.forEach(function (a) {
        var s = +a.getAttribute('data-mock-start'), e = +a.getAttribute('data-mock-end')
        if (!cur || s >= curEnd) { cur = []; clusters.push(cur); curEnd = e } else curEnd = Math.max(curEnd, e)
        cur.push(a)
      })
      clusters.forEach(function (cl) {
        cl.forEach(function (a, i) {
          var s = +a.getAttribute('data-mock-start'), e = +a.getAttribute('data-mock-end')
          a.style.top = (s / 30 * slotH) + 'px'
          a.style.bottom = (-(e / 30 * slotH) + 1) + 'px'
          a.style.zIndex = 1 + i
          a.style.left = (i / cl.length * 100) + '%'
          a.style.right = ((cl.length - i - 1) / cl.length * 100) + '%'
        })
      })
    })
    var scroller = root.querySelector('.fc-time-grid-container')
    if (scroller) scroller.scrollTop = 14 * slotH // scrollTime 07:00:00
    // Calendar#drawNowLine
    if (cmpDay(currentDate, TODAY) >= 0 || true) {
      var weekStart = addDays(currentDate, -dow(currentDate))
      var slats = root.querySelector('.fc-slats')
      var line = document.createElement('div')
      line.className = 'calendar-nowline'
      var inWeek = cmpDay(TODAY, weekStart) >= 0 && cmpDay(TODAY, addDays(weekStart, 7)) < 0
      line.style.display = inWeek ? '' : 'none'
      var nowP = la(NOW)
      line.style.top = ((nowP.h * 3600 + nowP.mi * 60) * (slats.offsetHeight / 86400)) + 'px'
      slats.appendChild(line)
    }
  }
  var NOW = new Date(document.querySelector('meta[name=mock-canvas]').content.match(/now=([^;]+)/)[1])

  // ---------- agenda view (AgendaView + agendaView.handlebars) ----------
  function agendaHtml(events) {
    var days = {}
    events.forEach(function (ev) { var k = key(ev.day); (days[k] = days[k] || []).push(ev) })
    var keys = Object.keys(days).sort()
    if (!keys.length) return '<div class="agenda-container">\n    <span class="agendaView--no-assignments">No events after this date.</span>\n</div>\n\n<div class="agenda-actions">\n  <i class="loading-spinner"\n    aria-label="Loading"\n    aria-hidden="true"></i>\n</div>\n'
    var out = '<div class="agenda-container">'
    keys.forEach(function (k) {
      var dd = parseKey(k)
      var isToday = cmpDay(dd, TODAY) === 0
      out += '\n      <div class="agenda-day' + (isToday ? ' agenda-today' : '') + '">\n        <h3 class="agenda-date" tabindex="-1">\n          <span aria-hidden="true">' + DAY_SHORT[dow(dd)] + ', ' + MON_SHORT[dd.m - 1] + ' ' + dd.d + '</span>\n          <span class="screenreader-only">' + DAY_LONG[dow(dd)] + ', ' + MONTHS[dd.m - 1] + ' ' + dd.d + ', ' + dd.y + '</span>\n        </h3>\n      </div>\n\n        <div class="agenda-event__container">\n          <ul class="agenda-event__list">'
      sortSegs(days[k]).forEach(function (ev) {
        var isAsg = ev.eventType === 'assignment'
        var timeTxt = isAsg ? 'Due  ' + tinyTime(ev.originalStart) : ev.allDay ? '' : tinyTime(ev.originalStart)
        var srWhen = isAsg ? 'Due  ' + tinyTime(ev.originalStart) : ev.allDay ? 'All Day ' + MON_SHORT[dd.m - 1] + ' ' + dd.d : 'Starts at ' + tinyTime(ev.originalStart) + ' Ends at ' + tinyTime(ev.end)
        out += '\n              <li class="agenda-event__item" data-event-id="' + esc(ev.id) + '">\n                <span class="screenreader-only">\n                  ' + esc(ev.readable) + ',\n                    ' + esc(srWhen) + ',\n                </span>\n                <span class="screenreader-only">\n                      ' + esc(ev.title.slice(0, 60)) + '\n                </span>\n                <span class="screenreader-only">\n                    Not Completed\n                </span>\n                <span class="screenreader-only">Calendar ' + esc((ctxByAsset[ev.contextCode] || {}).name) + '</span>\n                <div class="agenda-event__item-container" tabindex="0" role="button" data-mock-event-id="' + esc(ev.id) + '">\n                  <div class="agenda-event__icon group_' + esc(ev.contextCode) + '">\n                    <i class="icon-' + ev.icon + '"></i>\n                  </div>\n                  <span class="screenreader-only">Open event menu for ' + esc(ev.title) + '</span>\n                  <div class="agenda-event__time" aria-hidden="true">\n                    ' + esc(timeTxt) + '\n                  </div>\n                  <span class="agenda-event__title group_' + esc(ev.contextCode) + ' ">\n                        ' + esc(ev.title.slice(0, 60)) + '\n                  </span>\n                </div>\n              </li>'
      })
      out += '\n          </ul>\n        </div>\n'
    })
    out += '\n</div>\n\n<div class="agenda-actions">\n  <i class="loading-spinner"\n    aria-label="Loading"\n    aria-hidden="true"></i>\n</div>\n'
    return out
  }

  // ---------- main render ----------
  var lastEvents = {}
  var renderSeq = 0
  function render() {
    var seq = ++renderSeq
    selectView(currentView)
    updateFragment()
    var cal = document.querySelector('#calendar-app .calendar')
    var agenda = document.querySelector('#calendar-app .agenda-wrapper')
    var container = cal.querySelector('.fc-view-container')
    var refresh = document.getElementById('refresh_calendar_link')
    refresh.classList.add('loading')
    var range, title
    if (currentView === 'month') {
      range = monthRange(currentDate)
      title = MONTHS[currentDate.m - 1] + ' ' + currentDate.y
    } else if (currentView === 'week') {
      var ws = addDays(currentDate, -dow(currentDate)), we = addDays(ws, 6)
      range = {start: ws, end: addDays(ws, 7)}
      title = ws.m === we.m ? MON_SHORT[ws.m - 1] + ' ' + ws.d + ' – ' + we.d + ', ' + we.y
        : ws.y === we.y ? MON_SHORT[ws.m - 1] + ' ' + ws.d + ' – ' + MON_SHORT[we.m - 1] + ' ' + we.d + ', ' + we.y
          : MON_SHORT[ws.m - 1] + ' ' + ws.d + ', ' + ws.y + ' – ' + MON_SHORT[we.m - 1] + ' ' + we.d + ', ' + we.y
    } else {
      range = {start: currentDate, end: addDays(currentDate, 30)}
      var ae = addDays(range.end, -1)
      title = MON_SHORT[currentDate.m - 1] + ' ' + currentDate.d + ', ' + currentDate.y + ' – ' + MON_SHORT[ae.m - 1] + ' ' + ae.d + ', ' + ae.y
    }
    setTitle(title)
    var isCal = currentView !== 'agenda'
    // Calendar#loadView: calendar.show()/hide(), .agenda-wrapper.active, header.hidePrevNext()
    cal.style.display = isCal ? '' : 'none'
    agenda.classList.toggle('active', !isCal)
    document.querySelector('.calendar_navigator .navigation_buttons').style.display = isCal ? '' : 'none'
    return getEvents(range.start, range.end, visible).then(function (events) {
      if (seq !== renderSeq) return
      refresh.classList.remove('loading')
      events.forEach(fudge)
      lastEvents = {}
      var byDay = {}
      events.forEach(function (ev) { lastEvents[ev.id] = ev; (byDay[key(ev.day)] = byDay[key(ev.day)] || []).push(ev) })
      if (currentView === 'month') {
        container.innerHTML = monthGridHtml(range, byDay)
        sizeMonth(container, Math.round(cal.clientWidth / 1.35))
      } else if (currentView === 'week') {
        container.innerHTML = weekGridHtml(range.start, byDay)
        positionWeekEvents(container)
      } else {
        agenda.innerHTML = agendaHtml(events.slice().sort(function (a, b) { return a.start - b.start }))
      }
      renderMini()
    })
  }
  function gotoDate(dd) { currentDate = dd; return render() }
  function step(n) {
    if (currentView === 'month') currentDate = day(currentDate.y, currentDate.m + n, 1)
    else if (currentView === 'week') currentDate = addDays(currentDate, 7 * n)
    else currentDate = addDays(currentDate, 30 * n)
    return render()
  }
  function loadView(v) {
    currentView = v
    setSetting('calendar_view', v)
    return render()
  }

  // ---------- mini calendar (MiniCalendar.js on FullCalendar) ----------
  var miniDate = null
  function renderMini() {
    var target = currentView === 'month' ? day(currentDate.y, currentDate.m, 1) : currentDate
    if (!miniDate || miniDate.y !== target.y || miniDate.m !== target.m) miniDate = day(target.y, target.m, 1)
    var r = monthRange(miniDate)
    var el = document.getElementById('minical')
    el.className = 'fc fc-unthemed fc-ltr'
    el.setAttribute('role', 'region')
    el.setAttribute('aria-label', 'Mini calendar view')
    el.innerHTML = '<div class="fc-toolbar fc-header-toolbar"><div class="fc-left"><button type="button" class="fc-prev-button fc-button fc-state-default fc-corner-left fc-corner-right prev_month_link" aria-label="Previous month" role="button"><span class="fc-icon fc-icon-left-single-arrow"></span></button></div>' +
      '<div class="fc-right"><button type="button" class="fc-next-button fc-button fc-state-default fc-corner-left fc-corner-right next_month_link" aria-label="Next month" role="button"><span class="fc-icon fc-icon-right-single-arrow"></span></button></div>' +
      '<div class="fc-center"><h2>' + MONTHS[miniDate.m - 1] + ' ' + miniDate.y + '</h2></div><div class="fc-clear"></div></div>' +
      '<div class="fc-view-container" style="">' + monthGridHtml(r, {}, {noEvents: true}) + '</div>'
    // eventRender: mark the bg cell of days (in this month) that have events
    getEvents(r.start, r.end, visible).then(function (events) {
      events.forEach(function (ev) {
        fudge(ev)
        if (ev.day.m !== r.month) return
        var td = el.querySelector('td[data-date="' + key(ev.day) + '"]')
        if (td) td.classList.add('event')
      })
      miniA11y(el, r)
    })
    miniA11y(el, r)
    var toolbarH = el.querySelector('.fc-toolbar').offsetHeight
    sizeMonth(el.querySelector('.fc-view-container'), 185 - toolbarH)
    el.querySelector('.fc-prev-button').addEventListener('click', function () { miniDate = day(miniDate.y, miniDate.m - 1, 1); if (currentView === 'month') gotoDate(miniDate); else renderMini() })
    el.querySelector('.fc-next-button').addEventListener('click', function () { miniDate = day(miniDate.y, miniDate.m + 1, 1); if (currentView === 'month') gotoDate(miniDate); else renderMini() })
  }
  function miniA11y(el, r) {
    // removeTableSemantics, hideEmptyRows, setupAccessibleDays, setupDayInteractions
    el.querySelectorAll('.fc-view-container table, .fc-view-container thead, .fc-view-container tbody, .fc-view-container tr, .fc-view-container th, .fc-view-container td').forEach(function (n) { n.setAttribute('role', 'presentation') })
    el.querySelectorAll('.fc-bg td[data-date]').forEach(function (n) { n.setAttribute('tabindex', '-1') })
    el.querySelectorAll('.fc-widget-content tr').forEach(function (tr) {
      var useful = [].some.call(tr.querySelectorAll('td[data-date]'), function (td) { return td.classList.contains('event') || td.textContent.trim() !== '' })
      tr.setAttribute('aria-hidden', useful ? 'false' : 'true')
    })
    el.querySelectorAll('.fc-content-skeleton td.fc-day-top[data-date]').forEach(function (td) {
      var dd = parseKey(td.getAttribute('data-date'))
      var label = DAY_LONG[dow(dd)] + ', ' + MONTHS[dd.m - 1] + ' ' + dd.d + ', ' + dd.y
      if (td.classList.contains('fc-today')) label += ', Today'
      if (td.classList.contains('fc-other-month')) label += dd.m < r.month || dd.y < miniDate.y ? ', Previous month' : ', Next month'
      var bg = el.querySelector('.fc-bg td[data-date="' + td.getAttribute('data-date') + '"]')
      if (bg && bg.classList.contains('event')) label += ', Has events'
      var btn = td.querySelector('.day-wrapper-button')
      if (!btn) {
        var num = td.querySelector('.fc-day-number')
        btn = document.createElement('button')
        btn.className = 'day-wrapper-button fc-day-number'
        btn.textContent = num ? num.textContent : dd.d
        btn.style.cssText = 'border: none; background: transparent; padding: 0px; margin: 0px; font: inherit; color: inherit; opacity: inherit; cursor: pointer; width: 100%; height: 100%; text-align: inherit; display: inline-block; line-height: inherit; vertical-align: baseline;'
        if (num) num.replaceWith(btn); else td.appendChild(btn)
        btn.addEventListener('click', function () { gotoDate(dd) })
      }
      btn.setAttribute('tabindex', '0')
      btn.setAttribute('aria-label', label)
      btn.setAttribute('title', label)
    })
    el.querySelectorAll('.fc-widget-content td[data-date]').forEach(function (td) {
      td.style.cursor = 'pointer'
      if (td.classList.contains('fc-today')) td.style.backgroundColor = 'rgb(224, 247, 250)'
    })
  }

  // ---------- sidebar: context list (contextList.handlebars, type "calendars") ----------
  function renderContextList() {
    var holder = document.getElementById('calendar-list-holder')
    var html = '<ul id="calendars-context-list">\n  ' + CONTEXTS.filter(function (c) { return c.type !== 'account' }).map(function (c) {
      var a = esc(c.asset_string)
      return '<li data-context="' + a + '" class="context_list_context hover-container" style="display:flex;">\n    <span class="context-list-toggle-box group_' + a + '" aria-labelledby="group_' + a + '_checkbox_label"\n      tabindex="0" role="checkbox" style="flex-shrink:0;""></span>\n    <label id="group_' + a + '_checkbox_label" style="flex-grow:1;">\n      ' + esc(c.name) + '\n    </label>\n    <div class="buttons-wrapper" style="flex-shrink:0;">\n    <button type="button" tabindex="0" class="Button Button--icon-action ContextList__MoreBtn">\n      <i class="icon-more" aria-hidden="true"></i>\n      <span class="screenreader-only">\n        Open ' + esc(c.name) + ' Color Picker\n      </span>\n    </button>\n    </div>\n  </li>\n  '
    }).join('') + '</ul>\n<div id="calendars_color_picker_holder"></div>'
    holder.innerHTML = html
    notifyContexts()
    holder.addEventListener('click', function (e) {
      var box = e.target.closest('.context-list-toggle-box')
      if (!box) return
      toggleContext(box.closest('.context_list_context').getAttribute('data-context'))
    })
    holder.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('context-list-toggle-box')) {
        e.preventDefault()
        toggleContext(e.target.closest('.context_list_context').getAttribute('data-context'))
      }
    })
  }
  function notifyContexts() {
    document.querySelectorAll('#calendar-list-holder .context_list_context').forEach(function (li) {
      var on = visible.indexOf(li.getAttribute('data-context')) >= 0
      li.classList.toggle('checked', on)
      li.classList.toggle('not-checked', !on)
      li.querySelector('.context-list-toggle-box').setAttribute('aria-checked', on ? 'true' : 'false')
    })
    setSetting('checked_calendar_codes', visible)
  }
  function toggleContext(code) {
    var i = visible.indexOf(code)
    if (i >= 0) visible.splice(i, 1)
    else { visible.push(code); if (visible.length > ENV.CALENDAR.VISIBLE_CONTEXTS_LIMIT) visible.shift() }
    notifyContexts()
    window.__mockApi('/api/v1/calendar_events/save_selected_contexts', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({selected_contexts: visible.length ? visible : '[]'})})
    render()
  }

  // ---------- undated (UndatedEventsList, initially unloaded) ----------
  function renderUndated() {
    var div = document.getElementById('undated-events')
    div.innerHTML = '\n  <div class="spin_holder"></div>\n  <a href="#" data-text-while-loading="Loading undated items..." class="undated-events-link" style="display: none;">Show undated items</a>\n'
    var btn = document.getElementById('undated-events-button')
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true'
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
      div.style.display = open ? '' : 'none'
      if (!open) return
      var assets = visible.filter(function (c) { return c.indexOf('course_') === 0 })
      Promise.all(assets.map(function (c) { return fetchAll('/api/v1/courses/' + c.slice(7) + '/assignments?per_page=50') })).then(function (lists) {
        var undated = []
        lists.forEach(function (list, i) {
          list.forEach(function (a) { if (!a.due_at) undated.push({id: 'assignment_' + a.id, title: a.name, code: assets[i], url: a.html_url, icon: (a.submission_types || [])[0] === 'online_quiz' ? 'quiz' : 'assignment'}) })
        })
        div.innerHTML = undated.length ? '\n    <ul id="undated_events_list">\n      ' + undated.map(function (u) {
          return '<li class="undated_event event group_' + esc(u.code) + ' ' + esc(u.id) + '" data-event-id="' + esc(u.id) + '">\n          <a href="' + esc(u.url) + '" class=\'icon-' + u.icon + ' undated_event_title \'>\n            ' + esc(u.title.length > 35 ? u.title.slice(0, 35) + '...' : u.title) + '\n          </a>\n        </li>\n      '
        }).join('') + '</ul>\n' : '\n    No undated items.\n'
      })
    })
    div.style.display = 'none'
  }
  // element_toggler for "Calendars"
  function wireCalendarsToggle() {
    var btn = document.getElementById('calendar-toggle-button')
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true'
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
      document.getElementById('calendar-list-holder').style.display = open ? '' : 'none'
      var i = btn.querySelector('i'); i.className = open ? 'icon-mini-arrow-down auto_rotate' : 'icon-mini-arrow-right auto_rotate'
    })
  }

  // ---------- event details popover (ShowEventDetailsDialog + jquery-popover) ----------
  function closePopover() {
    var p = document.querySelector('body > .event-details')
    if (p) p.remove()
    document.getElementById('application').removeAttribute('aria-hidden')
  }
  function openPopover(ev, trigger, pageX) {
    closePopover()
    var ctx = ctxByAsset[ev.contextCode] || {}
    var timeStr
    if (ev.eventType === 'assignment') timeStr = 'Due: ' + fullDate(ev.originalStart) + ' ' + tinyTime(ev.originalStart)
    else if (ev.allDay) timeStr = fullDate(ev.start)
    else if (ev.eventType === 'planner_note') timeStr = fullDate(ev.start) + ' ' + tinyTime(ev.start)
    else timeStr = '<time datetime="' + ev.start.toISOString() + '">' + fullDate(ev.start) + ', ' + tinyTime(ev.start) + '</time> - <time datetime="' + ev.end.toISOString() + '">' + tinyTime(ev.end) + '</time>'
    var link = ev.eventType === 'assignment' ? ev.fullDetailsURL : ev.eventType === 'calendar_event' ? '/calendar?event_id=' + ev.object.id + '&include_contexts=' + ev.contextCode : null
    var canEdit = ev.editable
    var html = '<div class="event-details carat-bottom">\n  <div id="event-details-trap-focus">\n  <a href="#" class="popover_close x-close-link close" role="button" aria-label="Close">×</a>\n  <div class=\'event-details-header\'>\n    <div class="event-type">' + esc(ev.readable) + '</div>\n    <h2 class="details_title title">\n      ' + (link ? '<a href="' + esc(link) + '" class="view_event_link">' + esc(ev.title) + '</a>' : esc(ev.title)) + '\n    </h2>\n  </div>\n  <div class="event-details-content">\n    <div class="event-details-timestring">\n      ' + timeStr + '\n    </div>\n    <table cellspacing="0" role="presentation">\n        <tr>\n          <th scope="row">Source Calendar</th>\n          <td>\n              <a href="' + esc(ctx.url) + '">' + esc(ctx.name) + '</a>\n          </td>\n        </tr>\n' +
      (ev.location_name ? '        <tr>\n          <th scope="row">Location</th>\n          <td>' + esc(ev.location_name) + '</td>\n        </tr>\n' : '') +
      (ev.description ? '        <tr>\n          <th scope="row">Details</th>\n          <td class="user_content">\n              <div class="event-detail-overflow">\n                  ' + (ev.eventType === 'planner_note' ? esc(ev.description) : ev.description) + '\n              </div>\n          </td>\n        </tr>\n' : '') +
      (ev.eventType !== 'planner_note' ? '            <tr id=\'reservations\'>\n            </tr>\n' : '') +
      '    </table>\n    <div class="details_description lock_explanation"></div>\n  </div>\n' +
      (canEdit ? '    <div class="popover-links-holder event-details-footer">\n      <div class="pull-right">\n          <button class="event_button Button Button--small delete_event_link">Delete</button>\n          <button class="event_button edit_event_link Button Button--small Button--primary">Edit</button>\n      </div>\n      <div class="event-details-links">\n      </div>\n    </div>\n' : '') +
      '  </div>\n</div>'
    var t = document.createElement('template')
    t.innerHTML = html.trim()
    var el = t.content.firstChild
    el.id = 'popover-0'
    document.body.appendChild(el)
    el.style.position = 'absolute'
    var r = trigger.getBoundingClientRect()
    var top = r.top + window.scrollY - el.offsetHeight - 12
    var below = top < 0
    if (below) { top = r.bottom + window.scrollY + 12; el.classList.remove('carat-bottom') }
    var left = Math.max(0, Math.min(r.left + window.scrollX + r.width / 2 - el.offsetWidth / 2, document.documentElement.clientWidth - el.offsetWidth))
    el.style.top = top + 'px'
    el.style.left = left + 'px'
    var carat = document.createElement('span')
    carat.className = 'ui-menu-carat'
    carat.innerHTML = '<span></span>'
    carat.style.left = Math.max(20, Math.min((pageX || r.left + r.width / 2) - left, el.offsetWidth - 20)) + 'px'
    el.insertBefore(carat, el.firstChild)
    trigger.setAttribute('aria-expanded', 'true')
    trigger.setAttribute('aria-controls', 'popover-0')
    document.getElementById('application').setAttribute('aria-hidden', 'true')
    el.querySelector('.popover_close').addEventListener('click', function (e) { e.preventDefault(); closePopover() })
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePopover() })
    var first = el.querySelector('a[href], button')
    if (first) first.focus()
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-mock-event-id]')
    if (a && lastEvents[a.getAttribute('data-mock-event-id')]) {
      e.preventDefault()
      openPopover(lastEvents[a.getAttribute('data-mock-event-id')], a, e.pageX)
      return
    }
    if (!(e.target.closest && e.target.closest('.event-details'))) closePopover()
  })

  // calendar feed dialog (jQuery UI dialog) — minimal
  function wireFeed() {
    document.getElementById('calendar-feed-button').addEventListener('click', function () {
      var box = document.getElementById('calendar_feed_box')
      if (document.getElementById('mock-feed-dialog')) return
      var wrap = document.createElement('div')
      wrap.id = 'mock-feed-dialog'
      wrap.className = 'ui-dialog ui-widget ui-widget-content ui-corner-all ui-draggable ui-dialog-buttons'
      wrap.setAttribute('role', 'dialog')
      wrap.style.cssText = 'position: fixed; width: 400px; top: 120px; left: calc(50% - 200px); z-index: 1001; display: block;'
      wrap.innerHTML = '<div class="ui-dialog-titlebar ui-widget-header ui-corner-all ui-helper-clearfix"><span id="ui-id-1" class="ui-dialog-title">Calendar Feed</span><button class="ui-dialog-titlebar-close ui-corner-all" type="button" aria-label="Close"><span class="ui-icon ui-icon-closethick"></span></button></div>'
      var content = box.cloneNode(true)
      content.removeAttribute('id')
      content.className = 'ui-dialog-content ui-widget-content'
      content.style.display = 'block'
      wrap.appendChild(content)
      var overlay = document.createElement('div')
      overlay.className = 'ui-widget-overlay'
      overlay.style.cssText = 'position: fixed; inset: 0; z-index: 1000;'
      document.body.appendChild(overlay)
      document.body.appendChild(wrap)
      wrap.querySelector('.ui-dialog-titlebar-close').addEventListener('click', function () { wrap.remove(); overlay.remove() })
    })
  }

  later(function () {
    renderHeader()
    renderAppSkeleton()
    colorize()
    renderContextList()
    renderUndated()
    wireCalendarsToggle()
    wireFeed()
    window.addEventListener('resize', function () {
      if (currentView === 'month') sizeMonth(document.querySelector('#calendar-app .fc-view-container'), Math.round(document.querySelector('#calendar-app .calendar').clientWidth / 1.35))
    })
    return render()
  })
})()
