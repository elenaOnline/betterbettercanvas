// Canvas REST JSON shapes. Field lists follow the @API docs / serializers in canvas-lms
// (lib/api/v1/course_json.rb, assignment.rb, submission.rb, planner_item.rb, user.rb,
// app/presenters/course_for_menu_presenter.rb, section_tab_presenter.rb). IDs are numbers unless
// the client sent Accept: application/json+canvas-string-ids (handled in routes via `idify`).
import {iso} from '../lib/time.mjs'
import {nickname, colorOf, isFavorite} from '../data/state.mjs'
import {currentPeriod} from '../data/scenarios.mjs'

const BASE = 'https://canvas.example.edu'

export function userJson(S) {
  const u = S.user
  return {
    id: +u.id, name: u.name, created_at: '2023-09-15T17:02:11-07:00', sortable_name: u.sortable_name,
    short_name: u.short_name, sis_user_id: u.sis_user_id, integration_id: null, login_id: u.login_id,
    avatar_url: u.avatar_url, last_name: u.last_name, first_name: u.first_name, email: u.primary_email,
    locale: u.locale, effective_locale: 'en', permissions: {can_update_name: false, can_update_avatar: true, limit_parent_app_web_access: false},
  }
}

export function profileJson(S) {
  const u = S.user
  return {
    id: +u.id, name: u.name, short_name: u.short_name, sortable_name: u.sortable_name, title: null, bio: null,
    pronunciation: null, primary_email: u.primary_email, login_id: u.login_id, integration_id: null,
    time_zone: u.time_zone, locale: u.locale, effective_locale: 'en', avatar_url: u.avatar_url,
    calendar: {ics: `${BASE}/feeds/calendars/user_mockfeedtoken${u.id}.ics`}, lti_user_id: 'mock-lti-user-id', k5_user: false,
    use_classic_font_in_k5: false,
  }
}

export function termJson(t) {
  return {id: +t.id, name: t.name, start_at: iso(t.start_at), end_at: iso(t.end_at), created_at: '2022-05-01T00:00:00Z', workflow_state: t.workflow_state, grading_period_group_id: null}
}

export function enrollmentJson(S, c, {scores = false, periods = false} = {}) {
  const e = {
    type: 'student', role: 'StudentEnrollment', role_id: 3, user_id: +S.user.id,
    enrollment_state: c.enrollment_state, limit_privileges_to_course_section: false,
  }
  // courses_controller.rb: total_scores is ignored when the course hides final grades
  if (scores && !c.hide_final_grades && c.scores) {
    Object.assign(e, {
      computed_current_score: c.scores.current_score, computed_final_score: c.scores.final_score,
      computed_current_grade: c.scores.current_grade, computed_final_grade: c.scores.final_grade,
      computed_current_letter_grade: c.scores.current_grade, computed_final_letter_grade: c.scores.final_grade,
    })
    if (periods) {
      const gp = currentPeriod(c, S.now)
      const ps = gp && c.periodScores?.[gp.id]
      Object.assign(e, {
        has_grading_periods: !!c.gradingPeriods, totals_for_all_grading_periods_option: c.gradingPeriodSet ? !!c.gradingPeriodSet.display_totals_for_all_grading_periods : true,
        current_grading_period_title: gp ? gp.title : null, current_grading_period_id: gp ? +gp.id : null,
        current_period_override_grade: null, current_period_override_score: null, current_period_unposted_current_score: null,
        current_period_computed_current_score: ps ? ps.current_score : null, current_period_computed_final_score: ps ? ps.final_score : null,
        current_period_computed_current_grade: ps ? ps.current_grade : null, current_period_computed_final_grade: ps ? ps.final_grade : null,
      })
    }
  }
  return e
}

export function courseJson(S, c, include = []) {
  const nick = S.nicknames[c.id]
  const j = {
    id: +c.id, name: nick || c.name, account_id: +c.account_id, uuid: c.uuid, start_at: iso(c.start_at),
    grading_standard_id: c.grading_standard_enabled ? 1 : null, is_public: false, created_at: iso(c.created_at),
    course_code: c.course_code, default_view: c.default_view, root_account_id: 1, enrollment_term_id: +c.enrollment_term_id,
    license: 'private', grade_passback_setting: null, end_at: iso(c.end_at), public_syllabus: false,
    public_syllabus_to_auth: false, storage_quota_mb: 500, is_public_to_auth_users: false, homeroom_course: false,
    course_color: null, friendly_name: null, apply_assignment_group_weights: c.apply_assignment_group_weights,
    calendar: {ics: `${BASE}/feeds/calendars/course_${c.uuid}.ics`}, time_zone: c.time_zone, blueprint: false,
    template: false, sis_course_id: c.sis_course_id, integration_id: null,
    enrollments: [enrollmentJson(S, c, {scores: include.includes('total_scores'), periods: include.includes('current_grading_period_scores')})],
    hide_final_grades: c.hide_final_grades, workflow_state: c.workflow_state,
    restrict_enrollments_to_course_dates: false,
  }
  if (nick) j.original_name = c.name
  if (include.includes('term')) j.term = termJson(c.term)
  if (include.includes('favorites')) j.is_favorite = isFavorite(S, c)
  if (include.includes('syllabus_body')) j.syllabus_body = c.syllabus_body
  if (include.includes('course_image')) j.image_download_url = c.image
  if (include.includes('concluded')) j.concluded = c.enrollment_state === 'completed'
  if (include.includes('tabs')) j.tabs = courseTabs(c).map(t => ({id: t.id, html_url: t.path, full_url: BASE + t.path, position: t.position, visibility: 'public', label: t.label, type: 'internal'}))
  return j
}

// Course navigation tabs (Course::TAB_*). the pilot school courses typically hide a few; we show a common set.
export function courseTabs(c) {
  const p = `/courses/${c.id}`
  if (c.is_advising) {
    return [
      {id: 'home', label: 'Home', path: p, css_class: 'home'},
      {id: 'announcements', label: 'Announcements', path: `${p}/announcements`, css_class: 'announcements'},
      {id: 'pages', label: 'Pages', path: `${p}/wiki`, css_class: 'pages'},
      {id: 'people', label: 'People', path: `${p}/users`, css_class: 'people'},
    ].map((t, i) => ({...t, position: i + 1}))
  }
  return [
    {id: 'home', label: 'Home', path: p, css_class: 'home'},
    {id: 'announcements', label: 'Announcements', path: `${p}/announcements`, css_class: 'announcements'},
    {id: 'modules', label: 'Modules', path: `${p}/modules`, css_class: 'modules'},
    {id: 'assignments', label: 'Assignments', path: `${p}/assignments`, css_class: 'assignments'},
    {id: 'discussions', label: 'Discussions', path: `${p}/discussion_topics`, css_class: 'discussions'},
    {id: 'grades', label: 'Grades', path: `${p}/grades`, css_class: 'grades'},
    {id: 'people', label: 'People', path: `${p}/users`, css_class: 'people'},
    {id: 'syllabus', label: 'Syllabus', path: `${p}/assignments/syllabus`, css_class: 'syllabus'},
    ...(c.files_hidden ? [] : [{id: 'files', label: 'Files', path: `${p}/files`, css_class: 'files'}]),
    {id: 'context_external_tool_9001', label: 'Zoom', path: `${p}/external_tools/9001`, css_class: 'context_external_tool_9001'},
    {id: 'context_external_tool_9002', label: 'YuJa', path: `${p}/external_tools/9002`, css_class: 'context_external_tool_9002'},
  ].map((t, i) => ({...t, position: i + 1}))
}

// /api/v1/dashboard/dashboard_cards item (CourseForMenuPresenter#to_h with DASHBOARD_CARD_TABS)
export function dashboardCardJson(S, c) {
  const p = `/courses/${c.id}`
  const links = c.is_advising
    ? [{css_class: 'announcements', icon: 'icon-announcement', hidden: null, path: `${p}/announcements`, label: 'Announcements'}]
    : [
        {css_class: 'announcements', icon: 'icon-announcement', hidden: null, path: `${p}/announcements`, label: 'Announcements'},
        {css_class: 'assignments', icon: 'icon-assignment', hidden: null, path: `${p}/assignments`, label: 'Assignments'},
        {css_class: 'discussions', icon: 'icon-discussion', hidden: null, path: `${p}/discussion_topics`, label: 'Discussions'},
        ...(c.files_hidden ? [] : [{css_class: 'files', icon: 'icon-folder', hidden: null, path: `${p}/files`, label: 'Files'}]),
      ]
  return {
    longName: `${c.name} - ${c.course_code}`,
    shortName: nickname(S, c),
    originalName: c.name,
    courseCode: c.course_code,
    assetString: `course_${c.id}`,
    href: p,
    term: c.term && c.term.id !== '1' ? c.term.name : null,
    subtitle: 'enrolled as: Student',
    enrollmentState: c.enrollment_state,
    enrollmentType: 'StudentEnrollment',
    observee: null,
    id: c.id,
    isFavorited: S.favorites ? S.favorites.has(c.id) : false,
    isK5Subject: false,
    isHomeroom: false,
    useClassicFont: false,
    canManage: false,
    canReadAnnouncements: true,
    image: c.image,
    color: null,
    position: S.dashboardPositions[`course_${c.id}`] ?? null,
    published: true,
    links,
    canChangeCoursePublishState: false,
    defaultView: c.default_view,
    pagesUrl: `${BASE}${p}/pages`,
    frontPageTitle: c.pages.find(pg => pg.front_page)?.title || null,
  }
}

export function submissionJson(S, c, a, s, include = []) {
  if (!s) return null
  const j = {
    id: +s.id, body: s.body, url: null, grade: s.posted_at ? s.grade : null, score: s.posted_at ? s.score : null,
    submitted_at: iso(s.submitted_at), assignment_id: +a.id, user_id: +s.user_id, submission_type: s.submission_type,
    workflow_state: s.workflow_state, grade_matches_current_submission: true, graded_at: iso(s.graded_at),
    grader_id: s.grader_id ? +s.grader_id : null, attempt: s.attempt, cached_due_date: iso(a.due_at), excused: s.excused,
    late_policy_status: s.late_policy_status, points_deducted: s.points_deducted, grading_period_id: null,
    extra_attempts: null, posted_at: iso(s.posted_at), redo_request: false, custom_grade_status_id: null,
    sticky: null, late: s.late, missing: s.missing, seconds_late: s.seconds_late,
    entered_grade: s.posted_at ? s.entered_grade : null, entered_score: s.posted_at ? s.entered_score : null,
    preview_url: `${BASE}/courses/${c.id}/assignments/${a.id}/submissions/${S.user.id}?preview=1&version=1`,
    anonymous_id: 'mOcK1',
  }
  if (include.includes('submission_comments')) j.submission_comments = s.comments.map(cm => ({id: +cm.id, author_id: 1180001, author_name: cm.author_name, comment: cm.comment, created_at: iso(cm.created_at), edited_at: null, media_comment: null}))
  if (include.includes('read_state')) j.read_state = s.read_state
  return j
}

export function assignmentJson(S, c, a, include = []) {
  const s = c.submissions.get(a.id)
  const j = {
    id: +a.id, description: a.description, due_at: iso(a.due_at), unlock_at: iso(a.unlock_at), lock_at: iso(a.lock_at),
    points_possible: a.points_possible, grading_type: a.grading_type, assignment_group_id: +a.assignment_group_id,
    grading_standard_id: null, created_at: iso(a.created_at), updated_at: iso(a.updated_at), peer_reviews: false,
    automatic_peer_reviews: false, position: a.position, grade_group_students_individually: false,
    anonymous_peer_reviews: false, group_category_id: null, post_to_sis: false, moderated_grading: false,
    omit_from_final_grade: a.omit_from_final_grade, intra_group_peer_reviews: false, anonymous_instructor_annotations: false,
    anonymous_grading: false, graders_anonymous_to_graders: false, grader_count: 0, grader_comments_visible_to_graders: true,
    final_grader_id: null, grader_names_visible_to_final_grader: true, allowed_attempts: -1, annotatable_attachment_id: null,
    hide_in_gradebook: false, secure_params: 'mock', lti_context_id: 'mock', course_id: +c.id, name: a.name,
    submission_types: a.submission_types, has_submitted_submissions: !!s?.submitted_at, due_date_required: false,
    max_name_length: 255, in_closed_grading_period: false, graded_submissions_exist: true, is_quiz_assignment: a.is_quiz,
    can_duplicate: false, original_course_id: null, original_assignment_id: null, original_lti_resource_link_id: null,
    original_assignment_name: null, original_quiz_id: null, workflow_state: 'published', important_dates: false,
    muted: false, html_url: `${BASE}/courses/${c.id}/assignments/${a.id}`, has_overrides: false, needs_grading_count: undefined,
    sis_assignment_id: null, integration_id: null, integration_data: {}, published: a.published, unpublishable: false,
    only_visible_to_overrides: false, visible_to_everyone: true, locked_for_user: false, submissions_download_url: `${BASE}/courses/${c.id}/assignments/${a.id}/submissions?zip=1`,
    post_manually: false, anonymize_students: false, require_lockdown_browser: false, restrict_quantitative_data: false,
  }
  if (a.quiz_id) j.quiz_id = +a.quiz_id
  if (a.discussion_topic_id) j.discussion_topic = {id: +a.discussion_topic_id, title: a.name}
  if (include.includes('submission')) j.submission = submissionJson(S, c, a, s, include)
  if (include.includes('all_dates')) j.all_dates = [{base: true, due_at: iso(a.due_at), unlock_at: iso(a.unlock_at), lock_at: iso(a.lock_at)}]
  return j
}

export function assignmentGroupJson(S, c, g, include = []) {
  const j = {id: +g.id, name: g.name, position: g.position, group_weight: g.group_weight, sis_source_id: null, integration_data: {}, rules: g.rules, any_assignment_in_closed_grading_period: false}
  if (include.includes('assignments')) {
    j.assignments = c.assignments.filter(a => a.assignment_group_id === g.id).map(a => assignmentJson(S, c, a, include))
  }
  return j
}

// lib/api/v1/planner_item.rb
export function plannerItemFromAssignment(S, c, a) {
  const s = c.submissions.get(a.id)
  const ov = S.plannerOverrides.find(o => o.plannable_type === (a.is_quiz ? 'quiz' : a.is_discussion ? 'discussion_topic' : 'assignment') && o.plannable_id === (a.is_quiz ? a.quiz_id : a.is_discussion ? a.discussion_topic_id : a.id))
  const type = a.is_quiz ? 'quiz' : a.is_discussion ? 'discussion_topic' : 'assignment'
  const plannableId = a.is_quiz ? a.quiz_id : a.is_discussion ? a.discussion_topic_id : a.id
  const plannable = {
    id: +plannableId, title: a.name, created_at: iso(a.created_at), updated_at: iso(a.updated_at),
    points_possible: a.points_possible, due_at: iso(a.due_at),
  }
  if (type === 'quiz') Object.assign(plannable, {assignment_id: +a.id})
  if (type === 'discussion_topic') Object.assign(plannable, {assignment_id: +a.id, unread_count: 2, read_state: 'read'})
  return {
    context_type: 'Course', course_id: +c.id, plannable_id: +plannableId,
    planner_override: ov ? overrideJson(ov) : null, plannable_type: type,
    new_activity: s?.read_state === 'unread' && !!s.posted_at,
    submissions: {
      submitted: !!s?.submitted_at, excused: !!s?.excused, graded: s?.workflow_state === 'graded' && !!s.posted_at,
      posted_at: iso(s?.posted_at), late: !!s?.late, missing: !!s?.missing, needs_grading: s?.workflow_state === 'submitted',
      has_feedback: !!s?.comments?.length, redo_request: false,
    },
    plannable_date: iso(a.due_at), plannable,
    html_url: type === 'quiz' ? `/courses/${c.id}/quizzes/${a.quiz_id}` : type === 'discussion_topic' ? `/courses/${c.id}/discussion_topics/${a.discussion_topic_id}` : `/courses/${c.id}/assignments/${a.id}`,
    context_name: nickname(S, c), context_image: c.image,
  }
}

export function plannerItemFromNote(S, n) {
  const c = n.course_id ? S.courses.find(x => x.id === n.course_id) : null
  const ov = S.plannerOverrides.find(o => o.plannable_type === 'planner_note' && o.plannable_id === n.id)
  const j = {
    plannable_id: +n.id, planner_override: ov ? overrideJson(ov) : null, plannable_type: 'planner_note', new_activity: false,
    submissions: false, plannable_date: iso(n.todo_date), plannable: plannerNoteJson(S, n),
    html_url: `/api/v1/planner_notes/${n.id}`,
  }
  if (c) Object.assign(j, {context_type: 'Course', course_id: +c.id, context_name: nickname(S, c), context_image: c.image})
  else Object.assign(j, {context_type: 'User', user_id: +S.user.id})
  return j
}

export function plannerItemFromEvent(S, e) {
  const cid = e.context_code.startsWith('course_') ? e.context_code.slice(7) : null
  const c = cid && S.courses.find(x => x.id === cid)
  const j = {
    plannable_id: +e.id, planner_override: null, plannable_type: 'calendar_event', new_activity: false, submissions: false,
    plannable_date: iso(e.start_at),
    plannable: {id: +e.id, title: e.title, location_name: e.location_name, created_at: iso(e.start_at), updated_at: iso(e.start_at), all_day: e.all_day, location_address: null, description: e.description, start_at: iso(e.start_at), end_at: iso(e.end_at), online_meeting_url: null},
    html_url: `/api/v1/calendar_events/${e.id}`,
  }
  if (c) Object.assign(j, {context_type: 'Course', course_id: +c.id, context_name: nickname(S, c), context_image: c.image})
  else Object.assign(j, {context_type: 'User', user_id: +S.user.id})
  return j
}

export function plannerItemFromAnnouncement(S, c, an) {
  return {
    context_type: 'Course', course_id: +c.id, plannable_id: +an.id, planner_override: null, plannable_type: 'announcement',
    new_activity: an.read_state === 'unread', submissions: false, plannable_date: iso(an.posted_at),
    plannable: {id: +an.id, title: an.title, unread_count: 0, read_state: an.read_state, created_at: iso(an.posted_at), updated_at: iso(an.posted_at), posted_at: iso(an.posted_at)},
    html_url: `/courses/${c.id}/discussion_topics/${an.id}`, context_name: nickname(S, c), context_image: c.image,
  }
}

export function overrideJson(o) {
  return {id: +o.id, plannable_type: o.plannable_type, plannable_id: +o.plannable_id, user_id: +o.user_id, workflow_state: 'active', marked_complete: o.marked_complete, dismissed: o.dismissed, created_at: iso(o.created_at), updated_at: iso(o.updated_at), deleted_at: null}
}

export function plannerNoteJson(S, n) {
  return {id: +n.id, todo_date: iso(n.todo_date), title: n.title, details: n.details, user_id: +S.user.id, course_id: n.course_id ? +n.course_id : null, workflow_state: n.workflow_state, created_at: iso(n.created_at || n.todo_date), updated_at: iso(n.updated_at || n.todo_date), linked_object_type: null, linked_object_id: null, linked_object_html_url: null, linked_object_url: null}
}

export function calendarEventJson(S, e) {
  const cid = e.context_code.startsWith('course_') ? e.context_code.slice(7) : null
  const c = cid && S.courses.find(x => x.id === cid)
  return {
    id: +e.id, title: e.title, start_at: iso(e.start_at), end_at: iso(e.end_at), workflow_state: 'active', created_at: iso(e.start_at),
    updated_at: iso(e.start_at), all_day: e.all_day, all_day_date: e.all_day ? iso(e.start_at).slice(0, 10) : null, comments: null,
    location_address: null, location_name: e.location_name, type: 'event', description: e.description, context_code: e.context_code,
    context_name: c ? nickname(S, c) : S.user.name, context_color: c ? colorOf(S, c) : null, url: `${BASE}/api/v1/calendar_events/${e.id}`,
    html_url: `${BASE}/calendar?event_id=${e.id}&include_contexts=${e.context_code}`, duplicates: [], important_dates: false, series_uuid: null, rrule: null,
    hidden: false, child_events: [], child_events_count: 0, parent_event_id: null, effective_context_code: null,
  }
}

export function assignmentEventJson(S, c, a) {
  return {
    title: a.name, workflow_state: 'published', created_at: iso(a.created_at), updated_at: iso(a.updated_at),
    all_day: false, all_day_date: iso(a.due_at)?.slice(0, 10), id: `assignment_${a.id}`, type: 'assignment',
    description: a.description, start_at: iso(a.due_at), end_at: iso(a.due_at), context_code: `course_${c.id}`,
    context_name: nickname(S, c), context_color: colorOf(S, c), html_url: `${BASE}/courses/${c.id}/assignments/${a.id}`,
    url: `${BASE}/api/v1/calendar_events/assignment_${a.id}`, assignment: assignmentJson(S, c, a, ['submission']),
    important_dates: false,
  }
}

export function announcementJson(S, c, an) {
  return {
    id: +an.id, title: an.title, last_reply_at: iso(an.posted_at), created_at: iso(an.posted_at), delayed_post_at: null,
    posted_at: iso(an.posted_at), assignment_id: null, root_topic_id: null, position: null, podcast_has_student_posts: false,
    discussion_type: 'side_comment', lock_at: null, allow_rating: false, only_graders_can_rate: false, sort_by_rating: false,
    is_section_specific: false, anonymous_state: null, summary_enabled: false, user_name: an.author,
    discussion_subentry_count: an.discussion_subentry_count, permissions: {attach: false, update: false, reply: true, delete: false},
    require_initial_post: null, user_can_see_posts: true, podcast_url: null, read_state: an.read_state, unread_count: an.unread_count,
    subscribed: false, attachments: [], published: true, can_unpublish: false, locked: false, can_lock: false,
    comments_disabled: false, author: {id: 1180001, anonymous_id: 'x', display_name: an.author, avatar_image_url: `${BASE}/images/messages/avatar-50.png`, html_url: `${BASE}/courses/${c.id}/users/1180001`, pronouns: null},
    html_url: `${BASE}/courses/${c.id}/discussion_topics/${an.id}`, url: `${BASE}/courses/${c.id}/discussion_topics/${an.id}`,
    pinned: false, group_category_id: null, can_group: false, topic_children: [], group_topic_children: [],
    context_code: `course_${c.id}`, locked_for_user: false, message: an.message, subscription_hold: 'topic_is_announcement', todo_date: null,
    is_announcement: true, sort_order: 'desc', sort_order_locked: false, expanded: false, expanded_locked: false,
  }
}

export function discussionJson(S, c, d) {
  const j = announcementJson(S, c, {...d, author: d.author})
  return {...j, is_announcement: false, discussion_type: 'threaded', last_reply_at: iso(d.last_reply_at), pinned: d.pinned, locked: d.locked, assignment_id: d.assignment_id ? +d.assignment_id : null, subscription_hold: undefined}
}

export function conversationJson(S, cv) {
  return {
    id: +cv.id, subject: cv.subject, workflow_state: cv.workflow_state, last_message: cv.last_message,
    last_message_at: iso(cv.last_message_at), last_authored_message: null, last_authored_message_at: null,
    message_count: cv.message_count, subscribed: true, private: true, starred: cv.starred, properties: cv.properties,
    audience: cv.audience.map(Number), audience_contexts: {courses: {}, groups: {}}, avatar_url: `${BASE}/images/messages/avatar-group-50.png`,
    participants: [{id: +S.user.id, name: S.user.name, full_name: S.user.name}, {id: +cv.from.id, name: cv.from.name, full_name: cv.from.name}],
    visible: true, context_code: cv.context_code, context_name: cv.context_name,
  }
}


// lib/api/v1/context_module.rb
export function moduleItemJson(S, c, mod, it, {details = false} = {}) {
  const a = it.assignment || null
  const type = it.type
  const contentId = a ? (type === 'Quiz' ? a.quiz_id : type === 'Discussion' ? a.discussion_topic_id || a.id : a.id) : null
  const j = {
    id: +it.id, module_id: +mod.id, position: it.position, title: it.title, indent: it.indent || 0, quiz_lti: false,
    type, html_url: `${BASE}/courses/${c.id}/modules/items/${it.id}`, published: true, unpublishable: false,
  }
  if (contentId) { j.content_id = +contentId; j.url = `${BASE}/api/v1/courses/${c.id}/${type === 'Quiz' ? 'quizzes' : type === 'Discussion' ? 'discussion_topics' : 'assignments'}/${contentId}` }
  if (type === 'Page') { j.page_url = it.page_url; j.url = `${BASE}/api/v1/courses/${c.id}/pages/${it.page_url}` }
  if (type === 'File') { j.content_id = +it.file_id; j.url = `${BASE}/api/v1/courses/${c.id}/files/${it.file_id}` }
  if (type === 'ExternalUrl') { j.external_url = it.external_url; j.new_tab = true }
  if (it.req) j.completion_requirement = {type: it.req, completed: !!it.completed}
  if (details) {
    const f = type === 'File' ? (c.files || []).find(x => x.id === it.file_id) : null
    j.content_details = a
      ? {points_possible: a.points_possible, due_at: iso(a.due_at), unlock_at: iso(a.unlock_at), lock_at: iso(a.lock_at), locked_for_user: false}
      : f ? {unlock_at: null, lock_at: null, locked_for_user: mod.state === 'locked', display_name: f.display_name, thumbnail_url: null}
      : {locked_for_user: mod.state === 'locked'}
  }
  return j
}

export function moduleJson(S, c, mod, {withItems = false, details = false} = {}) {
  const j = {
    id: +mod.id, workflow_state: 'active', position: mod.position, name: mod.name, unlock_at: iso(mod.unlock_at),
    require_sequential_progress: !!mod.require_sequential_progress, requirement_type: 'all', publish_final_grade: false,
    prerequisite_module_ids: [], published: true, items_count: mod.items.length,
    items_url: `${BASE}/api/v1/courses/${c.id}/modules/${mod.id}/items`, state: mod.state,
    completed_at: mod.state === 'completed' ? iso(mod.unlock_at || c.start_at) : null,
  }
  if (withItems) j.items = mod.items.map(it => moduleItemJson(S, c, mod, it, {details}))
  return j
}

export function pageJson(S, c, pg) {
  return {
    page_id: Math.abs([...pg.url].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, +c.id)) % 9000000 + 1000000,
    url: pg.url, title: pg.title, created_at: iso(pg.created_at || c.created_at), updated_at: iso(pg.updated_at || c.created_at),
    hide_from_students: false, editing_roles: 'teachers', last_edited_by: {id: 1180001, display_name: c.prof, anonymous_id: 'x'},
    published: true, front_page: !!pg.front_page, html_url: `${BASE}/courses/${c.id}/pages/${pg.url}`, todo_date: null,
    publish_at: null, locked_for_user: false,
  }
}

export function fileJson(S, c, f) {
  return {
    id: +f.id, uuid: `mockfile${f.id}`, folder_id: +f.folder_id, display_name: f.display_name, filename: f.filename,
    // like Canvas, `url` is the download URL and there is no html_url; the file page is /courses/:id/files/:id
    'content-type': f.content_type, url: `${BASE}/files/${f.id}/download?download_frd=1&verifier=mockverifier${f.id}`, size: f.size, created_at: iso(f.created_at), updated_at: iso(f.updated_at),
    unlock_at: null, locked: false, hidden: false, lock_at: null, hidden_for_user: false, thumbnail_url: null, modified_at: iso(f.updated_at),
    mime_class: f.content_type === 'application/pdf' ? 'pdf' : 'file', media_entry_id: null, locked_for_user: false, visibility_level: 'inherit',
  }
}
