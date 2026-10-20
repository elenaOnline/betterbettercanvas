// mock-canvas: helpers shared by the course-page client scripts (course home, assignments,
// modules, syllabus, announcements, discussions, assignment show). Exposes window.__mockC.
// Also injects the emotion-style CSS for the InstUI pieces these pages render, the way InstUI's
// emotion runtime appends <style data-emotion> tags to <head> at render time.
(function () {
  if (window.__mockC) return
  var CFG = window.__mockCourse || {}
  var NOW = new Date(document.querySelector('meta[name=mock-canvas]').content.match(/now=([^;]+)/)[1])
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  var WD = {Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat'}

  function h(tag, attrs, kids) {
    var el = document.createElement(tag)
    attrs = attrs || {}
    for (var k in attrs) {
      var v = attrs[k]
      if (v == null || v === false) continue
      if (k === 'style') { if (typeof v === 'string') el.setAttribute('style', v); else for (var s in v) el.style[s] = v[s] }
      else if (k === 'html') el.innerHTML = v
      else if (k === 'text') el.textContent = v
      else if (k === 'class') el.className = v
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : v)
    }
    ;(kids || []).forEach(function (c) { if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c) })
    return el
  }
  function iconEl(name, opts) {
    opts = opts || {}
    var t = document.createElement('template')
    t.innerHTML = ((CFG.icons || {})[name] || '').trim()
    var svg = t.content.firstChild
    if (!svg) return document.createTextNode('')
    if (opts.className) svg.setAttribute('class', svg.getAttribute('class') + ' ' + opts.className)
    if (opts.label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', opts.label); svg.removeAttribute('aria-hidden') }
    return svg
  }
  function sr(text) { return h('span', {class: 'css-1sr5vj2-screenReaderContent', text: text}) }
  function laParts(d) {
    var o = {}
    new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'long'})
      .formatToParts(d).forEach(function (p) { o[p.type] = p.value })
    return {y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, wd: o.weekday}
  }
  function timeStr(d) {
    d = new Date(d)
    var p = laParts(d), h12 = p.h % 12 === 0 ? 12 : p.h % 12
    return h12 + (p.mi ? ':' + String(p.mi).padStart(2, '0') : '') + (p.h < 12 ? 'am' : 'pm')
  }
  // "%l:%M%P" — always shows minutes ("11:59pm", "5:00pm")
  function timeFull(d) {
    var p = laParts(new Date(d)), h12 = p.h % 12 === 0 ? 12 : p.h % 12
    return h12 + ':' + String(p.mi).padStart(2, '0') + (p.h < 12 ? 'am' : 'pm')
  }
  // date-functions dateString: "Oct 21" this year, "Oct 21, 2025" otherwise
  function dateStr(d) {
    var p = laParts(new Date(d)), n = laParts(NOW)
    return MONTHS[p.m - 1] + ' ' + p.d + (p.y !== n.y ? ', ' + p.y : '')
  }
  // #date.formats.date_at_time "%b %-d at %l:%M%P"
  function dateAtTime(d) { var p = laParts(new Date(d)); return MONTHS[p.m - 1] + ' ' + p.d + ' at ' + timeFull(d) }
  // datetimeString (canvas date-functions): "Oct 21 at 11:59pm" / with year when not this year
  function datetimeStr(d) { return dateStr(d) + ' at ' + timeStr(d) }
  // #date.formats.full_with_weekday "%a %b %-d, %Y %-l:%M%P"
  function fullWithWeekday(d) { var p = laParts(new Date(d)); return WD[p.wd] + ' ' + MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y + ' ' + timeFull(d) }
  // #date.formats.medium_with_weekday "%a %b %-d, %Y"
  function mediumWithWeekday(d) { var p = laParts(new Date(d)); return WD[p.wd] + ' ' + MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y }
  // time.formats.medium (Intl, used by useDateTimeFormat): "Oct 15, 2026, 1:42 PM" -> Canvas shows "Oct 15, 2026, 1:42 PM"
  function intlMedium(d) {
    return new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'}).format(new Date(d))
  }
  function longDate(d) { var p = laParts(new Date(d)); return MONTHS_LONG[p.m - 1] + ' ' + p.d }
  function dayKey(d) { var p = laParts(new Date(d)); return p.y + '_' + String(p.m).padStart(2, '0') + '_' + String(p.d).padStart(2, '0') }

  // FriendlyDatetime (ui/shared/datetime/react/components/FriendlyDatetime.tsx), alwaysUseSpecifiedFormat
  function friendly(iso, text, prefix, extra) {
    var full = (prefix ? prefix + ' ' : '') + text
    var attrs = {title: datetimeStr(iso), datetime: new Date(iso).toISOString(), 'aria-hidden': 'true'}
    for (var k in extra || {}) attrs[k] = extra[k]
    return h('span', {'data-testid': 'friendly-date-time'}, [
      sr(full),
      h('time', attrs, [h('span', {class: 'visible-desktop', text: full}), h('span', {class: 'hidden-desktop', text: full})]),
    ])
  }

  function fromHtml(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content }

  // planner ToDoSidebar (ui/shared/planner/components/ToDoSidebar) — same DOM as pages/client/dashboard.js
  function renderTodoSidebar(container, courseId) {
    var root = h('div', {'data-testid': 'ToDoSidebar'}, [h('h2', {class: 'todo-list-header', text: 'To Do'}), h('div', {class: 'css-mock-view', style: {textAlign: 'center'}}, [h('div', {class: 'css-mock-spinner', role: 'img', 'aria-label': 'To Do Items Loading'})])])
    container.replaceChildren(root)
    var start = new Date(NOW.getTime() - 14 * 864e5).toISOString()
    var q = 'start_date=' + encodeURIComponent(start) + '&order=asc&filter=incomplete_items&per_page=14'
    if (courseId) q += '&context_codes%5B%5D=course_' + courseId + '&context_codes%5B%5D=user_' + window.ENV.current_user_id
    return window.__mockApi('/api/v1/planner/items?' + q).then(function (items) {
      return window.__mockLater(function () {
        var courses = CFG.plannerCourses || []
        var visible = items.filter(function (i) { return !(i.planner_override && (i.planner_override.marked_complete || i.planner_override.dismissed)) }).slice(0, 7)
        var title = h('h2', {class: 'todo-list-header'}, [h('span', {tabindex: '-1', text: 'To Do'})])
        var body
        if (!visible.length) body = h('span', {class: 'css-mock-text css-mock-text-small', text: 'Nothing for now'})
        else {
          body = h('ul', {id: 'planner-todosidebar-item-list', class: 'css-mock-list'})
          visible.forEach(function (it) {
            var c = courses.filter(function (x) { return String(x.id) === String(it.course_id) })[0]
            var typeLabel = {assignment: 'Assignment', quiz: 'Quiz', discussion_topic: 'Discussion', planner_note: 'To Do'}[it.plannable_type] || 'To Do'
            var titleText = h('span', {class: 'css-mock-text css-mock-text-small', 'data-lineheight': 'fit'}, [h('span', {class: 'css-mock-truncateText', text: it.plannable.title})])
            var link = it.html_url && it.plannable_type !== 'planner_note'
              ? h('a', {href: it.html_url, 'aria-label': typeLabel + ' ' + it.plannable.title, class: 'css-mock-view-link'}, [titleText])
              : h('span', {class: 'css-mock-text', 'aria-label': typeLabel + ' ' + it.plannable.title}, [titleText])
            var info = h('ul', {'data-testid': 'ToDoSidebarItem__InformationRow', class: 'css-mock-inlineList'})
            if (it.plannable.points_possible) info.appendChild(h('li', {class: 'css-mock-inlineListItem'}, [it.plannable.points_possible + ' points', h('span', {class: 'css-mock-inlineListItem__delimiter', 'aria-hidden': 'true'})]))
            info.appendChild(h('li', {class: 'css-mock-inlineListItem', text: datetimeStr(it.plannable_date)}))
            var close = h('button', {type: 'button', class: 'css-mock-closeButton', 'data-testid': 'todo-sidebar-item-close-button'}, [h('span', {}, [iconEl('x'), sr('Dismiss ' + it.plannable.title)])])
            var icon = {assignment: ['assignment', 'Assignment'], quiz: ['quiz', 'Quiz'], discussion_topic: ['discussion', 'Discussion'], planner_note: ['note', 'To Do']}[it.plannable_type] || ['note', 'To Do']
            var li = h('li', {class: 'css-mock-listItem'}, [
              h('div', {class: 'ToDoSidebarItem'}, [
                iconEl(icon[0], {className: 'ToDoSidebarItem__Icon', label: icon[1]}),
                h('div', {class: 'ToDoSidebarItem__Info', 'data-testid': 'todo-sidebar-item-info'}, [
                  h('div', {class: 'ToDoSidebarItem__Title', 'data-testid': 'todo-sidebar-item-title'}, [link]),
                  h('span', {class: 'css-mock-text css-mock-text-secondary css-mock-text-small css-mock-text-bold', text: c ? c.shortName : ''}),
                  info,
                ]),
                h('div', {class: 'ToDoSidebarItem__Close', 'data-testid': 'todo-sidebar-item-close'}, [h('span', {class: 'css-mock-closeButton-wrap'}, [close])]),
              ]),
            ])
            close.addEventListener('click', function () {
              var o = it.planner_override
              var req = o
                ? window.__mockApi('/api/v1/planner/overrides/' + o.id, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({marked_complete: o.marked_complete, dismissed: true})})
                : window.__mockApi('/api/v1/planner/overrides', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({plannable_type: it.plannable_type, plannable_id: it.plannable_id, dismissed: true, marked_complete: false})})
              req.then(function () { li.remove() })
            })
            body.appendChild(li)
          })
        }
        // ToDoSidebar renders "Show All" only when it can switch the dashboard view; never on course pages
        root.replaceChildren(title, body)
      })
    })
  }

  // emotion-equivalent styles for the InstUI components these pages render (approximation of
  // InstUI 10 theme values: Lato, 0.875/1rem text, #2D3B45 text, #6B7780 secondary, #C7CDD1 borders)
  var CSS = [
    '.css-mock-ti{display:inline-flex;align-items:center;border:1px solid #C7CDD1;border-radius:.25rem;background:#fff;height:2.375rem;padding:0 .75rem;box-sizing:border-box;font-size:1rem;color:#2D3B45}',
    '.css-mock-ti:focus-within{border-color:#0374B5;box-shadow:inset 0 0 0 1px #0374B5}',
    '.css-mock-ti svg{color:#6B7780;margin-right:.5rem;flex:none}',
    '.css-mock-ti input{border:0 !important;outline:0;box-shadow:none !important;background:transparent;font:inherit;color:inherit;flex:1;min-width:0;height:100%;margin:0 !important;padding:0 !important}',
    '.css-mock-toggle-group{display:inline-flex;border:0;padding:0;margin:0}',
    '.css-mock-toggle{position:relative;display:inline-block}',
    '.css-mock-toggle input{position:absolute;opacity:0;width:1px;height:1px}',
    '.css-mock-toggle label{display:inline-block;cursor:pointer;font-size:.875rem;font-weight:700;text-transform:uppercase;line-height:2.375rem;padding:0 1rem;background:#F5F5F5;color:#2D3B45;border:1px solid #C7CDD1;margin:0}',
    '.css-mock-toggle:first-child label{border-radius:.25rem 0 0 .25rem}',
    '.css-mock-toggle:last-child label{border-radius:0 .25rem .25rem 0;border-left:0}',
    '.css-mock-toggle input:checked + label{background:var(--ic-brand-button--primary-bgd,#213921);border-color:var(--ic-brand-button--primary-bgd,#213921);color:#fff}',
    '.css-mock-badge{display:inline-block;width:.75rem;height:.75rem;border-radius:50%;background:#0374B5;vertical-align:middle}',
    '.css-mock-avatar{display:inline-flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;border-radius:50%;background:#fff center/cover no-repeat;box-shadow:inset 0 0 0 1px #C7CDD1;overflow:hidden;font-size:.875rem;color:#6B7780}',
    '.css-mock-avatar img{width:100%;height:100%;object-fit:cover}',
    '.css-mock-pill{display:inline-flex;align-items:center;border:1px solid #6B7780;border-radius:999rem;padding:0 .5rem;font-size:.75rem;line-height:1.25rem;color:#6B7780;text-transform:uppercase;font-weight:700;letter-spacing:.0625rem}',
    '.css-mock-pill.danger{border-color:#E0061F;color:#E0061F}',
    '.css-mock-pill.success{border-color:#03893D;color:#03893D}',
    '.css-mock-togglebtn{display:flex;align-items:center;width:100%;background:transparent;border:0;padding:.75rem;margin:0;cursor:pointer;color:#2D3B45;font:inherit;text-align:start}',
    '.css-mock-togglebtn svg{margin-right:.5rem;flex:none}',
    '.css-mock-select{display:inline-flex;align-items:center;justify-content:space-between;border:1px solid #C7CDD1;border-radius:.25rem;background:#fff;height:2.375rem;padding:0 .75rem;box-sizing:border-box;font-size:1rem;color:#2D3B45;min-width:7rem}',
    '.css-mock-select svg{color:#6B7780;margin-left:.5rem}',
    '.css-mock-btn{display:inline-flex;align-items:center;gap:.5rem;border:1px solid #C7CDD1;border-radius:.25rem;background:#F5F5F5;color:#2D3B45;height:2.375rem;padding:0 .75rem;font-size:1rem;cursor:pointer;font-family:inherit}',
    '.css-mock-btn.primary{background:var(--ic-brand-button--primary-bgd,#213921);border-color:var(--ic-brand-button--primary-bgd,#213921);color:#fff}',
    '.css-mock-grid{display:flex;flex-direction:column;width:100%}',
    '.css-mock-gridRow{display:flex;align-items:center;width:100%}',
    '.css-mock-gridCol{flex:1 1 0;min-width:0}',
    '.css-mock-gridCol.auto{flex:0 0 auto}',
    '.css-mock-flex{display:flex}',
    // app/stylesheets/components/_ic-unread-badge.scss (not in the mock's compiled bundles)
    '.ic-unread-badge{background:var(--ic-brand-primary);border-radius:100px;overflow:hidden;display:inline-block;font-size:.9rem;text-align:center;margin-bottom:-6px;margin-right:5px}',
    '.ic-unread-badge__count{min-width:5px;padding:1px 10px;display:inline-block}',
    '.ic-unread-badge__unread-count{color:#fff}',
    '.ic-unread-badge__total-count{background:#F5F5F5}',
  ].join('\n')
  var st = document.createElement('style')
  st.setAttribute('data-emotion', 'css-mock-course')
  st.textContent = CSS
  document.head.appendChild(st)

  window.__mockC = {
    h: h, iconEl: iconEl, sr: sr, NOW: NOW, laParts: laParts, timeStr: timeStr, timeFull: timeFull, dateStr: dateStr,
    dateAtTime: dateAtTime, datetimeStr: datetimeStr, fullWithWeekday: fullWithWeekday, mediumWithWeekday: mediumWithWeekday,
    intlMedium: intlMedium, longDate: longDate, dayKey: dayKey, friendly: friendly, fromHtml: fromHtml,
    renderTodoSidebar: renderTodoSidebar, cfg: CFG, MONTHS: MONTHS,
  }
})()
