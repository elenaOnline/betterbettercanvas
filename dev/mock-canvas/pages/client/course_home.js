// mock-canvas: course home late rendering.
//  - course_show_secondary bundle: planner ToDoSidebar into .Sidebar__TodoListContainer, scoped to
//    the course (sidebar-actions.js sidebarLoadInitialItems(currentMoment, course_id)).
//  - wiki_page_show bundle (when default_view is wiki): WikiPageView from ENV.WIKI_PAGE.
(function () {
  var C = window.__mockC, h = C.h, CFG = C.cfg

  function renderWiki() {
    var host = document.getElementById('wiki_page_show')
    var pg = window.ENV.WIKI_PAGE
    if (!host || !pg) return
    // ui/features/wiki_page_show/jst/WikiPage.handlebars (student: no edit/publish buttons)
    var html =
      '<div class="header-bar-outer-container">' +
      '<div class="sticky-toolbar" data-sticky>' +
      '<div class="header-bar flex-container">' +
      '<div class="header-bar-right header-right flex-column">' +
      '<div class="buttons">' +
      '<span id="immersive_reader_mount_point"></span>' +
      '</div></div></div></div></div>' +
      '<div class="show-content user_content clearfix enhanced">' +
      '<h1 class="page-title">' + escapeHtml(pg.title) + '</h1>' +
      pg.body +
      '</div>'
    host.innerHTML = html
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (ch) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch] }) }

  // ui/features/dashboard DashboardView (course stream): Show More / Show Less toggles
  function setShowMore(cat) {
    var exp = cat.querySelector('.details_container').style.display !== 'none'
    var n = parseInt((cat.querySelector('.count') || {}).textContent, 10)
    var name = cat.getAttribute('data-category') === 'Announcement' ? 'announcement' : 'discussion'
    var sr = (exp ? 'Collapse ' : 'Expand ') + n + ' ' + name + (n === 1 ? '' : 's')
    var link = cat.querySelector('.toggle-details')
    link.innerHTML = (exp ? '<span aria-hidden="true">Show Less <i class="icon-mini-arrow-up"></i></span>' : '<span aria-hidden="true">Show More <i class="icon-mini-arrow-down"></i></span>') + "\n<span class='screenreader-only'>" + sr + '</span>'
    link.setAttribute('aria-expanded', String(exp))
  }
  function initStream() {
    document.querySelectorAll('.stream-category').forEach(function (cat) {
      setShowMore(cat)
      cat.querySelector('.stream_header').addEventListener('click', function (e) {
        e.preventDefault()
        var d = cat.querySelector('.details_container')
        d.style.display = d.style.display === 'none' ? '' : 'none'
        setShowMore(cat)
      })
    })
  }

  window.__mockLater(function () {
    if (CFG.view === 'feed') initStream()
    if (CFG.view === 'wiki') renderWiki()
    var c = document.querySelector('#course_show_secondary .Sidebar__TodoListContainer')
    if (c) return C.renderTodoSidebar(c, CFG.courseId)
  })
})()
