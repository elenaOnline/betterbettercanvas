// app/views/layouts/application.html.erb + _head.html.erb + shared/_new_nav_header.html.erb,
// rendered for a signed-in the pilot school student. See README "Provenance" for line-level notes.
import fs from 'node:fs'
import path from 'node:path'
import {ROOT, esc, html, raw, navSvg, json} from '../lib/html.mjs'
import {courseTabs} from '../api/serializers.mjs'
import {nickname, colorOf, dashboardCourses} from '../data/state.mjs'

// InstUI's runtime CSS. Production Canvas never links it: InstUI (emotion, in
// "speedy" mode) inserts each rule through CSSOM into an empty-looking
// <style data-emotion="css">, which is what extensions see and what b²c's
// page-world palette layer rewrites. Emulate exactly that path rather than
// a static <link>, so tests and renders take the production route.
let SHIM = null
function instuiEmotion() {
  SHIM ??= fs.readFileSync(path.join(ROOT, 'mock-assets/instui-shim.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const js = JSON.stringify(SHIM).replace(/</g, '\\u003c')
  return `  <style data-emotion="css" data-s=""></style>
  <script>(function () { var el = document.currentScript.previousElementSibling, t = new CSSStyleSheet(); t.replaceSync(${js}); for (var i = 0; i < t.cssRules.length; i++) { try { el.sheet.insertRule(t.cssRules[i].cssText, el.sheet.cssRules.length) } catch (e) {} } })()</script>`
}

// The captured live ENV (vendor-live/, not redistributable) when present;
// otherwise a sanitised generic copy (data/base-ENV.json) so the mock runs
// standalone, e.g. in the public repo.
const LIVE_ENV_FILE = path.join(ROOT, 'vendor-live/login-ENV.json')
const LIVE_ENV = JSON.parse(fs.readFileSync(fs.existsSync(LIVE_ENV_FILE) ? LIVE_ENV_FILE : path.join(ROOT, 'data/base-ENV.json'), 'utf8'))
const BRAND_MD5 = LIVE_ENV.active_brand_config.md5
const BRAND = `/dist/brandable_css/${BRAND_MD5}/variables-9dec371ad57e3dd0396f0b2eddb63479`
// Canvas's always-on bundles: the captured production files when vendor-live/
// is present, else the same bundles compiled from canvas-lms source
// (vendor-built/, tools/vendor-build.mjs), so the mock runs standalone.
const HAS_LIVE = fs.existsSync(path.join(ROOT, 'vendor-live/dist/brandable_css/new_styles_normal_contrast/bundles/common-701cbe13bb.css'))
const COMMON = HAS_LIVE ? '/dist/brandable_css/new_styles_normal_contrast/bundles/common-701cbe13bb.css' : '/dist/brandable_css/new_styles_normal_contrast/bundles/common-mock.css'
const FONTS = HAS_LIVE ? '/dist/brandable_css/no_variables/bundles/fonts-eb4a10fb18.css' : '/dist/brandable_css/new_styles_normal_contrast/bundles/fonts-mock.css'

// mock-built page bundles keep the production URL shape; "mock" marks them as not from the CDN
export const bundleUrl = b => `/dist/brandable_css/new_styles_normal_contrast/bundles/${b}-mock.css`

export function baseEnv(S, ctx, extra = {}) {
  const u = S.user
  return {
    ASSET_HOST: LIVE_ENV.ASSET_HOST,
    active_brand_config_json_url: LIVE_ENV.active_brand_config_json_url,
    active_brand_config: LIVE_ENV.active_brand_config,
    confetti_branding_enabled: false,
    url_to_what_gets_loaded_inside_the_tinymce_editor_css: LIVE_ENV.url_to_what_gets_loaded_inside_the_tinymce_editor_css,
    url_for_high_contrast_tinymce_editor_css: LIVE_ENV.url_for_high_contrast_tinymce_editor_css,
    current_user_id: u.id,
    current_user_global_id: `2008300000${u.id.padStart(8, '0')}`,
    current_user_uuid: 'mockUserUuid4217733aaaaaaaaaaaaaaaaaaaaa',
    current_user_usage_metrics_id: 'mock-usage-metrics-id',
    current_user_roles: ['user', 'student'],
    current_user_granular_roles: ['student'],
    current_user_is_student: true,
    current_user_types: [],
    current_user_disabled_inbox: false,
    current_user_visited_tabs: null,
    discussions_reporting: true,
    files_domain: LIVE_ENV.files_domain,
    group_information: null,
    DOMAIN_ROOT_ACCOUNT_ID: LIVE_ENV.DOMAIN_ROOT_ACCOUNT_ID,
    DOMAIN_ROOT_ACCOUNT_UUID: LIVE_ENV.DOMAIN_ROOT_ACCOUNT_UUID,
    k12: false,
    help_link_name: LIVE_ENV.help_link_name,
    help_link_icon: LIVE_ENV.help_link_icon,
    use_high_contrast: false,
    auto_show_cc: false,
    disable_celebrations: false,
    disable_keyboard_shortcuts: false,
    LTI_LAUNCH_FRAME_ALLOWANCES: LIVE_ENV.LTI_LAUNCH_FRAME_ALLOWANCES,
    DEEP_LINKING_POST_MESSAGE_ORIGIN: LIVE_ENV.DEEP_LINKING_POST_MESSAGE_ORIGIN,
    comment_library_suggestions_enabled: false,
    SETTINGS: {...LIVE_ENV.SETTINGS, collapse_global_nav: false},
    RAILS_ENVIRONMENT: 'Production',
    DIRECT_SHARE_ENABLED: false,
    CAN_VIEW_CONTENT_SHARES: false,
    FEATURES: LIVE_ENV.FEATURES,
    current_user: {id: u.id, anonymous_id: '2j1', display_name: u.short_name, avatar_image_url: u.avatar_url, html_url: `https://canvas.example.edu/about/${u.id}`, pronouns: null, fake_student: false, avatar_is_fallback: true},
    page_view_update_url: `/page_views/mock-${Date.now()}`,
    IS_LARGE_ROSTER: false,
    TIMEZONE: 'America/Los_Angeles',
    CONTEXT_TIMEZONE: ctx.course ? 'America/Los_Angeles' : null,
    LOCALES: ['en'],
    BIGEASY_LOCALE: 'en_US',
    FULLCALENDAR_LOCALE: 'en',
    MOMENT_LOCALE: 'en',
    rce_auto_save_max_age_ms: 86400000,
    K5_USER: false,
    USE_CLASSIC_FONT: false,
    K5_HOMEROOM_COURSE: false,
    K5_SUBJECT_COURSE: false,
    LOCALE_TRANSLATION_FILE: LIVE_ENV.LOCALE_TRANSLATION_FILE,
    ACCOUNT_ID: '1',
    horizon_course: false,
    use_dyslexic_font: false,
    notices: [],
    active_context_tab: ctx.activeTab || null,
    ...(ctx.course ? {context_asset_string: `course_${ctx.course.id}`, COURSE_ID: ctx.course.id} : {context_asset_string: `user_${u.id}`}),
    ...extra,
  }
}

function navItem({id, href, text, icon, active, role = 'button', badge = false, li = 'menu-item ic-app-header__menu-list-item'}) {
  return `
      <li class="${li}${active ? ' ic-app-header__menu-list-item--active' : ''}">
        <a id="${id}"${role ? ` role="${role}"` : ''} href="${href}" class="ic-app-header__menu-list-link"${active ? ' aria-current="page"' : ''}>
          <div class="menu-item-icon-container"${badge ? '' : ' aria-hidden="true"'}>
            ${badge ? `<span aria-hidden="true">${icon}</span>\n            <span class="menu-item__badge"></span>` : icon}
          </div>
          <div class="menu-item__text">
            ${esc(text)}
          </div>
        </a>
      </li>`
}

export function globalNav(S, ctx) {
  const p = ctx.path
  const act = pre => p === pre || p.startsWith(pre + '/')
  const crumbs = ctx.crumbs || []
  const contextCrumb = crumbs.length > 1 ? crumbs[1] : null
  return `<header id="mobile-header" class="no-print">
  <button type="button" class="Button Button--icon-action-rev Button--large mobile-header-hamburger">
    <i class="icon-solid icon-hamburger"></i>
    <span id="mobileHeaderInboxUnreadBadge" class="menu-item__badge" style="min-width: 0; top: 12px; height: 12px; right: 6px; display:none;"></span>
    <span class="screenreader-only">Global Navigation Menu</span>
  </button>
  <div class="mobile-header-space"></div>
  ${contextCrumb
    ? `<a class="mobile-header-title expandable" href="${esc(contextCrumb[1])}" role="button" aria-controls="mobileContextNavContainer">
      <div>${esc(contextCrumb[0])}</div>${crumbs.length > 2 ? `\n      <div>${esc(crumbs[crumbs.length - 1][0])}</div>` : ''}
    </a>`
    : `<span class="mobile-header-title">${esc(ctx.title || 'Dashboard')}</span>`}
  <div id="nutrition_facts_mobile_container"></div>
  <div class="mobile-header-space"></div>
  ${contextCrumb
    ? `<button type="button" class="Button Button--icon-action-rev Button--large mobile-header-arrow" aria-label="Navigation Menu">
      <i class="icon-arrow-open-down" id="mobileHeaderArrowIcon"></i>
    </button>`
    : '<div class="mobile-header-space"></div>'}
</header>
<nav id="mobileContextNavContainer"></nav>
<header id="header" class="ic-app-header no-print " aria-label="Global Header">
  <a href="#content" id="skip_navigation_link">Skip To Content</a>
  <div role="region" class="ic-app-header__main-navigation" aria-label="Global Navigation">
      <div class="ic-app-header__logomark-container">
        <a href="https://canvas.example.edu/" class="ic-app-header__logomark">
          <span class="screenreader-only">Dashboard</span>
        </a>
      </div>
    <ul id="menu" class="ic-app-header__menu-list">
      <li class="menu-item ic-app-header__menu-list-item ${act('/profile') ? ' ic-app-header__menu-list-item--active' : ''}">
        <a id="global_nav_profile_link" role="button" href="/profile/settings" class="ic-app-header__menu-list-link">
          <div class="menu-item-icon-container">
            <div aria-hidden="true" class="fs-exclude ic-avatar ">
              <img src="${esc(S.user.avatar_url)}" alt="${esc(S.user.short_name)}" />
            </div>
            <span class="menu-item__badge"></span>
          </div>
          <div class="menu-item__text">
            Account
          </div>
        </a>
      </li>${navItem({id: 'global_nav_dashboard_link', href: 'https://canvas.example.edu/', text: 'Dashboard', icon: navSvg('svg_icon_dashboard'), active: p === '/', role: null, li: 'ic-app-header__menu-list-item'})}${navItem({id: 'global_nav_courses_link', href: '/courses', text: 'Courses', icon: navSvg('svg_icon_courses_new_styles'), active: act('/courses')})}${navItem({id: 'global_nav_calendar_link', href: '/calendar', text: 'Calendar', icon: navSvg('svg_icon_calendar_new_styles'), active: act('/calendar'), role: null})}
      <li class="menu-item ic-app-header__menu-list-item ${act('/conversations') ? ' ic-app-header__menu-list-item--active' : ''}">
      <!-- TODO: Add back global search when available -->
        <a id="global_nav_conversations_link" href="/conversations" class="ic-app-header__menu-list-link">
          <div class="menu-item-icon-container">
            <span aria-hidden="true">${navSvg('svg_icon_inbox')}</span>
            <span class="menu-item__badge"></span>
          </div>
          <div class="menu-item__text">
            Inbox
          </div>
        </a>
      </li>${navItem({id: 'global_nav_history_link', href: '#', text: 'History', icon: navSvg('svg_icon_history')})}
      <li class="globalNavExternalTool menu-item ic-app-header__menu-list-item">
        <a class="ic-app-header__menu-list-link" href="/accounts/1/external_tools/41005?launch_type=global_navigation">
          <div class="menu-item-icon-container" aria-hidden="true">
            <svg version="1.1" class="ic-icon-svg ic-icon-svg--lti menu-item__icon" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 64 64"><path d="M32,4C16.5,4,4,16.5,4,32s12.5,28,28,28s28-12.5,28-28S47.5,4,32,4z M32,52c-11,0-20-9-20-20s9-20,20-20s20,9,20,20S43,52,32,52z"/></svg>
          </div>
          <div class="menu-item__text">
            Studio
          </div>
        </a>
      </li>
      <li class="ic-app-header__menu-list-item">
        <a id="global_nav_help_link" role="button" class="ic-app-header__menu-list-link" data-track-category="help system" data-track-label="help button" href="https://help.instructure.com/">
          <div class="menu-item-icon-container" role="presentation">
            ${navSvg('svg_icon_help')}
            <span class="menu-item__badge"></span>
          </div>
          <div class="menu-item__text">
            Help
          </div>
</a>      </li>
    </ul>
  </div>
  <div class="ic-app-header__secondary-navigation">
    <ul class="ic-app-header__menu-list">
      <li class="menu-item ic-app-header__menu-list-item">
        <a
          id="primaryNavToggle"
          role="button"
          href="#"
          class="ic-app-header__menu-list-link ic-app-header__menu-list-link--nav-toggle"
          aria-label="Minimize global navigation"
          title="Minimize global navigation"
        >
          <div class="menu-item-icon-container" aria-hidden="true">
            ${navSvg('svg_icon_navtoggle')}
          </div>
        </a>
      </li>
    </ul>
  </div>
  <div id="global_nav_tray_container"></div>
  <div id="global_nav_tour"></div>
</header>`
}

export function sectionTabs(S, course, activeTab) {
  const tabs = courseTabs(course)
  return `<nav role="navigation" aria-label="Courses Navigation Menu"><ul id="section-tabs">${tabs
    .map(t => {
      const active = t.id === activeTab
      const idAttr = t.id.startsWith('context_external_tool') ? `${t.id}-link` : `${t.label.toLowerCase().replace(/ /g, '-')}-link`
      return `<li class="section"><a id="${idAttr}" href="${t.path}"${active ? ' aria-current="page"' : ''} class="${t.css_class}${active ? ' active' : ''}"${t.id.startsWith('context_external_tool') ? ' target="_blank"' : ''}>${esc(t.label)}</a></li>`
    })
    .join('')}</ul></nav>`
}

function crumbsHtml(crumbs) {
  // gems/canvas_crummy/lib/canvas_crummy/view_methods.rb#render_crumbs (+ #crumb_to_html)
  return `<nav id="breadcrumbs" role="navigation" aria-label="breadcrumbs"><ol>${crumbs
    .map((c, i) => {
      const cur = i === crumbs.length - 1 ? ' aria-current="page"' : ''
      const name = i === 0 ? '<i class="icon-home" title="My Dashboard">\n  <span class="screenreader-only">My Dashboard</span>\n</i>\n' : esc(c[0])
      return `<li${cur}><a href="${esc(c[1])}"><span class="ellipsible">${name}</span></a></li>`
    })
    .join('')}</ol></nav>`
}

const FOOTER = `<footer role="contentinfo" id="footer" class="ic-app-footer">
  <a href="http://www.instructure.com" class="footer-logo ic-app-footer__logo-link">
    <span class="screenreader-only">
      By Instructure
    </span>
  </a>
  <div id="footer-links" class="ic-app-footer__links">
    <a href="https://www.instructure.com/policies/product-privacy-policy" class="privacy_policy_link">Privacy Policy</a>
    <a href="https://www.instructure.com/policies/canvas-lms-cookie-notice">Cookie Notice</a>
    <a href="https://www.instructure.com/policies/acceptable-use">Acceptable Use Policy</a>
    <a href="https://facebook.com/instructure" class="icon-facebook-boxed"><span class="screenreader-only">Facebook</span></a>
    <a href="https://x.com/instructure" class="icon-twitter"><span class="screenreader-only">X.com</span></a>
  </div>
</footer>`

// Behaviour Canvas' own JS would add that tests rely on: nav badges filled from the API,
// the course-menu toggle, and the global-nav minimise toggle. Kept tiny on purpose.
const CHROME_JS = fs.readFileSync(path.join(ROOT, 'pages/client/chrome.js'), 'utf8')

/**
 * page: {title, content, rightSide?, course?, activeTab?, crumbs?, cssBundles?, bodyClass?,
 *        env?, scripts?, showFooter?, headers? (false = no global nav), padless?, noLeftSide?}
 */
export function renderPage(S, ctx, page) {
  const course = page.course || null
  const crumbs = page.crumbs || (course ? [['Dashboard', '/'], [course.course_code, `/courses/${course.id}`]] : [])
  ctx = {...ctx, course, crumbs, activeTab: page.activeTab, title: page.title}
  // page.leftSide: HTML for a non-course #left-side (e.g. the account nav on /profile/settings)
  const showLeft = (!!course || !!page.leftSide) && !page.noLeftSide
  const hasRight = page.rightSide != null && String(page.rightSide).trim() !== ''
  const body = [
    ...(page.bodyClass || []),
    showLeft ? 'with-left-side' : null,
    showLeft ? 'course-menu-expanded' : null,
    hasRight ? 'with-right-side' : null,
    page.padless ? 'padless-content' : null,
    page.activeTab || null,
    'primary-nav-expanded',
    'full-width',
    `context-${course ? `course_${course.id}` : `user_${S.user.id}`}`,
    'responsive_student_grades_page',
  ].filter(Boolean)
  const env = baseEnv(S, ctx, page.env || {})
  const css = (page.cssBundles || []).map(b => `  <link rel="stylesheet" href="${bundleUrl(b)}" media="screen" />`).join('\n')
  const scripts = (page.scripts || []).map(s => `<script>\n${s}\n</script>`).join('\n')
  const leftSide = showLeft
    ? page.leftSide && /id="left-side"/.test(page.leftSide)
      ? page.leftSide
      : `<div id="left-side"
          class="ic-app-course-menu ic-sticky-on list-view"
          style="display: block"
          >
          <div id="sticky-container" class="ic-sticky-frame">
            ${page.leftSide || `<span id="section-tabs-header-subtitle" class="ellipsis">${esc(course.term?.name || '')}</span>
            ${sectionTabs(S, course, page.activeTab)}`}
          </div>
        </div>`
    : ''
  const crumbBar = crumbs.length > 1
    ? `<div class="ic-app-nav-toggle-and-crumbs no-print">
          ${showLeft ? `<button type="button" id="courseMenuToggle" class="Button Button--link ic-app-course-nav-toggle" aria-live="polite" aria-label="${course ? 'Hide Courses Navigation Menu' : ctx.path.startsWith('/profile') ? 'Hide Account Navigation Menu' : 'Hide Navigation Menu'}">
              <i class="icon-hamburger" aria-hidden="true"></i>
            </button>` : ''}
          <div class="ic-app-crumbs">
              ${crumbsHtml(crumbs)}
          </div>
          <div id="nutrition_facts_container"></div>
          <div class="right-of-crumbs right-of-crumbs-no-reverse">
            <div id="ai-information-mount"></div>
          </div>
        </div>`
    : ''
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#213921">
  <meta name="robots" content="noindex,nofollow" />
  <meta name="apple-itunes-app" content="app-id=480883488"><link rel="manifest" href="/web-app-manifest/manifest.json">
  <meta name="mock-canvas" content="scenario=${esc(S.name)}; now=${esc(S.now.toISOString())}">
  <title>${esc(page.title)}</title>

  <link rel="preload" href="/dist/fonts/lato/extended/Lato-Regular-bd03a2cc27.woff2" as="font" type="font/woff2" crossorigin="anonymous">
  <link rel="preload" href="/dist/fonts/lato/extended/Lato-Bold-cccb897485.woff2" as="font" type="font/woff2" crossorigin="anonymous">
  <link rel="preload" href="/dist/fonts/lato/extended/Lato-Italic-4eb103b4d1.woff2" as="font" type="font/woff2" crossorigin="anonymous">
  <link rel="stylesheet" href="${FONTS}" media="screen" />
  <link rel="stylesheet" href="${BRAND}.css" media="all" />
  <link rel="stylesheet" href="${COMMON}" media="all" />
${css}
${instuiEmotion()}
  <link rel="apple-touch-icon" href="/mock-assets/school/295-school_logo.png" />
  <link rel="icon" type="image/x-icon" href="/mock-assets/school/305-school_logo.png" />
  <script>if (navigator.userAgent.match(/(MSIE|Trident\\/)/)) location.replace('/ie-is-not-supported.html')</script>
  <script>
    INST = {"environment":"production","logPageViews":true,"editorButtons":[]};
    ENV = ${json(env)};
  </script>
  <script type="text/javascript">
    window.CANVAS_COOKIE_CONSENT_STATE = false;
    window.CANVAS_FUNCTIONAL_COOKIE_CONSENT_STATE = true;
  </script>
  <script src="${BRAND}.js" defer="defer"></script>
</head>

<body class="${body.join(' ')}">
<div id="flash_message_holder"></div>
<div id="flash_screenreader_holder" role="alert" aria-live="assertive" aria-relevant="additions text" class="screenreader-only" aria-atomic="false"></div>
<div id="application" class="ic-app ">
  ${page.headers === false ? '' : globalNav(S, ctx)}
  <div id="instructure_ajax_error_box">
    <div style="text-align: right; background-color: #fff;"><a href="#" class="close_instructure_ajax_error_box_link">Close</a></div>
    <iframe id="instructure_ajax_error_result" src="about:blank" style="border: 0;" title="Error"></iframe>
  </div>
  <div id="wrapper" class="ic-Layout-wrapper">
        ${crumbBar}
    <div id="main" class="ic-Layout-columns">
        <div class="ic-Layout-watermark" aria-hidden="true"></div>
        ${leftSide}
      <div id="not_right_side" class="ic-app-main-content">
        <div id="content-wrapper" class="ic-Layout-contentWrapper">
          <div id="content" class="ic-Layout-contentMain" role="main">
${page.content}
          </div>
        </div>
        <div id="right-side-wrapper" class="ic-app-main-content__secondary">
          <aside id="right-side">
${hasRight ? page.rightSide : ''}
          </aside>
        </div>
      </div>
    </div>
    ${page.showFooter ? FOOTER : ''}
  </div>
  <div style="display:none;"><!-- Everything inside of this should always stay hidden -->
      <div id="page_view_id">mock-page-view</div>
  </div>
  <div id='aria_alerts' class='hide-text affix' role="alert" aria-live="assertive"></div>
  <div id='StudentTray__Container'></div>
  <div id="react-router-portals"></div>
<script>
${CHROME_JS}
</script>
${scripts}
</div> <!-- #application -->
<div id="nav-tray-portal" style="position: relative; z-index: 99;"></div>
</body>
</html>
`
}

export {nickname, colorOf, dashboardCourses, html, raw, esc}
