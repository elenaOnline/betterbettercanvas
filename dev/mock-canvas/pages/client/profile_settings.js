// mock-canvas: /profile/settings behaviour.
// 1. Account navigation into #left-side (synchronous, before DOMContentLoaded). Production renders
//    this server-side (layouts/application.html.erb #left-side with the UserProfile #section-tabs,
//    body.with-left-side.course-menu-expanded, and #courseMenuToggle in the crumb bar). pages/layout.mjs
//    only does that for courses today, so the page ships the markup in <template id="mock-account-nav">
//    and this script puts it where production has it. It does nothing if #left-side already exists.
// 2. "Edit Settings" / Cancel, after ui/features/profile/jquery/index.jsx.
(function () {
  var tpl = document.getElementById('mock-account-nav')
  if (tpl && !document.getElementById('left-side')) {
    var left = tpl.content.querySelector('#left-side')
    var main = document.getElementById('main')
    var notRight = document.getElementById('not_right_side')
    if (left && main && notRight) {
      main.insertBefore(document.importNode(left, true), notRight)
      document.body.classList.add('with-left-side', 'course-menu-expanded')
      var bar = document.querySelector('.ic-app-nav-toggle-and-crumbs')
      if (bar && !document.getElementById('courseMenuToggle')) {
        var t = document.createElement('template')
        t.innerHTML = '<button type="button" id="courseMenuToggle" class="Button Button--link ic-app-course-nav-toggle" aria-live="polite" aria-label="Hide Account Navigation Menu">\n              <i class="icon-hamburger" aria-hidden="true"></i>\n            </button>'
        bar.insertBefore(t.content.firstChild, bar.firstChild)
      }
    }
  }
  if (tpl) tpl.remove()

  var link = document.querySelector('.edit_settings_link')
  var table = document.querySelector('.profile_table')
  if (!link || !table) return
  link.addEventListener('click', function (e) {
    e.preventDefault()
    link.style.display = 'none'
    table.classList.add('editing')
    table.querySelectorAll('.edit_data_row').forEach(function (r) { r.style.display = '' })
    var first = table.querySelector('input:not([type=hidden]), select, textarea, button')
    if (first) first.focus()
  })
  var cancel = table.querySelector('.cancel_button')
  if (cancel) cancel.addEventListener('click', function (e) {
    e.preventDefault()
    link.style.display = ''
    table.classList.remove('editing')
    table.querySelectorAll('.change_password_row, .edit_data_row, .more_options_row').forEach(function (r) { r.style.display = 'none' })
  })
  // Update Settings: the mock does not persist profile edits; behave like a successful save.
  var form = document.getElementById('update_profile_form')
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault()
    var pr = form.querySelector('#user_pronouns')
    if (pr) form.querySelector('#pronouns').textContent = pr.value || 'None'
    var lc = form.querySelector('#user_locale')
    if (lc) form.querySelector('.locale.display_data').textContent = lc.options[lc.selectedIndex].text
    var tz = form.querySelector('#user_time_zone')
    if (tz) form.querySelector('.time_zone.display_data').textContent = tz.value
    if (cancel) cancel.click()
  })
})()
