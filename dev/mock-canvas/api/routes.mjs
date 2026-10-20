// /api/v1 router. Pure functions of (state, request) -> {status, headers, body}.
import {
  userJson, profileJson, courseJson, dashboardCardJson, assignmentJson, assignmentGroupJson, submissionJson,
  plannerItemFromAssignment, plannerItemFromNote, plannerItemFromEvent, plannerItemFromAnnouncement, overrideJson,
  plannerNoteJson, calendarEventJson, assignmentEventJson, announcementJson, discussionJson, conversationJson,
  enrollmentJson, courseTabs, moduleJson, moduleItemJson, pageJson, fileJson,
} from './serializers.mjs'
import {findCourse, findAssignment, dashboardCourses, nextSeq, recompute, nickname, isFavorite} from '../data/state.mjs'
import {iso, addDays, startOfLaDay} from '../lib/time.mjs'
import {periodOf} from '../data/scenarios.mjs'

const BASE = 'https://canvas.example.edu'

function arr(q, k) { return q.getAll(k).concat(q.getAll(k + '[]')) }

function paginate(req, list, {defaultPer = 10, max = 100} = {}) {
  const q = req.query
  const per = Math.min(Math.max(parseInt(q.get('per_page') || defaultPer, 10) || defaultPer, 1), max)
  const page = Math.max(parseInt(q.get('page') || '1', 10) || 1, 1)
  const last = Math.max(1, Math.ceil(list.length / per))
  const mk = p => {
    const u = new URL(BASE + req.path + '?' + q.toString())
    u.searchParams.set('page', String(p))
    u.searchParams.set('per_page', String(per))
    return u.toString()
  }
  const links = [`<${mk(page)}>; rel="current"`]
  if (page < last) links.push(`<${mk(page + 1)}>; rel="next"`)
  if (page > 1) links.push(`<${mk(page - 1)}>; rel="prev"`)
  links.push(`<${mk(1)}>; rel="first"`, `<${mk(last)}>; rel="last"`)
  return {body: list.slice((page - 1) * per, page * per), headers: {Link: links.join(',')}}
}

const ok = (body, headers = {}) => ({status: 200, headers, body})
const err = (status, message) => ({status, body: {errors: [{message}]}})
const notFound = () => err(404, 'The specified resource does not exist.')

function parseBody(req) {
  const ct = req.headers['content-type'] || ''
  const raw = req.rawBody || ''
  if (ct.includes('application/json')) { try { return JSON.parse(raw || '{}') } catch { return {} } }
  const o = {}
  for (const [k, v] of new URLSearchParams(raw)) o[k.replace(/\[\]$/, '')] = v
  for (const [k, v] of req.query) if (!(k in o)) o[k] = v
  return o
}
const bool = v => v === true || v === 'true' || v === '1' || v === 1

function isComplete(S, item) {
  if (item.planner_override?.marked_complete) return true
  if (item.submissions && (item.submissions.submitted || item.submissions.excused || item.submissions.graded)) return true
  return false
}

function allPlannerItems(S, {includeAnnouncements = true} = {}) {
  const items = []
  for (const c of S.courses) {
    for (const a of c.assignments) if (a.due_at && a.published) items.push(plannerItemFromAssignment(S, c, a))
    if (includeAnnouncements) for (const an of c.announcements) items.push(plannerItemFromAnnouncement(S, c, an))
  }
  for (const n of S.plannerNotes) if (n.workflow_state !== 'deleted') items.push(plannerItemFromNote(S, n))
  for (const e of S.calendarEvents) items.push(plannerItemFromEvent(S, e))
  return items
}

export function handleApi(S, req) {
  const {method, path} = req
  const q = req.query
  const p = path.replace(/^\/api\/v1/, '').replace(/\/$/, '')
  let m
  const include = arr(q, 'include')

  // ---- users ----
  if (method === 'GET' && (p === '/users/self' || p === `/users/${S.user.id}`)) return ok(userJson(S))
  if (method === 'GET' && p === '/users/self/profile') return ok(profileJson(S))
  if (method === 'GET' && p === '/users/self/colors') return ok({custom_colors: S.colors})
  if ((m = p.match(/^\/users\/self\/colors\/((?:course|group|user)_\d+)$/))) {
    if (method === 'GET') return S.colors[m[1]] ? ok({hexcode: S.colors[m[1]]}) : notFound()
    if (method === 'PUT') {
      const b = parseBody(req)
      let hex = String(b.hexcode || '').trim()
      if (!/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return err(400, 'Invalid Hexcode Provided')
      hex = hex.replace(/^#?/, '#')
      if (hex.length === 4) hex = '#' + [...hex.slice(1)].map(ch => ch + ch).join('')
      S.colors[m[1]] = hex.toUpperCase()
      return ok({hexcode: S.colors[m[1]]})
    }
  }
  if (method === 'PUT' && p === '/users/self/settings') {
    const b = parseBody(req)
    S.settings = {...(S.settings || {}), ...b}
    return ok({manual_mark_as_read: false, release_notes_badge_disabled: false, collapse_global_nav: false, collapse_course_nav: false, hide_dashcard_color_overlays: bool(S.settings.hide_dashcard_color_overlays), comment_library_suggestions_enabled: false, elementary_dashboard_disabled: false})
  }
  if (method === 'GET' && p === '/users/self/settings') return ok({manual_mark_as_read: false, collapse_global_nav: false, hide_dashcard_color_overlays: bool(S.settings?.hide_dashcard_color_overlays)})
  if (p === '/users/self/dashboard_positions' && method === 'PUT') {
    const b = parseBody(req)
    const pos = b.dashboard_positions || {}
    for (const [k, v] of Object.entries(pos)) S.dashboardPositions[k] = +v
    return ok({dashboard_positions: S.dashboardPositions})
  }
  if (method === 'GET' && p === '/users/self/dashboard_positions') return ok({dashboard_positions: S.dashboardPositions})

  // favorites
  if (method === 'GET' && p === '/users/self/favorites/courses') {
    return ok(S.courses.filter(c => isFavorite(S, c)).map(c => courseJson(S, c, include)))
  }
  if ((m = p.match(/^\/users\/self\/favorites\/courses\/(\d+)$/))) {
    const c = findCourse(S, m[1])
    if (!c) return notFound()
    S.favorites ||= new Set(S.courses.filter(x => isFavorite(S, x)).map(x => x.id))
    if (method === 'POST') { S.favorites.add(c.id); return ok({id: +c.id + 100000, context_id: +c.id, context_type: 'Course'}) }
    if (method === 'DELETE') { S.favorites.delete(c.id); return ok({id: +c.id + 100000, context_id: +c.id, context_type: 'Course'}) }
  }
  if (method === 'DELETE' && p === '/users/self/favorites/courses') { S.favorites = null; return ok({message: 'OK'}) }

  // nicknames
  if (method === 'GET' && p === '/users/self/course_nicknames') {
    return ok(Object.entries(S.nicknames).map(([cid, nick]) => ({course_id: +cid, name: findCourse(S, cid)?.name, nickname: nick})))
  }
  if (method === 'DELETE' && p === '/users/self/course_nicknames') { S.nicknames = {}; return ok({message: 'OK'}) }
  if ((m = p.match(/^\/users\/self\/course_nicknames\/(\d+)$/))) {
    const c = findCourse(S, m[1])
    if (!c) return notFound()
    if (method === 'GET') return S.nicknames[c.id] ? ok({course_id: +c.id, name: c.name, nickname: S.nicknames[c.id]}) : notFound()
    if (method === 'PUT') {
      const nick = String(parseBody(req).nickname || '').trim()
      if (!nick || nick.length >= 60) return err(400, 'nickname must be non-empty and under 60 characters')
      S.nicknames[c.id] = nick
      return ok({course_id: +c.id, name: c.name, nickname: nick})
    }
    if (method === 'DELETE') { const n = S.nicknames[c.id]; delete S.nicknames[c.id]; return ok({course_id: +c.id, name: c.name, nickname: n || null}) }
  }

  // dashboard
  if (method === 'GET' && p === '/dashboard/dashboard_cards') return ok(dashboardCourses(S).map(c => dashboardCardJson(S, c)))

  // ---- courses ----
  if (method === 'GET' && p === '/courses') {
    const states = arr(q, 'enrollment_state')
    let list = [...S.courses, ...S.futureCourses]
    if (states.includes('completed') || include.includes('concluded')) list = [...list, ...S.pastCourses]
    if (states.length && states.includes('active') && !states.includes('completed')) list = list.filter(c => c.enrollment_state === 'active')
    return (r => ok(r.body, r.headers))(paginate(req, list.map(c => courseJson(S, c, include))))
  }
  if ((m = p.match(/^\/courses\/(\d+)(\/.*)?$/))) {
    const c = findCourse(S, m[1])
    if (!c) return notFound()
    const sub = m[2] || ''
    if (method === 'GET' && sub === '') return ok(courseJson(S, c, include))
    if (method === 'GET' && sub === '/tabs') return ok(courseTabs(c).map(t => ({id: t.id, html_url: t.path, full_url: BASE + t.path, position: t.position, visibility: 'public', label: t.label, type: 'internal'})))
    if (method === 'GET' && sub === '/assignments') {
      let list = c.assignments.filter(a => a.published)
      const ids = arr(q, 'assignment_ids')
      if (ids.length) list = list.filter(a => ids.includes(a.id))
      const term = (q.get('search_term') || '').toLowerCase()
      if (term) list = list.filter(a => a.name.toLowerCase().includes(term))
      const bucket = q.get('bucket')
      const now = S.now
      if (bucket) {
        list = list.filter(a => {
          const s = c.submissions.get(a.id)
          switch (bucket) {
            case 'past': return a.due_at && a.due_at < now
            case 'overdue': return a.due_at && a.due_at < now && !s?.submitted_at && !s?.excused
            case 'undated': return !a.due_at
            case 'ungraded': return s?.workflow_state !== 'graded'
            case 'unsubmitted': return !s?.submitted_at
            case 'upcoming': return a.due_at && a.due_at >= now && a.due_at < addDays(now, 7)
            case 'future': return !a.due_at || a.due_at >= now
            default: return true
          }
        })
      }
      if (q.get('order_by') === 'due_at') list = [...list].sort((a, b) => (a.due_at?.getTime() ?? 9e15) - (b.due_at?.getTime() ?? 9e15))
      return (r => ok(r.body, r.headers))(paginate(req, list.map(a => assignmentJson(S, c, a, include)), {defaultPer: 10}))
    }
    if ((m = sub.match(/^\/assignments\/(\d+)$/)) && method === 'GET') {
      const a = c.assignments.find(x => x.id === m[1])
      return a ? ok(assignmentJson(S, c, a, include)) : notFound()
    }
    if ((m = sub.match(/^\/assignments\/(\d+)\/submissions\/(self|\d+)$/)) && method === 'GET') {
      const a = c.assignments.find(x => x.id === m[1])
      return a ? ok(submissionJson(S, c, a, c.submissions.get(a.id), include)) : notFound()
    }
    if (method === 'GET' && sub === '/assignment_groups') {
      const gpid = q.get('grading_period_id')
      const list = c.groups.map(g => assignmentGroupJson(S, c, g, include))
      if (gpid && c.gradingPeriods && include.includes('assignments')) {
        for (const g of list) g.assignments = g.assignments.filter(a => periodOf(c, {due_at: a.due_at ? new Date(a.due_at) : null})?.id === gpid)
      }
      return ok(list)
    }
    if (method === 'GET' && sub === '/grading_periods') {
      const gps = c.gradingPeriods || []
      return ok({grading_periods: gps.map(g => ({id: +g.id, title: g.title, start_date: iso(g.start_date), end_date: iso(g.end_date), close_date: iso(g.close_date), weight: g.weight, is_closed: g.is_closed})), meta: {primaryCollection: 'grading_periods'}})
    }
    if (method === 'GET' && sub === '/students/submissions') {
      const list = c.assignments.map(a => {
        const j = submissionJson(S, c, a, c.submissions.get(a.id), include)
        if (include.includes('assignment')) j.assignment = assignmentJson(S, c, a)
        return j
      })
      return (r => ok(r.body, r.headers))(paginate(req, list))
    }
    if (method === 'GET' && sub === '/enrollments') {
      const e = {...enrollmentJson(S, c), id: +c.id + 7000000, course_id: +c.id, course_section_id: +c.id + 1, root_account_id: 1, associated_user_id: null,
        created_at: iso(c.created_at), updated_at: iso(c.created_at), start_at: null, end_at: null, last_activity_at: iso(S.now), last_attended_at: null,
        total_activity_time: 36000, html_url: `${BASE}/courses/${c.id}/users/${S.user.id}`, sis_account_id: null, sis_course_id: c.sis_course_id,
        course_integration_id: null, sis_section_id: null, section_integration_id: null, sis_user_id: S.user.sis_user_id, sis_import_id: null,
        grades: {html_url: `${BASE}/courses/${c.id}/grades/${S.user.id}`, current_grade: c.scores?.current_grade ?? null, current_score: c.scores?.current_score ?? null, final_grade: c.scores?.final_grade ?? null, final_score: c.scores?.final_score ?? null, unposted_current_score: null, unposted_current_grade: null, unposted_final_score: null, unposted_final_grade: null},
        user: {id: +S.user.id, name: S.user.name, created_at: '2023-09-15T17:02:11-07:00', sortable_name: S.user.sortable_name, short_name: S.user.short_name, sis_user_id: S.user.sis_user_id, integration_id: null, login_id: S.user.login_id}}
      return ok([e])
    }
    if (method === 'GET' && sub === '/discussion_topics') {
      const ann = q.get('only_announcements') === 'true'
      const term = (q.get('search_term') || '').toLowerCase()
      const src = (ann ? c.announcements : c.discussions).filter(d => !term || d.title.toLowerCase().includes(term) || (d.message || '').toLowerCase().includes(term))
      const list = ann ? src.map(an => announcementJson(S, c, an)) : src.map(d => discussionJson(S, c, d))
      return (r => ok(r.body, r.headers))(paginate(req, list))
    }
    if (method === 'GET' && sub === '/modules') {
      const withItems = include.includes('items'), details = include.includes('content_details')
      const list = c.modules.map(mod => moduleJson(S, c, mod, {withItems, details}))
      return (r => ok(r.body, r.headers))(paginate(req, list, {defaultPer: 10}))
    }
    if ((m = sub.match(/^\/modules\/(\d+)$/)) && method === 'GET') {
      const mod = c.modules.find(x => x.id === m[1])
      return mod ? ok(moduleJson(S, c, mod, {withItems: include.includes('items'), details: include.includes('content_details')})) : notFound()
    }
    if ((m = sub.match(/^\/modules\/(\d+)\/items$/)) && method === 'GET') {
      const mod = c.modules.find(x => x.id === m[1])
      if (!mod) return notFound()
      return (r => ok(r.body, r.headers))(paginate(req, mod.items.map(it => moduleItemJson(S, c, mod, it, {details: include.includes('content_details')})), {defaultPer: 10}))
    }
    if ((m = sub.match(/^\/modules\/(\d+)\/items\/(\d+)$/)) && method === 'GET') {
      const mod = c.modules.find(x => x.id === m[1])
      const it = mod?.items.find(x => x.id === m[2])
      return it ? ok(moduleItemJson(S, c, mod, it, {details: include.includes('content_details')})) : notFound()
    }
    if (method === 'GET' && sub === '/pages') {
      let list = [...c.pages]
      const term = (q.get('search_term') || '').toLowerCase()
      if (term) list = list.filter(pg => pg.title.toLowerCase().includes(term))
      const sort = q.get('sort') || 'title', desc = q.get('order') === 'desc'
      const key = pg => (sort === 'updated_at' ? +new Date(pg.updated_at || 0) : sort === 'created_at' ? +new Date(pg.created_at || 0) : pg.title.toLowerCase())
      list.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0) * (desc ? -1 : 1))
      return (r => ok(r.body, r.headers))(paginate(req, list.map(pg => pageJson(S, c, pg))))
    }
    if ((m = sub.match(/^\/pages\/([\w-]+)$/)) && method === 'GET') {
      const pg = c.pages.find(x => x.url === m[1])
      return pg ? ok({...pageJson(S, c, pg), body: `<p>${pg.title}</p>`}) : notFound()
    }
    if (method === 'GET' && (sub === '/files' || (m = sub.match(/^\/files\/(\d+)$/)))) {
      if (c.files_hidden) return {status: 403, body: {status: 'unauthorized', errors: [{message: 'user not authorized to perform that action'}]}}
      if (m && sub !== '/files') { const f = (c.files || []).find(x => x.id === m[1]); return f ? ok(fileJson(S, c, f)) : notFound() }
      let list = [...(c.files || [])]
      const term = (q.get('search_term') || '').toLowerCase()
      if (term) list = list.filter(f => f.display_name.toLowerCase().includes(term))
      const sort = q.get('sort') || 'name', desc = q.get('order') === 'desc'
      const key = f => (sort === 'created_at' ? +f.created_at : sort === 'updated_at' ? +f.updated_at : sort === 'size' ? f.size : f.display_name.toLowerCase())
      list.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0) * (desc ? -1 : 1))
      return (r => ok(r.body, r.headers))(paginate(req, list.map(f => fileJson(S, c, f))))
    }
    if (method === 'GET' && sub === '/activity_stream/summary') {
      const annUnread = c.announcements.filter(a => a.read_state === 'unread').length
      const discUnread = c.discussions.reduce((n, d) => n + (d.unread_count || 0), 0)
      return ok([
        {type: 'Announcement', unread_count: annUnread, count: c.announcements.length, notification_category: null},
        {type: 'DiscussionTopic', unread_count: discUnread, count: c.discussions.length, notification_category: null},
        {type: 'Message', unread_count: 0, count: 2, notification_category: 'Due Date'},
      ])
    }
  }

  // ---- planner ----
  if (method === 'GET' && p === '/planner/items') {
    const now = S.now
    let start = q.get('start_date') ? new Date(q.get('start_date')) : null
    let end = q.get('end_date') ? new Date(q.get('end_date')) : null
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('start_date') || '')) start = startOfLaDay(new Date(q.get('start_date') + 'T12:00:00Z'))
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('end_date') || '')) end = startOfLaDay(new Date(q.get('end_date') + 'T12:00:00Z'))
    if (!start && !end) { start = addDays(startOfLaDay(now), -14); end = addDays(startOfLaDay(now), 14) }
    else if (!start) start = addDays(end, -3650)
    else if (!end) end = addDays(start, 3650)
    const ctx = arr(q, 'context_codes')
    const filter = q.get('filter')
    let items = allPlannerItems(S).filter(it => {
      const d = new Date(it.plannable_date)
      if (d < start || d > end) return false
      if (ctx.length && !(it.course_id ? ctx.includes(`course_${it.course_id}`) : ctx.includes(`user_${S.user.id}`))) return false
      return true
    })
    if (filter === 'incomplete_items') items = items.filter(it => !isComplete(S, it) && it.plannable_type !== 'announcement' && it.plannable_type !== 'calendar_event')
    if (filter === 'complete_items') items = items.filter(it => isComplete(S, it))
    if (filter === 'new_activity') items = items.filter(it => it.new_activity)
    const desc = q.get('order') === 'desc'
    items.sort((a, b) => (new Date(a.plannable_date) - new Date(b.plannable_date)) * (desc ? -1 : 1) || a.plannable_id - b.plannable_id)
    return (r => ok(r.body, r.headers))(paginate(req, items, {defaultPer: 50}))
  }
  if (p === '/planner/overrides') {
    if (method === 'GET') return ok(S.plannerOverrides.map(overrideJson))
    if (method === 'POST') {
      const b = parseBody(req)
      if (!b.plannable_type || !b.plannable_id) return err(400, 'plannable_type and plannable_id required')
      if (S.plannerOverrides.find(o => o.plannable_type === b.plannable_type && o.plannable_id === String(b.plannable_id))) return err(400, 'A planner override for this item already exists')
      const o = {id: nextSeq(S), plannable_type: b.plannable_type, plannable_id: String(b.plannable_id), user_id: S.user.id, marked_complete: bool(b.marked_complete), dismissed: bool(b.dismissed), created_at: new Date(), updated_at: new Date()}
      S.plannerOverrides.push(o)
      return {status: 201, body: overrideJson(o)}
    }
  }
  if ((m = p.match(/^\/planner\/overrides\/(\d+)$/))) {
    const o = S.plannerOverrides.find(x => x.id === m[1])
    if (!o) return notFound()
    if (method === 'GET') return ok(overrideJson(o))
    if (method === 'PUT') {
      const b = parseBody(req)
      // Canvas assigns both fields every time (planner_overrides_controller.rb#update)
      o.marked_complete = bool(b.marked_complete); o.dismissed = bool(b.dismissed); o.updated_at = new Date()
      return ok(overrideJson(o))
    }
    if (method === 'DELETE') { S.plannerOverrides = S.plannerOverrides.filter(x => x !== o); return ok({...overrideJson(o), workflow_state: 'deleted'}) }
  }
  if (p === '/planner_notes') {
    if (method === 'GET') return ok(S.plannerNotes.filter(n => n.workflow_state !== 'deleted').map(n => plannerNoteJson(S, n)))
    if (method === 'POST') {
      const b = parseBody(req)
      const n = {id: nextSeq(S), title: b.title || '', details: b.details || '', todo_date: b.todo_date ? new Date(b.todo_date) : S.now, course_id: b.course_id ? String(b.course_id) : null, workflow_state: 'active', created_at: new Date(), updated_at: new Date()}
      S.plannerNotes.push(n)
      return ok(plannerNoteJson(S, n))
    }
  }
  if ((m = p.match(/^\/planner_notes\/(\d+)$/))) {
    const n = S.plannerNotes.find(x => x.id === m[1] && x.workflow_state !== 'deleted')
    if (!n) return notFound()
    if (method === 'GET') return ok(plannerNoteJson(S, n))
    if (method === 'PUT') {
      const b = parseBody(req)
      if ('title' in b) n.title = b.title
      if ('details' in b) n.details = b.details
      if ('todo_date' in b) n.todo_date = new Date(b.todo_date)
      if ('course_id' in b) n.course_id = b.course_id ? String(b.course_id) : null
      n.updated_at = new Date()
      return ok(plannerNoteJson(S, n))
    }
    if (method === 'DELETE') { n.workflow_state = 'deleted'; return ok(plannerNoteJson(S, n)) }
  }

  // ---- user lists ----
  if (method === 'GET' && p === '/users/self/todo') {
    const now = S.now
    const list = []
    for (const c of S.courses) for (const a of c.assignments) {
      const s = c.submissions.get(a.id)
      if (!a.due_at || a.due_at < now || a.due_at > addDays(now, 7) || s?.submitted_at || s?.excused) continue
      if (S.ignoredTodos?.has(a.id)) continue
      list.push({type: 'submitting', assignment: assignmentJson(S, c, a), ignore: `${BASE}/api/v1/users/self/todo/assignment_${a.id}/submitting?permanent=0`, ignore_permanently: `${BASE}/api/v1/users/self/todo/assignment_${a.id}/submitting?permanent=1`, html_url: `${BASE}/courses/${c.id}/assignments/${a.id}#submit`, needs_grading_count: undefined, context_type: 'Course', course_id: +c.id, group_id: null})
    }
    list.sort((x, y) => new Date(x.assignment.due_at) - new Date(y.assignment.due_at))
    return (r => ok(r.body, r.headers))(paginate(req, list))
  }
  if ((m = p.match(/^\/users\/self\/todo\/assignment_(\d+)\/submitting$/)) && method === 'DELETE') {
    S.ignoredTodos ||= new Set(); S.ignoredTodos.add(m[1]); return {status: 204, body: null}
  }
  if (method === 'GET' && p === '/users/self/todo_item_count') {
    const n = S.courses.flatMap(c => c.assignments.filter(a => a.due_at && a.due_at > S.now && a.due_at < addDays(S.now, 7) && !c.submissions.get(a.id)?.submitted_at)).length
    return ok({needs_grading_count: 0, assignments_needing_submitting: n})
  }
  if (method === 'GET' && p === '/users/self/upcoming_events') {
    const now = S.now, end = addDays(now, 7)
    const list = [
      ...S.calendarEvents.filter(e => e.start_at >= now && e.start_at <= end).map(e => calendarEventJson(S, e)),
      ...S.courses.flatMap(c => c.assignments.filter(a => a.due_at && a.due_at >= now && a.due_at <= end).map(a => assignmentEventJson(S, c, a))),
    ].sort((a, b) => new Date(a.start_at) - new Date(b.start_at)).slice(0, 10)
    return ok(list)
  }
  if (method === 'GET' && p === '/users/self/missing_submissions') {
    const list = []
    for (const c of S.courses) for (const a of c.assignments) {
      const s = c.submissions.get(a.id)
      if (!s?.missing) continue
      const j = assignmentJson(S, c, a)
      if (include.includes('planner_overrides')) j.planner_override = (o => (o ? overrideJson(o) : null))(S.plannerOverrides.find(o => o.plannable_type === 'assignment' && o.plannable_id === a.id))
      if (include.includes('course')) j.course = courseJson(S, c)
      list.push(j)
    }
    return (r => ok(r.body, r.headers))(paginate(req, list, {defaultPer: 10}))
  }
  if (method === 'GET' && p === '/users/self/activity_stream') {
    const list = S.courses.flatMap(c => c.announcements.map(an => ({id: +an.id + 50000000, title: an.title, message: an.message, type: 'Announcement', read_state: an.read_state === 'read', context_type: 'Course', course_id: +c.id, created_at: iso(an.posted_at), updated_at: iso(an.posted_at), html_url: `${BASE}/courses/${c.id}/discussion_topics/${an.id}`, announcement_id: +an.id})))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return (r => ok(r.body, r.headers))(paginate(req, list, {defaultPer: 21}))
  }
  if (method === 'GET' && p === '/users/self/activity_stream/summary') {
    const unread = S.courses.flatMap(c => c.announcements).filter(an => an.read_state === 'unread').length
    return ok([{type: 'Announcement', unread_count: unread, count: S.courses.flatMap(c => c.announcements).length, notification_category: null}])
  }

  // ---- announcements / calendar ----
  if (method === 'GET' && p === '/announcements') {
    const ctx = arr(q, 'context_codes')
    const start = q.get('start_date') ? new Date(q.get('start_date')) : addDays(S.now, -14)
    const end = q.get('end_date') ? new Date(q.get('end_date')) : addDays(S.now, 1)
    const list = []
    for (const c of S.courses) {
      if (ctx.length && !ctx.includes(`course_${c.id}`)) continue
      for (const an of c.announcements) if (an.posted_at >= start && an.posted_at <= end) list.push(announcementJson(S, c, an))
    }
    list.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at))
    return (r => ok(r.body, r.headers))(paginate(req, list))
  }
  if (method === 'GET' && p === '/calendar_events') {
    const type = q.get('type') || 'event'
    const ctx = arr(q, 'context_codes')
    const start = q.get('start_date') ? new Date(q.get('start_date')) : startOfLaDay(S.now)
    const end = q.get('end_date') ? new Date(q.get('end_date')) : addDays(startOfLaDay(S.now), 1)
    const inCtx = code => !ctx.length || ctx.includes(code)
    let list
    if (type === 'assignment') {
      list = S.courses.flatMap(c => (inCtx(`course_${c.id}`) ? c.assignments.filter(a => a.due_at && a.due_at >= start && a.due_at <= end).map(a => assignmentEventJson(S, c, a)) : []))
    } else {
      list = S.calendarEvents.filter(e => inCtx(e.context_code) && e.start_at >= start && e.start_at <= end).map(e => calendarEventJson(S, e))
    }
    list.sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    return (r => ok(r.body, r.headers))(paginate(req, list))
  }

  // ---- inbox ----
  if (method === 'GET' && p === '/conversations/unread_count') return ok({unread_count: String(S.conversations.filter(c => c.workflow_state === 'unread').length)})
  if (method === 'GET' && p === '/conversations') {
    const scope = q.get('scope')
    let list = S.conversations
    if (scope === 'unread') list = list.filter(c => c.workflow_state === 'unread')
    if (scope === 'starred') list = list.filter(c => c.starred)
    if (scope === 'sent' || scope === 'archived') list = []
    return (r => ok(r.body, r.headers))(paginate(req, list.map(cv => conversationJson(S, cv))))
  }

  return null
}

export {parseBody}
