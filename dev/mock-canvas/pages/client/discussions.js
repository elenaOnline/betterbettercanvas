// mock-canvas: discussions index (student view) post-hydration DOM. Sources in pages/discussions.mjs.
(function () {
  var C = window.__mockC, h = C.h, CFG = C.cfg
  var api = window.__mockApi
  var content = document.getElementById('content')
  var topicsReq = api('/api/v1/courses/' + CFG.courseId + '/discussion_topics?plain_messages=true&exclude_assignment_descriptions=true&exclude_context_module_locked_topics=true&order_by=recent_activity&include_assignment=true&page=1&per_page=50')
  var assignReq = api('/api/v1/courses/' + CFG.courseId + '/assignments?per_page=100')
  var state = {filter: 'all', term: '', list: []}

  // useDateTimeFormat('time.formats.short') -> Intl {month: short, day: numeric, hour, minute}
  function short(iso) {
    return new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric'}).format(new Date(iso))
  }

  function header() {
    var selInput = h('input', {id: 'discussion-filter', name: 'filter-dropdown', readonly: true, role: 'combobox', 'aria-expanded': 'false', value: 'All', style: 'border:0;outline:0;background:transparent;font:inherit;width:100%;margin:0;padding:0;box-shadow:none;cursor:pointer'})
    selInput.addEventListener('click', function () {
      state.filter = state.filter === 'all' ? 'unread' : 'all'
      selInput.value = state.filter === 'all' ? 'All' : 'Unread'
      renderSections()
    })
    var search = h('input', {type: 'search', id: 'discussion-search', placeholder: 'Search by title or author...', 'aria-label': 'Search discussions by title'})
    search.addEventListener('input', function () { state.term = search.value; renderSections() })
    return h('span', {class: 'css-mock-view', style: 'display:block;margin:0 0 1.5rem', 'data-testid': 'discussions-index-container'}, [
      h('span', {class: 'css-mock-flex', style: 'flex-wrap:wrap;gap:.75rem;align-items:center'}, [
        h('span', {style: 'flex:0 1 12rem;min-width:8rem'}, [
          h('label', {for: 'discussion-filter', class: 'css-1sr5vj2-screenReaderContent', text: 'Discussion Filter'}),
          h('span', {class: 'css-mock-select', style: 'width:100%'}, [selInput, C.iconEl('arrow-open-down')]),
        ]),
        h('span', {style: 'flex:1 1 auto'}, [h('span', {class: 'css-mock-ti', style: 'width:100%'}, [C.iconEl('search'), search])]),
        h('span', {class: 'css-mock-flex', style: 'gap:.75rem'}, [
          h('a', {href: '/courses/' + CFG.courseId + '/discussion_topics/new', id: 'add_discussion', class: 'css-mock-btn primary', style: 'text-decoration:none'}, [C.iconEl('add'), h('span', {class: 'css-1sr5vj2-screenReaderContent', text: 'Add discussion'}), h('span', {'aria-hidden': 'true', text: 'Add Discussion'})]),
          h('span', {id: 'discussion_settings'}, [h('button', {type: 'button', class: 'css-mock-btn', id: 'discussion_settings_btn'}, [C.iconEl('settings'), 'Settings'])]),
        ]),
      ]),
    ])
  }

  // @canvas/unread-badge (both counts always rendered; Tooltip wrappers omitted)
  function unreadBadge(d) {
    if (!(d.discussion_subentry_count > 0)) return null
    return h('span', {class: 'ic-unread-badge'}, [
      C.sr(d.unread_count + ' unread replies'),
      h('span', {'aria-hidden': 'true', class: 'ic-unread-badge__count ic-unread-badge__unread-count', text: String(d.unread_count)}),
      C.sr(d.discussion_subentry_count + ' total replies'),
      h('span', {'aria-hidden': 'true', class: 'ic-unread-badge__count ic-unread-badge__total-count', text: String(d.discussion_subentry_count)}),
    ])
  }

  function row(d) {
    var unread = d.read_state !== 'read'
    var a = d.assignment
    var title = h('h3', {class: 'css-mock-heading', style: 'margin:0;font-size:1rem;line-height:1.25'}, [
      h('a', {href: d.html_url, 'data-testid': 'discussion-link-' + d.id, class: 'css-mock-view-link', style: 'font-weight:700'}, [
        unread ? C.sr('unread,') : null,
        h('span', {'aria-hidden': 'true', text: d.title}),
        C.sr(d.title + (d.last_reply_at && d.discussion_subentry_count ? ', Last post at ' + short(d.last_reply_at) : '') + (a && a.due_at ? ', Due ' + short(a.due_at) : '')),
      ]),
    ])
    var sub = h('span', {class: 'subscribe-button', 'data-testid': 'discussion-subscribe', 'data-action-state': d.subscribed ? 'unsubscribeButton' : 'subscribeButton'}, [
      h('button', {type: 'button', class: 'css-mock-iconButton', 'aria-pressed': d.subscribed ? 'true' : 'false', title: d.subscribed ? 'Unsubscribe from ' + d.title : 'Subscribe to ' + d.title, style: 'background:transparent;border:0;color:' + (d.subscribed ? '#03893D' : '#6B7780')}, [
        C.iconEl(d.subscribed ? 'bookmark' : 'bookmark'), C.sr(d.subscribed ? 'Subscribed' : 'Unsubscribed'),
      ]),
    ])
    sub.firstChild.addEventListener('click', function () {
      var m = d.subscribed ? 'DELETE' : 'PUT'
      api('/api/v1/courses/' + CFG.courseId + '/discussion_topics/' + d.id + '/subscribed', {method: m}).catch(function () {})
      d.subscribed = !d.subscribed
      renderSections()
    })
    var lastReply = d.discussion_subentry_count > 0 && d.last_reply_at
      ? h('span', {class: 'ic-discussion-row__content last-reply-at'}, [h('span', {class: 'css-mock-text', text: 'Last post at ' + short(d.last_reply_at)})]) : null
    var due = a && a.due_at
      ? h('span', {class: 'ic-discussion-row__content due-date'}, [h('span', {class: 'css-mock-text', text: 'Due ' + short(a.due_at)})]) : null
    var icon = a ? h('span', {class: 'css-mock-text', style: 'color:#03893D;font-size:1.375rem;margin-right:.75rem'}, [C.iconEl('assignment', {label: 'Graded Discussion'})]) : null
    var badgeCol = unread
      ? h('div', {'data-testid': 'ic-blue-unread-badge', style: 'position:relative;top:0'}, [h('span', {class: 'css-mock-view', style: 'display:inline-block;margin:0 .75rem .375rem 0'}, [h('span', {class: 'css-mock-badge'}, [C.sr('Unread')])])])
      : h('span', {class: 'css-mock-view', style: 'display:block;margin:0 .75rem .375rem 0'}, [h('span', {class: 'css-mock-view', style: 'display:block;margin:0 .75rem .375rem 0'})])
    var grid = function (rows) { return h('span', {class: 'css-mock-grid'}, rows) }
    var gRow = function (cols) { return h('span', {class: 'css-mock-gridRow'}, cols) }
    var gCol = function (kids, align, auto) { return h('span', {class: 'css-mock-gridCol' + (auto ? ' auto' : ''), style: align ? 'text-align:' + align : null}, kids) }
    var discussion = h('div', {style: 'opacity: 1;', class: 'ic-item-row ic-discussion-row'}, [
      h('div', {class: 'ic-discussion-row-container'}, [
        h('span', {class: 'ic-drag-handle-container'}),
        icon,
        h('span', {class: 'ic-discussion-content-container', style: 'margin-left: 0px;'}, [grid([
          gRow([gCol([title], 'start'), gCol([h('div', {style: 'display:flex;justify-content:end'}, [
            h('div', {class: 'ic-button-line-left '}, [unreadBadge(d)]),
            h('div', {class: 'ic-button-line-right '}, [sub]),
          ])], 'end')]),
          gRow([gCol([h('span', {'aria-hidden': 'true'}, [lastReply])], 'start'), gCol([h('span', {'aria-hidden': 'true'})], 'center'), gCol([h('span', {'aria-hidden': 'true'}, [due])], 'end')]),
        ])]),
      ]),
    ])
    return h('div', {'data-testid': 'discussion-row-container'}, [h('div', {}, [grid([gRow([gCol([badgeCol], null, true), gCol([discussion])])])])])
  }

  function background(kind) {
    var img = {pinned: CFG.images.pinned, unpinned: CFG.images.unpinned, closed: CFG.images['closed-comments']}[kind]
    var texts = {
      pinned: ['You currently have no pinned discussions'],
      unpinned: ['There are no discussions to show in this section'],
      closed: ['You currently have no discussions with closed comments'],
    }[kind]
    return h('div', {class: 'discussions-v2__container-image'}, [
      h('span', {class: 'css-mock-view', style: 'display:block;margin:2.25rem;text-align:center'}, [
        h('span', {class: 'discussions-v2__placeholder'}, [h('img', {alt: '', src: img, style: 'max-width:12rem'})]),
        h('span', {class: 'css-mock-view', style: 'display:block;margin:.375rem auto'}, [h('div', {class: 'css-mock-text css-mock-text-bold', text: texts[0]})]),
        kind === 'unpinned' ? h('a', {href: '/courses/' + CFG.courseId + '/discussion_topics/new', class: 'css-mock-view-link', text: 'Click here to add a discussion'}) : null,
      ]),
    ])
  }

  function section(cls, title, list, kind, pinned) {
    var kebab = title.toLowerCase().replace(/\s+/g, '-')
    var expanded = true
    var body = h('div', {class: 'css-mock-toggleDetails__content', style: 'padding:0'}, list.length ? list.map(row) : [background(kind)])
    var arrow = C.iconEl('arrow-open-down')
    var btn = h('button', {type: 'button', class: 'css-mock-togglebtn', 'aria-expanded': 'true'}, [
      arrow,
      h('span', {class: 'css-mock-flex', style: 'flex:1;align-items:center'}, [
        h('span', {style: 'flex:1'}, [h('span', {class: 'css-mock-text css-mock-text-bold', text: title})]),
        pinned ? null : h('span', {style: 'text-align:end'}, [h('span', {class: 'recent-activity-text-container'}, [h('span', {class: 'css-mock-text', style: 'font-style:italic', text: 'Ordered by Recent Activity'})])]),
      ]),
    ])
    btn.addEventListener('click', function () {
      expanded = !expanded
      btn.setAttribute('aria-expanded', String(expanded))
      body.style.display = expanded ? '' : 'none'
    })
    return h('div', {class: cls, 'data-testid': 'discussion-connected-container'}, [
      h('div', {class: 'discussions-container__wrapper', 'data-testid': 'discussions-container-' + kebab, 'data-action-state': 'discussions-container-' + kebab + '-expanded'}, [
        h('span', {}, [h('span', {class: 'css-1sr5vj2-screenReaderContent'}, [h('h2', {text: title})]), h('div', {class: 'css-mock-toggleDetails'}, [btn, body])]),
      ]),
    ])
  }

  var host
  function renderSections() {
    var re = state.term ? new RegExp(state.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null
    var vis = state.list.filter(function (d) { return (state.filter === 'all' || d.read_state !== 'read' || d.unread_count > 0) && (!re || re.test(d.title) || re.test((d.author || {}).display_name || '')) })
    var pinned = vis.filter(function (d) { return d.pinned })
    var closed = vis.filter(function (d) { return !d.pinned && d.locked })
    var open = vis.filter(function (d) { return !d.pinned && !d.locked })
    open.sort(function (a, b) { return new Date(b.last_reply_at || b.posted_at) - new Date(a.last_reply_at || a.posted_at) })
    var kids = []
    if (pinned.length) kids.push(section('pinned-discussions-v2__wrapper', 'Pinned Discussions', pinned, 'pinned', true))
    kids.push(section('unpinned-discussions-v2__wrapper', 'Discussions', open, 'unpinned'))
    kids.push(section('closed-for-comments-discussions-v2__wrapper', 'Closed for Comments', closed, 'closed'))
    host.replaceChildren(h('span', {class: 'css-mock-view', style: 'display:block;margin:1.5rem'}, kids))
  }

  window.__mockLater(function () {
    host = h('div', {})
    content.appendChild(h('div', {class: 'discussions-v2__wrapper'}, [
      h('span', {class: 'css-1sr5vj2-screenReaderContent'}, [h('h1', {text: 'Discussions'})]),
      header(),
      host,
    ]))
    return Promise.all([topicsReq, assignReq]).then(function (r) {
      var byId = {}
      ;(r[1] || []).forEach(function (a) { byId[a.id] = a })
      state.list = (r[0] || []).map(function (d) { if (d.assignment_id && !d.assignment) d.assignment = byId[d.assignment_id] || null; return d })
      renderSections()
    })
  })
})()
