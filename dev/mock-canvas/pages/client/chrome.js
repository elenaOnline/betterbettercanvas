// mock-canvas: page chrome behaviour normally supplied by Canvas' navigation_header bundle.
// Runs on every page. Shares the mock delay (cookie mock_delay, default 250 ms).
(function () {
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : null
  }
  var d = parseInt(cookie('mock_delay'), 10)
  window.__mockDelay = isNaN(d) ? 250 : Math.max(0, d)
  window.__mockLater = function (fn) {
    if (window.__mockDelay === 0) return Promise.resolve().then(fn)
    return new Promise(function (r) { setTimeout(r, window.__mockDelay) }).then(fn)
  }
  window.__mockApi = function (url, opts) {
    opts = opts || {}
    var headers = Object.assign({Accept: 'application/json+canvas-string-ids, application/json', 'X-Requested-With': 'XMLHttpRequest'}, opts.headers || {})
    if (opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = cookie('_csrf_token') || ''
    return fetch(url, Object.assign({credentials: 'same-origin'}, opts, {headers: headers})).then(function (r) {
      return r.status === 204 ? null : r.json()
    })
  }

  // Canvas' JS marks the crumbs ready once it has measured them (common CSS hides #breadcrumbs until then)
  var crumbs = document.querySelector('.ic-app-crumbs')
  if (crumbs) crumbs.classList.add('ic-app-crumbs-ready')

  // Inbox unread badge (navigation_header renders this with React after an API call)
  window.__mockLater(function () {
    return window.__mockApi('/api/v1/conversations/unread_count').then(function (j) {
      var n = parseInt(j && j.unread_count, 10) || 0
      var badge = document.querySelector('#global_nav_conversations_link .menu-item__badge')
      if (!badge || !n) return
      badge.innerHTML = '<span class="css-1sr5vj2-screenReaderContent">' + n + ' unread messages</span><span aria-hidden="true">' + n + '</span>'
      var mob = document.getElementById('mobileHeaderInboxUnreadBadge')
      if (mob) mob.style.display = ''
    })
  })


  // Global-nav trays (ui/features/navigation_header/react/OldSideNav.tsx + trays/*Tray.tsx): Courses,
  // Account, Help, History open an InstUI Tray mounted in body > #nav-tray-portal instead of navigating.
  var TRAY_LINKS = {global_nav_courses_link: 'courses', global_nav_profile_link: 'profile', global_nav_help_link: 'help', global_nav_history_link: 'history'}
  var TRAY_LABEL = {courses: 'Courses tray', profile: 'Profile tray', help: 'Help tray', history: 'Recent History tray'}
  var openTray = null
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c] }) }
  function trayBody(type) {
    if (type === 'courses') {
      return window.__mockApi('/api/v1/users/self/favorites/courses?include[]=term&exclude[]=enrollments&sort=nickname').then(function (cs) {
        return '<div class="css-mock-tray-view" style="padding: 1.5rem"><h2 class="css-mock-tray-heading">Courses</h2><hr role="presentation"><div><div style="margin: 0.5rem 0"><a href="/courses" class="css-mock-view-link">All Courses</a></div><hr role="presentation"><ul class="css-mock-list" style="margin: 0.75rem 0">' +
          cs.map(function (c) { return '<li class="css-mock-listItem" style="margin-bottom: 0.75rem"><a href="/courses/' + c.id + '" class="css-mock-view-link">' + esc(c.name) + '</a>' + (c.term && c.term.name !== 'Default Term' ? '<div class="css-mock-text css-mock-text-small css-mock-text-secondary">' + esc(c.term.name) + '</div>' : '') + '</li>' }).join('') +
          '</ul></div><br><div class="css-mock-text">Welcome to your courses! To customize the list of courses, click on the "All Courses" link and star the courses to display.</div></div>'
      })
    }
    if (type === 'profile') {
      var u = window.ENV.current_user || {}
      var tabs = [['profile', 'Profile', '/profile'], ['settings', 'Settings', '/profile/settings'], ['notifications', 'Notifications', '/profile/communication'], ['files', 'Files', '/files'], ['eportfolios', 'ePortfolios', '/dashboard/eportfolios']]
      return Promise.resolve('<div class="css-mock-tray-view" style="padding: 1.5rem"><div style="text-align: center"><span class="css-mock-avatar" aria-label="User profile picture" role="img"><img src="' + esc(u.avatar_image_url) + '" alt="" style="width: 3.5rem; height: 3.5rem; border-radius: 50%"></span><div style="word-break: break-word"><h2 class="css-mock-tray-heading">' + esc(u.display_name) + '</h2></div><form action="/logout" method="post" style="margin: 1.5rem 0 0.5rem"><button type="submit" class="css-mock-baseButton" style="margin: 0">Logout</button></form></div><hr role="presentation"><ul class="css-mock-list">' +
        tabs.map(function (t) { return '<li class="css-mock-listItem"><div class="profile-tab-' + t[0] + '" style="margin: 0.75rem 0"><a href="' + t[2] + '" class="css-mock-view-link">' + t[1] + '</a></div></li>' }).join('') +
        '</ul><hr role="presentation"><h3 class="css-mock-tray-heading" style="font-size: 1.25rem">Accessibility Settings</h3><label class="css-mock-toggle"><input type="checkbox" role="switch" data-testid="high-contrast-toggle"> Use High Contrast UI</label></div>')
    }
    if (type === 'help') {
      var links = [['Ask Your Instructor a Question', 'Questions are submitted to your instructor'], ['Search the Canvas Guides', 'Find answers to common questions'], ['Report a Problem', 'If Canvas misbehaves, tell us about it'], ['the pilot school Office of Academic Innovation', 'Canvas help for the pilot school students']]
      return Promise.resolve('<div class="css-mock-tray-view" style="padding: 1.5rem"><h2 class="css-mock-tray-heading">Help</h2><hr role="presentation"><ul class="css-mock-list">' + links.map(function (l) { return '<li class="css-mock-listItem" style="margin-bottom: 1rem"><a href="#" class="css-mock-view-link">' + l[0] + '</a><div class="css-mock-text css-mock-text-small">' + l[1] + '</div></li>' }).join('') + '</ul></div>')
    }
    return Promise.resolve('<div class="css-mock-tray-view" style="padding: 1.5rem"><h2 class="css-mock-tray-heading">Recent History</h2><hr role="presentation"><ul class="css-mock-list"></ul></div>')
  }
  function closeTray() {
    var portal = document.getElementById('nav-tray-portal')
    if (portal) portal.innerHTML = ''
    document.querySelectorAll('.ic-app-header__menu-list-item--active[data-mock-tray]').forEach(function (li) { li.classList.remove('ic-app-header__menu-list-item--active'); li.removeAttribute('data-mock-tray') })
    if (openTray && openTray.prev) openTray.prev.classList.add('ic-app-header__menu-list-item--active')
    openTray = null
  }
  function showTray(type, link) {
    var portal = document.getElementById('nav-tray-portal')
    if (!portal) { portal = document.createElement('div'); portal.id = 'nav-tray-portal'; portal.setAttribute('style', 'position: relative; z-index: 99;'); document.body.appendChild(portal) }
    var prev = document.querySelector('#menu .ic-app-header__menu-list-item--active')
    if (prev) prev.classList.remove('ic-app-header__menu-list-item--active')
    var li = link.closest('li'); li.classList.add('ic-app-header__menu-list-item--active'); li.setAttribute('data-mock-tray', '1')
    openTray = {type: type, prev: prev}
    portal.innerHTML = '<span dir="ltr" class="css-1a3wh3f-tray" role="dialog" aria-label="' + TRAY_LABEL[type] + '"><span class="css-1n3iqmq-tray__content"><div class="navigation-tray-container ' + type + '-tray"><span class="css-mock-closeButton-end"><button type="button" class="css-mock-closeButton" data-mock-close-tray><span class="css-1sr5vj2-screenReaderContent">Close</span>&times;</button></span><div class="tray-with-space-for-global-nav"><div class="css-mock-view" style="text-align:center; padding: 2rem"><div class="css-mock-spinner" role="img" aria-label="Loading"></div></div></div></div></span></span>'
    trayBody(type).then(function (html) { return window.__mockLater(function () { var t = portal.querySelector('.tray-with-space-for-global-nav'); if (t && openTray && openTray.type === type) t.innerHTML = html }) })
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openTray) closeTray() })
  document.addEventListener('click', function (e) {
    var trayLink = e.target.closest && e.target.closest('#global_nav_courses_link, #global_nav_profile_link, #global_nav_help_link, #global_nav_history_link')
    if (trayLink) {
      e.preventDefault()
      var type = TRAY_LINKS[trayLink.id]
      if (openTray && openTray.type === type) closeTray(); else { closeTray(); showTray(type, trayLink) }
      return
    }
    if (e.target.closest && e.target.closest('[data-mock-close-tray]')) { e.preventDefault(); closeTray(); return }
    if (openTray && !(e.target.closest && e.target.closest('#nav-tray-portal'))) closeTray()
    var t = e.target.closest && e.target.closest('#courseMenuToggle, #primaryNavToggle')
    if (!t) return
    e.preventDefault()
    var b = document.body
    if (t.id === 'courseMenuToggle') {
      var left = document.getElementById('left-side')
      var expanded = b.classList.toggle('course-menu-expanded')
      if (left) left.style.display = expanded ? 'block' : 'none'
      t.setAttribute('aria-label', (expanded ? 'Hide' : 'Show') + ' Courses Navigation Menu')
    } else {
      var exp = b.classList.toggle('primary-nav-expanded')
      b.classList.add('primary-nav-transitions')
      t.setAttribute('aria-label', exp ? 'Minimize global navigation' : 'Expand global navigation')
      t.setAttribute('title', exp ? 'Minimize global navigation' : 'Expand global navigation')
    }
  })
})()
