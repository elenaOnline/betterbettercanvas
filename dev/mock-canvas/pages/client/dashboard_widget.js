// mock-canvas: client-side render of Canvas's new student "widget dashboard" into #content, late
// (after window.__mockLater), the way ui/features/widget_dashboard/index.tsx mounts its React app.
// Structure follows @instructure/platform-widget-dashboard 15.x (the package canvas-lms renders
// the dashboard from; it matches the test ids captured live on canvas.example.edu 2026-10-19, see
// design/captures/2026-10-19-new-dashboard-dom.md) plus canvas-lms 1c9f0bb8013e
// ui/features/widget_dashboard (CoursesTab.tsx, index.tsx) and ui/shared/dashboard-card.
// InstUI 11 DOM is emulated: View/Flex/Text/... wrappers, passthrough attributes (direction, wrap,
// size, color...), data-cid, and emotion-style hashed classes css-<hash>-<label> whose rules are
// inserted with CSSOM into an (empty-looking) <style data-emotion="css"> like production emotion.
(function () {
  var CFG = window.__mockWidgetDashboard
  var later = window.__mockLater
  var ENV = window.ENV
  var NOW = new Date(document.querySelector('meta[name=mock-canvas]').content.match(/now=([^;]+)/)[1])
  var TZ = ENV.TIMEZONE || 'America/Los_Angeles'
  var PREFS = ENV.PREFERENCES || {}
  var FEATURES = ENV.DASHBOARD_FEATURES || {}

  // ---------------------------------------------------------------- emotion emulation
  function murmur2(str) {
    var h = 0, k, i = 0, len = str.length
    for (; len >= 4; ++i, len -= 4) {
      k = (str.charCodeAt(i) & 0xff) | ((str.charCodeAt(++i) & 0xff) << 8) | ((str.charCodeAt(++i) & 0xff) << 16) | ((str.charCodeAt(++i) & 0xff) << 24)
      k = (k & 0xffff) * 0x5bd1e995 + (((k >>> 16) * 0xe995) << 16)
      k ^= k >>> 24
      h = ((k & 0xffff) * 0x5bd1e995 + (((k >>> 16) * 0xe995) << 16)) ^ ((h & 0xffff) * 0x5bd1e995 + (((h >>> 16) * 0xe995) << 16))
    }
    switch (len) {
      case 3: h ^= (str.charCodeAt(i + 2) & 0xff) << 16 // falls through
      case 2: h ^= (str.charCodeAt(i + 1) & 0xff) << 8 // falls through
      case 1: h ^= str.charCodeAt(i) & 0xff; h = (h & 0xffff) * 0x5bd1e995 + (((h >>> 16) * 0xe995) << 16)
    }
    h ^= h >>> 13
    h = (h & 0xffff) * 0x5bd1e995 + (((h >>> 16) * 0xe995) << 16)
    return ((h ^ (h >>> 15)) >>> 0).toString(36)
  }
  var sheetEl = document.createElement('style')
  sheetEl.setAttribute('data-emotion', 'css')
  sheetEl.setAttribute('data-s', '')
  document.head.appendChild(sheetEl)
  var inserted = {}
  function kebab(p) { return p.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase() }) }
  function ser(d) {
    var s = ''
    for (var k in d) if (d[k] != null && d[k] !== '') s += kebab(k) + ':' + d[k] + ';'
    return s
  }
  // cls('view-flexItem', {..declarations..}, {':hover': {...}, ' svg': {...}}) -> 'css-1abc2de-view-flexItem'
  function cls(label, decl, nested) {
    var body = ser(decl || {})
    var nest = ''
    if (nested) for (var sel in nested) nest += sel + '{' + ser(nested[sel]) + '}'
    var name = 'css-' + murmur2(body + nest + label) + (label ? '-' + label : '')
    if (!inserted[name]) {
      inserted[name] = true
      try { sheetEl.sheet.insertRule('.' + name + '{' + body + '}', sheetEl.sheet.cssRules.length) } catch (e) { /* ignore */ }
      if (nested) for (var s2 in nested) {
        try { sheetEl.sheet.insertRule('.' + name + s2 + '{' + ser(nested[s2]) + '}', sheetEl.sheet.cssRules.length) } catch (e) { /* ignore */ }
      }
    }
    return name
  }
  function globalRule(text) { try { sheetEl.sheet.insertRule(text, sheetEl.sheet.cssRules.length) } catch (e) { /* ignore */ } }
  globalRule('@keyframes mock-instui-rotate{to{transform:rotate(360deg)}}')
  globalRule('@keyframes mock-instui-morph{0%{stroke-dashoffset:190%}50%{stroke-dashoffset:50%;transform:rotate(90deg)}100%{stroke-dashoffset:190%;transform:rotate(360deg)}}')
  globalRule('.transition--fade-entered,.transition--fade-entering{opacity:1}')

  // ---------------------------------------------------------------- theme tokens (InstUI canvas + the school's brand)
  // Like production, link and brand come from the account's brand config.
  var BV = (window.ENV && ENV.active_brand_config && ENV.active_brand_config.variables) || {}
  var T = {
    font: 'LatoWeb, Lato, "Helvetica Neue", Helvetica, Arial, sans-serif',
    text: '#273540', text2: '#6A7883', link: BV['ic-link-color'] || '#005F85', brand: BV['ic-brand-primary'] || '#213921',
    bg: '#FFFFFF', bg2: '#F2F4F4', border: '#D7DADE', danger: '#E62429', success: '#03893D', warning: '#CF4A00', info: '#2B7ABC',
  }
  var SP = {none: '0', '0': '0', auto: 'auto', 'xxx-small': '0.125rem', 'xx-small': '0.375rem', 'x-small': '0.5rem', small: '0.75rem', 'medium-small': '1rem', medium: '1.5rem', large: '2.25rem', 'x-large': '3rem', 'xx-large': '3.75rem'}
  function spc(v) { return v == null ? null : String(v).split(' ').map(function (x) { return SP[x] != null ? SP[x] : x }).join(' ') }
  var RAD = {none: '0', small: '0.125rem', medium: '0.25rem', large: '0.5rem', circle: '100%', pill: '999em'}
  function rad(v) { return v == null ? null : String(v).split(' ').map(function (x) { return RAD[x] != null ? RAD[x] : x }).join(' ') }
  var BW = {none: '0', '0': '0', small: '0.0625rem', medium: '0.125rem', large: '0.25rem'}
  function bw(v) { return v == null ? null : String(v).split(' ').map(function (x) { return BW[x] != null ? BW[x] : x }).join(' ') }
  var SHADOW = {
    resting: '0 0.0625rem 0.125rem rgba(0, 0, 0, 0.2), 0 0.0625rem 0.1875rem rgba(0, 0, 0, 0.1)',
    above: '0 0.1875rem 0.375rem rgba(0, 0, 0, 0.1), 0 0.1875rem 0.375rem rgba(0, 0, 0, 0.15)',
    topmost: '0 0.375rem 0.4375rem rgba(0, 0, 0, 0.1), 0 0.625rem 1.75rem rgba(0, 0, 0, 0.25)',
  }
  var FS = {'x-small': '0.75rem', small: '0.875rem', medium: '1rem', large: '1.375rem', 'x-large': '1.75rem', 'xx-large': '2.375rem'}
  var TEXT_COLOR = {primary: T.text, secondary: T.text2, 'primary-inverse': '#FFFFFF', 'secondary-inverse': '#F2F4F4', danger: T.danger, success: T.success, warning: T.warning, brand: T.info}

  // ---------------------------------------------------------------- DOM helper
  function h(tag, attrs, kids) {
    var el = document.createElement(tag)
    attrs = attrs || {}
    for (var k in attrs) {
      var v = attrs[k]
      if (v == null || v === false) continue
      if (k === 'style') { if (typeof v === 'string') el.setAttribute('style', v); else for (var s in v) el.style[s] = v[s] }
      else if (k === 'text') el.textContent = v
      else if (k === 'html') el.innerHTML = v
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : v)
    }
    append(el, kids)
    return el
  }
  function append(el, kids) {
    if (kids == null) return
    if (!Array.isArray(kids)) kids = [kids]
    kids.forEach(function (c) {
      if (c == null || c === false) return
      if (Array.isArray(c)) append(el, c)
      else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c)
    })
  }
  var uidN = 0
  function uid(prefix) { uidN += 1; return prefix + '_' + uidN }

  // ---------------------------------------------------------------- InstUI component emulation
  // View: {as, display, background, bgColor, color, padding, margin, borderRadius, borderWidth, borderColor,
  //        shadow, textAlign, width, height, minHeight, maxWidth, position, overflowX, overflowY, cursor,
  //        label (component label appended), css (component declarations), nested, attrs, className}
  function View(p, kids) {
    p = p || {}
    var d = {boxSizing: 'border-box', fontFamily: T.font, maxWidth: p.maxWidth || '100%', overflow: 'visible'}
    var lbl = 'view'
    if (p.display && p.display !== 'auto') {
      lbl = 'view--' + ({'inline-block': 'inlineBlock', 'inline-flex': 'inlineFlex'}[p.display] || p.display)
      d.display = p.display
      if (/^inline-/.test(p.display)) d.verticalAlign = 'middle'
    }
    if (p.background === 'primary') d.background = p.bgColor || T.bg
    else if (p.background === 'secondary') d.background = p.bgColor || T.bg2
    else if (p.background === 'transparent') d.background = 'transparent'
    if (p.background && p.background !== 'transparent') d.color = p.color || T.text
    if (p.shadow) d.boxShadow = SHADOW[p.shadow]
    if (p.textAlign) d.textAlign = p.textAlign
    if (p.position && p.position !== 'static') d.position = p.position
    if (p.overflowX && p.overflowX !== 'visible') d.overflowX = p.overflowX
    if (p.overflowY && p.overflowY !== 'visible') d.overflowY = p.overflowY
    d.overscrollBehavior = 'auto'
    if (p.borderWidth) { d.borderWidth = bw(p.borderWidth); d.borderStyle = 'solid'; d.borderColor = p.borderColor === 'primary' || !p.borderColor ? T.border : p.borderColor }
    if (p.borderRadius) d.borderRadius = rad(p.borderRadius)
    if (p.margin) d.margin = spc(p.margin)
    if (p.padding) d.padding = spc(p.padding)
    if (p.width) d.width = p.width
    if (p.height) d.height = p.height
    if (p.minHeight) d.minHeight = p.minHeight
    if (p.minWidth) d.minWidth = p.minWidth
    if (p.cursor) d.cursor = p.cursor
    if (p.css) for (var k in p.css) d[k] = p.css[k]
    var c = cls(lbl + (p.label ? '-' + p.label : ''), d, p.nested)
    var attrs = Object.assign({}, p.attrs || {})
    attrs['class'] = (p.className ? p.className + ' ' : '') + c
    return h(p.as || 'span', attrs, kids)
  }

  // Flex.Item spec; materialized by Flex() which passes its direction down (Flex.renderChildren)
  function Item(p, kids) { return {__item: true, p: p || {}, kids: kids} }
  function renderItem(spec, direction) {
    var p = spec.p
    return View({
      as: p.as || 'span', label: 'flexItem', width: p.width, margin: p.margin, padding: p.padding, textAlign: p.textAlign,
      overflowX: p.overflowX, overflowY: p.overflowY || (direction === 'column' ? 'auto' : 'visible'),
      minHeight: direction === 'column' ? p.size : null, minWidth: direction === 'row' ? p.size : null,
      css: {minWidth: '0.0625rem', flexShrink: p.shouldShrink ? 1 : 0, flexGrow: p.shouldGrow ? 1 : 0, flexBasis: p.size || 'auto'},
      attrs: p.attrs,
    }, spec.kids)
  }
  var JUSTIFY = {start: 'flex-start', end: 'flex-end', center: 'center', 'space-around': 'space-around', 'space-between': 'space-between'}
  var ALIGN = {center: 'center', start: 'flex-start', end: 'flex-end', stretch: 'stretch'}
  function Flex(p, kids) {
    p = p || {}
    var dir = p.direction || 'row'
    var wrap = p.wrap || 'no-wrap'
    var align = p.alignItems || (dir === 'column' ? 'stretch' : 'center')
    var flat = []
    ;(function walk(k) { (Array.isArray(k) ? k : [k]).forEach(function (c) { if (Array.isArray(c)) walk(c); else if (c != null && c !== false) flat.push(c) }) })(kids)
    if (!flat.length) return null
    var attrs = Object.assign({direction: dir, wrap: wrap}, p.attrs || {})
    return View({
      as: p.as || 'span', display: p.display || 'flex', label: 'flex', width: p.width, height: p.height, margin: p.margin, padding: p.padding, textAlign: p.textAlign,
      css: {fontFamily: T.font, boxSizing: 'border-box', alignItems: ALIGN[align], justifyContent: JUSTIFY[p.justifyItems || 'start'], flexWrap: wrap === 'no-wrap' ? null : wrap, flexDirection: dir, gap: p.gap && p.gap !== 'none' ? spc(p.gap) : null},
      attrs: attrs,
    }, flat.map(function (c) { return c.__item ? renderItem(c, dir.replace('-reverse', '')) : c }))
  }

  // Text: {as, size, color, colorValue, weight, wrap, lineHeight, attrs}
  function Text(p, kids) {
    p = p || {}
    var size = p.size || 'medium'
    var d = {fontFamily: T.font, fontWeight: p.weight === 'bold' ? 700 : p.weight === 'light' ? 300 : 400, fontStyle: 'normal', fontSize: FS[size], lineHeight: {fit: 1.125, condensed: 1.25, double: 2}[p.lineHeight] || 1.5, color: p.colorValue || TEXT_COLOR[p.color] || 'inherit', letterSpacing: 0, textTransform: 'none'}
    if (p.wrap === 'break-word') { d.overflowWrap = 'break-word'; d.wordBreak = 'break-word'; d.hyphens = 'auto' }
    var attrs = Object.assign({size: size}, p.color ? {color: p.color} : {}, {wrap: p.wrap || 'normal', 'letter-spacing': 'normal'}, p.attrs || {})
    attrs['class'] = cls('text', d)
    return h(p.as || 'span', attrs, kids)
  }

  function ScreenReader(text) {
    return h('span', {'class': cls('screenReaderContent', {width: '0.0625rem', height: '0.0625rem', margin: '-0.0625rem', padding: 0, position: 'absolute', overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0})}, text)
  }

  // Heading: {level, variant, id, testid, margin, color}
  function Heading(p, kids) {
    var size, weight
    if (p.variant === 'titleCardSection') { size = '1.75rem'; weight = 700 }
    else if (p.level === 'h1') { size = '2.375rem'; weight = 700 }
    else if (p.level === 'h2') { size = '1.75rem'; weight = 400 }
    else { size = '1.375rem'; weight = 400 }
    return View({as: p.level || 'h2', label: 'heading', margin: p.margin, css: {lineHeight: 1.25, margin: spc(p.margin || '0'), fontFamily: T.font, fontSize: size, fontWeight: weight, color: p.color === 'primary-inverse' ? '#FFFFFF' : 'inherit'},
      attrs: Object.assign({id: p.id, 'data-testid': p.testid, 'data-cid': 'Heading'}, p.attrs || {})}, kids)
  }

  // Link: {href, testid, ariaLabel, onClick, attrs}
  function Link(p, kids) {
    var attrs = Object.assign({href: p.href, 'aria-label': p.ariaLabel, 'data-testid': p.testid, 'data-cid': 'Link'}, p.attrs || {})
    if (p.onClick) attrs.role = 'button'
    var el = View({as: 'a', label: 'link', css: {fontFamily: T.font, color: T.link, cursor: 'pointer', textDecoration: 'none', outlineColor: 'transparent', outlineWidth: '0.125rem', outlineStyle: 'solid'},
      nested: {':hover': {textDecoration: 'underline'}, ':focus': {outlineColor: T.info}}, attrs: attrs}, kids)
    if (p.onClick) el.addEventListener('click', p.onClick)
    return el
  }

  // SVG icon from the server-built map: icon('eye', {size, color, title, testid, variant})
  var ICON_SIZE = {'x-small': '1.125rem', small: '2rem', medium: '3rem', large: '5rem'}
  var ICON_COLOR = {success: T.success, error: T.danger, warning: T.warning, brand: T.info, secondary: T.text2, primary: T.text}
  function icon(name, o) {
    o = o || {}
    var t = document.createElement('template')
    t.innerHTML = (CFG.icons[o.variant === 'Solid' ? name + ':Solid' : name] || '').trim()
    var svg = t.content.firstChild
    if (!svg) return null
    var d = {fill: 'currentcolor', display: 'inline-block', verticalAlign: 'middle', width: '1em', height: '1em'}
    if (o.size) d.fontSize = ICON_SIZE[o.size]
    if (o.color) d.color = ICON_COLOR[o.color]
    svg.setAttribute('class', cls('inlineSVG-svgIcon', d))
    if (o.title) {
      var id = uid('InlineSVG')
      svg.removeAttribute('aria-hidden')
      svg.setAttribute('role', 'img')
      svg.setAttribute('aria-labelledby', id)
      var title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      title.setAttribute('id', id)
      title.textContent = o.title
      svg.insertBefore(title, svg.firstChild)
    }
    if (o.testid) svg.setAttribute('data-testid', o.testid)
    return svg
  }

  // BaseButton family. Button: {color: secondary|primary, withBackground, size, display, icon, testid, onClick, margin, disabled}
  function baseButton(p, inner, cid) {
    var color = p.color || 'secondary'
    var bgc, fg, bc
    if (color === 'primary') { bgc = p.withBackground === false ? 'transparent' : T.brand; fg = p.withBackground === false ? T.brand : '#FFFFFF'; bc = T.brand }
    else if (color === 'primary-inverse') { bgc = 'transparent'; fg = '#FFFFFF'; bc = 'transparent' }
    else { bgc = p.withBackground === false ? 'transparent' : T.bg2; fg = T.text; bc = T.border }
    if (p.withBorder === false) bc = 'transparent'
    var small = p.size === 'small'
    var iconOnly = !!p.iconOnly
    var btn = View({
      as: p.href ? 'a' : 'button', display: p.display || 'inline-block', position: 'relative', borderRadius: 'medium', background: 'transparent', padding: 'none', borderWidth: 'none',
      margin: p.margin, width: p.display === 'block' ? '100%' : 'auto', cursor: p.disabled ? 'not-allowed' : 'pointer', label: 'baseButton',
      css: {appearance: 'none', textDecoration: 'none', userSelect: 'none', touchAction: 'manipulation', overflow: 'visible', direction: 'inherit', margin: spc(p.margin || '0'), padding: 0, width: p.display === 'block' ? '100%' : 'auto', opacity: p.disabled ? 0.5 : 1},
      nested: {':focus': {outline: 'none'}},
      attrs: Object.assign({type: p.href ? null : 'button', href: p.href, target: p.target, rel: p.rel, 'data-cid': cid + ' BaseButton', 'data-testid': p.testid, disabled: p.disabled ? '' : null, 'aria-pressed': p.ariaPressed, 'aria-label': p.ariaLabel}, p.attrs || {}),
    })
    var content = h('span', {'class': cls('baseButton__content', {boxSizing: 'border-box', width: '100%', display: 'block', direction: 'inherit', userSelect: 'none', transition: 'background 0.2s, transform 0.2s', fontFamily: T.font, fontWeight: 400, textTransform: 'none', letterSpacing: 'normal', borderStyle: 'solid', borderWidth: '0.0625rem', borderColor: bc, borderRadius: '0.25rem', background: bgc, color: fg, cursor: 'inherit', fontSize: small ? '0.875rem' : '1rem', lineHeight: small ? '1.75rem' : '2.375rem', paddingLeft: iconOnly ? 0 : small ? '0.5rem' : '0.75rem', paddingRight: iconOnly ? 0 : small ? '0.5rem' : '0.75rem', textAlign: p.textAlign || 'center'})}, inner)
    btn.appendChild(content)
    if (p.onClick) btn.addEventListener('click', function (e) { if (!p.disabled) p.onClick(e) })
    return btn
  }
  function Button(p, label) {
    var children = h('span', {'class': cls('baseButton__children', {display: 'block'})}, label)
    var inner = children
    if (p.icon) {
      inner = h('span', {'class': cls('baseButton__childrenLayout', {display: 'flex', height: '100%', width: '100%', justifyContent: 'center', alignItems: 'center', flexDirection: 'row'})}, [
        h('span', {'class': cls('baseButton__iconWrapper', {display: 'flex', alignItems: 'center', boxSizing: 'border-box', paddingInlineEnd: '0.5rem'})}, [h('span', {'class': cls('baseButton__iconSVG', {display: 'flex', alignItems: 'center', fontSize: '1rem'})}, [icon(p.icon)])]),
        h('span', {'class': cls('baseButton__childrenWrapper', {display: 'flex', alignItems: 'center', boxSizing: 'border-box'})}, [children]),
      ])
    }
    return baseButton(p, inner, p.cid || 'Button')
  }
  // IconButton: {label, icon (element), size, color, testid, onClick, href}
  function IconButton(p) {
    var small = p.size === 'small'
    var dim = small ? '1.75rem' : '2.375rem'
    var inner = h('span', {'class': cls('baseButton__childrenLayout', {display: 'flex', height: '100%', width: '100%', justifyContent: 'center', alignItems: 'center', flexDirection: 'row'})}, [
      h('span', {'class': cls('baseButton__iconOnly', {boxSizing: 'border-box', width: dim, height: dim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: small ? '1rem' : '1.25rem'})}, [
        h('span', {'class': cls('baseButton__iconSVG', {display: 'flex', alignItems: 'center', fontSize: small ? '1rem' : '1.25rem'})}, [p.icon]),
        ScreenReader(p.label),
      ]),
    ])
    return baseButton(Object.assign({}, p, {iconOnly: true, withBackground: p.withBackground}), inner, 'IconButton')
  }

  function Spinner(title, size) {
    var dims = {'x-small': '1.5rem', small: '3rem', medium: '5rem', large: '7rem'}[size || 'medium']
    var id = uid('Spinner')
    var ns = 'http://www.w3.org/2000/svg'
    var svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('class', cls('spinner__circle', {display: 'block', position: 'absolute', top: 0, left: 0, width: dims, height: dims, animationName: 'mock-instui-rotate', animationDuration: '2.25s', animationIterationCount: 'infinite', animationTimingFunction: 'linear'}))
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-labelledby', id); svg.setAttribute('focusable', 'false')
    var t = document.createElementNS(ns, 'title'); t.setAttribute('id', id); t.textContent = title; svg.appendChild(t)
    var g = document.createElementNS(ns, 'g'); g.setAttribute('role', 'presentation'); svg.appendChild(g)
    var r = size === 'x-small' ? '0.5em' : '1.75em'
    ;[['spinner__circleTrack', {stroke: '#F2F4F4', fill: 'none', strokeWidth: '0.375em'}], ['spinner__circleSpin', {stroke: T.info, fill: 'none', strokeWidth: '0.375em', strokeLinecap: 'round', strokeDasharray: '6em', transformOrigin: 'center center', animationName: 'mock-instui-morph', animationDuration: '1.75s', animationIterationCount: 'infinite'}]].forEach(function (c) {
      var el = document.createElementNS(ns, 'circle')
      el.setAttribute('class', cls(c[0], c[1])); el.setAttribute('cx', '50%'); el.setAttribute('cy', '50%'); el.setAttribute('r', r)
      g.appendChild(el)
    })
    var wrap = h('div', {'class': cls('spinner', {display: 'inline-block', verticalAlign: 'middle', position: 'relative', boxSizing: 'border-box', overflow: 'hidden', width: dims, height: dims})})
    wrap.appendChild(svg)
    return wrap
  }

  function Avatar(p) {
    var parts = String(p.name || '').trim().split(/\s+/)
    var initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (parts[0] || '?')[0].toUpperCase()
    var box = View({
      as: 'span', display: 'inline-block', label: 'avatar',
      css: {boxSizing: 'border-box', borderStyle: 'solid', borderColor: '#D7DADE', borderWidth: '0.0625rem', borderRadius: '50%', overflow: 'hidden', width: '3rem', height: '3rem', fontSize: '1.5rem', background: '#FFFFFF', color: T.info, display: 'inline-block', verticalAlign: 'middle'},
      attrs: Object.assign({name: p.name, size: 'medium', color: 'default', shape: 'circle'}, p.testid ? {'data-testid': p.testid} : {}),
    }, [
      h('img', {'class': cls('avatar__loadImage', {display: 'none'}), alt: '', 'aria-hidden': 'true'}),
      h('span', {'class': cls('avatar__initials', {color: T.info, lineHeight: '2.875rem', fontFamily: T.font, fontWeight: 700, letterSpacing: '0.0313rem', textAlign: 'center', display: 'block', fontSize: '1.125rem'}), 'aria-hidden': 'true'}, initials),
    ])
    return box
  }

  // List isUnstyled
  function List(items) {
    return View({as: 'ul', display: 'block', label: 'list', margin: '0', css: {listStyleType: 'none', padding: 0, margin: 0}, attrs: {'data-cid': 'List'}},
      items.map(function (c) { return View({as: 'li', label: 'listItem', margin: '0', css: {padding: 0, maxWidth: '100%', fontFamily: T.font, fontSize: '1rem', color: T.text}, attrs: {'data-cid': 'ListItem'}}, c) }))
  }

  // Checkbox variant="toggle": {label, checked, testid, value, onChange}
  function Toggle(p) {
    var id = uid('Checkbox')
    var input = h('input', {id: id, value: p.value, type: 'checkbox', 'data-testid': p.testid, 'class': cls('checkbox__input', {padding: 0, margin: 0, fontSize: 'inherit', lineHeight: 'inherit', width: 'auto', position: 'absolute', top: 0, left: 0, opacity: 0.0001})})
    input.checked = !!p.checked
    var on = !!p.checked
    var knob = h('span', {'class': cls('toggleFacade__iconToggle', {display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', top: '-0.0625rem', insetInlineStart: on ? 'calc(100% - 1.5rem)' : '-0.0625rem', width: '1.5rem', height: '1.5rem', borderRadius: '100%', background: '#FFFFFF', boxShadow: '0 0.0625rem 0.125rem rgba(0,0,0,0.2)', color: on ? T.success : T.text2, transition: 'all 0.2s'})}, [icon(on ? 'check' : 'x', {variant: 'Solid'})])
    knob.querySelector('svg') && knob.querySelector('svg').setAttribute('class', cls('toggleFacade__iconSVG', {fontSize: '0.75rem', fill: 'currentcolor', width: '1em', height: '1em'}))
    var el = h('div', {'class': cls('checkbox', {position: 'relative', width: '100%'}), 'data-cid': 'Checkbox'}, [
      h('div', {'class': cls('', {display: 'flex', alignItems: 'center'})}, [
        input,
        h('label', {for: id, 'class': cls('checkbox__control', {all: 'initial', display: 'block', direction: 'inherit', textAlign: 'start', cursor: 'pointer'})}, [
          h('span', {'class': cls('toggleFacade', {display: 'flex', alignItems: 'center'})}, [
            h('span', {'class': cls('toggleFacade__facade', {position: 'relative', display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', boxSizing: 'border-box', width: '2.5rem', height: '1.5rem', borderRadius: '4rem', background: on ? T.success : '#9EA6AD', transition: 'background 0.2s'}), 'aria-hidden': 'true'}, [
              h('span', {'class': cls('toggleFacade__icon', {display: 'block', position: 'relative', width: '100%', height: '100%'})}, [knob]),
            ]),
            h('span', {'class': cls('toggleFacade__label', {flex: 1, minWidth: '0.0625rem', paddingInlineStart: '0.75rem', color: T.text, fontFamily: T.font, fontWeight: 400, fontSize: '0.875rem', lineHeight: 1.5})}, p.label),
          ]),
        ]),
      ]),
    ])
    input.addEventListener('change', function () { p.onChange(input.checked) })
    return el
  }

  // SimpleSelect: {label, value, options:[{id,value,label}], testid, size, width, onChange}
  var openListbox = null
  function closeListbox() { if (openListbox) { openListbox.close(); openListbox = null } }
  document.addEventListener('mousedown', function (e) { if (openListbox && !openListbox.contains(e.target)) closeListbox() })
  function SimpleSelect(p) {
    var id = uid('Select')
    var small = p.size === 'small'
    var cur = p.options.filter(function (o) { return o.value === p.value })[0] || p.options[0]
    var input = h('input', {
      id: id, role: 'combobox', title: cur ? cur.label : '', 'aria-autocomplete': 'none', 'aria-readonly': 'true', readonly: '', autocomplete: 'off',
      'aria-expanded': 'false', 'aria-haspopup': 'listbox', 'aria-describedby': id + '-description', 'data-testid': p.testid, value: cur ? cur.label : '',
      'class': cls('textInput', {all: 'initial', WebkitFontSmoothing: 'antialiased', appearance: 'none', margin: 0, width: '100%', display: 'block', boxSizing: 'border-box', outline: 'none', fontFamily: T.font, fontWeight: 400, color: T.text, background: 'transparent', border: 'none', borderRadius: '0.25rem', padding: '0 0.75rem', height: small ? '1.875rem' : '2.375rem', lineHeight: small ? '1.875rem' : '2.375rem', fontSize: small ? '0.875rem' : '1rem', cursor: 'pointer', textOverflow: 'ellipsis'}),
    })
    input.value = cur ? cur.label : ''
    var label = h('label', {'data-cid': 'TextInput', for: id, style: p.width ? {width: p.width} : null, 'class': cls('formFieldLayout', {all: 'initial', border: 0, padding: 0, margin: 0, minWidth: 0, direction: 'inherit', textAlign: 'start', opacity: 'inherit', display: 'block', width: '100%'})}, [
      h('span', {'class': cls('formFieldLayout__label', {all: 'initial', display: 'block', color: T.text, fontFamily: T.font, fontWeight: 700, fontSize: '1rem', lineHeight: 1.25, margin: '0 0 0.75rem'})}, p.label),
      h('span', {'class': cls('formFieldLayout__children', {display: 'block'})}, [
        h('span', {'class': cls('textInput__facade', {position: 'relative', display: 'block', boxSizing: 'border-box', fontFamily: T.font, border: '0.0625rem solid #9EA6AD', borderRadius: '0.25rem', background: '#FFFFFF', transition: 'all 0.2s'})}, [
          h('span', {'class': cls('textInput__layout', {display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flexDirection: 'row'})}, [
            h('span', {'class': cls('textInput__inputLayout', {flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between'})}, [
              input,
              h('span', {'class': cls('textInput__afterElement', {display: 'flex', alignItems: 'center', paddingInlineEnd: '0.75rem'})}, [
                h('span', {'class': cls('select__icon', {display: 'inline-block', color: T.text, fontSize: '0.875rem', cursor: 'pointer'})}, [icon('arrow-open-down')]),
              ]),
            ]),
          ]),
        ]),
      ]),
    ])
    var root = h('span', {'class': cls('select', {display: 'block', fontFamily: T.font}), 'data-cid': 'Select SimpleSelect'}, [
      label,
      h('span', {id: id + '-description', 'class': cls('select__assistiveText', {display: 'none'})}, 'Use arrow keys to navigate options.'),
    ])
    function open() {
      if (openListbox && openListbox.owner === input) { closeListbox(); return }
      closeListbox()
      input.setAttribute('aria-expanded', 'true')
      var listId = id + '-list'
      input.setAttribute('aria-controls', listId)
      var ul = h('ul', {id: listId, role: 'listbox', 'aria-labelledby': id, 'class': cls('options', {listStyleType: 'none', position: 'relative', padding: '0.375rem 0', margin: 0, background: '#FFFFFF', display: 'block'})},
        p.options.map(function (o) {
          var li = h('li', {role: 'none', 'class': cls('options__item', {listStyleType: 'none', position: 'relative', background: '#FFFFFF', color: T.text, fontFamily: T.font, fontSize: '1rem', lineHeight: 1.5}, {':hover': {background: T.info, color: '#FFFFFF'}})}, [
            h('span', {id: id + '-opt-' + o.id, role: 'option', 'aria-selected': o.value === (cur && cur.value) ? 'true' : 'false', 'class': cls('options__itemLabel', {display: 'block', padding: '0.375rem 0.75rem', cursor: 'pointer', fontWeight: o.value === (cur && cur.value) ? 700 : 400})}, o.label),
          ])
          li.addEventListener('click', function () { closeListbox(); if (!cur || o.value !== cur.value) p.onChange(o.value) })
          return li
        }))
      var r = label.querySelector('[class*=textInput__facade]').getBoundingClientRect()
      var pop = h('span', {dir: 'ltr', 'class': cls('view-popover', {position: 'absolute', zIndex: 9999, boxShadow: SHADOW.topmost, borderRadius: '0.25rem', border: '0.0625rem solid ' + T.border, overflow: 'auto', maxHeight: '18rem', background: '#FFFFFF'}), style: {top: r.bottom + window.scrollY + 'px', left: r.left + window.scrollX + 'px', width: r.width + 'px'}}, [ul])
      document.body.appendChild(pop)
      openListbox = {owner: input, contains: function (t) { return pop.contains(t) || label.contains(t) }, close: function () { pop.remove(); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-controls') }}
    }
    label.addEventListener('click', function (e) { e.preventDefault(); open() })
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); open() } if (e.key === 'Escape') closeListbox() })
    return root
  }

  // Pagination variant="compact" with currentPage/totalPageNumber
  function Pagination(p) {
    var pages = []
    var total = p.total, curr = p.current
    var first = Math.max(1, Math.min(curr - 1, total - 4)), last = Math.min(total, first + 4)
    for (var i = first; i <= last; i++) pages.push(i)
    function pageBtn(n) {
      var cur = n === curr
      var b = baseButton({color: 'primary', withBackground: cur, withBorder: cur, size: 'small', attrs: {'aria-current': cur ? 'page' : null}, onClick: cur ? null : function () { p.onChange(n) }}, h('span', {'class': cls('baseButton__children', {display: 'block'})}, String(n)), 'PaginationButton')
      return h('li', {style: 'all: unset;'}, [b])
    }
    var items = pages.map(pageBtn)
    if (first > 1) items.unshift(pageBtn(1), first > 2 ? h('li', {style: 'all: unset;', 'aria-hidden': 'true'}, '…') : null)
    if (last < total) items.push(last < total - 1 ? h('li', {style: 'all: unset;', 'aria-hidden': 'true'}, '…') : null, pageBtn(total))
    function arrow(dir) {
      var n = dir === 'prev' ? curr - 1 : curr + 1
      if (n < 1 || n > total) return null
      return IconButton({label: dir === 'prev' ? 'Previous Page' : 'Next Page', size: 'small', withBackground: false, withBorder: false, icon: icon(dir === 'prev' ? 'arrow-open-start' : 'arrow-open-end'), onClick: function () { p.onChange(n) }, attrs: {'data-direction': dir}})
    }
    return View({as: 'nav', margin: 'x-small', label: 'pagination', css: {textAlign: 'center'}, attrs: {role: 'navigation', 'aria-label': p.label, 'data-cid': 'Pagination'}}, [
      View({display: 'inline-block', label: 'pagination__pages', css: {display: 'inline-flex', alignItems: 'center'}}, [
        arrow('prev'),
        View({as: 'ul', display: 'inline-block', margin: '0', padding: '0'}, items),
        arrow('next'),
      ]),
    ])
  }

  // ---------------------------------------------------------------- formatting
  function laParts(d) {
    var o = {}
    new Intl.DateTimeFormat('en-US', {timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric'}).formatToParts(d).forEach(function (x) { o[x.type] = x.value })
    return {y: +o.year, m: +o.month, d: +o.day}
  }
  function dayDiff(d) {
    var a = laParts(d), b = laParts(NOW)
    return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 864e5)
  }
  function startOfToday() {
    var p = laParts(NOW)
    var guess = new Date(Date.UTC(p.y, p.m - 1, p.d, 7))
    // shift to LA midnight (PDT/PST)
    var off = new Date(guess.toLocaleString('en-US', {timeZone: TZ})).getTime() - new Date(guess.toLocaleString('en-US', {timeZone: 'UTC'})).getTime()
    return new Date(Date.UTC(p.y, p.m - 1, p.d) - off)
  }
  function timeOf(d, o) { return d.toLocaleTimeString([], Object.assign({timeZone: TZ}, o)) }
  // CourseWorkWidget/utils formatDueDate
  function formatDueDate(iso) {
    if (!iso) return 'No due date'
    var d = new Date(iso), diff = dayDiff(d)
    if (diff === 0) return 'Today ' + timeOf(d, {hour: 'numeric', minute: '2-digit'})
    if (diff === 1) return 'Tomorrow ' + timeOf(d, {hour: 'numeric', minute: '2-digit'})
    return d.toLocaleDateString(undefined, {timeZone: TZ}) + ' ' + timeOf(d, {hour: '2-digit', minute: '2-digit'})
  }
  function friendlyDate(iso, prefix) {
    var d = new Date(iso)
    var f = new Intl.DateTimeFormat('en-US', {timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric'}).format(d)
    return h('time', {datetime: d.toISOString(), title: f}, prefix ? prefix + ' ' + f : f)
  }
  function stripOrigin(u) { return String(u || '').replace(/^https?:\/\/[^/]+/, '') }

  // ---------------------------------------------------------------- data transport
  // Real widgets: @canvas/graphql executeQuery -> POST /api/graphql {query, variables}.
  function csrf() { var m = document.cookie.match(/(?:^|; )_csrf_token=([^;]*)/); return m ? decodeURIComponent(m[1]) : '' }
  function gql(query, variables) {
    var body = {query: query, variables: variables || {}}
    if (!CFG.graphqlRouted) {
      // server.mjs does not route /api/graphql yet: answer from the embedded snapshot with the same resolver
      return Promise.resolve(CFG.resolve(CFG.fallbackDb, JSON.parse(JSON.stringify(body)))).then(unwrap)
    }
    return fetch('/api/graphql', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf()}, body: JSON.stringify(body)})
      .then(function (r) { return r.json() }).then(unwrap)
  }
  function unwrap(r) { if (r && r.errors && !r.data) throw new Error(r.errors.map(function (e) { return e.message }).join(', ')); return r.data }
  var Q = {
    work: 'query GetUserCourseWork($userId: ID!, $first: Int, $after: String, $last: Int, $before: String, $courseFilter: String, $startDate: ISO8601DateTime, $endDate: ISO8601DateTime, $includeOverdue: Boolean, $includeNoDueDate: Boolean, $onlySubmitted: Boolean, $observedUserId: ID) {\n  legacyNode(_id: $userId, type: User) {\n    ... on User {\n      _id\n      courseWorkSubmissionsConnection(first: $first, after: $after, last: $last, before: $before, courseFilter: $courseFilter, startDate: $startDate, endDate: $endDate, includeOverdue: $includeOverdue, includeNoDueDate: $includeNoDueDate, onlySubmitted: $onlySubmitted, observedUserId: $observedUserId) {\n        nodes {\n          _id\n          cachedDueDate\n          submittedAt\n          late\n          missing\n          excused\n          state\n          assignment {\n            _id\n            name\n            dueAt\n            pointsPossible\n            htmlUrl\n            submissionTypes\n            state\n            published\n            quiz {\n              _id\n              title\n            }\n            discussion {\n              _id\n              title\n            }\n            course {\n              _id\n              name\n            }\n          }\n        }\n        pageInfo {\n          hasNextPage\n          hasPreviousPage\n          endCursor\n          startCursor\n          totalCount\n        }\n      }\n    }\n  }\n}',
    stats: 'query GetUserCourseStatistics($userId: ID!, $startDate: ISO8601DateTime!, $endDate: ISO8601DateTime!, $observedUserId: ID) {\n  legacyNode(_id: $userId, type: User) {\n    ... on User {\n      _id\n      enrollments(currentOnly: true) {\n        course {\n          _id\n          name\n          submissionStatistics(observedUserId: $observedUserId) {\n            submissionsDueCount(startDate: $startDate, endDate: $endDate)\n            missingSubmissionsCount\n            submissionsSubmittedCount\n          }\n          assignmentsConnection(filter: {submissionTypes: [online_quiz]}) {\n            nodes {\n              dueAt\n            }\n          }\n        }\n      }\n    }\n  }\n}',
    announcements: 'query GetUserAnnouncements($userId: ID!, $first: Int!, $after: String, $readState: String, $observedUserId: ID) {\n  legacyNode(_id: $userId, type: User) {\n    ... on User {\n      _id\n      discussionParticipantsConnection(first: $first, after: $after, filter: {isAnnouncement: true, readState: $readState}, observedUserId: $observedUserId) {\n        nodes {\n          id\n          read\n          discussionTopic {\n            _id\n            title\n            message\n            createdAt\n            contextName\n            contextId\n            isAnnouncement\n            author {\n              _id\n              name\n              avatarUrl\n            }\n          }\n        }\n        pageInfo {\n          hasNextPage\n          hasPreviousPage\n          startCursor\n          endCursor\n          totalCount\n        }\n      }\n    }\n  }\n}',
    instructors: 'query GetCourseInstructorsPaginated($courseIds: [ID!]!, $first: Int, $after: String, $observedUserId: ID, $enrollmentTypes: [String!]) {\n  courseInstructorsConnection(courseIds: $courseIds, first: $first, after: $after, observedUserId: $observedUserId, enrollmentTypes: $enrollmentTypes) {\n    nodes {\n      user {\n        _id\n        name\n        sortableName\n        shortName\n        avatarUrl\n        email\n      }\n      enrollments {\n        course {\n          _id\n          name\n          courseCode\n        }\n        type\n        role {\n          _id\n          name\n        }\n        enrollmentState\n      }\n    }\n    pageInfo {\n      hasNextPage\n      hasPreviousPage\n      startCursor\n      endCursor\n      totalCount\n    }\n  }\n}',
    notifications: 'query GetDashboardNotifications {\n  accountNotifications {\n    id\n    _id\n    subject\n    message\n    startAt\n    endAt\n    accountName\n    siteAdmin\n    notificationType\n  }\n  enrollmentInvitations {\n    id\n    uuid\n    course {\n      id\n      name\n    }\n    role {\n      name\n    }\n    roleLabel\n  }\n}',
    readState: 'mutation UpdateAnnouncementReadState($discussionTopicId: ID!, $read: Boolean!) {\n  updateDiscussionReadState(input: {discussionTopicId: $discussionTopicId, read: $read}) {\n    discussionTopic {\n      _id\n    }\n  }\n}',
    tab: 'mutation UpdateLearnerDashboardTabSelection($tab: LearnerDashboardTabType!) {\n  updateLearnerDashboardTabSelection(input: {tab: $tab}) {\n    tab\n    errors {\n      message\n    }\n  }\n}',
    config: 'mutation UpdateWidgetDashboardConfig($widgetId: String!, $filters: JSON) {\n  updateWidgetDashboardConfig(input: {widgetId: $widgetId, filters: $filters}) {\n    widgetId\n    filters\n    errors {\n      message\n    }\n  }\n}',
    layout: 'mutation UpdateWidgetDashboardLayout($layout: String!) {\n  updateWidgetDashboardLayout(input: {layout: $layout}) {\n    layout\n    errors {\n      message\n    }\n  }\n}',
  }
  var USER_ID = ENV.current_user_id
  var SHARED = ENV.SHARED_COURSE_DATA || []

  // useWidgetConfig: widget_dashboard_config.filters[widgetId][key]
  var FILTERS = JSON.parse(JSON.stringify((PREFS.widget_dashboard_config && PREFS.widget_dashboard_config.filters) || {}))
  function cfgGet(wid, key, def, valid) {
    var f = FILTERS[wid]
    if (f && key in f) { var v = f[key]; if (key === 'selectedCourse' && typeof v === 'string' && v.indexOf('course_') === 0) v = v.slice(7); if (!valid || valid(v)) return v }
    return def
  }
  function cfgSet(wid, key, value) {
    FILTERS[wid] = Object.assign({}, FILTERS[wid] || {}); FILTERS[wid][key] = value
    gql(Q.config, {widgetId: wid, filters: FILTERS[wid]}).catch(function () {})
  }

  // ---------------------------------------------------------------- TemplateWidget
  var TITLES = {course_work_combined: 'Course work', course_grades: 'Course grades', announcements: 'Announcements', people: 'People', todo_list: 'To-do list'}
  var state = {editMode: false, layout: null, savedLayout: null, tab: PREFS.learner_dashboard_tab_selection || 'dashboard'}
  function bp() { var w = window.innerWidth; return w < 640 ? 'mobile' : w < 1380 ? 'tablet' : 'desktop' }

  // o: {widget, headerActions, body (element) | loading | error, pagination: {current,total,label,onChange}}
  function TemplateWidget(o) {
    var w = o.widget
    var mobile = bp() === 'mobile'
    var title = TITLES[w.type] || w.title
    var headId = w.id + '-heading'
    var edit = state.editMode ? h('div', {style: {display: 'flex', gap: '0.5rem', alignItems: 'center'}}, [
      h('button', {'data-testid': w.id + '-drag-handle', type: 'button', 'aria-label': 'Reorder ' + title, style: {cursor: 'grab', display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', padding: '0.375rem', margin: '0', lineHeight: '1'}, onclick: function (e) { moveMenu(e.currentTarget, w) }}, [icon('drag-handle')]),
      IconButton({label: 'Remove ' + title, size: 'small', withBackground: false, withBorder: false, testid: w.id + '-remove-button', icon: icon('trash'), onClick: function () { removeWidget(w.id) }}),
    ]) : null
    var header = mobile
      ? Flex({direction: 'column', gap: 'x-small'}, [Item({}, Heading({level: 'h2', id: headId}, title)), o.headerActions ? Item({padding: 'x-small 0 x-small x-small'}, o.headerActions) : null, edit ? Item({padding: 'x-small 0 x-small x-small'}, edit) : null])
      : Flex({direction: 'row', alignItems: 'center', justifyItems: 'space-between', wrap: 'wrap'}, [Item({shouldGrow: true}, Heading({level: 'h2', variant: 'titleCardSection', id: headId}, title)), o.headerActions ? Item({shouldGrow: false}, o.headerActions) : null, edit ? Item({margin: '0 0 0 small', shouldGrow: false}, edit) : null])
    var content
    if (o.loading) content = Flex({justifyItems: 'center', alignItems: 'center', height: '400px'}, [Spinner(o.loadingText || 'Loading widget data...', 'medium')])
    else if (o.error) content = View({as: 'div', textAlign: 'center'}, [Text({color: 'danger', size: 'medium'}, o.error)])
    else content = o.body || View({as: 'div', textAlign: 'center'}, [Text({color: 'secondary', size: 'medium'}, 'No content available')])
    var pag = o.pagination && !o.loading && !o.error && o.pagination.total > 1
      ? View({as: 'div', textAlign: 'center', padding: 'x-small 0', attrs: {'data-testid': 'pagination-container'}}, [Flex({direction: 'row', justifyItems: 'center', alignItems: 'center', gap: 'small'}, [Pagination(o.pagination)])])
      : null
    return View({as: 'section', height: '100%', margin: mobile ? '0' : 'x-small', padding: 'medium', shadow: 'above', borderRadius: 'large', background: 'primary',
      attrs: {'data-testid': 'widget-' + w.id, 'aria-labelledby': headId, role: 'region'}}, [
      Flex({direction: 'column', gap: 'small'}, [header, View({as: 'div', position: 'relative'}, [content]), pag]),
    ])
  }
  function mount(slot, el) { slot.replaceChildren(el) }

  // ---------------------------------------------------------------- widgets
  function courseOptions() { return [{id: 'all', value: 'all', label: 'All Courses'}].concat(SHARED.map(function (c) { return {id: c.courseId, value: c.courseId, label: c.courseName} })) }

  function CourseWorkCombinedWidget(w, slot) {
    var st = {
      course: cfgGet(w.id, 'selectedCourse', 'all'),
      status: cfgGet(w.id, 'selectedDateFilter', 'not_submitted', function (v) { return ['not_submitted', 'missing', 'submitted'].indexOf(v) >= 0 }),
      summary: cfgGet(w.id, 'showSummaryCounts', true, function (v) { return typeof v === 'boolean' }),
      page: 0, items: null, total: 0, stats: null, loading: true,
    }
    var PAGE = 6
    function params() {
      if (st.status === 'missing') return {includeOverdue: true, includeNoDueDate: false, onlySubmitted: false}
      if (st.status === 'submitted') return {includeOverdue: false, includeNoDueDate: false, onlySubmitted: true}
      return {startDate: NOW.toISOString(), includeOverdue: false, includeNoDueDate: false, onlySubmitted: false}
    }
    function load() {
      var vars = Object.assign({userId: USER_ID, first: PAGE, after: st.page ? btoa(String(st.page * PAGE)) : undefined, courseFilter: st.course === 'all' ? undefined : st.course}, params())
      var s0 = startOfToday()
      var reqs = [gql(Q.work, vars)]
      if (st.summary) reqs.push(gql(Q.stats, {userId: USER_ID, startDate: s0.toISOString(), endDate: new Date(s0.getTime() + 90 * 864e5).toISOString()}))
      return Promise.all(reqs).then(function (r) {
        return later(function () {
          var conn = r[0].legacyNode.courseWorkSubmissionsConnection
          st.items = conn.nodes.map(function (s) {
            var a = s.assignment
            return {id: a._id, title: a.quiz ? a.quiz.title : a.discussion ? a.discussion.title : a.name, course: {id: a.course._id, name: a.course.name}, dueAt: s.cachedDueDate || a.dueAt || null, points: a.pointsPossible || null, htmlUrl: a.htmlUrl,
              type: a.quiz ? 'quiz' : a.discussion ? 'discussion' : (a.submissionTypes || []).indexOf('online_quiz') >= 0 ? 'quiz' : (a.submissionTypes || []).indexOf('discussion_topic') >= 0 ? 'discussion' : 'assignment',
              late: !!s.late, missing: !!s.missing, excused: !!s.excused, state: s.state || 'not_submitted'}
          })
          st.total = conn.pageInfo.totalCount || 0
          if (r[1]) {
            var sum = {due: 0, missing: 0, submitted: 0}
            r[1].legacyNode.enrollments.forEach(function (e) {
              if (st.course !== 'all' && e.course._id !== st.course) return
              var x = e.course.submissionStatistics
              if (x) { sum.due += x.submissionsDueCount; sum.missing += x.missingSubmissionsCount; sum.submitted += x.submissionsSubmittedCount }
            })
            st.stats = sum
          }
          st.loading = false
          render()
        })
      })
    }
    function status(it) {
      var C = {blue: ['#E0EBF5', '#1A5A8E'], red: ['#FCE4E5', '#C71F23'], orange: ['#FCE5D9', '#CF4A00'], green: ['#DCEEE4', '#027634'], grey: ['#E8EAEC', '#6A7883']}
      if (it.excused) return {type: 'excused', label: 'Excused', c: C.green, icon: 'check-mark', iconColor: 'success'}
      if (it.missing) return {type: 'missing', label: 'Missing', c: C.red, icon: 'warning', iconColor: 'error'}
      if (it.late) return {type: 'late', label: 'Late', c: C.orange, icon: 'warning', iconColor: 'warning'}
      if (it.state === 'pending_review') return {type: 'pending_review', label: 'Pending Review', c: C.orange}
      if (it.state === 'submitted' || it.state === 'graded') return {type: 'submitted', label: 'Submitted', c: C.green, icon: 'check-mark', iconColor: 'success'}
      if (it.dueAt) return {type: 'due_soon', label: formatDueDate(it.dueAt), c: C.blue, icon: 'calendar-clock', iconColor: 'brand'}
      return {type: 'not_submitted', label: 'Not Submitted', c: C.grey}
    }
    function itemEl(it) {
      var s = status(it)
      var mobile = bp() === 'mobile'
      var typeIcon = {assignment: ['assignment', 'Assignment'], quiz: ['quiz', 'Quiz'], discussion: ['discussion', 'Discussion']}[it.type] || ['document', 'Course Work Item']
      return renderItem(Item({overflowY: 'hidden', attrs: {role: 'group', 'aria-label': it.title, 'data-testid': 'listed-course-work-item-' + it.id}}, [
        View({as: 'div', margin: 'small', background: 'primary'}, [
          Flex({gap: 'small', alignItems: mobile ? 'start' : 'center', direction: mobile ? 'column' : 'row'}, [
            mobile ? null : Item({}, View({as: 'div', background: 'secondary', bgColor: s.c[0], borderRadius: 'medium', padding: 'medium', margin: '0 0 0 0'}, [h('span', {style: {color: s.c[1]}}, [icon(typeIcon[0], {title: typeIcon[1], size: 'small', testid: typeIcon[0] + '-icon'})])])),
            Item({shouldGrow: true, shouldShrink: true}, Flex({direction: 'column', gap: '0'}, [
              Item({overflowY: 'visible'}, Link({href: stripOrigin(it.htmlUrl), testid: 'course-work-item-link-' + it.id}, Text({weight: 'bold', size: 'small', wrap: 'break-word'}, it.title))),
              Item({overflowY: 'visible'}, Flex({direction: 'row', gap: 'x-small', alignItems: 'center'}, [
                Text({size: 'x-small', color: 'secondary', wrap: 'break-word'}, it.course.name),
                Text({size: 'x-small', color: 'secondary'}, '|'),
                Link({href: '/courses/' + it.course.id, ariaLabel: 'Go to ' + it.course.name, testid: 'course-work-item-course-link-' + it.id}, Text({size: 'x-small'}, 'Go to course')),
              ])),
              Item({}, Text({size: 'x-small', color: 'secondary'}, it.points != null ? it.points + ' pts' : null)),
            ])),
            Item({}, View({as: 'span', background: 'primary', bgColor: s.c[0], borderRadius: 'large', padding: 'x-small', display: 'inline-block', attrs: {'data-testid': s.type + '-status-pill-' + it.id}}, [
              Flex({gap: 'xx-small', alignItems: 'center'}, [s.icon ? icon(s.icon, {size: 'x-small', color: s.iconColor}) : null, Text({size: 'x-small', weight: 'bold', color: 'primary', colorValue: s.c[1], lineHeight: 'fit'}, s.label)]),
            ])),
          ]),
        ]),
      ]), null)
    }
    function statCard(count, label, color) {
      return View({as: 'div', padding: 'small', background: 'primary', bgColor: '#F5F5F5', textAlign: 'center', borderRadius: 'medium', attrs: {'data-testid': 'statistics-card-' + label}}, [
        Text({size: 'x-large', weight: 'bold'}, h('span', {style: {color: color}}, count >= 1000 ? (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : count.toLocaleString())),
        View({as: 'div', margin: 'x-small 0 0'}, [Text({size: 'small'}, h('span', {style: {color: color}}, label))]),
      ])
    }
    function render() {
      var mobile = bp() === 'mobile'
      var body = null
      if (!st.loading) {
        var items = st.items || []
        body = Flex({direction: 'column', gap: 'small', height: '100%'}, [
          Item({overflowX: 'visible', overflowY: 'visible'}, Flex({direction: mobile ? 'column' : 'row', wrap: 'wrap', gap: 'small'}, [
            Item({shouldGrow: true, overflowX: 'visible', overflowY: 'visible'}, SimpleSelect({label: 'Course filter:', value: st.course, options: courseOptions(), testid: 'course-filter-select', onChange: function (v) { st.course = v; st.page = 0; cfgSet(w.id, 'selectedCourse', v); load() }})),
            Item({shouldGrow: true, overflowX: 'visible', overflowY: 'visible'}, SimpleSelect({label: 'Submission status:', value: st.status, testid: 'submission-status-filter-select',
              options: [{id: 'not_submitted', value: 'not_submitted', label: 'Not submitted'}, {id: 'missing', value: 'missing', label: 'Missing'}, {id: 'submitted', value: 'submitted', label: 'Submitted'}],
              onChange: function (v) { st.status = v; st.page = 0; cfgSet(w.id, 'selectedDateFilter', v); load() }})),
          ])),
          st.summary && st.stats ? Item({overflowY: 'hidden'}, Flex({gap: 'x-small', margin: 'small 0', direction: mobile ? 'column' : 'row'}, [
            Item({shouldGrow: !mobile, shouldShrink: true}, statCard(st.stats.due, 'Due', '#1A5A8E')),
            Item({shouldGrow: !mobile, shouldShrink: true}, statCard(st.stats.missing, 'Missing', '#C71F23')),
            Item({shouldGrow: !mobile, shouldShrink: true}, statCard(st.stats.submitted, 'Submitted', '#027634')),
          ])) : null,
          Item({shouldGrow: true}, items.length === 0
            ? Flex({justifyItems: 'center', padding: 'large'}, [Text({color: 'secondary', attrs: {'data-testid': 'no-course-work-message'}}, st.course === 'all' ? 'No upcoming course work' : 'No upcoming course work for selected course')])
            : View({height: '100%'}, [Flex({direction: 'column'}, [List(items.map(itemEl))])])),
        ])
      }
      mount(slot, TemplateWidget({widget: w, loading: st.loading, loadingText: 'Loading widget data...', body: body,
        headerActions: Toggle({label: 'Show summary counts', checked: st.summary, testid: 'show-summary-counts-toggle', onChange: function (v) { st.summary = v; cfgSet(w.id, 'showSummaryCounts', v); if (v && !st.stats) load(); else render() }}),
        pagination: {current: st.page + 1, total: Math.ceil(st.total / PAGE), label: 'Course work pagination', onChange: function (n) { st.page = n - 1; load() }}}))
    }
    render()
    return load
  }

  function CourseGradesWidget(w, slot) {
    var st = {showAll: cfgGet(w.id, 'showGrades', true), vis: cfgGet(w.id, 'gradeVisibilities', {}), page: 0}
    var MAX = 6
    function letter(score, scheme) {
      var x = score / 100
      for (var i = 0; i < scheme.length; i++) if (x >= scheme[i][1]) return scheme[i][0]
      return scheme.length ? scheme[scheme.length - 1][0] : 'F'
    }
    function textOn(bg) {
      var c = String(bg).replace('#', '').toLowerCase()
      if (c.length === 3) c = c.split('').map(function (x) { return x + x }).join('')
      if (!/^[0-9a-f]{6}$/.test(c)) return '#000000'
      var lum = [0, 2, 4].map(function (i) { var v = parseInt(c.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
      var L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2]
      return 1.05 / (L + 0.05) >= 4.5 ? '#FFFFFF' : '#000000'
    }
    function card(g) {
      var visible = st.vis[g.courseId] != null ? st.vis[g.courseId] : st.showAll
      var color = g.courseColor || '#334451'
      var tc = textOn(color), light = tc === '#FFFFFF'
      var shown = !visible ? '•••' : g.currentGrade == null ? 'N/A' : g.gradingScheme === 'percentage' ? Math.floor(g.currentGrade) + '%' : Array.isArray(g.gradingScheme) ? letter(g.currentGrade, g.gradingScheme) : Math.floor(g.currentGrade) + '%'
      var overlay = h('div', {style: {position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: '100'}}, [
        h('div', {style: {backgroundColor: light ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.85)', padding: '0.25rem 0.75rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '0.25rem'}}, [
          Text({size: 'x-large', weight: 'bold', color: 'primary-inverse', colorValue: tc, attrs: {'data-testid': 'course-' + g.courseId + '-grade', 'aria-hidden': visible ? null : 'true'}}, shown),
          visible ? null : ScreenReader('Grade hidden for ' + g.courseName),
          IconButton({size: 'small', withBackground: false, withBorder: false, color: light ? 'primary-inverse' : 'secondary', label: (visible ? 'Hide grade for ' : 'Show grade for ') + g.courseName,
            testid: (visible ? 'hide-single-grade-button-' : 'show-single-grade-button-') + g.courseId, icon: icon(visible ? 'eye' : 'off'),
            onClick: function () { var nv = !visible; if (nv === st.showAll) delete st.vis[g.courseId]; else st.vis[g.courseId] = nv; cfgSet(w.id, 'gradeVisibilities', st.vis); render() }}),
        ]),
      ])
      var menu = h('div', {style: {position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: '100'}}, [
        h('span', {style: {display: 'inline-block'}}, [IconButton({label: 'Choose a color for ' + g.courseName, testid: 'color-picker-trigger-' + g.courseId, size: 'small', withBackground: false, withBorder: false, color: light ? 'primary-inverse' : 'secondary', icon: icon('more')})]),
      ])
      var hero = g.image
        ? h('div', {'data-testid': 'course-' + g.courseId + '-image', style: {position: 'relative', height: '146px', width: '100%', borderRadius: '0.5rem 0.5rem 0 0', backgroundImage: 'url("' + g.image + '")', backgroundSize: 'cover', backgroundPosition: 'center'}}, [h('div', {style: {position: 'absolute', inset: '0', backgroundColor: color, opacity: '0.6', borderRadius: '0.5rem 0.5rem 0 0'}}), overlay, menu])
        : View({as: 'div', background: 'primary', bgColor: color, height: '146px', width: '100%', position: 'relative'}, [overlay, menu])
      return View({as: 'div', background: 'secondary', borderRadius: 'medium', width: '100%', height: '100%', shadow: 'resting', position: 'relative', attrs: {role: 'listitem', 'aria-label': g.courseName, 'data-testid': 'course-grade-card-' + g.courseId}}, [
        Flex({direction: 'column', width: '100%', height: '100%'}, [
          Item({}, hero),
          Item({padding: 'small', shouldGrow: true}, Flex({direction: 'column', gap: 'xx-small'}, [
            View({}, [Text({size: 'medium', weight: 'bold', wrap: 'break-word', attrs: {'data-testid': 'course-' + g.courseId + '-name'}}, g.courseName)]),
            View({}, [Text({size: 'small', color: 'secondary', wrap: 'break-word', attrs: {'data-testid': 'course-' + g.courseId + '-code'}}, g.courseCode)]),
            g.term ? View({}, [Text({size: 'small', color: 'secondary', wrap: 'break-word', attrs: {'data-testid': 'course-' + g.courseId + '-term'}}, g.term)]) : null,
            g.currentGrade != null && g.lastUpdated ? View({}, [Text({size: 'small', color: 'secondary', attrs: {'data-testid': 'course-' + g.courseId + '-last-updated'}}, friendlyDate(g.lastUpdated, 'Updated'))]) : null,
          ])),
          Item({padding: '0 small small small', overflowX: 'visible', overflowY: 'visible'}, Flex({wrap: 'wrap', gap: 'small', justifyItems: 'center'}, [
            Item({overflowX: 'visible', overflowY: 'visible'}, Link({href: '/courses/' + g.courseId + '/grades', ariaLabel: 'View ' + g.courseName + ' gradebook', testid: 'course-' + g.courseId + '-gradebook-link'}, Text({size: 'small'}, 'View Gradebook'))),
            Item({}, Text({size: 'small', color: 'secondary'}, '|')),
            Item({overflowX: 'visible', overflowY: 'visible'}, Link({href: '/courses/' + g.courseId, ariaLabel: 'Go to ' + g.courseName, testid: 'course-' + g.courseId + '-link'}, Text({size: 'small'}, 'Go to course'))),
          ])),
        ]),
      ])
    }
    function render() {
      var total = Math.max(Math.ceil(SHARED.length / MAX), 1)
      var data = SHARED.slice(st.page * MAX, st.page * MAX + MAX)
      var grid = h('div', {role: 'list', 'aria-label': 'Course grades', style: {display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(262px, 100%), 262px))', gridAutoRows: '1fr', gap: '1rem', padding: '0.75rem', justifyContent: 'center'}}, data.map(card))
      mount(slot, TemplateWidget({widget: w, body: grid, loadingText: 'Loading course grades...',
        headerActions: Toggle({label: 'Show all grades', value: 'showGrades', checked: st.showAll, testid: st.showAll ? 'hide-all-grades-checkbox' : 'show-all-grades-checkbox', onChange: function () { st.showAll = !st.showAll; cfgSet(w.id, 'showGrades', st.showAll); render() }}),
        pagination: {current: st.page + 1, total: total, label: 'Course grades pagination', onChange: function (n) { st.page = n - 1; render() }}}))
    }
    render() // data comes from ENV.SHARED_COURSE_DATA, available immediately
    return function () { return Promise.resolve() }
  }

  function AnnouncementsWidget(w, slot) {
    var st = {filter: cfgGet(w.id, 'filter', 'unread'), page: 0, loading: true, items: [], total: 0}
    var PAGE = 3
    function load() {
      return gql(Q.announcements, {userId: USER_ID, first: PAGE, after: st.page ? btoa(String(st.page * PAGE)) : undefined, readState: st.filter}).then(function (d) {
        return later(function () {
          var conn = d.legacyNode.discussionParticipantsConnection
          st.items = conn.nodes.map(function (p) {
            var t = p.discussionTopic
            return {id: t._id, title: t.title, message: t.message, posted_at: t.createdAt, html_url: '/courses/' + t.contextId + '/discussion_topics/' + t._id, course: {id: t.contextId, name: t.contextName}, author: t.author, isRead: p.read}
          })
          st.total = conn.pageInfo.totalCount || 0
          st.loading = false
          render()
        })
      })
    }
    function trunc(s, n) { return !s || s.length <= n ? s : s.slice(0, n).trim() + '...' }
    function truncText(s, n) { return Text({wrap: 'break-word', size: 'x-small', attrs: {title: s.length > n ? s : null}}, trunc(s, n)) }
    function itemEl(a) {
      var ta = document.createElement('textarea'); ta.innerHTML = String(a.message || '').replace(/<[^>]*>/g, '')
      var msg = ta.value
      var btn = IconButton({size: 'small', withBackground: false, withBorder: false, color: 'secondary', label: (a.isRead ? 'Mark ' + a.title + ' as unread' : 'Mark ' + a.title + ' as read'),
        ariaPressed: a.isRead ? 'true' : 'false', testid: (a.isRead ? 'mark-unread-' : 'mark-read-') + a.id,
        icon: a.isRead ? icon('check-mark', {variant: 'Solid', size: 'x-small', color: 'success'}) : icon('empty', {size: 'x-small', color: 'secondary'}),
        onClick: function () {
          var nv = !a.isRead
          gql(Q.readState, {discussionTopicId: a.id, read: nv}).then(function () {
            if (st.filter === 'all') { a.isRead = nv; render() } else load()
          })
        }})
      return View({as: 'div', padding: 'x-small 0', borderWidth: '0 0 small 0', borderColor: 'primary', width: '100%', maxWidth: '100%', attrs: {'data-testid': 'announcement-item-' + a.id, role: 'group', 'aria-label': a.title}}, [
        Flex({direction: 'column', gap: 'xxx-small'}, [
          Item({overflowY: 'visible'}, Flex({direction: 'row', gap: 'x-small'}, [
            Item({shouldShrink: false}, Avatar({name: (a.author && a.author.name) || 'Unknown Author'})),
            Item({shouldGrow: true, shouldShrink: true}, Flex({direction: 'column', gap: 'xxx-small'}, [
              Item({shouldShrink: true, overflowX: 'visible', overflowY: 'visible'}, Flex({direction: 'row', justifyItems: 'space-between', alignItems: 'start', gap: 'small'}, [
                Item({shouldGrow: true, shouldShrink: true}, Text({weight: 'bold', size: 'small', wrap: 'normal', color: 'primary'}, truncText(a.title, 75))),
                Item({shouldShrink: false}, btn),
              ])),
              Item({}, Text({size: 'x-small', color: 'secondary', wrap: 'break-word', attrs: {style: 'word-break: break-all;'}}, [a.author && a.author.name ? 'Sent by ' + a.author.name + ' | ' : null, friendlyDate(a.posted_at)])),
              a.course && a.course.name ? Item({}, Text({size: 'x-small', color: 'secondary', attrs: {'data-testid': 'course-name-' + a.id}}, a.course.name)) : null,
            ])),
          ])),
          Item({overflowX: 'visible', overflowY: 'visible'}, msg ? View({}, [Text({size: 'x-small'}, [truncText(msg, 120), ' '])]) : null),
          Item({overflowX: 'visible', overflowY: 'visible'}, Link({href: a.html_url}, Text({size: 'small'}, 'Read more'))),
        ]),
      ])
    }
    function render() {
      var body = null
      if (!st.loading) {
        var content = st.items.length === 0
          ? View({as: 'div', margin: 'large 0'}, [Text({color: 'secondary', size: 'medium', attrs: {'data-testid': 'no-announcements-message'}}, st.filter === 'unread' ? 'No unread announcements' : st.filter === 'read' ? 'No read announcements' : 'No recent announcements')])
          : View({as: 'div'}, [List(st.items.map(itemEl))])
        body = Flex({direction: 'column', gap: 'small'}, [
          Item({overflowX: 'visible', overflowY: 'visible'}, SimpleSelect({label: 'Read filter:', value: st.filter, size: 'small', width: '7rem', testid: 'announcement-filter-select',
            options: [{id: 'unread', value: 'unread', label: 'Unread'}, {id: 'read', value: 'read', label: 'Read'}, {id: 'all', value: 'all', label: 'All'}],
            onChange: function (v) { st.filter = v; st.page = 0; cfgSet(w.id, 'filter', v); load() }})),
          Item({overflowY: 'visible', shouldGrow: true}, content),
        ])
      }
      mount(slot, TemplateWidget({widget: w, loading: st.loading, loadingText: 'Loading announcements...', body: body,
        pagination: {current: st.page + 1, total: Math.ceil(st.total / PAGE), label: 'Announcements pagination', onChange: function (n) { st.page = n - 1; load() }}}))
    }
    render()
    return load
  }

  function PeopleWidget(w, slot) {
    var st = {course: cfgGet(w.id, 'selectedCourse', 'all'), role: cfgGet(w.id, 'selectedRole', 'all', function (v) { return ['all', 'teacher', 'ta'].indexOf(v) >= 0 }), page: 0, loading: true, list: [], total: 0}
    var PAGE = 5
    function load() {
      return gql(Q.instructors, {courseIds: st.course === 'all' ? [] : [st.course], first: PAGE, after: st.page ? btoa(String(st.page * PAGE)) : undefined, enrollmentTypes: st.role === 'all' ? undefined : st.role === 'teacher' ? ['TeacherEnrollment'] : ['TaEnrollment']}).then(function (d) {
        return later(function () {
          var c = d.courseInstructorsConnection
          st.list = c.nodes.filter(function (n) { return n.user && n.user._id && n.enrollments.length }).map(function (n) {
            return {id: n.user._id, name: n.user.name, email: n.user.email, avatar_url: n.user.avatarUrl, course_name: n.enrollments[0].course.name,
              enrollments: n.enrollments.map(function (e) { return {id: n.user._id + '-' + e.course._id, user_id: n.user._id, course_id: e.course._id, course_name: e.course.name, type: e.type} })}
          })
          st.total = c.pageInfo.totalCount || 0
          st.loading = false
          render()
        })
      })
    }
    function toggleDetails(summary, inner) {
      var id = uid('ToggleDetails')
      var content = h('div', {id: id, style: {display: 'none'}}, [View({as: 'div', css: {paddingTop: '0.5rem'}}, [inner])])
      var arrow = h('span', {'class': cls('toggleDetails__icon', {display: 'inline-flex', marginInlineEnd: '0.25rem', fontSize: '0.75rem'})}, [icon('arrow-open-end')])
      var btn = h('button', {type: 'button', 'aria-expanded': 'false', 'aria-controls': id, 'class': cls('toggleDetails__toggle', {background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: T.font, color: T.link})}, [
        h('span', {'class': cls('toggleDetails__summary', {display: 'flex', alignItems: 'center'})}, [arrow, h('span', {'class': cls('toggleDetails__summaryText', {})}, [summary])]),
      ])
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') !== 'true'
        btn.setAttribute('aria-expanded', open ? 'true' : 'false')
        content.style.display = open ? '' : 'none'
        arrow.replaceChildren(icon(open ? 'arrow-open-down' : 'arrow-open-end'))
      })
      return h('div', {'class': cls('toggleDetails', {fontFamily: T.font, fontSize: '0.875rem'})}, [btn, content])
    }
    function person(p) {
      var roleName = function (t) { return t === 'TeacherEnrollment' ? 'Teacher' : 'Teaching Assistant' }
      var details = p.enrollments.length === 1
        ? [View({as: 'div'}, [Text({size: 'small', wrap: 'break-word'}, p.course_name)]), View({as: 'div'}, [Text({size: 'small'}, roleName(p.enrollments[0].type))])]
        : [View({as: 'div', margin: 'xx-small 0 0 0'}, [toggleDetails(Text({size: 'small'}, p.enrollments.length + ' enrollments'),
            View({as: 'div', borderWidth: 'small 0 0 0', padding: 'x-small 0 0 0'}, [View({as: 'ul', margin: '0', padding: '0', css: {listStyleType: 'disc'}}, p.enrollments.map(function (e) { return h('li', {}, [Text({size: 'small', wrap: 'break-word'}, roleName(e.type) + ' in ' + e.course_name)]) }))]))])]
      return Flex({gap: 'small', padding: 'small 0', alignItems: 'start', attrs: {role: 'group', 'aria-label': p.name}}, [
        Item({}, Avatar({name: p.name, testid: 'instructor-avatar-' + p.id})),
        Item({shouldGrow: true, shouldShrink: true}, View({as: 'div'}, [Text({size: 'medium', weight: 'bold', wrap: 'break-word', lineHeight: 'condensed'}, p.name), p.email ? View({as: 'div'}, [Text({size: 'small', wrap: 'break-word'}, p.email)]) : null].concat(details))),
        Item({}, View({as: 'div', margin: '0 small'}, [IconButton({color: 'secondary', label: 'Send a message to ' + p.name, testid: 'message-button-' + p.id, icon: icon('message'),
          onClick: function () { location.href = '/conversations?user_id=' + encodeURIComponent(p.id) + '&user_name=' + encodeURIComponent(p.name) + '&compose=true' + (p.enrollments.length === 1 ? '&context_id=course_' + p.enrollments[0].course_id : '') }})])),
      ])
    }
    function render() {
      var body = null
      if (!st.loading) {
        var mobile = bp() === 'mobile'
        body = Flex({direction: 'column', height: '100%'}, [
          Flex({direction: mobile ? 'column' : 'row', wrap: 'wrap', gap: 'small'}, [
            Item({shouldGrow: true, overflowX: 'visible', overflowY: 'visible'}, SimpleSelect({label: 'Course filter:', value: st.course, options: courseOptions(), testid: 'course-filter-select', onChange: function (v) { st.course = v; st.page = 0; cfgSet(w.id, 'selectedCourse', v); load() }})),
            Item({shouldGrow: true, overflowX: 'visible', overflowY: 'visible'}, SimpleSelect({label: 'Role filter:', value: st.role, testid: 'role-filter-select',
              options: [{id: 'all', value: 'all', label: 'All Roles'}, {id: 'teacher', value: 'teacher', label: 'Teacher'}, {id: 'ta', value: 'ta', label: 'Teaching Assistant'}],
              onChange: function (v) { st.role = v; st.page = 0; cfgSet(w.id, 'selectedRole', v); load() }})),
          ]),
          Item({shouldGrow: true}, View({as: 'div', padding: 'small 0 0 0'}, [st.list.length === 0
            ? Text({color: 'secondary', attrs: {'data-testid': 'no-instructors-message'}}, 'No instructors found')
            : View({as: 'div'}, [List(st.list.map(person))])])),
        ])
      }
      mount(slot, TemplateWidget({widget: w, loading: st.loading, loadingText: 'Loading people data...', body: body,
        pagination: {current: st.page + 1, total: Math.ceil(st.total / PAGE), label: 'Instructors pagination', onChange: function (n) { st.page = n - 1; load() }}}))
    }
    render()
    return load
  }

  // To-do list (not in the default layout; added via Customize dashboard). REST: /api/v1/planner/items
  function TodoListWidget(w, slot) {
    var st = {filter: cfgGet(w.id, 'filter', 'incomplete_items', function (v) { return ['incomplete_items', 'complete_items', 'all'].indexOf(v) >= 0 }), page: 1, loading: true, items: [], last: 1}
    function load() {
      var start = new Date(NOW.getTime() - 14 * 864e5).toISOString(), end = new Date(NOW.getTime() + 365 * 864e5).toISOString()
      var url = '/api/v1/planner/items?per_page=5&order=asc&start_date=' + encodeURIComponent(start) + '&end_date=' + encodeURIComponent(end) + (st.filter === 'all' ? '' : '&filter=' + st.filter) + '&page=' + st.page
      return fetch(url, {credentials: 'same-origin', headers: {Accept: 'application/json+canvas-string-ids, application/json'}}).then(function (r) {
        var link = r.headers.get('Link') || ''
        var m = link.match(/[?&]page=(\d+)[^>]*>; rel="last"/)
        st.last = m ? +m[1] : 1
        return r.json()
      }).then(function (items) {
        // if the endpoint ignores per_page, paginate here so the widget still shows 5 per page
        if (items.length > 5) { st.last = Math.ceil(items.length / 5); items = items.slice((st.page - 1) * 5, st.page * 5) }
        return later(function () { st.items = items; st.loading = false; render() })
      })
    }
    var TYPE = {assignment: 'Assignment', quiz: 'Quiz', discussion_topic: 'Discussion', announcement: 'Announcement', wiki_page: 'Page', calendar_event: 'Event', planner_note: 'To Do'}
    function dateText(it) {
      if (!it.plannable_date) return ''
      var d = new Date(it.plannable_date)
      if (it.plannable_type === 'announcement') return 'Posted ' + d.toLocaleDateString(undefined, {timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric'})
      var ms = d - NOW, hrs = Math.floor(ms / 36e5)
      if (ms < 0) return 'Overdue'
      if (hrs < 24) return hrs === 0 ? 'Due soon' : 'Due in ' + hrs + ' hours'
      return 'Due ' + d.toLocaleDateString('en-US', {timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'})
    }
    function itemEl(it) {
      var done = it.planner_override ? it.planner_override.marked_complete : !!(it.submissions && it.submissions.submitted && !it.submissions.redo_request)
      var cid = it.course_id || it.plannable.course_id
      var overdue = it.plannable_type !== 'announcement' && it.plannable_date && new Date(it.plannable_date) < NOW
      var pts = it.plannable.points_possible
      return View({as: 'div', padding: 'small', margin: 'small 0', borderWidth: 'small', borderRadius: 'large', background: 'secondary', bgColor: '#F9FAFA', attrs: {'data-testid': 'todo-item-' + it.plannable_id, role: 'group', 'aria-label': it.plannable.title}}, [
        Flex({gap: 'small', alignItems: 'center'}, [
          Item({shouldGrow: true, shouldShrink: true}, Flex({direction: 'column', gap: 'x-small'}, [
            Item({overflowY: 'visible'}, Text({size: 'small', color: 'secondary'}, TYPE[it.plannable_type] || 'Item')),
            Item({overflowY: 'visible'}, Link({href: it.html_url, testid: 'todo-link-' + it.plannable_id}, Text({weight: 'bold', wrap: 'break-word', color: done ? 'secondary' : null}, it.plannable.title))),
            it.plannable.details ? Item({}, Text({size: 'small', color: 'secondary', wrap: 'break-word', lineHeight: 'condensed'}, it.plannable.details)) : null,
            cid && it.context_name ? Item({overflowY: 'visible'}, Link({href: '/courses/' + cid, testid: 'todo-item-course-link-' + it.plannable_id}, Text({wrap: 'break-word', size: 'small', color: 'secondary'}, it.context_name))) : null,
            Item({overflowY: 'visible'}, Text({size: 'small'}, [dateText(it) ? Text({size: 'small', color: overdue ? 'danger' : 'secondary'}, dateText(it)) : null, dateText(it) && pts > 0 ? Text({size: 'small', color: 'secondary'}, ' | ') : null, pts > 0 ? Text({size: 'small', color: 'secondary'}, pts + ' points') : null])),
          ])),
          Item({}, IconButton({color: 'secondary', label: (done ? 'Mark ' + it.plannable.title + ' as incomplete' : 'Mark ' + it.plannable.title + ' as complete'), testid: 'todo-checkbox-' + it.plannable_id,
            icon: done ? icon('check', {color: 'success'}) : icon('check-plus'),
            onClick: function () {
              var body = {plannable_type: it.plannable_type, plannable_id: it.plannable_id, marked_complete: !done}
              var req = it.planner_override
                ? window.__mockApi('/api/v1/planner/overrides/' + it.planner_override.id, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({marked_complete: !done})})
                : window.__mockApi('/api/v1/planner/overrides', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
              req.then(function (o) { it.planner_override = o; render() })
            }})),
        ]),
      ])
    }
    function render() {
      var body = null
      if (!st.loading) {
        body = View({as: 'div'}, [
          View({as: 'div', padding: 'small 0', borderWidth: '0 0 small 0'}, [SimpleSelect({label: 'Filter', value: st.filter, width: '200px', testid: 'todo-filter-select',
            options: [{id: 'incomplete', value: 'incomplete_items', label: 'Incomplete'}, {id: 'complete', value: 'complete_items', label: 'Complete'}, {id: 'all', value: 'all', label: 'All'}],
            onChange: function (v) { st.filter = v; st.page = 1; cfgSet(w.id, 'filter', v); load() }})]),
          st.items.length === 0
            ? View({as: 'div', textAlign: 'center', padding: 'large 0'}, [Text({color: 'secondary', size: 'medium', attrs: {'data-testid': 'no-todos-message'}}, 'No upcoming items')])
            : View({as: 'div'}, [List(st.items.map(itemEl))]),
        ])
      }
      mount(slot, TemplateWidget({widget: w, loading: st.loading, loadingText: 'Loading to-do items...', body: body,
        headerActions: Button({size: 'small', testid: 'new-todo-button'}, '+ New To-do'),
        pagination: {current: st.page, total: st.last, label: 'To-do list pagination', onChange: function (n) { st.page = n; load() }}}))
    }
    render()
    return load
  }

  var WIDGETS = {course_work_combined: CourseWorkCombinedWidget, course_grades: CourseGradesWidget, announcements: AnnouncementsWidget, people: PeopleWidget, todo_list: TodoListWidget}

  // ---------------------------------------------------------------- layout (WidgetGrid)
  var DEFAULT_LAYOUT = {columns: 2, widgets: [
    {id: 'course-work-combined-widget', type: 'course_work_combined', position: {col: 1, row: 1, relative: 1}, title: 'Course work'},
    {id: 'announcements-widget', type: 'announcements', position: {col: 2, row: 2, relative: 3}, title: 'Announcements'},
    {id: 'course-grades-widget', type: 'course_grades', position: {col: 1, row: 2, relative: 4}, title: 'Course grades'},
    {id: 'people-widget', type: 'people', position: {col: 2, row: 3, relative: 5}, title: 'People'},
  ]}
  state.layout = JSON.parse(JSON.stringify((PREFS.widget_dashboard_config && PREFS.widget_dashboard_config.layout) || DEFAULT_LAYOUT))
  function renumber(widgets) {
    ;[1, 2].forEach(function (col) {
      widgets.filter(function (x) { return x.position.col === col }).sort(function (a, b) { return a.position.row - b.position.row }).forEach(function (x, i) { x.position.row = i + 1 })
    })
    return widgets
  }
  function removeWidget(id) { state.layout.widgets = renumber(state.layout.widgets.filter(function (x) { return x.id !== id })); renderGrid() }
  function moveWidget(w, action) {
    var ws = state.layout.widgets
    var col = ws.filter(function (x) { return x.position.col === w.position.col }).sort(function (a, b) { return a.position.row - b.position.row })
    var i = col.indexOf(w)
    if (action === 'up' && i > 0) { var t = col[i - 1].position.row; col[i - 1].position.row = w.position.row; w.position.row = t }
    if (action === 'down' && i < col.length - 1) { var t2 = col[i + 1].position.row; col[i + 1].position.row = w.position.row; w.position.row = t2 }
    if (action === 'top') w.position.row = 0
    if (action === 'bottom') w.position.row = 99
    if (action === 'left' || action === 'right') { w.position.col = action === 'left' ? 1 : 2; w.position.row = 99 }
    renumber(ws)
    renderGrid()
  }
  function moveMenu(anchor, w) {
    closeListbox()
    var acts = [['top', 'Move to top'], ['up', 'Move up'], ['down', 'Move down'], ['bottom', 'Move to bottom'], ['left', 'Move left'], ['right', 'Move right']]
    var ul = h('ul', {role: 'menu', 'class': cls('menu', {listStyleType: 'none', margin: 0, padding: '0.375rem 0', background: '#FFFFFF', fontFamily: T.font})}, acts.map(function (a) {
      var li = h('li', {role: 'none'}, [h('span', {role: 'menuitem', tabindex: '-1', 'class': cls('menuItem', {display: 'block', padding: '0.375rem 0.75rem', cursor: 'pointer', color: T.text}, {':hover': {background: T.info, color: '#FFFFFF'}})}, a[1])])
      li.addEventListener('click', function () { closeListbox(); moveWidget(w, a[0]) })
      return li
    }))
    var r = anchor.getBoundingClientRect()
    var pop = h('span', {dir: 'ltr', 'class': cls('view-popover', {position: 'absolute', zIndex: 9999, boxShadow: SHADOW.topmost, borderRadius: '0.25rem', border: '0.0625rem solid ' + T.border, background: '#FFFFFF'}), style: {top: r.bottom + window.scrollY + 'px', left: r.left + window.scrollX + 'px'}}, [ul])
    document.body.appendChild(pop)
    openListbox = {owner: anchor, contains: function (t) { return pop.contains(t) || anchor.contains(t) }, close: function () { pop.remove() }}
  }
  function addWidgetModal(col, row) {
    var avail = [['course_work_combined', 'Course work'], ['course_grades', 'Course grades'], ['announcements', 'Announcements'], ['people', 'People'], ['todo_list', 'To-do list']]
    var mask = h('div', {'class': cls('mask', {position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center'})})
    function close() { mask.remove() }
    var body = Flex({direction: 'row', wrap: 'wrap', gap: 'small', alignItems: 'stretch'}, avail.map(function (a) {
      var on = state.layout.widgets.some(function (x) { return x.type === a[0] })
      return Item({width: 'calc(50% - 0.5rem)'}, View({as: 'div', padding: 'medium', borderWidth: 'small', borderRadius: 'large', attrs: {'data-testid': 'widget-card-' + a[0]}}, [
        Heading({level: 'h3', margin: '0 0 small'}, a[1]),
        Button({color: 'primary', disabled: on, testid: 'add-widget-button', onClick: function () {
          state.layout.widgets.forEach(function (x) { if (x.position.col === col && x.position.row >= row) x.position.row += 1 })
          var id = a[0] + '-widget-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
          state.layout.widgets.push({id: id, type: a[0], position: {col: col, row: row, relative: 0}, title: a[1]})
          renumber(state.layout.widgets)
          close(); renderGrid()
        }}, on ? 'Added' : 'Add'),
      ]))
    }))
    var dialog = View({as: 'div', background: 'primary', borderRadius: 'medium', shadow: 'topmost', width: '50rem', maxWidth: '90vw', attrs: {role: 'dialog', 'aria-label': 'Add widget', 'data-testid': 'add-widget-modal'}}, [
      View({as: 'div', padding: 'medium', borderWidth: '0 0 small 0', position: 'relative'}, [Heading({level: 'h2', testid: 'modal-heading'}, 'Add widget'),
        h('div', {style: {position: 'absolute', top: '1rem', right: '1rem'}}, [IconButton({label: 'Close', size: 'small', withBackground: false, withBorder: false, testid: 'close-button', icon: icon('x'), onClick: close})])]),
      View({as: 'div', padding: 'medium'}, [body]),
    ])
    mask.appendChild(dialog)
    document.body.appendChild(mask)
  }

  var gridHost = null
  function renderGrid() {
    if (!gridHost) return
    var b = bp(), stacked = b !== 'desktop', edit = state.editMode
    function placeholder(col, row) {
      if (!edit) return null
      return h('div', {}, [Button({display: 'block', textAlign: 'center', withBackground: false, color: 'primary', margin: 'x-small 0', testid: 'add-widget-placeholder-' + col + '-' + row, onClick: function () { addWidgetModal(col, row) }},
        Flex({direction: 'row', justifyItems: 'center', alignItems: 'center', gap: 'x-small'}, [Item({}, icon('add')), Item({}, Text({size: 'small'}, 'Add widget'))]))])
    }
    var loaders = []
    function column(col) {
      var ws = state.layout.widgets.filter(function (x) { return x.position.col === col }).sort(function (a, b2) { return a.position.row - b2.position.row })
      var kids = [placeholder(col, 1)]
      ws.forEach(function (w) {
        var slot = h('div', {'data-testid': 'widget-container-' + w.id})
        var make = WIDGETS[w.type]
        if (make) loaders.push(make(w, slot))
        else slot.appendChild(Text({color: 'danger'}, 'Unknown widget type: ' + w.type))
        kids.push(slot, placeholder(col, w.position.row + 1))
      })
      return Flex({direction: 'column', gap: 'medium', width: '100%'}, kids.length > 1 || edit ? kids : [h('div', {})])
    }
    var grid = stacked
      ? Flex({direction: 'column', gap: 'medium', width: '100%', justifyItems: 'start', alignItems: 'stretch', attrs: {'data-testid': 'widget-columns'}}, [
          Item({width: '100%', attrs: {'data-testid': 'widget-column-1-stacked'}}, column(1)),
          Item({width: '100%', attrs: {'data-testid': 'widget-column-2-stacked'}}, column(2)),
        ])
      : Flex({direction: 'row', gap: 'medium', justifyItems: 'start', alignItems: 'start', attrs: {'data-testid': 'widget-columns'}}, [
          Item({shouldGrow: true, shouldShrink: true, width: '66%', attrs: {'data-testid': 'widget-column-1'}}, column(1)),
          Item({shouldGrow: true, shouldShrink: true, width: '33%', attrs: {'data-testid': 'widget-column-2'}}, column(2)),
        ])
    gridHost.replaceChildren(View({as: 'div', padding: b === 'mobile' ? '0' : 'medium'}, [grid]))
    loaders.forEach(function (l) { l() })
  }

  // ---------------------------------------------------------------- Courses tab (canvas-lms CoursesTab.tsx -> DashboardCardBox)
  var colors = PREFS.custom_colors || {}
  var hideOverlays = !!PREFS.hide_dashcard_color_overlays
  function renderCards(cards, summaries) {
    var box = h('div', {'class': 'ic-DashboardCard__box'})
    var inner = h('div', {'class': 'ic-DashboardCard__box__container'})
    box.appendChild(inner)
    cards.forEach(function (card) {
      var color = colors[card.assetString] || '#626E7B'
      var nick = card.shortName
      var hero = h('div', {'class': 'ic-DashboardCard__header_hero', style: {backgroundColor: color}, 'aria-hidden': 'true'})
      if (card.image) {
        hero.style.opacity = hideOverlays ? 0 : 0.6
        hero = h('div', {'class': 'ic-DashboardCard__header_image', style: {backgroundImage: 'url(' + card.image + ')'}}, [hero])
      }
      hero.addEventListener('click', function () { location.href = card.href })
      var settingsBtn = h('button', {type: 'button', 'class': 'Button Button--icon-action-rev ic-DashboardCard__header-button', 'aria-expanded': 'false', 'data-popover-trigger': 'true'}, [
        h('i', {'class': 'icon-more', 'aria-hidden': 'true'}),
        h('span', {'class': 'screenreader-only', text: 'Choose a color or course nickname or move course card for ' + nick}),
      ])
      var header = h('div', {'class': 'ic-DashboardCard__header'}, [
        h('span', {'class': 'screenreader-only', text: card.image ? 'Course image for ' + nick : 'Course card color region for ' + nick}),
        hero,
        h('a', {href: card.href, 'class': 'ic-DashboardCard__link'}, [
          h('div', {'class': 'ic-DashboardCard__header_content'}, [
            h('h2', {'class': 'ic-DashboardCard__header-title ellipsis', title: card.originalName, 'data-testid': 'dashboard-card-title'}, [h('span', {style: {color: color}, text: nick})]),
            h('div', {'class': 'ic-DashboardCard__header-subtitle ellipsis', title: card.courseCode, text: card.courseCode}),
            h('div', {'class': 'ic-DashboardCard__header-term ellipsis', title: card.term || '', text: card.term || ''}),
          ]),
        ]),
        h('div', {}, [
          h('div', {'class': 'ic-DashboardCard__header-button-bg', style: {backgroundColor: color, opacity: hideOverlays ? 1 : 0}}),
          // InstUI Popover trigger, wrapped by Position (span.css-…-position) as captured live
          h('span', {'class': cls('position', {})}, [settingsBtn]),
        ]),
      ])
      var stream = summaries[card.id] || []
      var actions = h('nav', {'class': 'ic-DashboardCard__action-container', 'aria-label': 'Actions for ' + nick})
      card.links.forEach(function (link) {
        if (link.hidden) return
        var sr = link.label + ' - ' + nick
        var unread = 0
        var type = {'icon-announcement': 'Announcement', 'icon-discussion': 'DiscussionTopic'}[link.icon]
        stream.forEach(function (s) { if (s.type === type) unread = s.unread_count })
        var layout = h('div', {'class': 'ic-DashboardCard__action-layout'})
        var ic = icon(link.icon.replace('icon-', ''))
        if (ic) { ic.setAttribute('class', cls('inlineSVG-svgIcon', {fill: 'currentcolor', display: 'inline-block', verticalAlign: 'middle', width: '1em', height: '1em', fontSize: '1.125rem'})); layout.appendChild(ic) }
        if (unread > 0) layout.appendChild(h('span', {'class': 'ic-DashboardCard__action-badge'}, [h('span', {'class': 'unread_count', text: String(unread < 100 ? unread : '99+')}), h('span', {'class': 'screenreader-only', text: 'Unread'})]))
        actions.appendChild(h('a', {href: link.path, 'class': 'ic-DashboardCard__action ' + link.css_class, title: sr}, [h('span', {'class': 'screenreader-only', text: sr}), layout]))
      })
      inner.appendChild(h('div', {'class': 'ic-DashboardCard', style: {opacity: 1}, 'aria-label': card.originalName, 'data-testid': 'draggable-card', draggable: 'true'}, [header, actions]))
    })
    return box
  }
  var coursesLoaded = false
  var coursesHost = null
  function fetchCards() {
    return fetch('/api/v1/dashboard/dashboard_cards', {credentials: 'same-origin'}).then(function (r) { return r.json() }).then(function (cards) {
      // CourseActivitySummaryStore: one summary request per card
      return Promise.all(cards.map(function (c) { return window.__mockApi('/api/v1/courses/' + c.id + '/activity_stream/summary').then(function (s) { return [String(c.id), s] }, function () { return [String(c.id), []] }) })).then(function (pairs) {
        var sums = {}
        pairs.forEach(function (p) { sums[p[0]] = p[1] })
        cards.forEach(function (c) { sums[c.id] = sums[String(c.id)] })
        return {cards: cards, sums: sums}
      })
    })
  }
  function showCards(host, data) {
    if (!data.cards.length) {
      host.replaceChildren(View({as: 'div', padding: 'medium', attrs: {'data-testid': 'courses-tab-content'}}, [Text({attrs: {'data-testid': 'no-courses-message'}}, "You don't have any courses yet")]))
      return
    }
    var existing = host.querySelector && host.querySelector('[data-testid=courses-tab-content] .ic-DashboardCard__box')
    if (existing) { existing.replaceWith(renderCards(data.cards, data.sums)); return } // re-render in place (React reconciles the box)
    host.replaceChildren(View({as: 'div', padding: 'medium', attrs: {'data-testid': 'courses-tab-content'}}, [
      View({as: 'div', margin: 'medium 0 0'}, [h('div', {}, [renderCards(data.cards, data.sums)])]),
    ]))
  }
  function loadCoursesTab(host) {
    if (coursesLoaded) return
    coursesLoaded = true
    coursesHost = host
    host.replaceChildren(View({as: 'div', padding: 'medium', attrs: {'data-testid': 'courses-tab-content'}}, [
      Heading({level: 'h2', margin: '0 0 medium', testid: 'courses-tab-heading'}, 'Courses'),
      View({as: 'div', textAlign: 'center', margin: 'large 0'}, [Spinner('Loading courses', 'large')]),
    ]))
    return fetchCards().then(function (data) { return later(function () { if (coursesHost === host) showCards(host, data) }) })
  }
  // Test hook (same contract as the classic dashboard's): refetch dashboard_cards and re-render the
  // Courses-tab cards in the server's order, replacing the card nodes. Resolves when done.
  window.__mockRerenderCards = function () {
    return fetchCards().then(function (data) { if (coursesHost) showCards(coursesHost, data) })
  }

  // ---------------------------------------------------------------- tabs (Tabs / Tabs.Tab / Tabs.Panel)
  function Tabs() {
    var tabs = [{id: 'dashboard', label: 'Dashboard'}, {id: 'courses', label: 'Courses'}]
    var tabEls = {}, panelEls = {}
    var tabList = View({as: 'div', label: 'tabs__tabList', css: {display: 'flex', width: '100%', flexFlow: 'row nowrap', alignItems: 'flex-end', borderBottom: '0.0625rem solid ' + T.border, background: '#FFFFFF'}, attrs: {role: 'tablist'}})
    var panels = h('div', {'class': cls('tabs__panelsContainer', {flexShrink: 0, flexGrow: 1, display: 'flex', flexDirection: 'column'})})
    tabs.forEach(function (t) {
      var tabCss = function (sel) {
        return cls('view-tab', {boxSizing: 'border-box', fontFamily: T.font, maxWidth: '100%', overflow: 'visible', position: 'relative', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', fontSize: '1rem', lineHeight: 1.5, padding: '0.75rem 1.25rem', color: T.text, fontWeight: 400, borderBottom: '0.25rem solid ' + (sel ? T.brand : 'transparent'), marginBottom: '-0.0625rem'}, {':hover': {borderBottomColor: sel ? T.brand : T.border}})
      }
      var tab = h('div', {role: 'tab', id: 'tab-' + t.id, 'aria-controls': t.id}, [h('span', {'data-testid': 'tab-' + t.id}, t.label)])
      tab.__css = tabCss
      tabList.appendChild(tab)
      tabEls[t.id] = tab
      var panel = h('div', {role: 'tabpanel', id: t.id, 'aria-labelledby': 'tab-' + t.id, 'class': cls('panel', {boxSizing: 'border-box', flexShrink: 0, flexGrow: 1, fontFamily: T.font, fontSize: '1rem', color: T.text, background: '#FFFFFF', borderWidth: 0})})
      panelEls[t.id] = panel
      panels.appendChild(panel)
      tab.addEventListener('click', function () { if (state.tab !== t.id) { state.tab = t.id; select(); gql(Q.tab, {tab: t.id}).catch(function () {}) } })
      tab.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var o = t.id === 'dashboard' ? 'courses' : 'dashboard'; state.tab = o; select(); tabEls[o].focus(); gql(Q.tab, {tab: o}).catch(function () {}) }
      })
    })
    function select() {
      tabs.forEach(function (t) {
        var sel = state.tab === t.id
        var tab = tabEls[t.id], panel = panelEls[t.id]
        tab.setAttribute('class', tab.__css(sel))
        if (sel) { tab.setAttribute('aria-selected', 'true'); tab.setAttribute('tabindex', '0'); panel.removeAttribute('aria-hidden') }
        else { tab.removeAttribute('aria-selected'); tab.removeAttribute('tabindex'); panel.setAttribute('aria-hidden', 'true') }
        panel.style.display = sel ? '' : 'none'
        if (!sel) { panel.replaceChildren(); if (t.id === 'dashboard') gridHost = null; if (t.id === 'courses') { coursesLoaded = false; coursesHost = null } return } // Panel unmountOnExit
        if (panel.firstChild) return
        var content = View({as: 'div', label: 'panel__content', className: 'transition--fade-entered', padding: 'small', css: {boxSizing: 'border-box', padding: '0.75rem', textAlign: 'start'}})
        panel.appendChild(content)
        if (t.id === 'dashboard') {
          var tabContent = View({as: 'div', padding: 'medium 0 0 0', attrs: {'data-testid': 'dashboard-tab-content'}})
          content.appendChild(tabContent)
          gridHost = tabContent
          renderGrid()
        } else {
          loadCoursesTab(content)
        }
      })
    }
    var root = View({as: 'div', attrs: {'data-testid': 'dashboard-tabs'}}, [
      View({as: 'div', label: 'tabs__container', css: {display: 'flex', flexDirection: 'column', width: '100%', height: '100%'}, attrs: {'data-cid': 'Tabs'}}, [
        View({as: 'div', position: 'relative', borderRadius: 'medium', label: 'tabs', css: {flexShrink: 0, flexGrow: 0, display: 'flex'}}, [tabList]),
        panels,
      ]),
    ])
    root.__select = select
    return root
  }

  // ---------------------------------------------------------------- page shell (WidgetDashboardContainer)
  function renderApp() {
    var content = document.getElementById('content')
    var isDark = !!FEATURES.widget_dashboard_dark_mode && !!ENV.WIDGET_DASHBOARD_DARK_MODE
    var desktop = bp() === 'desktop'
    var mobile = bp() === 'mobile'
    var name = ENV.current_user && ENV.current_user.display_name
    var actions = []
    if (ENV.widget_dashboard_overridable === true) {
      actions.push(Item({}, Button({testid: 'switch-to-old-dashboard-button', onClick: function (e) {
        var b = e.currentTarget; b.setAttribute('disabled', '')
        window.__mockApi('/api/v1/users/' + USER_ID + '/settings', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({widget_dashboard_user_preference: false})}).then(function (j) {
          if (!j || j.widget_dashboard_user_preference !== false) throw new Error('Dashboard preference was not updated correctly')
          document.cookie = 'mock_dashboard_view=cards; path=/'
          location.reload()
        }).catch(function () { b.removeAttribute('disabled') })
      }}, 'Switch to old dashboard view')))
    }
    if (FEATURES.widget_dashboard_dark_mode) {
      actions.push(Item({}, Button({testid: isDark ? 'dashboard-darkmode-toggle-on' : 'dashboard-darkmode-toggle-off', onClick: function () {
        window.__mockApi('/api/v1/users/' + USER_ID + '/settings', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({widget_dashboard_dark_mode: !isDark})}).then(function (j) {
          ENV.WIDGET_DASHBOARD_DARK_MODE = !!j.widget_dashboard_dark_mode; renderApp()
        })
      }}, isDark ? 'Switch to light mode' : 'Switch to dark mode')))
    }
    if (desktop) {
      if (state.editMode) {
        actions.push(Item({}, Button({margin: '0 small 0 0', testid: 'cancel-customize-button', onClick: function () { state.editMode = false; state.layout = state.savedLayout; renderApp() }}, 'Cancel')))
        actions.push(Item({}, Button({color: 'primary', testid: 'save-customize-button', onClick: function () {
          var layout = JSON.parse(JSON.stringify(state.layout))
          gql(Q.layout, {layout: JSON.stringify(layout)}).then(function () { state.editMode = false; renderApp() })
        }}, 'Save changes')))
      } else {
        actions.push(Item({}, Button({icon: 'configure', withBackground: false, color: 'primary', testid: 'customize-dashboard-button', onClick: function () { state.savedLayout = JSON.parse(JSON.stringify(state.layout)); state.editMode = true; renderApp() }}, 'Customize dashboard')))
      }
    }
    var header = Flex({margin: '0 0 medium', alignItems: 'center'}, [Item({shouldGrow: true}, Flex({gap: 'small', direction: mobile ? 'column' : 'row', alignItems: 'center', wrap: 'wrap'}, [
      Item({shouldGrow: true}, Heading({level: 'h1', margin: '0', testid: 'dashboard-heading', color: isDark ? 'primary-inverse' : null}, name ? 'Hello, ' + name + '!' : 'Dashboard')),
    ].concat(actions)))])
    var tabs = Tabs()
    var shell = View({as: 'div', background: isDark ? null : 'primary'}, [header, tabs])
    var darkRoot = h('div', {'data-widget-dashboard-dark-root': ''}, [shell])
    var existingDark = document.getElementById('widget-dashboard-dark-mode')
    if (existingDark) existingDark.remove()
    document.body.style.backgroundColor = ''
    document.documentElement.style.backgroundColor = ''
    darkRoot.style.backgroundColor = ''
    if (isDark) {
      var D = {pageBackground: '#1B2330', cardBackground: '#1F2D3D', cardSecondary: '#253443', textPrimary: '#FFFFFF', textLink: '#5A9FD4', inputBackground: '#253443', inputBorder: '#4A5B68'}
      document.body.style.backgroundColor = D.pageBackground
      document.documentElement.style.backgroundColor = D.pageBackground
      darkRoot.style.backgroundColor = D.pageBackground
      var r = '[data-widget-dashboard-dark-root]'
      document.head.appendChild(h('style', {id: 'widget-dashboard-dark-mode'}, r + ' [class$="-view"],' + r + ' [class*="-view "],' + r + ' [class*="-view-"],' + r + ' [class$="-heading"],' + r + ' [class*="-heading "],' + r + ' [class*="-toggleDetails__summary"],' + r + ' [class*="-list__item"],' + r + ' [class*="-listItem"],' + r + ' [class*="-select"]{color:' + D.textPrimary + ' !important}' +
        r + ' [class*="-textInput__facade"]{background:' + D.inputBackground + ' !important;border-color:' + D.inputBorder + ' !important;color:' + D.textPrimary + ' !important}' + r + ' input[class*="-textInput__input"]{color:' + D.textPrimary + ' !important}' +
        r + ' [class*="-avatar__initials"]{background:' + D.cardSecondary + ' !important}' + r + ' [class*="-link"] a,' + r + ' a[class*="-link"]{color:' + D.textLink + ' !important}' +
        r + ' section[data-testid^="widget-"]{background:' + D.cardBackground + ' !important}' + r + ' [role=tablist],' + r + ' [role=tabpanel]{background:' + D.pageBackground + ' !important}'))
    }
    // ErrorBoundary/Responsive wrapper > dark root > View (live: #content > div > div > div.css-…-view)
    content.replaceChildren(h('div', {}, [darkRoot]))
    tabs.__select()
  }

  var lastBp = bp()
  window.addEventListener('resize', function () {
    var b = bp()
    if (b !== lastBp) { lastBp = b; closeListbox(); renderApp() }
  })

  later(function () {
    gql(Q.notifications, {}).catch(function () {})
    renderApp()
  })
})()
