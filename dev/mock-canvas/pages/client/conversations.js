// mock-canvas: client-side rendering of the React inbox (ui/features/inbox) after the mock delay.
// Builds the post-hydration DOM of CanvasInbox.tsx (desktop breakpoint, inbox settings off):
//   h1.sr "Inbox" / Flex(column, 100vh) > [desktop-message-action-header: MessageListActionContainer]
//   + [Flex: ConversationListContainer (#inbox-conversation-holder, 400px) | NoSelectedConversation
//   or MessageDetailContainer], and ComposeModalContainer (#compose-message-modal) on Compose/Reply.
// InstUI emotion classes are stand-ins "css-mbx<n>-<label>" with InstUI's own labels; their CSS goes
// into <head> as <style data-emotion="css">, as emotion does at runtime.
(function () {
  var CFG = window.__mockInbox
  var later = window.__mockLater
  var api = window.__mockApi
  var content = document.getElementById('content')

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
  function ic(name, solid) { return CFG.icons[name + (solid ? ':Solid' : '')] || CFG.icons[name] || '' }
  function frag(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild }
  var uid = 0
  function nid(p) { uid += 1; return p + '_' + uid }

  // ---------- emotion stand-in CSS (values from @instructure/ui-themes canvas tokens) ----------
  var CSS = [
    '.css-mbx1-screenReaderContent{width:.0625rem;height:.0625rem;margin:-.0625rem;padding:0;position:absolute;overflow:hidden;clip:rect(0 0 0 0);border:0}',
    '.css-mbx2-view--flex-flex{display:flex;box-sizing:border-box;min-width:.0625rem}',
    '.css-mbx3-view-flexItem{box-sizing:border-box;min-width:.0625rem;flex-shrink:0}',
    '.css-mbx4-view--block{display:block;box-sizing:border-box;max-width:100%}',
    '.css-mbx5-view--inlineBlock{display:inline-block;vertical-align:middle;box-sizing:border-box;max-width:100%}',
    '.css-mbx6-view-heading{margin:0;font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:700;color:#273540;line-height:1.25;font-size:1.375rem}',
    '.css-mbx7-text{font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif;color:#273540;font-size:1rem;line-height:1.5}',
    '.css-mbx7-text.small{font-size:.875rem}.css-mbx7-text.x-small{font-size:.75rem}.css-mbx7-text.large{font-size:1.375rem}',
    '.css-mbx7-text.bold{font-weight:700}.css-mbx7-text.secondary{color:#6A7883}.css-mbx7-text.brand{color:var(--ic-brand-primary,#0374B5)}',
    '.css-mbx8-view--inlineBlock-baseButton{appearance:none;cursor:pointer;display:inline-block;position:relative;margin:0;padding:0;border-radius:.25rem;border:.0625rem solid #D7DADE;background:#F2F4F4;color:#273540;font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:1rem;line-height:1;text-decoration:none;vertical-align:middle;box-sizing:border-box}',
    '.css-mbx8-view--inlineBlock-baseButton:hover{background:#E2E5E7}',
    '.css-mbx8-view--inlineBlock-baseButton[disabled]{cursor:not-allowed;opacity:.5;pointer-events:none}',
    '.css-mbx8-view--inlineBlock-baseButton.primary{background:var(--ic-brand-button--primary-bgd,#0374B5);border-color:var(--ic-brand-button--primary-bgd,#0374B5);color:var(--ic-brand-button--primary-text,#fff)}',
    '.css-mbx8-view--inlineBlock-baseButton.bare{background:transparent;border-color:transparent}',
    '.css-mbx9-baseButton__content{box-sizing:border-box;width:100%;display:flex;align-items:center;justify-content:center;min-height:2.375rem;padding:0 .75rem}',
    '.css-mbx9-baseButton__content.iconOnly{width:2.375rem;padding:0;font-size:1.25rem}',
    '.css-mbx9-baseButton__content.small{min-height:1.75rem}.css-mbx9-baseButton__content.small.iconOnly{width:1.75rem;font-size:1rem}',
    '.css-mbx10-baseButton__children{display:block}',
    '.css-mbx11-baseButton__iconSVG{display:flex;align-items:center}.css-mbx11-baseButton__iconSVG.withText{padding-right:.375rem}',
    'label.css-mbx12-formFieldLayout{all:initial;display:block;width:100%;margin:0;font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif}',
    '.css-mbx13-formFieldLayout__label{display:block}',
    '.css-mbx14-textInput__facade{display:flex;align-items:center;box-sizing:border-box;border:.0625rem solid #6A7883;border-radius:.25rem;background:#fff;height:2.375rem;padding:0 .5rem;gap:.5rem;color:#273540}',
    'input.css-mbx15-textInput[type],input.css-mbx15-textInput{all:initial;box-sizing:border-box;border:0;box-shadow:none;margin:0;padding:0;background:transparent;flex:1;min-width:0;height:100%;font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:1rem;color:#273540;line-height:1.5}',
    'input.css-mbx15-textInput::placeholder{color:#6A7883}',
    'textarea.css-mbx16-textArea{all:initial;margin:0;box-shadow:none;display:block;box-sizing:border-box;width:100%;border:.0625rem solid #6A7883;border-radius:.25rem;padding:.5rem .75rem;font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:1rem;color:#273540;resize:vertical;background:#fff}',
    '.css-mbx17-mask{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.75);box-sizing:border-box;padding:1rem}',
    '.css-mbx18-modal{display:flex;flex-direction:column;box-sizing:border-box;width:48em;max-width:100%;max-height:100%;background:#fff;border:.0625rem solid #D7DADE;border-radius:.25rem;box-shadow:0 .375rem .4375rem rgba(0,0,0,.1),0 .625rem 1.75rem rgba(0,0,0,.25);font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif;color:#273540;overflow:hidden}',
    '.css-mbx19-modal__constrainContext{display:flex;flex-direction:column;min-height:0;flex:1}',
    '.css-mbx20-modalHeader{position:relative;padding:1.5rem;border-bottom:.0625rem solid #D7DADE;box-sizing:border-box}',
    '.css-mbx20-modalHeader .css-mbx6-view-heading{font-size:1.75rem;font-weight:400}',
    '.css-mbx21-modalBody{position:relative;overflow-y:auto;flex:1;box-sizing:border-box}',
    '.css-mbx22-modalFooter{display:flex;align-items:center;justify-content:flex-end;padding:.75rem;background:#F2F4F4;border-top:.0625rem solid #D7DADE;box-sizing:border-box}',
    '.css-mbx23-closeButton{position:absolute;top:.75rem;right:.75rem}',
    '.css-mbx24-checkbox{display:flex;align-items:center;gap:.5rem;position:relative}',
    '.css-mbx25-checkbox__input{width:1.25rem;height:1.25rem;margin:0}',
    '.css-mbx26-checkboxFacade__label{font-size:1rem;color:#273540;font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif}',
    '.css-mbx27-grid{display:block}.css-mbx27-grid__row{display:flex;align-items:center}.css-mbx27-grid__col{flex:1 1 0;min-width:0;box-sizing:border-box}.css-mbx27-grid__col.auto{flex:0 0 auto}',
    '.css-mbx28-badge{display:inline-block;min-width:1.25rem;padding:0 .3125rem;border-radius:.25rem;background:#6A7883;color:#fff;font-size:.8125rem;font-weight:700;line-height:1.25rem;text-align:center;box-sizing:border-box}',
    '.css-mbx29-options{list-style:none;margin:0;padding:.25rem 0;background:#fff;border:.0625rem solid #D7DADE;border-radius:.25rem;box-shadow:0 .1875rem .375rem rgba(0,0,0,.1),0 .1875rem .375rem rgba(0,0,0,.16);max-height:20rem;overflow-y:auto;font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif;min-width:14rem}',
    '.css-mbx30-optionItem{padding:.5rem .75rem;cursor:pointer;color:#273540}.css-mbx30-optionItem[aria-selected=true],.css-mbx30-optionItem:hover{background:#0374B5;color:#fff}',
    '.css-mbx31-optionsGroup__label{display:block;padding:.5rem .75rem;font-weight:700;color:#273540}',
    '.css-mbx32-avatar{display:inline-flex;align-items:center;justify-content:center;width:3rem;height:3rem;border-radius:50%;background:#F2F4F4;border:.125rem solid #fff;box-shadow:inset 0 0 0 .0625rem #D7DADE;font-weight:700;color:#2B7ABC;overflow:hidden;flex-shrink:0}',
    '.css-mbx32-avatar img{width:100%;height:100%;object-fit:cover}',
    '.css-mbx33-tag{display:inline-flex;align-items:center;gap:.25rem;padding:0 .5rem;height:1.5rem;border:.0625rem solid #D7DADE;border-radius:.75rem;background:#F2F4F4;font-size:.875rem;margin-right:.25rem}',
    '.css-mbx34-popover{position:absolute;z-index:10000}',
    '.css-mbx35-menu{list-style:none;margin:0;padding:.25rem 0;background:#fff;border:.0625rem solid #D7DADE;border-radius:.25rem;box-shadow:0 .1875rem .375rem rgba(0,0,0,.1);min-width:12rem;font-family:LatoWeb,"Lato Extended",Lato,"Helvetica Neue",Helvetica,Arial,sans-serif}',
    '.css-mbx36-menuItem{display:block;padding:.5rem .75rem;cursor:pointer;color:#273540}.css-mbx36-menuItem:hover{background:#0374B5;color:#fff}',
  ].join('')

  // ---------- InstUI building blocks ----------
  function sr(text) { return '<span class="css-mbx1-screenReaderContent">' + esc(text) + '</span>' }
  function button(o) {
    // o: {id, testid, label (aria-label), icon, text, primary, disabled, bare, small, extraAttrs}
    var iconOnly = !o.text
    return '<button' + (o.id ? ' id="' + esc(o.id) + '"' : '') + ' cursor="pointer" type="button"' + (o.testid ? ' data-testid="' + esc(o.testid) + '"' : '') +
      (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + (o.disabled ? ' disabled="" aria-disabled="true"' : '') + (o.extraAttrs || '') +
      ' class="css-mbx8-view--inlineBlock-baseButton' + (o.primary ? ' primary' : '') + (o.bare ? ' bare' : '') + '"' + (o.margin ? ' style="margin:' + o.margin + '"' : '') + '>' +
      '<span class="css-mbx9-baseButton__content' + (iconOnly ? ' iconOnly' : '') + (o.small ? ' small' : '') + '">' +
      (o.icon ? '<span class="css-mbx11-baseButton__iconSVG' + (iconOnly ? '' : ' withText') + '">' + ic(o.icon, o.solid) + '</span>' : '') +
      '<span class="css-mbx10-baseButton__children">' + (o.text ? esc(o.text) : (o.srLabel ? sr(o.srLabel) : '')) + '</span></span></button>'
  }
  function textInput(o) {
    // o: {id, label (sr), placeholder, value, before (html), after (html), testid, role, readonly, attrs}
    var id = o.id || nid('TextInput')
    return '<label class="css-mbx12-formFieldLayout" for="' + id + '"><span class="css-mbx13-formFieldLayout__label">' + (o.visibleLabel ? esc(o.visibleLabel) : sr(o.label || '')) + '</span>' +
      '<span class="css-mbx14-textInput__facade">' + (o.before ? '<span class="css-mbx14-textInput__beforeElement">' + o.before + '</span>' : '') +
      '<input id="' + id + '"' + (o.testid ? ' data-testid="' + esc(o.testid) + '"' : '') + (o.role ? ' role="' + o.role + '"' : '') + (o.readonly ? ' readonly=""' : '') +
      ' placeholder="' + esc(o.placeholder || '') + '" type="text" autocomplete="off" class="css-mbx15-textInput" value="' + esc(o.value || '') + '"' + (o.attrs || '') + '>' +
      (o.after ? '<span class="css-mbx14-textInput__afterElement">' + o.after + '</span>' : '') + '</span></label>'
  }
  function flex(attrs, items, style) {
    return '<span class="css-mbx2-view--flex-flex"' + (attrs || '') + (style ? ' style="' + style + '"' : '') + '>' + items.map(function (it) {
      if (typeof it === 'string') it = {html: it}
      return '<span class="css-mbx3-view-flexItem"' + (it.attrs || '') + (it.style ? ' style="' + it.style + '"' : '') + '>' + it.html + '</span>'
    }).join('') + '</span>'
  }

  // ---------- state ----------
  var scope = 'inbox'
  var courseFilter = null // {id, name}
  var conversations = []
  var selected = null
  var deletedLocally = {}

  function fmtDate(iso) {
    // DateHelper.formatDateForDisplay -> date.formats.medium "%b %-d, %Y"
    var d = new Date(iso)
    return new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric'}).format(d)
  }
  function fmtDateTime(iso) {
    var d = new Date(iso)
    var date = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric'}).format(d)
    var time = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit'}).format(d).replace(' AM', 'am').replace(' PM', 'pm')
    return date + ' at ' + time
  }
  function participantString(c) {
    // utils.getConversationParticipantString: owner (author of the first message) first, then the rest
    var me = c.participants.filter(function (p) { return String(p.id) === String(CFG.userId) })[0]
    var other = c.participants.filter(function (p) { return String(p.id) !== String(CFG.userId) })
    var n = c.message_count || 1
    var lastByMe = (c.properties || []).indexOf('last_author') >= 0
    var oldestByOther = ((n - 1) % 2 === 0) ? !lastByMe : lastByMe
    var owner = oldestByOther && other[0] ? other[0] : me
    return [owner].concat(c.participants.filter(function (p) { return p !== owner })).map(function (p) { return p && p.name }).filter(Boolean).join(', ')
  }
  function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '...' : s }

  // ---------- toolbar (MessageListActionContainer) ----------
  function toolbarHtml() {
    var courseSelect = '<span data-testid="course-select">' + textInput({id: 'mock-course-select', label: 'Filter messages by course', placeholder: 'All Courses', value: courseFilter ? courseFilter.name : '', role: 'combobox', attrs: ' aria-expanded="false" aria-autocomplete="list" aria-haspopup="listbox"', after: courseFilter ? '<span>' + sr('Filtered by ' + courseFilter.name) + '<span class="css-mbx23-closeButton" style="position:static">' + button({testid: 'delete-course-button', icon: 'x', srLabel: 'Clear Course Selection', bare: true, small: true}) + '</span></span>' : ic('arrow-open-down') }) + '</span>'
    var labels = {inbox: 'Inbox', unread: 'Unread', starred: 'Starred', sent: 'Sent', archived: 'Archived', submission_comments: 'Submission Comments'}
    var mailbox = '<span data-testid="mailbox-select">' + textInput({id: 'mock-mailbox-select', label: 'Mailbox Selection', value: labels[scope], role: 'combobox', readonly: true, attrs: ' aria-expanded="false" aria-haspopup="listbox"', after: ic('arrow-open-down')}) + '</span>'
    var search = '<div class="css-mbx4-view--block">' + textInput({id: 'mock-address-book-input', label: 'Search', placeholder: 'Search...', role: 'combobox', testid: 'message-list-actions-address-book-input', attrs: ' aria-expanded="false" aria-label="Search" aria-autocomplete="list" aria-haspopup="listbox"', before: ic('search')}) + '</div>'
    var none = !selected
    var actions = flex('', [
      {attrs: ' style="flex-grow:1"', html: '<span class="css-mbx5-view--inlineBlock" style="padding:0 1.5rem 0 0">' + button({id: 'compose-new-message', testid: 'compose', label: 'Compose a new message', icon: 'compose', margin: '0 .375rem 0 0'}) + '</span>'},
      button({id: 'reply-to-message', testid: 'reply', label: 'Reply', icon: 'reply', disabled: none, margin: '0 .375rem 0 0'}) +
        button({id: 'reply-to-all', testid: 'reply-all', label: 'Reply all', icon: 'reply-all-2', disabled: none, margin: '0 .375rem 0 0'}) +
        button({id: 'archive-conversation', testid: scope === 'archived' ? 'unarchive' : 'archive', label: scope === 'archived' ? 'Unarchive' : 'Archive', icon: scope === 'archived' ? 'remove-from-collection' : 'collection-save', disabled: none || scope === 'sent', margin: '0 .375rem 0 0'}) +
        button({id: 'delete-conversation', testid: 'delete', label: 'Delete', icon: 'trash', disabled: none, margin: '0 .375rem 0 0'}) +
        button({testid: 'settings', label: 'More options', icon: 'more', disabled: none, extraAttrs: ' aria-haspopup="true"'}),
    ])
    return '<div class="css-mbx5-view--inlineBlock" data-testid="tool-bar" style="width:100%;margin:0;padding:.75rem;background:#F2F4F4;border-style:solid;border-color:#D7DADE;border-width:.0625rem 0 .0625rem 0">' +
      flex(' style="flex-wrap:wrap;align-items:center"', [
        {style: 'padding:.375rem', html: courseSelect},
        {style: 'padding:.375rem', html: mailbox},
        {style: 'padding:.375rem .75rem .375rem .375rem;flex-grow:1;flex-shrink:1', html: search},
        {style: 'padding:.375rem .375rem .375rem 1.5rem', html: actions},
      ]) + '</div>'
  }

  // ---------- conversation list (ConversationListContainer / ConversationListItem) ----------
  function itemHtml(c, isSel) {
    var subject = trunc(c.subject || '(No subject)', 40)
    var unread = c.workflow_state === 'unread'
    var count = c.message_count || 1
    var col30 = '<div class="css-mbx4-view--block" style="text-align:center;width:30px;height:30px;margin:0 .75rem 0 0">'
    return '<div class="css-mbx4-view--block" data-mock-conversation-id="' + c.id + '"><div style="' + (isSel ? 'background-color: rgb(229, 242, 248);' : '') + '">' +
      '<div class="css-mbx4-view--block" data-testid="conversation" style="padding:.75rem 1.5rem .75rem .5rem;border-bottom:.0625rem solid #D7DADE">' +
      '<div class="css-mbx27-grid" data-testid="conversationListItem-Item">' +
      '<div class="css-mbx27-grid__row"><span class="css-mbx27-grid__col auto">' + '<div class="css-mbx4-view--block" style="text-align:center;width:30px;height:30px;padding:.125rem;margin:0 .75rem 0 0;box-sizing:border-box"><div class="css-mbx24-checkbox" data-testid="conversationListItem-Checkbox"><input id="' + nid('Checkbox') + '" type="checkbox" class="css-mbx25-checkbox__input"' + (isSel ? ' checked' : '') + '><label class="css-mbx24-checkbox__control">' + sr('Message ' + subject + ' from ' + fmtDate(c.last_message_at) + (isSel ? ' selected' : ' not selected')) + '</label></div></div></span>' +
      '<span class="css-mbx27-grid__col"><span class="css-mbx7-text small brand">' + esc(fmtDate(c.last_message_at)) + '</span></span>' +
      '<span class="css-mbx27-grid__col auto"><span class="css-mbx28-badge" style="background:#6A7883">' + sr(count === 1 ? '1 message' : count + ' messages') + '<span aria-hidden="true">' + count + '</span></span></span></div>' +
      '<div class="css-mbx27-grid__row"><span class="css-mbx27-grid__col auto">' + col30 + button({testid: unread ? 'unread-badge' : 'read-badge', icon: 'empty', solid: unread, srLabel: subject + (unread ? ' Mark as Read' : ' Mark as Unread'), bare: true, small: true, extraAttrs: ' aria-pressed="' + (!unread) + '"', margin: '.375rem'}) + '</div></span>' +
      '<span class="css-mbx27-grid__col"><h2 class="css-mbx6-view-heading"><span class="css-mbx7-text small bold">' + esc(trunc(participantString(c), 40)) + '</span></h2></span></div>' +
      '<div class="css-mbx27-grid__row"><span class="css-mbx27-grid__col auto">' + col30 + '</div></span><span class="css-mbx27-grid__col"><h3 class="css-mbx6-view-heading" style="font-weight:400"><span class="css-mbx7-text small">' + esc(subject) + '</span></h3></span></div>' +
      '<div class="css-mbx27-grid__row"><span class="css-mbx27-grid__col auto">' + col30 + '</div></span><span class="css-mbx27-grid__col"><span class="css-mbx7-text small secondary" data-testid="last-message-content">' + esc(trunc(c.last_message, 40)) + '</span></span>' +
      '<span class="css-mbx27-grid__col auto"><div class="css-mbx4-view--block" style="text-align:center;width:30px;height:30px"><div>' + button({testid: c.starred ? 'visible-starred' : 'visible-not-starred', icon: c.starred ? 'star' : 'star-light', solid: c.starred, srLabel: subject + (c.starred ? ' starred' : ' not starred'), bare: true, small: true}) + '</div></div></span></div>' +
      '<div class="css-mbx27-grid__row" role="button"><span class="css-mbx27-grid__col"><span class="css-mbx1-screenReaderContent" tabindex="0" data-testid="open-conversation-for-' + c.id + '">Open Conversation ' + esc(subject) + '</span></span></div>' +
      '</div></div></div></div>'
  }
  function listHtml() {
    var items = conversations.map(function (c) { return itemHtml(c, selected && selected.id === c.id) }).join('')
    if (!conversations.length) {
      items = '<span class="css-mbx2-view--flex-flex" data-testid="conversation-list-no-messages" style="flex-direction:column;text-align:center;margin:2.25rem 0 0 0">' +
        '<span class="css-mbx3-view-flexItem" style="flex-grow:1;flex-shrink:1">' + (CFG.emptySvg ? '<img src="' + CFG.emptySvg + '" alt="No messages Panda" aria-hidden="true">' : '') + '</span>' +
        '<span class="css-mbx3-view-flexItem"><span class="css-mbx7-text small bold">No Conversations to Show</span></span></span>'
    }
    return '<span id="inbox-conversation-holder"><div class="css-mbx4-view--block" data-testid="list-items-desktop" style="height:100%;overflow:hidden auto">' +
      '<div class="css-mbx4-view--block" style="height:100%;overflow:hidden auto;border-style:solid;border-color:#D7DADE;border-width:0 .0625rem .0625rem .0625rem">' + items + '</div></div></span>'
  }

  // ---------- message detail (MessageDetailContainer) ----------
  function noSelectedHtml() {
    return '<div class="css-mbx4-view--block" style="padding:.75rem"><span class="css-mbx2-view--flex-flex" style="flex-direction:column;text-align:center">' +
      '<span class="css-mbx3-view-flexItem"><span style="font-size:5rem;color:#6A7883">' + ic('email') + '</span></span>' +
      '<span class="css-mbx3-view-flexItem"><span class="css-mbx7-text large secondary">No Conversations Selected</span></span></span></div>'
  }
  function detailHtml(d) {
    var subject = d.subject || '(No subject)'
    var people = {}
    ;(d.participants || []).forEach(function (p) { people[p.id] = p })
    var header = flex(' style="padding:.75rem"', [
      {attrs: ' style="flex-grow:1;flex-shrink:1"', html: '<h2 class="css-mbx6-view-heading"><span class="css-mbx7-text bold large" data-testid="message-detail-header-desktop">' + esc(subject) + '</span></h2>'},
      button({label: 'Return to ' + subject + ' in Conversation List', srLabel: 'Return to ' + subject + ' in Conversation List', icon: 'arrow-start', bare: true, margin: '0 .375rem 0 0'}),
      button({testid: 'message-detail-header-reply-btn', srLabel: 'Reply for ' + subject, icon: 'reply', bare: true, margin: '0 .375rem 0 0'}),
      button({testid: 'message-detail-header-more-options', srLabel: 'More options for ' + subject, icon: 'more', bare: true, margin: '0 .375rem 0 0'}),
    ])
    var items = (d.messages || []).map(function (m) {
      var a = people[m.author_id] || {name: 'Unknown User'}
      var recips = (m.participating_user_ids || []).filter(function (id) { return String(id) !== String(m.author_id) }).map(function (id) { return (people[id] || {}).name }).filter(Boolean)
      return '<div class="css-mbx4-view--block" style="padding:.75rem;border-bottom:.0625rem solid #D7DADE">' +
        flex(' data-testid="message-detail-item-desktop" style="align-items:flex-start"', [
          '<span class="css-mbx32-avatar" style="margin:.75rem .75rem .75rem 0" aria-label="' + esc(a.name) + '" role="img"><img src="' + esc(a.avatar_url || '/images/messages/avatar-50.png') + '" alt=""></span>',
          {attrs: ' style="flex-grow:1;flex-shrink:1"', html: '<span class="css-mbx2-view--flex-flex" style="flex-direction:column">' +
            '<span class="css-mbx3-view-flexItem"><span class="css-mbx7-text"><span class="css-mbx7-text bold">' + esc(a.name) + '</span>' + (recips.length ? ', ' + esc(recips.join(', ')) : '') + '</span></span>' +
            '<span class="css-mbx3-view-flexItem"><span class="css-mbx7-text x-small">' + esc(d.context_name || '') + '</span></span>' +
            '<span class="css-mbx3-view-flexItem"><span class="css-mbx7-text x-small">' + esc(fmtDateTime(m.created_at)) + '</span></span></span>'},
          {attrs: ' style="text-align:end"', html: button({testid: 'message-reply', srLabel: 'Reply', icon: 'reply', bare: true, small: true}) + button({testid: 'message-more-options', srLabel: 'More options for message from ' + a.name, icon: 'more', bare: true, small: true})},
        ]) +
        '<span class="css-mbx7-text" style="white-space:pre-wrap;word-break:break-word">' + esc(m.body) + '</span></div>'
    }).join('')
    return header + '<div class="css-mbx4-view--block" style="height:100%;overflow:hidden auto;display:inline">' + items + '</div>'
  }

  // ---------- page ----------
  var root
  function renderAll() {
    root.innerHTML = '<h1 class="css-mbx6-view-heading">' + sr('Inbox') + '</h1>' +
      '<div class="css-mbx2-view--flex-flex" style="height:100vh;flex-direction:column">' +
      '<span class="css-mbx3-view-flexItem" data-testid="desktop-message-action-header">' + toolbarHtml() + '</span>' +
      '<span class="css-mbx3-view-flexItem" style="flex-grow:1;flex-shrink:1;min-height:0">' +
      '<div class="css-mbx2-view--flex-flex" style="height:100%;align-items:center;justify-content:center">' +
      '<span class="css-mbx3-view-flexItem" id="mock-inbox-list" style="width:' + (conversations.length ? '400px' : '100%') + ';height:100%">' + listHtml() + '</span>' +
      '<span class="css-mbx3-view-flexItem" id="mock-inbox-detail" style="flex-grow:1;flex-shrink:1;height:100%;overflow-y:auto">' + (selected && selected.detail ? detailHtml(selected.detail) : noSelectedHtml()) + '</span>' +
      '</div></span></div>'
    if (!conversations.length) document.getElementById('mock-inbox-detail').style.display = 'none'
  }

  function load() {
    var q = 'scope=' + encodeURIComponent(scope) + '&include[]=participant_avatars&per_page=50'
    if (courseFilter) q += '&filter[]=course_' + courseFilter.id
    return api('/api/v1/conversations?' + q).then(function (list) {
      conversations = (list || []).filter(function (c) {
        if (deletedLocally[c.id]) return false
        if (courseFilter && c.context_code !== 'course_' + courseFilter.id) return false
        if (scope === 'inbox' && c.workflow_state === 'archived') return false
        return true
      })
      if (selected && !conversations.some(function (c) { return c.id === selected.id })) selected = null
      renderAll()
    })
  }

  function select(id) {
    var c = conversations.filter(function (x) { return String(x.id) === String(id) })[0]
    if (!c) return
    selected = {id: c.id, detail: null}
    renderAll()
    return api('/api/v1/conversations/' + c.id).then(function (d) {
      if (!selected || selected.id !== c.id) return
      selected.detail = d
      c.workflow_state = d.workflow_state === 'unread' ? 'read' : d.workflow_state
      renderAll()
      refreshBadge()
    })
  }
  function refreshBadge() {
    api('/api/v1/conversations/unread_count').then(function (j) {
      var n = parseInt(j && j.unread_count, 10) || 0
      var badge = document.querySelector('#global_nav_conversations_link .menu-item__badge')
      if (badge) badge.innerHTML = n ? '<span class="css-1sr5vj2-screenReaderContent">' + n + ' unread messages</span><span aria-hidden="true">' + n + '</span>' : ''
    })
  }
  function setState(c, body) {
    return api('/api/v1/conversations/' + c.id, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({conversation: body})})
  }

  // ---------- popover menus (Select options / Menu) ----------
  function closePopovers() { document.querySelectorAll('[data-mock-inbox-popover]').forEach(function (p) { p.remove() }) }
  function openPopover(anchor, html, onPick) {
    closePopovers()
    var pop = frag('<span dir="ltr" data-mock-inbox-popover="1" class="css-mbx34-popover">' + html + '</span>')
    document.body.appendChild(pop)
    var r = anchor.getBoundingClientRect()
    pop.style.top = (r.bottom + window.scrollY + 4) + 'px'
    pop.style.left = (r.left + window.scrollX) + 'px'
    pop.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-value]')
      if (!opt) return
      closePopovers()
      onPick(opt.getAttribute('data-value'), opt)
    })
  }

  // ---------- compose modal (ComposeModalContainer) ----------
  var recipients = []
  function composeHtml(opts) {
    opts = opts || {}
    var isReply = !!opts.reply
    var courseField
    if (isReply) courseField = '<span class="css-mbx7-text">' + esc(opts.reply.context_name || '') + '</span>'
    else courseField = '<span data-testid="course-select-modal">' + textInput({id: 'mock-compose-course', label: 'Select course', placeholder: 'Select Course', value: courseFilter ? courseFilter.name : '', role: 'combobox', attrs: ' aria-expanded="false" aria-autocomplete="list" aria-haspopup="listbox"', after: ic('arrow-open-down')}) + '</span>'
    function wrap(title, input, grow) {
      return '<span class="css-mbx2-view--flex-flex" style="width:100%;flex-direction:column">' + (title ? '<span class="css-mbx3-view-flexItem" style="padding:0 0 0 .375rem"><span class="css-mbx7-text bold">' + title + '</span></span>' : '') +
        '<span class="css-mbx3-view-flexItem" style="flex-grow:1;flex-shrink:1;padding:.375rem">' + input + '</span></span>'
    }
    var header = '<span class="css-mbx2-view--flex-flex" style="flex-direction:column;width:100%;height:100%;padding:.75rem;box-sizing:border-box">' +
      '<span class="css-mbx3-view-flexItem">' + wrap('<span>Course</span>', courseField) + '</span>' +
      (isReply ? '' : '<span class="css-mbx3-view-flexItem" style="padding:0 0 .75rem 0">' + wrap('', '<div class="css-mbx24-checkbox" data-testid="individual-message-checkbox"><input type="checkbox" id="mock-individual-message" class="css-mbx25-checkbox__input" value=""><label for="mock-individual-message" class="css-mbx24-checkbox__control"><span class="css-mbx26-checkboxFacade__label">Send an individual message to each recipient</span></label></div>') + '</span>') +
      ((!isReply || !opts.reply.private) ? '<span class="css-mbx3-view-flexItem">' + wrap('<span id="address-book-form">To</span><span class="css-mbx7-text"> *</span>',
        '<div class="css-mbx4-view--block" style="width:100%"><div><span class="css-mbx2-view--flex-flex" style="align-items:flex-start"><span class="css-mbx3-view-flexItem" style="flex-grow:1;flex-shrink:1;padding:0 .125rem 0 0">' +
        textInput({id: 'mock-compose-to', label: 'To', placeholder: recipients.length ? '' : 'Insert or Select Names', role: 'combobox', testid: 'compose-modal-header-address-book-input', attrs: ' aria-expanded="false" aria-label="To" aria-autocomplete="list" aria-haspopup="listbox"', before: recipients.map(function (r) { return '<span class="css-mbx33-tag" data-testid="address-book-tag">' + esc(r.name) + '</span>' }).join('')}) +
        '</span><span class="css-mbx3-view-flexItem">' + button({testid: 'address-button', srLabel: 'Open Address Book', icon: 'more', label: 'Open Address Book'}) + '</span></span></div></div>') + '</span>' : '') +
      (isReply ? wrap('<span>Subject</span>', '<span class="css-mbx7-text">' + esc(opts.reply.subject) + '</span>')
        : wrap('<span>Subject</span>', textInput({id: 'mock-compose-subject', label: 'Subject', placeholder: 'Insert Subject', testid: 'subject-input'}))) +
      '</span>'
    var body = '<div class="css-mbx21-modalBody" tabindex="-1" style="padding:0"><span class="css-mbx2-view--flex-flex" style="flex-direction:column;width:100%;height:100%">' + header +
      '<div class="css-mbx4-view--block" style="border-top:.0625rem solid #D7DADE;padding:.375rem">' + wrap('<span>Message</span><span class="css-mbx7-text"> *</span>',
        '<label class="css-mbx12-formFieldLayout" for="mock-compose-body"><span class="css-mbx13-formFieldLayout__label">' + sr('Message Body') + '</span><span class="css-mbx12-formFieldLayout__children"><div class="css-mbx16-textArea__layout"><textarea id="mock-compose-body" data-testid="message-body" class="css-mbx16-textArea" style="height:200px;max-height:200px"></textarea></div></span></label>') + '</div>' +
      '<span class="css-mbx2-view--flex-flex" style="align-items:flex-start;border-top:.0625rem solid #D7DADE;padding:.75rem"><span class="css-mbx3-view-flexItem" style="flex-shrink:1"></span></span>' +
      '</span></div>'
    var footer = '<div class="css-mbx22-modalFooter">' + flex(' style="justify-content:space-between;width:100%"', [
      button({id: 'upload-attachment-button', testid: 'attachment-upload', srLabel: 'Add an attachment', icon: 'paperclip', margin: '.1875rem'}) +
        '<input data-testid="attachment-input" type="file" style="display: none;" aria-hidden="true" multiple="">' +
        button({id: 'media-upload-button', testid: 'media-upload', srLabel: 'Record an audio or video comment', icon: 'attach-media', margin: '.1875rem'}),
      button({testid: 'cancel-button', text: 'Cancel', margin: '.1875rem'}) + button({id: 'send-message-button', testid: 'send-button', text: 'Send', primary: true, margin: '.1875rem'}),
    ]) + '</div>'
    return '<span dir="ltr"><div class="css-mbx17-mask" aria-hidden="false"><span role="dialog" aria-label="Compose Message" class="css-mbx18-modal" id="compose-message-modal" data-testid="compose-modal-desktop">' +
      '<div class="css-mbx19-modal__constrainContext">' +
      '<div class="css-mbx20-modalHeader"><span class="css-mbx23-closeButton">' + button({srLabel: 'Close', icon: 'x', bare: true, small: true}) + '</span><h2 class="css-mbx6-view-heading">Compose Message</h2></div>' +
      body + footer + '</div></span></div></span>'
  }
  var modalEl = null
  function openCompose(opts) {
    closeCompose()
    recipients = []
    if (opts && opts.reply) {
      var me = String(CFG.userId)
      recipients = (opts.reply.participants || []).filter(function (p) { return String(p.id) !== me }).map(function (p) { return {id: String(p.id), name: p.name} })
    }
    modalEl = frag(composeHtml(opts))
    modalEl._opts = opts || {}
    document.body.appendChild(modalEl)
    var first = modalEl.querySelector('input:not([type=hidden]):not([type=file]), textarea')
    if (first) first.focus()
  }
  function closeCompose() { if (modalEl) { modalEl.remove(); modalEl = null }; closePopovers() }
  function rerenderCompose() {
    var opts = modalEl._opts
    var subj = modalEl.querySelector('#mock-compose-subject'), bodyEl = modalEl.querySelector('#mock-compose-body')
    var keep = {subject: subj ? subj.value : '', body: bodyEl ? bodyEl.value : ''}
    var fresh = frag(composeHtml(opts))
    fresh._opts = opts
    modalEl.replaceWith(fresh)
    modalEl = fresh
    if (subj) modalEl.querySelector('#mock-compose-subject').value = keep.subject
    modalEl.querySelector('#mock-compose-body').value = keep.body
  }
  function send() {
    var bodyEl = modalEl.querySelector('#mock-compose-body')
    var opts = modalEl._opts
    if (!bodyEl.value.trim()) {
      var area = bodyEl.closest('.css-mbx16-textArea__layout')
      if (!modalEl.querySelector('[data-mock-error=body]')) area.insertAdjacentHTML('afterend', '<span data-mock-error="body" class="css-mbx7-text small" style="color:#E0061F">Please insert a message body.</span>')
      return
    }
    if (!opts.reply && !recipients.length) {
      var to = modalEl.querySelector('#mock-compose-to')
      if (to && !modalEl.querySelector('[data-mock-error=to]')) to.closest('.css-mbx14-textInput__facade').insertAdjacentHTML('afterend', '<span data-mock-error="to" class="css-mbx7-text small" style="color:#E0061F">Please select a recipient.</span>')
      return
    }
    var subj = modalEl.querySelector('#mock-compose-subject')
    var payload = {recipients: recipients.map(function (r) { return r.id }), subject: subj ? subj.value : (opts.reply && opts.reply.subject) || '', body: bodyEl.value, group_conversation: true, bulk_message: false}
    var ctx = modalEl.querySelector('#mock-compose-course')
    if (ctx && ctx.getAttribute('data-context')) payload.context_code = ctx.getAttribute('data-context')
    api('/api/v1/conversations', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}).then(function () {
      closeCompose()
      var holder = document.getElementById('flash_message_holder')
      if (holder) {
        holder.innerHTML = '<div class="ic-flash-success flash-message-container" role="alert"><div class="ic-flash__icon" aria-hidden="true"><i class="icon-check"></i></div>Message sent!<button type="button" class="Button Button--icon-action close_link" aria-label="Close"><i class="icon-x" aria-hidden="true"></i></button></div>'
        setTimeout(function () { holder.innerHTML = '' }, 4000)
      }
    })
  }
  function courseOptionsHtml(selectedId) {
    return '<ul role="listbox" class="css-mbx29-options"><li role="none"><span class="css-mbx31-optionsGroup__label" role="presentation">Favorite Courses</span><ul role="group" class="css-mbx29-options" style="border:0;box-shadow:none;padding:0">' +
      CFG.favoriteCourses.map(function (c) { return '<li role="option" aria-selected="' + (selectedId === c.id) + '" class="css-mbx30-optionItem" data-value="' + c.id + '">' + esc(c.name) + '</li>' }).join('') + '</ul></li></ul>'
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target
    if (!t.closest) return
    // compose modal
    if (modalEl && modalEl.contains(t)) {
      if (t.closest('[data-testid=cancel-button]') || t.closest('.css-mbx23-closeButton button')) return closeCompose()
      if (t.closest('#send-message-button')) return send()
      if (t.closest('#mock-compose-course')) {
        var inp = modalEl.querySelector('#mock-compose-course')
        return openPopover(inp.closest('.css-mbx14-textInput__facade'), courseOptionsHtml(null), function (v, opt) { inp.value = opt.textContent; inp.setAttribute('data-context', 'course_' + v) })
      }
      if (t.closest('#mock-compose-to') || t.closest('[data-testid=address-button]')) {
        var toInp = modalEl.querySelector('#mock-compose-to')
        return api('/api/v1/search/recipients?per_page=20&synthetic_contexts=true').then(function (list) {
          var people = (list || []).filter(function (x) { return x.type !== 'context' })
          openPopover(toInp.closest('.css-mbx14-textInput__facade'), '<ul role="listbox" class="css-mbx35-menu" data-testid="address-book-popover">' + people.map(function (p) {
            return '<li role="option" class="css-mbx36-menuItem" data-value="' + esc(p.id) + '" data-name="' + esc(p.name) + '">' + esc(p.name) + '</li>'
          }).join('') + '</ul>', function (v, opt) {
            if (!recipients.some(function (r) { return r.id === v })) recipients.push({id: v, name: opt.getAttribute('data-name')})
            rerenderCompose()
          })
        })
      }
      return
    }
    if (t.closest('[data-mock-inbox-popover]')) return
    closePopovers()
    if (!root || !root.contains(t)) return
    if (t.closest('#compose-new-message')) return openCompose()
    if (t.closest('#reply-to-message, #reply-to-all, [data-testid=message-detail-header-reply-btn], [data-testid=message-reply]')) {
      if (selected && selected.detail) openCompose({reply: selected.detail})
      return
    }
    if (t.closest('#archive-conversation') && selected) {
      var c0 = conversations.filter(function (x) { return x.id === selected.id })[0]
      return setState(c0, {workflow_state: scope === 'archived' ? 'read' : 'archived'}).then(function () { selected = null; load() })
    }
    if (t.closest('#delete-conversation') && selected) {
      if (!window.confirm('Are you sure you want to delete your copy of this conversation? This action cannot be undone.')) return
      var delId = selected.id
      return api('/api/v1/conversations/' + delId, {method: 'DELETE'}).then(function () { deletedLocally[delId] = true; selected = null; load(); refreshBadge() })
    }
    if (t.closest('#mock-mailbox-select')) {
      var mb = t.closest('.css-mbx14-textInput__facade')
      var opts = [['inbox', 'Inbox'], ['unread', 'Unread'], ['starred', 'Starred'], ['sent', 'Sent'], ['archived', 'Archived'], ['submission_comments', 'Submission Comments']]
      return openPopover(mb, '<ul role="listbox" class="css-mbx29-options">' + opts.map(function (o) { return '<li role="option" id="' + o[0] + '" aria-selected="' + (o[0] === scope) + '" class="css-mbx30-optionItem" data-value="' + o[0] + '">' + o[1] + '</li>' }).join('') + '</ul>', function (v) {
        scope = v; selected = null; location.hash = 'filter=type=' + v + (courseFilter ? '&course=course_' + courseFilter.id : ''); load()
      })
    }
    if (t.closest('[data-testid=delete-course-button]')) { courseFilter = null; selected = null; return load() }
    if (t.closest('#mock-course-select')) {
      var cs = t.closest('.css-mbx14-textInput__facade')
      return openPopover(cs, courseOptionsHtml(courseFilter && courseFilter.id), function (v, opt) { courseFilter = {id: v, name: opt.textContent}; selected = null; load() })
    }
    var star = t.closest('[data-testid=visible-starred], [data-testid=visible-not-starred]')
    var row = t.closest('[data-mock-conversation-id]')
    if (star && row) {
      e.stopPropagation()
      var cs1 = conversations.filter(function (x) { return String(x.id) === row.getAttribute('data-mock-conversation-id') })[0]
      cs1.starred = !cs1.starred
      renderAll()
      return setState(cs1, {starred: cs1.starred})
    }
    var rb = t.closest('[data-testid=unread-badge], [data-testid=read-badge]')
    if (rb && row) {
      var cs2 = conversations.filter(function (x) { return String(x.id) === row.getAttribute('data-mock-conversation-id') })[0]
      cs2.workflow_state = cs2.workflow_state === 'unread' ? 'read' : 'unread'
      renderAll()
      return setState(cs2, {workflow_state: cs2.workflow_state}).then(refreshBadge)
    }
    if (row) return select(row.getAttribute('data-mock-conversation-id'))
    if (t.closest('[aria-label^="Return to "]')) { selected = null; return renderAll() }
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (document.querySelector('[data-mock-inbox-popover]')) closePopovers(); else if (modalEl) closeCompose() }
  })

  later(function () {
    var style = document.createElement('style')
    style.setAttribute('data-emotion', 'css')
    style.textContent = CSS
    document.head.appendChild(style)
    // legacyRender(<CanvasInboxApp/>, #content)
    content.innerHTML = ''
    root = content
    var h = new URLSearchParams(location.hash.slice(1))
    var m = (h.get('filter') || '').match(/type=(\w+)/)
    if (m) scope = m[1]
    renderAll()
    return load()
  })
})()
