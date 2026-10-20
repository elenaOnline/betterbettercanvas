// GET /profile/settings — "<name>'s Settings". Server-rendered in production:
//   ProfileController#settings (set_active_tab "profile_settings", crumbs [short_name, Settings])
//   app/views/profile/profile.html.erb + profile/_ways_to_contact.html.erb (right side)
//   + shared/_maintenance_window.html.erb + shared/_locale_warning.html.erb
//   left side: #section-tabs for the UserProfile context (app/models/user_profile.rb tabs,
//   SectionTabHelper; nav aria-label "Account Navigation Menu").
// the pilot school-specific choices (from the 2026-10-19 capture design/captures/2026-10-19-profile-settings-small.jpg):
// SSO login (no password pseudonyms, name not editable), pronouns enabled, avatars on, MFA off,
// tabs Notifications / Profile / Files / Settings / QR for Mobile Login / Global Announcements.
// CSS: profile_edit (vendor-built) + ways_to_contact and pairing_code, which vendor-built lacks;
// those two are precompiled from canvas-lms SCSS into pages/client/profile_settings.css and inlined.
import fs from 'node:fs'
import path from 'node:path'
import {ROOT, esc} from '../lib/html.mjs'
import {laParts, laDate} from '../lib/time.mjs'

const EXTRA_CSS = () => fs.readFileSync(path.join(ROOT, 'pages/client/profile_settings.css'), 'utf8')
const CLIENT_JS = () => fs.readFileSync(path.join(ROOT, 'pages/client/profile_settings.js'), 'utf8')
const BASE = 'https://canvas.example.edu'
// public/images/google_drive_icon.png is not among the captured CDN images; a small inline stand-in
// (Drive's three-colour triangle) keeps the button's look without a 404.
const DRIVE_ICON = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="14" viewBox="0 0 87 78"><path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 000 53h27.5z" fill="#00ac47"/><path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8L65.65 64.5z" fill="#ea4335"/><path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="M73.4 26.5L60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>').toString('base64')

// UserProfile tabs as the pilot school shows them to a student
function accountTabs() {
  return [
    {label: 'Notifications', css: 'notifications', href: '/profile/communication'},
    {label: 'Profile', css: 'profile', href: '/profile'},
    {label: 'Files', css: 'files', href: '/files'},
    {label: 'Settings', css: 'profile_settings', href: '/profile/settings'},
    {label: 'QR for Mobile Login', css: 'qr_mobile_login', href: '/profile/qr_mobile_login'},
    {label: 'Global Announcements', css: 'past_global_announcements', href: '/account_notifications'},
  ]
}

// SectionTabHelper#section_tabs for @context = user profile
export function accountNav(active = 'profile_settings') {
  return `<nav role="navigation" aria-label="Account Navigation Menu"><ul id="section-tabs">${accountTabs()
    .map(t => {
      const on = t.css === active
      return `<li class="section"><a id="${t.label.toLowerCase().replace(/ /g, '-')}-link" href="${t.href}"${on ? ' aria-current="page"' : ''} class="${t.css}${on ? ' active' : ''}">${esc(t.label)}</a></li>`
    })
    .join('')}</ul></nav>`
}

// layouts/application.html.erb #left-side block, for a non-course context (no term subtitle)
export function accountLeftSide(active) {
  return `<div id="left-side"
          class="ic-app-course-menu ic-sticky-on list-view"
          style="display: block"
          >
          <div id="sticky-container" class="ic-sticky-frame">
            ${accountNav(active)}
          </div>
        </div>`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WD3 = {Sun: 'Sun', Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat'}
function t12(h, m) { return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}` }

// shared/_maintenance_window: Instructure's 1st & 3rd Thursday, 08:05–10:05 UTC
function maintenanceWindow(now) {
  let start = null
  for (let k = 0; k < 3 && !start; k++) {
    const y = now.getUTCFullYear(), mo = now.getUTCMonth() + k
    const first = new Date(Date.UTC(y, mo, 1))
    const firstThu = 1 + ((4 - first.getUTCDay() + 7) % 7)
    for (const d of [firstThu, firstThu + 14]) {
      const s = new Date(Date.UTC(y, mo, d, 8, 5))
      if (s > now) { start = s; break }
    }
  }
  const end = new Date(start.getTime() + 2 * 3600000)
  const a = laParts(start), b = laParts(end)
  const wdLocal = WD[new Date(Date.UTC(a.year, a.month - 1, a.day)).getUTCDay()]
  const line1 = `Maintenance windows: 1st and 3rd ${wdLocal} of the month from ${t12(a.hour, a.minute)} to ${t12(b.hour, b.minute)} (${WD[start.getUTCDay()]} from ${t12(start.getUTCHours(), start.getUTCMinutes())} to ${t12(end.getUTCHours(), end.getUTCMinutes())} UTC )`
  const line2 = `Next window: ${WD3[a.weekday]} ${MONTHS[a.month - 1]} ${a.day}, ${a.year} from ${t12(a.hour, a.minute)} to ${t12(b.hour, b.minute)}`
  return `${esc(line1)}\n<br/>\n${esc(line2)}`
}

const LOCALES = [['', 'System Default (English (United States))'], ['ar', 'العربية (Arabic)'], ['zh-Hans', '中文 (简体) (Chinese Simplified)'], ['zh-Hant', '中文 (繁體) (Chinese Traditional)'], ['en-AU', 'English (Australia)'], ['en-GB', 'English (United Kingdom)'], ['en', 'English (United States)'], ['fr', 'Français (French)'], ['de', 'Deutsch (German)'], ['ja', '日本語 (Japanese)'], ['ko', '한국어 (Korean)'], ['pt-BR', 'Português do Brasil (Portuguese Brazil)'], ['ru', 'pусский (Russian)'], ['es', 'Español (Spanish)'], ['vi', 'Tiếng Việt (Vietnamese)']]
const US_ZONES = ['Hawaii', 'Alaska', 'Pacific Time (US & Canada)', 'Arizona', 'Mountain Time (US & Canada)', 'Central Time (US & Canada)', 'Eastern Time (US & Canada)', 'Indiana (East)']
const PRONOUNS = ['She/Her', 'He/Him', 'They/Them']

export default function render(S) {
  const u = S.user
  const genitive = /s$/i.test(u.short_name) ? `${u.short_name}'` : `${u.short_name}'s`
  const email = u.primary_email
  const ccId = String(+u.id + 30000000)
  const pushId = String(+u.id + 30000001)
  const rightSide = `
  <h2>Ways to Contact</h2>
<div>
  <table class="single channel_list email_channels ic-Table ic-Table--condensed">
    <thead>
      <tr>
        <th>Email Addresses</th>
        <th><span class="screenreader-only">Set Email as Default</span></th>
        <th><span class="screenreader-only">Email Actions</span></th>
      </tr>
    </thead>
    <tr class="channel default  pseudonym_${+u.id + 40000000}" id="channel_${ccId}">
      <th scope="row">
          <p class="path email_channel contact_channel_path ellipsis">${esc(email)}</p>
      </th>
      <td class="email_meta">
        <a href="${BASE}/profile" class="default_link no-hover" aria-label="Set default email address" >
          <i class="icon-star standalone-icon" alt="Set email address as default" aria-hidden="true" title="Set email address as default"></i>
            <span class="screenreader-only default_label">This is the default email address</span>
        </a>
        <span class="screenreader-only unconfirmed_text">This email address is unconfirmed</span>
      </td>
      <td class="email_actions">
        <span class="hidden_for_single">
              <a href="${BASE}/communication_channels/${ccId}" class="delete_channel_link no-hover" aria-label="Remove email address" ><i class="icon-trash standalone-icon" alt="Remove email address" title="Remove email address"></i></a>
            <span class="screenreader-only cant_delete_default_text">You cannot remove your default email address</span>
          <span class="pseudonym_id" style="display: none;">${+u.id + 40000000}</span>
          <span class="channel_id" style="display: none;">${ccId}</span>
          <span class="user_id" style="display: none;">${u.id}</span>
        </span>
      </td>
    </tr>
  <tr class="channel blank unconfirmed" style="display: none;">
    <th scope="row">
      <a href="#" class="path email_channel contact_channel_path ellipsis" title="">&nbsp;</a>
    </th>
    <td class="email_meta">
      <a href="${BASE}/about/${u.id}" class="default_link no-hover"><i class="icon-star standalone-icon" title="Default email address"></i></a>
      <span class="screenreader-only unconfirmed_text">This email address is unconfirmed</span>
    </td>
    <td class="email_actions hidden_for_single">
        <a href="${BASE}/communication_channels/{{ channel_id }}" class="delete_channel_link no-hover" aria-label="Remove email address"><i class="icon-trash standalone-icon" alt="Remove email address" title="Remove email address"></i></a>
      <span class="pseudonym_id" style="display: none;">&nbsp;</span>
      <span class="channel_id" style="display: none;">&nbsp;</span>
      <span class="user_id" style="display: none;">&nbsp;</span>
    </td>
  </tr>
    <tr>
      <td colspan="3" style="text-align: center;">
        <a href="#" class="add_email_link icon-add" title="Add Email Address" aria-label="Add Email Address">Email Address</a>
      </td>
    </tr>
</table>
<div class="content-box-mini">
  <table class="channel_list other_channels ic-Table ic-Table--condensed">
    <thead>
      <tr>
        <th>Other Contacts</th>
        <th colspan='2'>Type</th>
      </tr>
    </thead>
    <tbody>
      <tr class="channel  pseudonym_" id="channel_${pushId}">
        <td>
            <div class="path contact_channel_path ellipsis">For All Devices</div>
        </td>
        <td>push</td>
        <td style="padding: 0; text-align: center;">
              <a href="${BASE}/communication_channels/${pushId}" class="delete_channel_link no-hover"><i class="icon-trash standalone-icon" title="Remove contact method" aria-hidden="true"></i><span class="screenreader-only">Remove contact method</span></a>
          <span class="pseudonym_id" style="display: none;"></span>
          <span class="channel_id" style="display: none;">${pushId}</span>
          <span class="user_id" style="display: none;">${u.id}</span>
        </td>
      </tr>
    <tr class="channel blank unconfirmed" style="display: none;">
      <td><a href="#" class="path">&nbsp;</a></td>
      <td><span id="communication_text_type">sms</span></td>
      <td style="padding: 0; text-align: center;">
          <a href="${BASE}/communication_channels/{{ channel_id }}" class="delete_channel_link no-hover"><i class="icon-trash standalone-icon"></i></a>
        <span class="pseudonym_id" style="display: none;">&nbsp;</span>
        <span class="channel_id" style="display: none;">&nbsp;</span>
        <span class="user_id" style="display: none;">&nbsp;</span>
      </td>
    </tr>
    </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="text-align: center;">
            <a href="#" class="add_contact_link icon-add" title="Add Contact Method" aria-label="Add Contact Method">Contact Method</a>
          </td>
        </tr>
      </tfoot>
  </table>
</div>
</div>
<div id="register_communication_mount_point"></div>
<div id="confirm_email_address_mount_point"></div>
<div id="confirm_communication_channel_mount_point"></div>
<div style="display: none;" id="select_templates">
<select class="email_select contact_select" name="channel_id">
    <option class="channel_option_${ccId}" value="${ccId}" >${esc(email)}</option>
  <option value="new">New Email Address</option>
</select>
<select class="sms_select contact_select" name="channel_id">
  <option value="">[Select SMS Number]</option>
  <option value="new">New SMS Number</option>
</select>
</div>
  <div>
    <hr />
    <a href="#" class="edit_settings_link btn button-sidebar-wide"><i class="icon-edit" aria-hidden="true"></i> Edit Settings</a>
    <a href="/dashboard/content_exports" class="btn button-sidebar-wide"><i class="icon-download" aria-hidden="true"></i> Download Submissions</a>
  </div>
`
  const pronounOpts = [['', 'None'], ...PRONOUNS.map(p => [p, p])]
  const content = `<style id="mock-profile-extra-css">
${EXTRA_CSS()}</style>
<template id="mock-account-nav"><!-- TODO(mock-canvas layout): pages/layout.mjs only builds #left-side for a course.
  Until it accepts a page-supplied left side, pages/client/profile_settings.js moves this account
  navigation into #left-side synchronously, before DOMContentLoaded. -->${accountLeftSide('profile_settings')}</template>
    <a href="#" class="fs-exclude avatar profile_pic_link none" style="background-image: url(${esc(u.avatar_url)})"><span class="screenreader-only">Click to change profile picture for ${esc(u.short_name)}</span><i class="icon-edit"></i></a>
    <div id="avatar-modal-mount"></div>
<h1 style="padding-top: 0.3em;">${esc(genitive)} Settings</h1>
<div class="clear"></div>
<form id="update_profile_form" style="margin-bottom: 20px;" class="form-inline edit_user" action="/profile" accept-charset="UTF-8" method="post"><input type="hidden" name="_method" value="put" autocomplete="off" /><input type="hidden" name="authenticity_token" value="mock-authenticity-token" autocomplete="off" />
<table class="profile_table">
  <tr>
    <th scope="row"><label for="user_name">Full Name:</label></th>
    <td><span id="name"
              class="full_name edit_or_show_data">${esc(u.name)}</span>
      <span id="hints_name" class="edit_or_show_data data_description"><br/>This name will be used for grading.</span>
  </tr>
  <tr>
    <th scope="row"><label for="user_short_name">Display Name:</label></th>
    <td><span id="short_name"
              class="short_name edit_or_show_data">${esc(u.short_name)}</span>
      <span id="hints_short_name" class="edit_or_show_data data_description"><br/>People will see this name in discussions, messages and comments.</span>
    </td>
  </tr>
  <tr>
    <th scope="row"><label for="user_sortable_name">Sortable Name:</label></th>
    <td><span id="sortable_name"
              class="sortable_name edit_or_show_data">${esc(u.sortable_name)}</span>
      <span id="hints_sortable_name" class="edit_or_show_data data_description"><br/>This name appears in sorted lists.</span>
    </td>
  </tr>
    <tr>
      <th scope="row"><label for="user_pronouns">Pronouns:</label></th>
      <td>
          <span id="pronouns" class="display_data">${esc(u.pronouns || 'None')}</span>
            <span class="edit_data">
              <select name="user[pronouns]" id="user_pronouns">${pronounOpts.map(([v, l]) => `<option${(u.pronouns || '') === v ? ' selected="selected"' : ''} value="${esc(v)}">${esc(l)}</option>`).join('\n')}</select>
            </span>
        <span class="edit_or_show_data data_description">
          <br/>
          This pronoun will appear after your name when enabled
        </span>
      </td>
    </tr>
  <tr>
    <th scope="row"><label for="user_locale">Language:</label></th>
    <td>
      <span class="locale display_data">${esc(LOCALES[0][1])}</span>
      <span class="edit_data"><select class="locale" aria-describedby="hints_language" name="user[locale]" id="user_locale">${LOCALES.map(([v, l]) => `<option value="${esc(v)}"${v === '' ? ' selected="selected"' : ''}>${esc(l)}</option>`).join('\n')}</select>
      <i style="display: none;" class="locale-warning icon-warning" data-tooltip='{"tooltipClass":"popover", "position":"right"}'
   data-html-tooltip-title="<div class='popover-title'>Crowdsourced Language</div><div class='popover-content'><p>
    The language you have selected was translated via crowdsourcing.
    Instructure has not reviewed or verified the accuracy of the translation, and accepts no responsibility for your use of this language setting. Please use at your own discretion.</p></div>">
</i>
      <span id="hints_language" class="data_description"><br/>This will override any browser or account settings.</span>
      </span>
    </td>
  </tr>
  <tr>
    <th scope="row"><label for="user_time_zone">Time Zone:</label></th>
    <td>
      <span class="time_zone display_data">
          Pacific Time (US &amp; Canada)
      </span>
      <span class="edit_data"><select name="user[time_zone]" id="user_time_zone">${US_ZONES.map(z => `<option${z === 'Pacific Time (US & Canada)' ? ' selected="selected"' : ''} value="${esc(z)}">${esc(z)}</option>`).join('\n')}
<option value="" disabled="disabled">-------------</option>
<option value="UTC">UTC</option></select></span>
    </td>
  </tr>
  <tr>
    <td></td>
    <td> ${maintenanceWindow(S.now)} </td>
  </tr>
  <tr class="change_password_row" style="display: none;">
    <th class="nobr" scope="row"><label for="profile_pseudonym_id">Password For:</label></th>
    <td>
      <select name="pseudonym[password_id]" id="profile_pseudonym_id">
      </select>
    </td>
  </tr>
  <tr class="change_password_row" style="display: none;">
    <th scope="row"><label for="old_password">Old Password:</label></th>
    <td><input type="password" style="width: 150px;" id="old_password" name="pseudonym[old_password]"/></td>
  </tr>
  <tr class="change_password_row" style="display: none;">
    <th scope="row"><label for="pseudonym_password">New Password:</label></th>
    <td><input value="" style="width: 150px;" type="password" name="pseudonym[password]" id="pseudonym_password" /></td>
  </tr>
  <tr class="change_password_row" style="display: none;">
    <th scope="row"><label for="pseudonym_password_confirmation">Confirm Password:</label></th>
    <td><input value="" style="width: 150px;" type="password" name="pseudonym[password_confirmation]" id="pseudonym_password_confirmation" /></td>
  </tr>
  <tr class="edit_data_row more_options_link_row" style="display: none;">
    <th scope="row" colspan="2"><a href="#" class="more_options_link" style="display: none;">more options</a></th>
  </tr>

  <tr class="edit_data_row" style="display: none;">
    <td colspan="2">
      <div class="form-actions">
        <button type="button" class="btn cancel_button">Cancel</button>
        <button type="submit" class="btn btn-primary">Update Settings</button>
      </div>
    </td>
  </tr>
</table>
</form>
<div style="display: none; margin-bottom: 20px;">
<h2>Ways to Log In</h2>
<table class="summary pseudonym_list">
  <thead>
    <tr>
      <th scope="col">Organization</th>
      <th scope="col">Login</th>
    </tr>
  </thead>
  <tr id="pseudonym_${+u.id + 40000000}" class="pseudonym">
    <td>Example University</td>
    <td>
      <div style="display: flex; flex-direction: row; justify-content: space-between;">
        <a style="margin-right: 6px" href="${BASE}/login" class="not_external">${esc(u.login_id)}</a>
        <a class="delete_pseudonym_link no-hover" href="${BASE}/profile/pseudonyms/${+u.id + 40000000}" style="display: none;" title="Remove account from this profile"><img alt="Remove account from this profile" src="/dist/images/delete-39059ba0a6.png" /></a>
      </div>
    </td>
  </tr>
</table>
<div style="text-align: center; display: none;">
  <a href="#" class="add">Add Account</a>
</div>
</div>

<a name="registered_web_services"></a>
<h2>Web Services</h2>
<p>Canvas can make your life a lot easier by tying itself in with the web tools
you already use.  Click any of the services in "Other Services" to see what we mean.
</p>
<p>
<input type="checkbox" id="show_user_services" checked/> <label for="show_user_services">Let fellow course/group members see which services I've linked to my profile</label>
</p>
<table role="presentation" style="width: 100%;"><tr>
  <td class="services-cell">
    <div>
      <h3>Registered Services</h3>
      <div style="margin-left: 20px; margin-bottom: 20px;">
      <ul id="registered_services" class="unstyled_list">
        <li id="service_blank" class="service clearfix" style="display: none;">
          <a href="${BASE}/profile/user_services/{{ id }}" class="delete_service_link no-hover" style="float: right;" title="Unregister Service"><img alt="Unregister Service" src="/dist/images/delete_circle-f4242c3ba6.png" /></a>
          <span class="service">&nbsp;</span>
        </li>
      </ul>
      No Registered Services
      </div>
    </div>
  </td>
  <td class="services-cell">
    <h3>Other Services</h3>
    <div style="margin-left: 20px;">
    Click any service below to register:
    <ul id="unregistered_services" class="unstyled_list">
      <li id="unregistered_service_google_drive" class="service" style="">
        <a href="#" class="btn btn-small"><img alt="" src="${DRIVE_ICON}" /> Google Drive</a>
      </li>
      <li id="unregistered_service_diigo" class="service" style="display: none;">
        <a href="#" class="btn btn-small"><img alt="" src="${DRIVE_ICON}" /> Diigo</a>
      </li>
    </ul>
    <div id="register_service_mount_point"></div>
    </div>
  </td>
</tr></table>
<h2>Approved Integrations:</h2>
<div style="margin-left: 20px;">
    <div id="no_approved_integrations">Third-party applications can request permission to access
the Canvas site on your behalf.  As you begin authorizing
applications you will see them listed here.
</div>
  <div id="access_tokens_holder" style="display: none;">
    These are the third-party applications you have authorized
to access the Canvas site on your behalf:

    <table id="access_tokens" class="summary" style="margin-top: 10px;">
      <thead>
        <tr>
          <th scope="col">App</th>
          <th scope="col">Status</th>
          <th scope="col">Purpose</th>
          <th scope="col">Dates</th>
          <th scope="col">Details</th>
          <th scope="col">Remove</th>
        </tr>
      </thead>
      <tbody>
      </tbody>
    </table>
  </div>
  <div style="margin-top: 10px;">
    <a href="#" class="btn btn-primary add_access_token_link" disabled >
      <i class="icon-plus" aria-hidden="true"></i> New Access Token
    </a>
      <a class="icon-info"
          tabindex="0"
          data-tooltip='{"tooltipClass":"popover popover-padded", "position":"right"}'
          title="Your Canvas administrators have chosen to limit your ability to generate your own access token. Please reach out to your Canvas administrators to have them generate an access token on your behalf.">
          <span class="screenreader-only">Why can't I create an access token?</span>
      </a>
  </div>
  <div id='access_token_details_mount_point'></div>
  <div id='new_access_token_mount_point'></div>
</div>

<h2 aria-hidden=true>Feature Options</h2>
<div class="feature-flag-wrapper">
  <!-- this is populated by FeatureFlagAdminView -->
</div>

<div id="profile_pic_dialog" style="display: none;">
  <a href="${BASE}/profile/profile_pictures" class="profile_pics_url" style="display: none;">&nbsp;</a>
  Select the image you'd like to use as your profile pic, or upload a new image:
  <div class="profile_pic_list" style="background: #eee; padding: 5px; -moz-border-radius: 5px; margin: 5px 10px;">
    <h3 style="padding-left: 10px; padding-top: 10px;">Loading Images...</h3>
    <div class="clear"></div>
  </div>
  <a href="#" class="add_pic_link add">Upload a new Image</a>
  <form id="add_pic_form" style="display: none;" action="/users/${u.id}/files.json" accept-charset="UTF-8" method="post"><input type="hidden" name="authenticity_token" value="mock-authenticity-token" autocomplete="off" />
    <input type="hidden" name="format" value="text" />
    <input type="file" name="attachment[uploaded_data]" id="attachment_uploaded_data" />
    <button type="submit" class="btn btn-small">Add File</button>
</form>  <div class="form-actions">
    <button type="button" class="btn cancel_button button-secondary">Cancel</button>
    <button type="button" class="btn select_button btn-primary">Select Image</button>
  </div>
</div>
`
  return {
    title: 'User Settings',
    content,
    rightSide,
    activeTab: 'profile_settings',
    // For layout.mjs once it supports a non-course left side (see TODO above):
    leftSide: accountLeftSide('profile_settings'),
    crumbs: [['Dashboard', '/'], [u.short_name, '/profile'], ['Settings', '/profile/settings']],
    cssBundles: ['profile_edit'],
    env: {
      enable_gravatar: false,
      register_cc_tabs: ['email'],
      is_default_account: false,
      google_drive_oauth_url: `${BASE}/oauth?return_to=${encodeURIComponent(BASE + '/profile/settings')}&service=google_drive`,
      user_is_only_student: true,
      PERMISSIONS: {can_update_tokens: false},
      folder_id: String(+u.id + 9000000),
      PASSWORD_POLICY: {},
      PASSWORD_POLICIES: {},
      PROFILE: {id: u.id, short_name: u.short_name, user_name: u.name, avatar_image: u.avatar_url, can_edit: true, can_edit_channels: true, can_edit_name: false, can_edit_avatar: true},
      NEW_USER_TUTORIALS_ENABLED_AT_ACCOUNT: false,
      CONTEXT_BASE_URL: `/users/${u.id}`,
    },
    scripts: [CLIENT_JS()],
  }
}
