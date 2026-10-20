// Endpoints for the new student "widget dashboard" (ui/features/widget_dashboard at canvas-lms
// 1c9f0bb8013e). The real widgets read most of their data over GraphQL, so this file answers the
// exact operations they send to POST /api/graphql:
//   GetUserCourseWork            hooks/useCourseWork.ts           (User.courseWorkSubmissionsConnection)
//   GetUserCourseStatistics      hooks/useCourseWorkStatistics.ts (Course.submissionStatistics)
//   GetUserAnnouncements         hooks/useAnnouncements.ts        (User.discussionParticipantsConnection)
//   GetCourseInstructorsPaginated graphql/coursePeople.ts         (Query.courseInstructorsConnection)
//   GetDashboardNotifications    components/DashboardNotifications.tsx
//   mutations: UpdateAnnouncementReadState, UpdateLearnerDashboardTabSelection,
//              UpdateWidgetDashboardConfig, UpdateWidgetDashboardLayout
// Filtering follows app/graphql/types/user_type.rb#course_work_submissions_connection and
// app/graphql/types/submission_statistics_type.rb.
//
// It also answers PUT /api/v1/users/:id/settings for the numeric-id form the widget dashboard
// uses (DarkModeToggle.tsx, @canvas/dashboard-toggle): widget_dashboard_dark_mode and
// widget_dashboard_user_preference (users_controller.rb#settings).
//
// The resolver (widgetGraphqlResolve) is a pure function over a JSON "db" snapshot (buildWidgetDb)
// with no outer references, so pages/dashboard_widget.mjs can also embed it as a client-side
// fallback while server.mjs does not yet route /api/graphql to the api/extra-*.mjs handlers.
import {nickname} from '../data/state.mjs'
import {DEFAULT_SCHEME} from '../data/scenarios.mjs'
import {iso} from '../lib/time.mjs'

// Instructor identities for the scenario's `prof` strings (ids match the conversation senders).
const PEOPLE = {
  'Prof. Alex Rivera': {id: '1180001', name: 'Alex Rivera', sortable: 'Rivera, Alex'},
  'Prof. Jordan Lee': {id: '1180002', name: 'Jordan Lee', sortable: 'Lee, Jordan'},
  'Dr. Casey Morgan': {id: '1180044', name: 'Casey Morgan', sortable: 'Morgan, Casey'},
  'Lab Coordinator': {id: '1180045', name: 'Chem Lab Coordinator', sortable: 'Lab Coordinator, Chem'},
  'Prof. Taylor Brooks': {id: '1180003', name: 'Taylor Brooks', sortable: 'Brooks, Taylor'},
  Staff: {id: '1180099', name: 'Department Staff', sortable: 'Staff, Department'},
}
const TA = {id: '1180120', name: 'Priya Raman', sortable: 'Raman, Priya'}

export function widgetPrefs(S) {
  S.widgetPrefs ||= {tab: null, config: null, darkMode: false, userPreference: true}
  return S.widgetPrefs
}

// users_controller.rb#fetch_courses_with_grades -> ENV.SHARED_COURSE_DATA
export function sharedCourseData(S) {
  const courses = S.courses.filter(c => c.enrollment_state === 'active' && (!c.term?.end_at || c.term.end_at > S.now))
  const data = courses.map(c => {
    let last = null
    for (const s of c.submissions.values()) if (s.graded_at && (!last || s.graded_at > last)) last = s.graded_at
    const score = c.hide_final_grades ? null : c.scores?.current_score ?? null
    return {
      courseId: c.id,
      courseCode: c.course_code || 'N/A',
      courseName: nickname(S, c),
      originalName: c.name,
      currentGrade: score,
      gradingScheme: c.grading_standard_enabled ? DEFAULT_SCHEME : 'percentage',
      lastUpdated: score != null && last ? new Date(last).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
      courseColor: S.colors[`course_${c.id}`] ?? null,
      term: c.term?.name ?? null,
      image: c.image || null,
    }
  })
  return data.sort((a, b) => a.courseName.toLowerCase().localeCompare(b.courseName.toLowerCase()))
}

// Plain-JSON snapshot of what the resolvers need.
export function buildWidgetDb(S) {
  const work = []
  for (const c of S.courses) {
    if (c.enrollment_state !== 'active' || c.workflow_state !== 'available') continue
    for (const a of c.assignments) {
      if (!a.published) continue
      const s = c.submissions.get(a.id) || {}
      work.push({
        subId: s.id || String(+a.id + 9000000), aId: a.id, name: a.name, dueAt: iso(a.due_at), cachedDueDate: iso(s.cached_due_date || a.due_at),
        points: a.points_possible, submissionTypes: a.submission_types,
        quiz: a.is_quiz ? {_id: a.quiz_id, title: a.name} : null,
        discussion: a.is_discussion ? {_id: a.discussion_topic_id, title: a.name} : null,
        htmlUrl: `https://canvas.example.edu/courses/${c.id}/assignments/${a.id}`,
        courseId: c.id, courseName: c.name,
        submittedAt: iso(s.submitted_at), late: !!s.late, missing: !!s.missing, excused: !!s.excused,
        state: s.workflow_state || 'unsubmitted', score: s.score ?? null,
      })
    }
  }
  const announcements = []
  for (const c of S.courses) {
    for (const an of c.announcements) {
      const who = PEOPLE[an.author]
      announcements.push({
        id: an.id, title: an.title, message: an.message, createdAt: iso(an.posted_at), contextName: c.name, contextId: c.id,
        read: an.read_state === 'read',
        author: {_id: who?.id || '1180090', name: who?.name || an.author, avatarUrl: null},
      })
    }
  }
  const byUser = new Map()
  const add = (who, c, type) => {
    if (!byUser.has(who.id)) byUser.set(who.id, {user: {_id: who.id, name: who.name, sortableName: who.sortable, shortName: who.name, avatarUrl: null, email: null}, enrollments: []})
    byUser.get(who.id).enrollments.push({course: {_id: c.id, name: c.name, courseCode: c.course_code}, type, role: {_id: type === 'TeacherEnrollment' ? '4' : '5', name: type}, enrollmentState: 'active'})
  }
  for (const c of S.courses) {
    if (c.is_advising || c.enrollment_state !== 'active') continue
    add(PEOPLE[c.prof] || {id: '1180098', name: c.prof, sortable: c.prof}, c, 'TeacherEnrollment')
    if (/^MTH /.test(c.short_code || '')) add(TA, c, 'TaEnrollment')
  }
  return {
    userId: S.user.id,
    now: S.now.toISOString(),
    courseIds: S.courses.filter(c => c.enrollment_state === 'active').map(c => c.id),
    courseNames: Object.fromEntries(S.courses.map(c => [c.id, c.name])),
    work,
    announcements: announcements.sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)),
    instructors: [...byUser.values()].sort((x, y) => x.user.sortableName.localeCompare(y.user.sortableName)),
    prefs: {...widgetPrefs(S)},
  }
}

// Pure resolver: (db, {query, variables}) -> {data} | {errors}. Must not reference anything
// outside itself (it is embedded with Function.prototype.toString as the client fallback).
export function widgetGraphqlResolve(db, body) {
  const q = String((body && body.query) || '')
  const v = (body && body.variables) || {}
  const m = q.match(/\b(query|mutation)\s+(\w+)/)
  const op = m ? m[2] : (body && body.operationName) || ''
  const now = new Date(db.now).getTime()
  const t = s => (s ? new Date(s).getTime() : null)
  const enc = n => (typeof btoa === 'function' ? btoa(String(n)) : Buffer.from(String(n)).toString('base64'))
  const dec = s => {
    if (!s) return 0
    const str = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString()
    return parseInt(str, 10) || 0
  }
  function page(list, first, after) {
    const start = dec(after)
    const n = first == null ? list.length : first
    const nodes = list.slice(start, start + n)
    return {
      nodes,
      pageInfo: {
        hasNextPage: start + n < list.length,
        hasPreviousPage: start > 0,
        startCursor: nodes.length ? enc(start + 1) : null,
        endCursor: nodes.length ? enc(start + nodes.length) : null,
        totalCount: list.length,
      },
    }
  }
  const submitted = w => !!w.submittedAt || w.state === 'submitted' || w.state === 'pending_review'
  const graded = w => w.state === 'graded' && w.score != null

  if (op === 'GetUserCourseWork') {
    let ids = db.courseIds
    if (v.courseFilter) ids = ids.filter(id => String(id) === String(v.courseFilter))
    let list = db.work.filter(w => ids.indexOf(w.courseId) >= 0)
    if (v.onlySubmitted) {
      list = list.filter(w => !w.missing && (w.excused || w.state === 'submitted' || w.state === 'pending_review' || graded(w)))
    } else if (v.includeOverdue) {
      list = list.filter(w => !w.excused && w.missing)
    } else {
      list = list.filter(w => !w.submittedAt && !w.excused && !graded(w))
    }
    if (!v.onlySubmitted) {
      const sd = t(v.startDate), ed = t(v.endDate)
      const conds = []
      if (sd != null && ed != null) conds.push(w => t(w.cachedDueDate) != null && t(w.cachedDueDate) >= sd && t(w.cachedDueDate) <= ed)
      else if (sd != null) conds.push(w => t(w.cachedDueDate) != null && t(w.cachedDueDate) >= sd)
      else if (ed != null) conds.push(w => t(w.cachedDueDate) != null && t(w.cachedDueDate) <= ed)
      if (v.includeNoDueDate) conds.push(w => w.cachedDueDate == null)
      if (conds.length) list = list.filter(w => conds.some(c => c(w)))
    }
    list = list.slice().sort((a, b) => (t(a.cachedDueDate) ?? 9e15) - (t(b.cachedDueDate) ?? 9e15) || (t(a.dueAt) ?? 9e15) - (t(b.dueAt) ?? 9e15))
    const p = page(list, v.first, v.after)
    return {data: {legacyNode: {_id: db.userId, courseWorkSubmissionsConnection: {
      nodes: p.nodes.map(w => ({
        _id: w.subId, cachedDueDate: w.cachedDueDate, submittedAt: w.submittedAt, late: w.late, missing: w.missing, excused: w.excused, state: w.state,
        assignment: {_id: w.aId, name: w.name, dueAt: w.dueAt, pointsPossible: w.points, htmlUrl: w.htmlUrl, submissionTypes: w.submissionTypes, state: 'published', published: true, quiz: w.quiz, discussion: w.discussion, course: {_id: w.courseId, name: w.courseName}},
      })),
      pageInfo: p.pageInfo,
    }}}}
  }

  if (op === 'GetUserCourseStatistics') {
    const sd = t(v.startDate), ed = t(v.endDate)
    const enrollments = db.courseIds.map(id => {
      const subs = db.work.filter(w => w.courseId === id)
      const inRange = subs.filter(w => sd == null || ed == null || (t(w.cachedDueDate) != null && t(w.cachedDueDate) >= sd && t(w.cachedDueDate) <= ed))
      return {course: {
        _id: id,
        name: db.courseNames[id] || '',
        submissionStatistics: {
          submissionsDueCount: inRange.filter(w => t(w.cachedDueDate) != null && t(w.cachedDueDate) > now && !submitted(w) && !graded(w) && !w.excused && !w.missing).length,
          missingSubmissionsCount: subs.filter(w => w.missing).length,
          submissionsSubmittedCount: subs.filter(w => !w.missing && (submitted(w) || graded(w) || w.excused)).length,
        },
      }}
    })
    return {data: {legacyNode: {_id: db.userId, enrollments}}}
  }

  if (op === 'GetUserAnnouncements') {
    let list = db.announcements
    if (v.readState === 'read') list = list.filter(a => a.read)
    else if (v.readState === 'unread') list = list.filter(a => !a.read)
    const p = page(list, v.first, v.after)
    return {data: {legacyNode: {_id: db.userId, discussionParticipantsConnection: {
      nodes: p.nodes.map(a => ({
        id: 'DiscussionParticipant-' + a.id, read: a.read,
        discussionTopic: {_id: a.id, title: a.title, message: a.message, createdAt: a.createdAt, contextName: a.contextName, contextId: a.contextId, isAnnouncement: true, author: a.author},
      })),
      pageInfo: p.pageInfo,
    }}}}
  }

  if (op === 'GetCourseInstructorsPaginated') {
    const ids = (v.courseIds || []).map(String)
    const types = v.enrollmentTypes && v.enrollmentTypes.length ? v.enrollmentTypes : ['TeacherEnrollment', 'TaEnrollment']
    const list = db.instructors
      .map(i => ({user: i.user, enrollments: i.enrollments.filter(e => (!ids.length || ids.indexOf(e.course._id) >= 0) && types.indexOf(e.type) >= 0)}))
      .filter(i => i.enrollments.length)
    const p = page(list, v.first, v.after)
    return {data: {courseInstructorsConnection: {nodes: p.nodes, pageInfo: p.pageInfo}}}
  }

  if (op === 'GetDashboardNotifications') return {data: {accountNotifications: [], enrollmentInvitations: []}}

  if (op === 'UpdateAnnouncementReadState') {
    const a = db.announcements.find(x => String(x.id) === String(v.discussionTopicId))
    if (!a) return {data: {updateDiscussionReadState: null}, errors: [{message: 'not found'}]}
    a.read = !!v.read
    return {data: {updateDiscussionReadState: {discussionTopic: {_id: a.id}}}}
  }
  if (op === 'UpdateLearnerDashboardTabSelection') {
    db.prefs.tab = v.tab
    return {data: {updateLearnerDashboardTabSelection: {tab: v.tab, errors: null}}}
  }
  if (op === 'UpdateWidgetDashboardConfig') {
    db.prefs.config = db.prefs.config || {}
    db.prefs.config.filters = db.prefs.config.filters || {}
    db.prefs.config.filters[v.widgetId] = v.filters
    return {data: {updateWidgetDashboardConfig: {widgetId: v.widgetId, filters: v.filters, errors: null}}}
  }
  if (op === 'UpdateWidgetDashboardLayout') {
    db.prefs.config = db.prefs.config || {}
    try { db.prefs.config.layout = JSON.parse(v.layout) } catch (e) { return {errors: [{message: 'invalid layout'}]} }
    return {data: {updateWidgetDashboardLayout: {layout: v.layout, errors: null}}}
  }
  return {errors: [{message: 'mock-canvas: unsupported GraphQL operation ' + (op || '(anonymous)')}]}
}

function applyMutationToState(S, db, body) {
  const op = (String(body?.query || '').match(/\bmutation\s+(\w+)/) || [])[1]
  const v = body?.variables || {}
  if (op === 'UpdateAnnouncementReadState') {
    for (const c of S.courses) for (const an of c.announcements) if (String(an.id) === String(v.discussionTopicId)) an.read_state = v.read ? 'read' : 'unread'
  }
  if (['UpdateLearnerDashboardTabSelection', 'UpdateWidgetDashboardConfig', 'UpdateWidgetDashboardLayout'].includes(op)) {
    Object.assign(widgetPrefs(S), db.prefs)
  }
}

export default function widgetApi(S, req) {
  if (req.path === '/api/graphql' && req.method === 'POST') {
    let body = {}
    try { body = JSON.parse(req.rawBody || '{}') } catch { return {status: 400, body: {errors: [{message: 'invalid JSON'}]}} }
    const db = buildWidgetDb(S)
    const out = widgetGraphqlResolve(db, body)
    applyMutationToState(S, db, body)
    return {status: 200, body: out}
  }
  const m = req.path.match(/^\/api\/v1\/users\/(\d+)\/settings\/?$/)
  if (m && m[1] === S.user.id && (req.method === 'PUT' || req.method === 'GET')) {
    const p = widgetPrefs(S)
    if (req.method === 'PUT') {
      let b = {}
      const ct = req.headers['content-type'] || ''
      try { b = ct.includes('json') ? JSON.parse(req.rawBody || '{}') : Object.fromEntries(new URLSearchParams(req.rawBody || '')) } catch { b = {} }
      const bool = x => x === true || x === 'true' || x === '1'
      if ('widget_dashboard_dark_mode' in b) p.darkMode = bool(b.widget_dashboard_dark_mode)
      if ('widget_dashboard_user_preference' in b) p.userPreference = bool(b.widget_dashboard_user_preference)
      if ('hide_dashcard_color_overlays' in b) S.settings = {...(S.settings || {}), hide_dashcard_color_overlays: bool(b.hide_dashcard_color_overlays)}
    }
    return {status: 200, body: {
      manual_mark_as_read: false, release_notes_badge_disabled: false, collapse_global_nav: false, collapse_course_nav: false,
      hide_dashcard_color_overlays: !!S.settings?.hide_dashcard_color_overlays, comment_library_suggestions_enabled: false,
      elementary_dashboard_disabled: false, widget_dashboard_user_preference: p.userPreference, widget_dashboard_dark_mode: p.darkMode,
    }}
  }
  return null
}

