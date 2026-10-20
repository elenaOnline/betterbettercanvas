// mock-canvas: announcements index post-hydration DOM (see pages/announcements.mjs for sources).
(function () {
  var C = window.__mockC, h = C.h, CFG = C.cfg
  var api = window.__mockApi
  var content = document.getElementById('content')
  var url = '/api/v1/courses/' + CFG.courseId + '/discussion_topics?only_announcements=true&per_page=40&page=1&filter_by=all&include%5B%5D=sections_user_count&include%5B%5D=sections'
  var req = api(url)
  var state = {filter: 'all', term: '', list: []}

  function textOf(html) { var s = document.createElement('span'); s.innerHTML = html || ''; return (s.textContent || '').trim() }

  function header() {
    var sel = h('span', {class: 'css-mock-select-wrap', 'data-testid': 'announcement-filter'}, [
      h('label', {for: 'announcement-filter', class: 'css-1sr5vj2-screenReaderContent', text: 'Announcement Filter'}),
      h('span', {class: 'css-mock-select'}, [
        h('input', {id: 'announcement-filter', name: 'filter-dropdown', readonly: true, role: 'combobox', 'aria-expanded': 'false', value: 'All', style: 'border:0;outline:0;background:transparent;font:inherit;width:5rem;margin:0;padding:0;box-shadow:none;cursor:pointer'}),
        C.iconEl('arrow-open-down'),
      ]),
    ])
    var selInput = sel.querySelector('input')
    selInput.addEventListener('click', function () {
      state.filter = state.filter === 'all' ? 'unread' : 'all'
      selInput.value = state.filter === 'all' ? 'All' : 'Unread'
      renderList()
    })
    var search = h('input', {type: 'search', id: 'announcements-search', placeholder: 'Search...', 'aria-label': 'Search announcements by title'})
    search.addEventListener('input', function () { state.term = search.value; renderList() })
    var markAll = h('button', {type: 'button', id: 'mark_all_announcement_read', 'data-testid': 'mark-all-announcement-read', class: 'css-mock-btn'}, [C.iconEl('check'), 'Mark All as Read'])
    markAll.addEventListener('click', function () {
      api('/api/v1/courses/' + CFG.courseId + '/discussion_topics/read_all', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({only_announcements: true})}).then(function () {
        state.list.forEach(function (a) { a.read_state = 'read' })
        renderList()
      })
    })
    return h('span', {class: 'css-mock-view', style: 'display:block;margin:0 0 1.5rem'}, [
      h('span', {class: 'css-mock-flex', style: 'flex-wrap:wrap;justify-content:flex-end;gap:.75rem;align-items:center'}, [
        h('span', {style: 'flex:1 1 100px;min-width:100px;max-width:12rem'}, [sel]),
        h('span', {style: 'flex:1 1 auto'}, [h('span', {class: 'css-mock-ti', style: 'width:100%'}, [C.iconEl('search'), search])]),
        h('span', {class: 'css-mock-flex', style: 'gap:.75rem'}, [markAll]),
      ]),
    ])
  }

  function row(a) {
    var unread = a.read_state !== 'read'
    var author = a.author || {}
    var text = textOf(a.message)
    var badge = unread
      ? h('span', {class: 'css-mock-view', style: 'display:block;margin:0 1.5rem 0 0'}, [h('span', {class: 'css-mock-badge', 'data-testid': 'notification-badge'}, [C.sr('Unread')])])
      : h('span', {class: 'css-mock-view', style: 'display:block;margin:0 .75rem 0 0'}, [h('span', {class: 'css-mock-view', style: 'display:block;margin:0 1.5rem 0 0'})])
    var link = function (kids, ref) { return h('a', {class: 'ic-item-row__content-link', href: a.html_url}, [h('div', {class: 'ic-item-row__content-link-container', 'data-testid': 'single-announcement-test-id'}, kids)]) }
    var avatar = h('span', {class: 'css-mock-avatar', 'aria-label': author.display_name || 'Unknown', role: 'img', 'data-fs-exclude': 'true'}, [author.avatar_image_url ? h('img', {src: author.avatar_image_url.replace('https://canvas.example.edu', ''), alt: ''}) : (author.display_name || '?').slice(0, 1)])
    return h('div', {style: 'opacity: 1;', class: 'ic-item-row ic-announcement-row'}, [
      badge,
      h('div', {class: 'ic-item-row__author-col'}, [avatar]),
      h('div', {class: 'ic-item-row__content-col'}, [
        link([h('h3', {class: 'css-mock-heading', style: 'margin:0;font-size:1.375rem;font-weight:400;line-height:1.25'}, [unread ? C.sr('unread,') : null, a.title])]),
        text ? h('div', {class: 'ic-item-row__content-container'}, [h('div', {class: 'ic-announcement-row__content user_content', text: text})]) : null,
        a.permissions && a.permissions.reply ? link([h('span', {class: 'css-mock-view', style: 'display:block;margin:.375rem 0 0', 'data-testid': 'announcement-reply'}, [h('span', {class: 'css-mock-text', style: 'color:var(--ic-brand-font-color-dark,#2D3B45);color:var(--ic-link-color)'}, [C.iconEl('reply'), ' Reply'])])]) : null,
      ]),
      h('div', {class: 'ic-item-row__meta-col'}, [
        h('div', {class: 'ic-item-row__meta-actions'}, [h('span', {class: 'ic-item-row__master-course-lock lock-icon'})]),
        h('div', {class: 'ic-item-row__meta-content'}, [h('div', {}, [
          h('span', {class: 'ic-item-row__meta-content-heading'}, [h('p', {class: 'css-mock-text css-mock-text-small', style: 'margin:0', text: a.delayed_post_at ? 'Delayed until:' : 'Posted on:'})]),
          h('span', {class: 'ic-item-row__meta-content-timestamp'}, [h('p', {class: 'css-mock-text css-mock-text-small css-mock-text-secondary', style: 'margin:0', text: C.intlMedium(a.delayed_post_at || a.posted_at)})]),
        ])]),
      ]),
    ])
  }

  var listHost
  function renderList() {
    var re = state.term ? new RegExp(state.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null
    var shown = state.list.filter(function (a) { return (state.filter === 'all' || a.read_state !== 'read') && (!re || re.test(a.title)) })
    if (!shown.length) {
      listHost.replaceChildren(h('div', {class: 'announcements-v2__empty-state', style: 'text-align:center;margin:3rem 0'}, [
        h('div', {style: 'margin:0 auto;max-width:16rem'}, [C.iconEl('announcement')]),
        h('h2', {class: 'css-mock-heading', style: 'margin:.75rem;font-size:1.375rem;font-weight:400', text: 'No Announcements'}),
        h('span', {class: 'css-mock-text', style: 'display:block;margin:.375rem auto', text: 'Check back later'}),
      ]))
      return
    }
    listHost.replaceChildren(h('span', {class: 'css-mock-view', style: 'display:block;margin:1.5rem'}, [
      h('span', {class: 'css-1sr5vj2-screenReaderContent'}, [h('h2', {text: 'Announcements List'})]),
    ].concat(shown.map(row))))
  }

  window.__mockLater(function () {
    listHost = h('div', {})
    var wrap = h('div', {class: 'announcements-v2__wrapper'}, [
      h('span', {class: 'css-1sr5vj2-screenReaderContent'}, [h('h1', {text: 'Announcements'})]),
      header(),
      listHost,
    ])
    content.appendChild(wrap)
    // the API returns newest first (posted_at desc); the mock's endpoint returns data order
    return req.then(function (list) { state.list = (list || []).sort(function (x, y) { return new Date(y.posted_at) - new Date(x.posted_at) }); renderList() })
  })
})()
