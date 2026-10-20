// mock-canvas: client-side rendering of the classic dashboard, after a delay, from the API —
// mirroring the order production uses: header (React) -> cards (dashboard_cards XHR) ->
// sidebar HTML (/dashboard-sidebar) -> ToDoSidebar (planner/items XHR).
// The DOM produced is the post-hydration DOM of the React components named in pages/dashboard.mjs.
(function () {
  var CFG = window.__mockDashboard
  var later = window.__mockLater
  var api = window.__mockApi
  var ENV = window.ENV

  function h(tag, attrs, kids) {
    var el = document.createElement(tag)
    attrs = attrs || {}
    for (var k in attrs) {
      var v = attrs[k]
      if (v == null || v === false) continue
      if (k === 'style') { for (var s in v) el.style[s] = v[s] }
      else if (k === 'html') el.innerHTML = v
      else if (k === 'text') el.textContent = v
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : v)
    }
    ;(kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c) })
    return el
  }
  function iconEl(name, extraClass) {
    var t = document.createElement('template')
    t.innerHTML = (CFG.icons[name] || '').trim()
    var svg = t.content.firstChild
    if (svg && extraClass) svg.setAttribute('class', svg.getAttribute('class') + ' ' + extraClass)
    return svg
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  function laParts(d) {
    var o = {}
    new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'long'})
      .formatToParts(d).forEach(function (p) { o[p.type] = p.value })
    return {y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, wd: o.weekday}
  }
  function timeStr(d) {
    var p = laParts(d), h12 = p.h % 12 === 0 ? 12 : p.h % 12
    return h12 + (p.mi ? ':' + String(p.mi).padStart(2, '0') : '') + (p.h < 12 ? 'am' : 'pm')
  }
  var NOW = new Date(document.querySelector('meta[name=mock-canvas]').content.match(/now=([^;]+)/)[1])
  function dateTimeStr(iso) {
    var d = new Date(iso), p = laParts(d), n = laParts(NOW)
    return MONTHS[p.m - 1] + ' ' + p.d + (p.y !== n.y ? ', ' + p.y : '') + ' at ' + timeStr(d)
  }
  function dayKey(d) { var p = laParts(d); return p.y + '-' + p.m + '-' + p.d }

  var colors = (ENV.PREFERENCES && ENV.PREFERENCES.custom_colors) || {}
  var hideOverlays = !!(ENV.PREFERENCES && ENV.PREFERENCES.hide_dashcard_color_overlays)
  var view = CFG.view

  // ---------- header (DashboardHeader.renderLegacy) ----------
  function renderHeader() {
    var c = document.getElementById('dashboard_header_container')
    var menuBtn = h('button', {type: 'button', class: 'css-1ws1ofu-view--inlineBlock-baseButton', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-popover-trigger': 'true', id: 'DashboardOptionsMenu_Button'}, [
      h('span', {class: 'css-1kxbfur-baseButton__content'}, [
        h('span', {class: 'css-q8pdyg-baseButton__children'}, [
          h('span', {class: 'css-mock-iconbutton-icon'}, [iconEl('more')]),
          h('span', {class: 'css-1sr5vj2-screenReaderContent', text: 'Dashboard Options'}),
        ]),
      ]),
    ])
    var layout = h('div', {class: 'large ic-Dashboard-header__layout'}, [
      h('span', {dir: 'ltr', class: 'css-mock-view--flex-flex', style: {width: '100%'}}, [
        h('span', {class: 'css-mock-view-flexItem'}, [
          h('span', {class: 'css-mock-view-heading .ic-Dashboard-header__title'}, [h('span', {class: 'hidden-phone', text: 'Dashboard'})]),
        ]),
        h('span', {class: 'css-mock-view-flexItem'}, [
          h('div', {class: 'ic-Dashboard-header__actions'}, [
            h('div', {id: 'dashboard-planner-header', class: 'CanvasPlanner__HeaderContainer', style: {display: view === 'planner' ? 'block' : 'none'}}),
            h('div', {id: 'DashboardOptionsMenu_Container'}, [h('span', {}, [menuBtn])]),
            h('div', {id: 'dashboard-planner-header-aux'}),
          ]),
        ]),
      ]),
    ])
    c.appendChild(layout)
    menuBtn.addEventListener('click', function () { toggleMenu(menuBtn) })
  }

  function toggleMenu(btn) {
    var open = document.getElementById('DashboardOptionsMenu_Menu')
    if (open) { open.parentNode.remove(); btn.setAttribute('aria-expanded', 'false'); return }
    btn.setAttribute('aria-expanded', 'true')
    function item(label, value, checked, type) {
      var li = h('li', {class: 'css-mock-menuItem__listItem'}, [
        h('span', {role: type || 'menuitemradio', 'aria-checked': checked ? 'true' : 'false', tabindex: '-1', class: 'css-mock-menuItem', 'data-value': value}, [
          h('span', {class: 'css-mock-menuItem__icon'}, checked ? [iconEl('check')] : []),
          h('span', {class: 'css-mock-menuItem__label', text: label}),
        ]),
      ])
      li.firstChild.addEventListener('click', function () {
        if (value === 'overlay') { setOverlays(!hideOverlays) } else { switchView(value) }
        toggleMenu(btn)
      })
      return li
    }
    var menu = h('ul', {role: 'menu', id: 'DashboardOptionsMenu_Menu', 'aria-label': 'Dashboard Options', class: 'css-mock-menu'}, [
      h('li', {role: 'presentation', class: 'css-mock-menuItemGroup'}, [
        h('span', {class: 'css-mock-menuItemGroup__label', id: 'mock-dash-view-label', text: 'Dashboard View'}),
        h('ul', {role: 'group', 'aria-labelledby': 'mock-dash-view-label'}, [
          item('Card View', 'cards', view === 'cards'), item('List View', 'planner', view === 'planner'), item('Recent Activity', 'activity', view === 'activity'),
        ]),
      ]),
      h('li', {role: 'none', class: 'css-mock-menuItemSeparator'}),
      view === 'cards' ? item('Color Overlay', 'overlay', !hideOverlays, 'menuitemcheckbox') : null,
    ])
    var portal = h('span', {dir: 'ltr', class: 'css-mock-popover-content'}, [menu])
    document.getElementById('nav-tray-portal').appendChild(portal)
    var r = btn.getBoundingClientRect()
    Object.assign(portal.style, {position: 'absolute', top: r.bottom + window.scrollY + 4 + 'px', left: Math.max(8, r.right - 200) + 'px'})
  }

  function setOverlays(on) {
    hideOverlays = !on
    api('/api/v1/users/self/settings', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({hide_dashcard_color_overlays: hideOverlays})})
    document.querySelectorAll('.ic-DashboardCard__header-button-bg').forEach(function (e) { e.style.opacity = hideOverlays ? 1 : 0 })
    document.querySelectorAll('.ic-DashboardCard__header_image .ic-DashboardCard__header_hero').forEach(function (e) { e.style.opacity = hideOverlays ? 0 : 0.6 })
  }

  function switchView(v) {
    view = v
    api('/dashboard/view', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({dashboard_view: v})})
    document.cookie = 'mock_dashboard_view=' + v + '; path=/'
    var els = {planner: ['dashboard-planner', 'dashboard-planner-header', 'dashboard-planner-header-aux'], activity: ['dashboard-activity', 'right-side-wrapper'], cards: ['DashboardCard_Container', 'right-side-wrapper']}
    Object.keys(els).forEach(function (k) { if (k !== v) els[k].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = 'none' }) })
    els[v].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = 'block' })
    document.body.classList.toggle('dashboard-is-planner', v === 'planner')
    load(v)
  }

  // ---------- cards (DashboardCardBox / DashboardCard / DashboardCardAction) ----------
  function renderCards(cards, summaries) {
    var container = document.getElementById('DashboardCard_Container')
    var box = h('div', {class: 'ic-DashboardCard__box'})
    var inner = h('div', {class: 'ic-DashboardCard__box__container'})
    box.appendChild(inner)
    if (!cards.length) {
      // DashboardCardBox renders nothing for zero cards; Canvas shows its "no courses" empty state elsewhere
    }
    cards.forEach(function (card) {
      var color = colors[card.assetString] || '#626E7B'
      var nick = card.shortName
      var hero = h('div', {class: 'ic-DashboardCard__header_hero', style: {backgroundColor: color}, 'aria-hidden': 'true'})
      if (card.image) {
        hero.style.opacity = hideOverlays ? 0 : 0.6
        hero = h('div', {class: 'ic-DashboardCard__header_image', style: {backgroundImage: 'url(' + card.image + ')'}}, [hero])
      }
      hero.addEventListener('click', function () { location.href = card.href })
      var title = h('h2', {class: 'ic-DashboardCard__header-title ellipsis', title: card.originalName, 'data-testid': 'dashboard-card-title'}, [h('span', {style: {color: color}, text: nick})])
      var settingsBtn = h('button', {type: 'button', class: 'Button Button--icon-action-rev ic-DashboardCard__header-button', 'aria-expanded': 'false', 'data-popover-trigger': 'true'}, [
        h('i', {class: 'icon-more', 'aria-hidden': 'true'}),
        h('span', {class: 'screenreader-only', text: 'Choose a color or course nickname or move course card for ' + nick}),
      ])
      var header = h('div', {class: 'ic-DashboardCard__header'}, [
        h('span', {class: 'screenreader-only', text: card.image ? 'Course image for ' + nick : 'Course card color region for ' + nick}),
        hero,
        h('a', {href: card.href, class: 'ic-DashboardCard__link'}, [
          h('div', {class: 'ic-DashboardCard__header_content'}, [
            title,
            h('div', {class: 'ic-DashboardCard__header-subtitle ellipsis', title: card.courseCode, text: card.courseCode}),
            h('div', {class: 'ic-DashboardCard__header-term ellipsis', title: card.term || '', text: card.term || ''}),
          ]),
        ]),
        h('div', {}, [
          h('div', {class: 'ic-DashboardCard__header-button-bg', style: {backgroundColor: color, opacity: hideOverlays ? 1 : 0}}),
          h('span', {}, [settingsBtn]),
        ]),
      ])
      var stream = summaries[card.id] || []
      var actions = h('nav', {class: 'ic-DashboardCard__action-container', 'aria-label': 'Actions for ' + nick})
      card.links.forEach(function (link) {
        if (link.hidden) return
        var sr = link.label + ' - ' + nick
        var unread = 0
        var type = {'icon-announcement': 'Announcement', 'icon-discussion': 'DiscussionTopic'}[link.icon]
        stream.forEach(function (s) { if (s.type === type) unread = s.unread_count })
        var layout = h('div', {class: 'ic-DashboardCard__action-layout'})
        var t = document.createElement('template')
        t.innerHTML = (CFG.iconsXSmall[link.icon.replace('icon-', '')] || '').trim()
        if (t.content.firstChild) layout.appendChild(t.content.firstChild)
        if (unread > 0) layout.appendChild(h('span', {class: 'ic-DashboardCard__action-badge'}, [h('span', {class: 'unread_count', text: String(unread < 100 ? unread : '99+')}), h('span', {class: 'screenreader-only', text: 'Unread'})]))
        actions.appendChild(h('a', {href: link.path, class: 'ic-DashboardCard__action ' + link.css_class, title: sr}, [h('span', {class: 'screenreader-only', text: sr}), layout]))
      })
      var el = h('div', {class: 'ic-DashboardCard', style: {opacity: 1}, 'aria-label': card.originalName, 'data-testid': 'draggable-card', draggable: 'true'}, [header, actions])
      inner.appendChild(el)
    })
    container.replaceChildren(box)
  }

  function loadCards() {
    return Promise.all([api('/api/v1/dashboard/dashboard_cards'), later(function () { return null })]).then(function (r) {
      var cards = r[0]
      // CourseActivitySummaryStore: one summary request per card
      return Promise.all(cards.map(function (c) { return api('/api/v1/courses/' + c.id + '/activity_stream/summary').then(function (s) { return [c.id, s] }) })).then(function (pairs) {
        var sums = {}
        pairs.forEach(function (p) { sums[p[0]] = p[1] })
        renderCards(cards, sums)
      })
    })
  }

  // ---------- sidebar (/dashboard-sidebar + ToDoSidebar) ----------
  function loadSidebar() {
    var right = document.getElementById('right-side')
    return fetch('/dashboard-sidebar', {credentials: 'same-origin'}).then(function (r) { return r.text() }).then(function (html) {
      return later(function () {
        right.innerHTML = html
        var c = document.querySelector('.Sidebar__TodoListContainer')
        if (c) return renderTodoSidebar(c)
      })
    })
  }

  function todoIcon(type) {
    var map = {assignment: ['assignment', 'Assignment'], quiz: ['quiz', 'Quiz'], discussion_topic: ['discussion', 'Discussion'], announcement: ['announcement', 'Announcement'], calendar_event: ['calendar-month', 'Calendar Event'], wiki_page: ['document', 'Page'], planner_note: ['note', 'To Do']}
    var m = map[type] || ['note', 'To Do']
    var svg = iconEl(m[0], 'ToDoSidebarItem__Icon')
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', m[1]); svg.removeAttribute('aria-hidden')
    return svg
  }

  function renderTodoSidebar(container) {
    var root = h('div', {'data-testid': 'ToDoSidebar'}, [h('h2', {class: 'todo-list-header', text: 'To Do'}), h('div', {class: 'css-mock-view', style: {textAlign: 'center'}}, [h('div', {class: 'css-mock-spinner', role: 'img', 'aria-label': 'To Do Items Loading'})])])
    container.replaceChildren(root)
    var start = new Date(NOW.getTime() - 14 * 864e5).toISOString() // sidebar-actions.js: currentMoment - 2 weeks
    return api('/api/v1/planner/items?start_date=' + encodeURIComponent(start) + '&filter=incomplete_items&order=asc&per_page=14').then(function (items) {
      return later(function () {
        var courses = ENV.STUDENT_PLANNER_COURSES || []
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
            info.appendChild(h('li', {class: 'css-mock-inlineListItem', text: dateTimeStr(it.plannable_date)}))
            var close = h('button', {type: 'button', class: 'css-mock-closeButton', 'data-testid': 'todo-sidebar-item-close-button'}, [h('span', {}, [iconEl('x'), h('span', {class: 'css-1sr5vj2-screenReaderContent', text: 'Dismiss ' + it.plannable.title})])])
            var li = h('li', {class: 'css-mock-listItem'}, [
              h('div', {class: 'ToDoSidebarItem'}, [
                todoIcon(it.plannable_type),
                h('div', {class: 'ToDoSidebarItem__Info', 'data-testid': 'todo-sidebar-item-info'}, [
                  h('div', {class: 'ToDoSidebarItem__Title', 'data-testid': 'todo-sidebar-item-title'}, [link]),
                  h('span', {class: 'css-mock-text css-mock-text-secondary css-mock-text-small css-mock-text-bold', text: c ? c.shortName : ''}),
                  info,
                ]),
                h('div', {class: 'ToDoSidebarItem__Close', 'data-testid': 'todo-sidebar-item-close'}, [h('span', {class: 'css-mock-closeButton-wrap'}, [close])]),
              ]),
            ])
            close.addEventListener('click', function () { dismiss(it).then(function () { li.remove() }) })
            body.appendChild(li)
          })
        }
        var showAll = visible.length ? h('div', {class: 'css-mock-view', style: {textAlign: 'center'}}, [h('button', {type: 'button', class: 'css-mock-link', text: 'Show All', onclick: function () { switchView('planner') }})]) : null
        root.replaceChildren(title, body)
        if (showAll) root.appendChild(showAll)
      })
    })
  }

  function dismiss(it) {
    if (it.planner_override) return api('/api/v1/planner/overrides/' + it.planner_override.id, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({marked_complete: it.planner_override.marked_complete, dismissed: true})})
    return api('/api/v1/planner/overrides', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({plannable_type: it.plannable_type, plannable_id: it.plannable_id, dismissed: true, marked_complete: false})})
  }

  // ---------- planner list view (ui/shared/planner PlannerApp/Day/Grouping/PlannerItem) ----------
  function renderPlannerHeader() {
    var host = document.getElementById('dashboard-planner-header')
    if (!host || host.firstChild) return
    host.appendChild(h('div', {class: 'PlannerHeader-styles__root PlannerHeader', 'data-testid': 'PlannerHeader'}, [
      h('button', {type: 'button', id: 'planner-today-btn', class: 'css-mock-baseButton', text: 'Today'}),
      h('button', {type: 'button', class: 'css-mock-iconButton', 'data-testid': 'add-to-do-button'}, [iconEl('plus'), h('span', {class: 'css-1sr5vj2-screenReaderContent', text: 'Add To Do'})]),
      h('button', {type: 'button', class: 'css-mock-iconButton', 'data-testid': 'show-my-grades-button'}, [iconEl('gradebook'), h('span', {class: 'css-1sr5vj2-screenReaderContent', text: 'Show My Grades'})]),
    ]))
  }

  function loadPlanner() {
    renderPlannerHeader()
    var host = document.getElementById('dashboard-planner')
    if (host.getAttribute('data-mock-loaded')) return Promise.resolve()
    host.setAttribute('data-mock-loaded', '1')
    // PlannerApp loads from the start of today (LA) forward; earlier days load on scroll-up in production
    var np = laParts(NOW)
    var from = new Date(NOW.getTime() - (np.h * 3600 + np.mi * 60) * 1000).toISOString()
    return api('/api/v1/planner/items?start_date=' + encodeURIComponent(from) + '&per_page=100').then(function (items) {
      return later(function () {
        var courses = ENV.STUDENT_PLANNER_COURSES || []
        var byDay = {}, order = []
        items.forEach(function (it) {
          var k = dayKey(new Date(it.plannable_date))
          if (!byDay[k]) { byDay[k] = []; order.push(k) }
          byDay[k].push(it)
        })
        var app = h('div', {class: 'PlannerApp large', 'data-testid': 'PlannerApp'})
        var todayKey = dayKey(NOW)
        order.forEach(function (k) {
          var d = new Date(byDay[k][0].plannable_date), p = laParts(d)
          var isToday = k === todayKey
          var heading = h('h2', {class: 'css-mock-heading'}, isToday
            ? [h('div', {'data-testid': 'today-text', class: 'css-mock-text css-mock-text-large css-mock-text-bold', text: 'Today'}), h('div', {'data-testid': 'today-date', class: 'Day-styles__secondary', text: p.wd + ', ' + new Intl.DateTimeFormat('en-US', {month: 'long', timeZone: 'America/Los_Angeles'}).format(d) + ' ' + p.d})]
            : [h('div', {'data-testid': 'not-today', class: 'Day-styles__secondary', text: p.wd + ', ' + new Intl.DateTimeFormat('en-US', {month: 'long', timeZone: 'America/Los_Angeles'}).format(d) + ' ' + p.d})])
          var dayEl = h('div', {'data-testid': 'day', class: 'Day-styles__root planner-day' + (isToday ? ' planner-today' : '')}, [heading])
          var groups = {}, gorder = []
          byDay[k].forEach(function (it) { var g = it.course_id ? 'c' + it.course_id : 'u'; if (!groups[g]) { groups[g] = []; gorder.push(g) } groups[g].push(it) })
          var wrap = h('div', {})
          gorder.forEach(function (g) {
            var list = groups[g]
            var c = courses.filter(function (x) { return 'c' + x.id === g })[0]
            var color = c ? colors[c.assetString] || '#626E7B' : '#626E7B'
            var gname = c ? c.shortName : 'To Do'
            var ol = h('ol', {class: 'Grouping-styles__items', style: {borderColor: color}})
            list.forEach(function (it) {
              var sub = it.submissions || {}
              var done = !!(it.planner_override && it.planner_override.marked_complete) || sub.submitted
              var cb = h('input', {type: 'checkbox', id: 'mock-cb-' + it.plannable_type + it.plannable_id, checked: done ? true : null, class: 'css-mock-checkbox__input'})
              cb.addEventListener('change', function () { markComplete(it, cb.checked) })
              var typeName = {assignment: 'Assignment', quiz: 'Quiz', discussion_topic: 'Discussion', announcement: 'Announcement', calendar_event: 'Calendar Event', planner_note: (c ? gname + ' ' : '') + 'To Do'}[it.plannable_type] || 'To Do'
              ol.appendChild(h('li', {class: 'Grouping-styles__item'}, [
                h('div', {'data-testid': 'planner-item-raw', class: 'PlannerItem-styles__root planner-item large' + (sub.missing ? ' PlannerItem-styles__missingItem' : '')}, [
                  h('div', {class: 'PlannerItem-styles__completed'}, [h('div', {class: 'css-mock-checkbox', 'data-testid': 'planner-item-completed-checkbox'}, [cb, h('label', {for: cb.id}, [h('span', {class: 'css-1sr5vj2-screenReaderContent', text: (done ? 'Unmark ' : 'Mark ') + it.plannable.title + (done ? ' as complete' : ' as complete')})])])]),
                  h('div', {class: 'PlannerItem-styles__icon', style: {color: color}, 'aria-hidden': 'true'}, [iconEl({assignment: 'assignment', quiz: 'quiz', discussion_topic: 'discussion', announcement: 'announcement', calendar_event: 'calendar-month', planner_note: 'note'}[it.plannable_type] || 'note')]),
                  h('div', {class: 'PlannerItem-styles__layout'}, [
                    h('div', {class: 'PlannerItem-styles__innerLayout'}, [
                      h('div', {class: 'PlannerItem-styles__details PlannerItem-styles__details_no_badges'}, [
                        h('div', {class: 'PlannerItem-styles__type'}, [h('span', {class: 'css-mock-text css-mock-text-small', text: typeName})]),
                        h('div', {class: 'PlannerItem-styles__title', style: {position: 'relative'}}, [h('a', {href: it.html_url, class: 'css-mock-view-link', text: it.plannable.title})]),
                      ]),
                      h('div', {class: 'PlannerItem-styles__secondary PlannerItem-styles__secondary_no_badges'}, [
                        h('div', {class: 'PlannerItem-styles__badges'}),
                        h('div', {class: 'PlannerItem-styles__metrics'}, [
                          it.plannable.points_possible ? h('div', {class: 'PlannerItem-styles__score'}, [h('span', {class: 'css-mock-text css-mock-text-large', text: String(it.plannable.points_possible)}), h('span', {class: 'css-mock-text css-mock-text-x-small', text: ' pts'})]) : null,
                          h('div', {class: 'PlannerItem-styles__due'}, [h('span', {class: 'css-mock-text css-mock-text-x-small', text: (it.plannable_type === 'calendar_event' ? '' : 'Due: ') + timeStr(new Date(it.plannable_date))})]),
                        ]),
                      ]),
                    ]),
                  ]),
                ]),
              ]))
            })
            wrap.appendChild(h('div', {class: 'Grouping-styles__root planner-grouping large'}, [
              h('a', {href: c ? '/courses/' + c.id : '#', class: 'Grouping-styles__hero Grouping-styles__heroHover', style: {backgroundColor: color}}, [
                h('span', {class: 'Grouping-styles__overlay', style: {backgroundColor: color}}),
                h('span', {class: 'Grouping-styles__title'}, [h('span', {class: 'Grouping-styles__groupingName', text: gname})]),
              ]),
              ol,
            ]))
          })
          dayEl.appendChild(wrap)
          app.appendChild(dayEl)
        })
        host.replaceChildren(app)
      })
    })
  }

  function markComplete(it, on) {
    if (it.planner_override) return api('/api/v1/planner/overrides/' + it.planner_override.id, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({marked_complete: on, dismissed: !!it.planner_override.dismissed})}).then(function (o) { it.planner_override = o })
    return api('/api/v1/planner/overrides', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({plannable_type: it.plannable_type, plannable_id: it.plannable_id, marked_complete: on})}).then(function (o) { it.planner_override = o })
  }

  // ---------- recent activity (users/_recent_activity / dashboard stream items) ----------
  function loadActivity() {
    var host = document.getElementById('dashboard-activity')
    if (host.getAttribute('data-mock-loaded')) return Promise.resolve()
    host.setAttribute('data-mock-loaded', '1')
    return api('/api/v1/users/self/activity_stream?per_page=21').then(function (items) {
      return later(function () {
        var ul = h('ul', {class: 'recent-activity-list'})
        var ann = items.filter(function (i) { return i.type === 'Announcement' })
        if (ann.length) {
          var li = h('li', {class: 'stream-category stream-announcement', 'data-category': 'Announcement'}, [
            h('div', {class: 'stream_header'}, [
              h('i', {class: 'icon-announcement', 'aria-hidden': 'true'}),
              h('span', {class: 'title', text: ann.length + ' Announcements'}),
            ]),
            h('div', {class: 'details_container'}, [h('table', {class: 'stream-details'}, [h('tbody', {}, ann.map(function (a) {
              return h('tr', {class: 'ic-notification ' + (a.read_state ? '' : 'unread')}, [
                h('td', {class: 'ic-notification__content'}, [
                  h('a', {href: a.html_url, class: 'ic-notification__title', text: a.title}),
                  h('div', {class: 'ic-notification__message notification_message', html: a.message}),
                ]),
                h('td', {class: 'ic-notification__actions'}, [h('div', {class: 'date', text: dateTimeStr(a.created_at)})]),
              ])
            }))])]),
          ])
          ul.appendChild(li)
        }
        host.replaceChildren(h('div', {class: 'ic-Dashboard-Activity__container'}, [ul]))
      })
    })
  }

  // Test hook: refetch /api/v1/dashboard/dashboard_cards and re-render the cards in the server's order,
  // replacing the card nodes the way React does on a reorder. Returns a promise.
  window.__mockRerenderCards = function () { return loadCards() }

  var loaded = {}
  function load(v) {
    if (loaded[v]) return
    loaded[v] = true
    if (v === 'cards') { loadCards(); if (!loaded.sidebar) { loaded.sidebar = true; loadSidebar() } }
    if (v === 'planner') loadPlanner()
    if (v === 'activity') { loadActivity(); if (!loaded.sidebar) { loaded.sidebar = true; loadSidebar() } }
  }

  later(function () {
    renderHeader()
    load(view)
  })
})()
