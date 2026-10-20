// GET /courses — "All Courses". Server-rendered in production too:
//   app/views/courses/index.html.erb + app/views/shared/_current_enrollment.html.erb
//   CoursesController#index (css_bundle :context_list, :course_list; js_bundle :course_list),
//   #load_enrollments_for_index / #sort_enrollments, CoursesHelper#sortable_th / #get_sorting_icon.
// Behaviour: ui/features/course_list/index.jsx (star toggles via POST/DELETE favorites) is
// reproduced by pages/client/courses_index.js.
// Note: the context_list bundle is not in vendor-built; it only styles ul.context_list, which
// this page does not contain, so nothing visible is lost.
import fs from 'node:fs'
import path from 'node:path'
import {ROOT, esc} from '../lib/html.mjs'
import {isFavorite} from '../data/state.mjs'

const BASE = 'https://canvas.example.edu'
const CLIENT_JS = () => fs.readFileSync(path.join(ROOT, 'pages/client/courses_index.js'), 'utf8')

const COLUMNS = [
  ['favorite', 'Favorite', 'course-list-star-column course-list-column-header course-list-no-left-border'],
  ['course', 'Course', 'course-list-course-title-column course-list-column-header course-list-no-left-border'],
  ['nickname', 'Nickname', 'course-list-nickname-column course-list-column-header course-list-no-left-border'],
  ['term', 'Term', 'course-list-term-column course-list-column-header course-list-no-left-border'],
  ['enrolled_as', 'Enrolled as', 'course-list-enrolled-as-column course-list-column-header course-list-no-left-border'],
  ['published', 'Published', 'course-list-published-column course-list-column-header course-list-no-left-border'],
]

const isDefaultTerm = c => !c.term || c.term.id === '1' || c.term.name === 'Default Term'

// CoursesHelper#get_courses_params: keep the permitted sort params, set this table's, add focus
function sortUrl(q, table, col) {
  const sortP = `${table}_sort`, orderP = `${table}_order`
  const out = new URLSearchParams()
  for (const k of ['cc_sort', 'cc_order', 'pc_sort', 'pc_order', 'fc_sort', 'fc_order']) if (q.has(k)) out.set(k, q.get(k))
  const order = q.get(sortP) === col ? (q.get(orderP) === 'desc' ? 'asc' : 'desc') : 'asc'
  out.set(sortP, col)
  out.set(orderP, order)
  out.set('focus', table)
  return `/courses?${out.toString()}`
}

function sortableTh(q, table, [col, label, css]) {
  const current = q.get(`${table}_sort`)
  const ord = current === col ? q.get(`${table}_order`) : null
  const ariaSort = ord === 'asc' ? 'ascending' : ord === 'desc' ? 'descending' : null
  const icon = col === current || (col === 'published' && current == null)
    ? `icon-mini-arrow-${q.get(`${table}_order`) === 'desc' ? 'down' : 'up'}`
    : 'icon-mini-arrow-double'
  const iconCls = ['course-list-sort-icon', current === col ? 'sorted' : null, icon].filter(Boolean).join(' ')
  return `<th scope="col" class="${css}"${ariaSort ? ` aria-sort="${ariaSort}"` : ''}><a id="${table}_${col}" aria-label="${esc(`${label} column, sorted ${ariaSort || 'none'}, click to sort`)}" href="${esc(sortUrl(q, table, col))}">${esc(label)} <i class="${iconCls}"></i></a></th>`
}

// CoursesController#sort_enrollments
function sortEnrollments(S, list, q, table, type) {
  const col = q.get(`${table}_sort`)
  const order = q.get(`${table}_order`)
  const coll = new Intl.Collator('en', {sensitivity: 'base'})
  const key = c => {
    switch (col) {
      case 'favorite': return [isFavorite(S, c) ? 0 : 1]
      case 'course': return [c.name]
      case 'nickname': { const n = S.nicknames[c.id]; return [n == null ? 1 : 0, n || ''] }
      case 'term': return [isDefaultTerm(c) ? 1 : 0, c.term?.name || '']
      case 'enrolled_as': return ['Student']
      default: return type === 'past' ? [c.published ? 0 : 1, c.name] : [c.published ? 0 : 1, 1, c.name]
    }
  }
  const cmp = (a, b) => {
    const ka = key(a), kb = key(b)
    for (let i = 0; i < ka.length; i++) {
      const x = ka[i], y = kb[i]
      const r = typeof x === 'string' ? coll.compare(x, y) : x - y
      if (r) return r
    }
    return 0
  }
  const sorted = [...list].sort(cmp)
  return order === 'desc' ? sorted.reverse() : sorted
}

// shared/_current_enrollment.html.erb (non-dashboard, student, published course)
function enrollmentRow(S, c, {type, showStar}) {
  const published = c.published !== false && c.workflow_state !== 'unpublished'
  const unpublishedRedesign = !published && type === 'current'
  const showLink = published
  const fav = isFavorite(S, c)
  const past = type === 'past'
  let star = ''
  if (showStar) {
    let inner = ''
    if (!(past && !fav)) {
      const favPast = past && fav
      let tip
      if (!fav) tip = `Click to add ${c.name} to the courses menu.`
      if (!showLink) tip = `${c.name} cannot be added to the courses menu unless the course is active.`
      if (favPast) tip = `${c.name} is in the courses menu.`
      if (fav && !past) tip = `Click to remove ${c.name} from the courses menu.`
      const cls = `${fav ? 'course-list-favorite-course' : ''} ${!showLink || favPast ? 'course-list-not-favoritable disabled' : ''} ${showLink && !past ? 'course-list-favoritable' : ''}`
      inner = `
          <span
            class="${cls}"
            data-tooltip="bottom"
            title="${esc(tip)}"
            role="button"
            tabindex="0"
            data-course-name="${esc(c.name)}"
            data-course-id="${c.id}"
            ${showLink && !past ? `data-favorite-url=${BASE}/api/v1/users/self/favorites/courses/${c.id}` : ''}
          >
            <i class="course-list-favorite-icon ${fav ? 'icon-star' : 'icon-star-light'}"></i>
            <span id="course_list_screenreader_message_${c.id}" class="screenreader-only">
              ${esc(tip)}
            </span>
          </span>
          `
    }
    star = `
      <td class="course-list-star-column">
        ${inner}
      </td>
      `
  }
  const color = S.colors[`course_${c.id}`]
  const nick = S.nicknames[c.id] || ''
  const term = isDefaultTerm(c)
    ? `<span class="screenreader-only">${esc(c.term?.name || 'Default Term')}</span>`
    : esc(c.term.name)
  const pubCell = published
    ? `<span data-tooltip title="This course has been published.">Yes</span>
             <span class="screenreader-only">This course has been published.</span>`
    : `<span
              class="${unpublishedRedesign ? 'course-list-unpublished-course' : ''}"
              data-tooltip
              title="This course has not been published. Students should contact the course instructor for access.">
              No
            </span>
             <span class="screenreader-only">This course has not been published. Students should contact the course instructor for access.</span>`
  return `
  <tr class="course-list-table-row ${unpublishedRedesign ? 'course-list-unpublished-course-row' : ''}">
${star}
      <td class="course-list-course-title-column
        ${showStar ? 'course-list-no-left-border' : ''}
        ${showStar ? '' : 'course-list-not-favoritable'}">
        ${color ? `<span aria-hidden="true" class="course-color-block" style="color: ${esc(color)};" ></span>` : ''}
        ${showLink ? `<a href="/courses/${c.id}" title="${esc(c.name)}">` : ''}
        <span class="name">
          ${esc(c.name)}
        </span>
        ${showLink ? '</a>' : ''}
      </td>

      <td class="course-list-no-left-border course-list-nickname-column">
        ${esc(nick)}
      </td>

      <td class="course-list-no-left-border course-list-term-column">
        ${term}
      </td>

      <td class="course-list-no-left-border course-list-enrolled-as-column">
        Student
      </td>

      <td class="course-list-no-left-border course-list-published-column ">
            ${pubCell}
      </td>

  </tr>
`
}

function table(S, q, {id, table: t, type, list, overflow}) {
  const showStar = list.length > 0 // show_favorites_col_for_index?: any enrollment allows_favoriting? (true for non-K5)
  const rows = sortEnrollments(S, list, q, t, type).map(c => enrollmentRow(S, c, {type, showStar})).join('')
  const tbl = `<table
    id="${id}"
    class="ic-Table ic-Table--bordered course-list-table"
  >
    <thead>
      <tr>
        ${COLUMNS.filter(c => showStar || c[0] !== 'favorite').map(c => sortableTh(q, t, c)).join('\n        ')}
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>`
  return overflow ? `<div class="table-overflow-container">\n  ${tbl}\n  </div>` : tbl
}

export default function render(S, ctx) {
  const q = ctx.query || new URLSearchParams()
  const current = S.courses
  const past = S.pastCourses
  const future = S.futureCourses
  let content = `<div class="header-bar">
  <h1>All Courses</h1>
</div>

<div class="ic-Action-header content--hasMarginTop">
  <div class="ic-Action-header__Secondary">
  </div>
</div>

`
  content += current.length
    ? table(S, q, {id: 'my_courses_table', table: 'cc', type: 'current', list: current, overflow: true})
    : 'You are not enrolled in any courses.'
  if (past.length) {
    content += `\n\n  <div class="content--hasMarginTop">
    <h2>Past Enrollments</h2>
  </div>
  ${table(S, q, {id: 'past_enrollments_table', table: 'pc', type: 'past', list: past, overflow: true})}`
  }
  if (future.length) {
    content += `\n\n  <div class="content--hasMarginTop">
    <h2>Future Enrollments</h2>
  </div>
  ${table(S, q, {id: 'future_enrollments_table', table: 'fc', type: 'future', list: future, overflow: false})}`
  }
  return {
    title: 'Courses',
    content,
    cssBundles: ['course_list'],
    env: {CREATE_COURSES_PERMISSIONS: {PERMISSION: null, RESTRICT_TO_MCC_ACCOUNT: false, VIEWABLE_ACCOUNT_IDS: []}},
    crumbs: [],
    showFooter: false,
    scripts: [CLIENT_JS()],
  }
}
