// Scenario data generators. Everything is derived from `now` so due-date buckets stay meaningful
// whatever date the test pins. Output is plain objects; api/serializers.mjs shapes them into
// Canvas REST JSON, pages/*.mjs render them as HTML.
//
// Names and numbers are invented but the pilot school-shaped (subject codes, 4-credit lecture + 1-credit lab,
// an "Academic Advising" non-course site that every the pilot school student is enrolled in).
import {dayAt, addDays, laParts, laDate, startOfLaDay} from '../lib/time.mjs'

export const SCENARIOS = ['default', 'empty', 'heavy', 'nicknames', 'grading', 'weeks']

// Canvas' default dashboard card palette (ui/shared/dashboard-card/react/DashboardCardBackgroundStore.ts)
export const DEFAULT_COLORS = ['#008400', '#91349B', '#E1185C', '#D41E00', '#0076B8', '#626E7B', '#4D3D4D', '#254284', '#986C16', '#177B63', '#324A4D', '#3C4F36']

// Canvas default grading scheme
export const DEFAULT_SCHEME = [['A', 0.94], ['A-', 0.9], ['B+', 0.87], ['B', 0.84], ['B-', 0.8], ['C+', 0.77], ['C', 0.74], ['C-', 0.7], ['D+', 0.67], ['D', 0.64], ['D-', 0.61], ['F', 0]]
export function letterFor(pct, scheme = DEFAULT_SCHEME) {
  if (pct == null) return null
  for (const [l, min] of scheme) if (pct / 100 >= min - 1e-9) return l
  return 'F'
}

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const USER = {
  id: '4217733', name: 'Avery Student', short_name: 'Avery Student', sortable_name: 'Student, Avery',
  first_name: 'Avery', last_name: 'Student', login_id: 'astudent', primary_email: 'student@example.edu',
  avatar_url: 'https://canvas.example.edu/images/messages/avatar-50.png', pronouns: null,
  locale: null, effective_locale: 'en', time_zone: 'America/Los_Angeles', bio: null,
  integration_id: null, sis_user_id: '900000000',
}

function termFor(now) {
  // the pilot school quarters: Fall = late Sep to mid Dec
  const y = laParts(now).year
  return {
    current: {id: '3405', name: `Fall ${y}`, start_at: laDate(y, 9, 28, 0, 0), end_at: laDate(y, 12, 12, 23, 59), workflow_state: 'active', sis_term_id: `${y}04`},
    past: {id: '3402', name: `Spring ${y}`, start_at: laDate(y, 3, 30, 0, 0), end_at: laDate(y, 6, 13, 23, 59), workflow_state: 'active', sis_term_id: `${y}02`},
    future: {id: '3406', name: `Winter ${y + 1}`, start_at: laDate(y + 1, 1, 4, 0, 0), end_at: laDate(y + 1, 3, 20, 23, 59), workflow_state: 'active', sis_term_id: `${y + 1}01`},
    default: {id: '1', name: 'Default Term', start_at: null, end_at: null, workflow_state: 'active', sis_term_id: null},
  }
}

// --- course catalogue -------------------------------------------------------------------------
const DEFAULT_COURSES = [
  {code: 'MATH 401', title: 'Abstract Algebra I', crn: '10001', credits: 4, weighted: true, hasLetter: true,
    groups: [['Homework', 40], ['Midterm Exam', 25], ['Final Exam', 35]], prof: 'Prof. Alex Rivera',
    work: [['Homework', 'Problem Set'], ['Midterm Exam', 'Midterm'], ['Final Exam', 'Final Exam']]},
  {code: 'MATH 301', title: 'Introduction to Mathematical Analysis I', crn: '10002', credits: 4, weighted: true, hasLetter: true,
    groups: [['Homework', 50], ['Quizzes', 15], ['Exams', 35]], prof: 'Prof. Jordan Lee', rules: {Homework: {drop_lowest: 1}},
    work: [['Homework', 'Homework'], ['Quizzes', 'Quiz'], ['Exams', 'Exam']]},
  {code: 'CHEM 101', title: 'General Chemistry I', crn: '10003', credits: 4, weighted: false, hasLetter: true,
    groups: [['Online Homework', null], ['Quizzes', null], ['Exams', null]], prof: 'Dr. Casey Morgan', rules: {Quizzes: {drop_lowest: 1, never_drop: []}},
    work: [['Online Homework', 'Mastering Chemistry'], ['Quizzes', 'Recitation Quiz'], ['Exams', 'Exam']]},
  {code: 'CHEM 107', title: 'General Chemistry Laboratory I', crn: '10004', credits: 1, weighted: false, hasLetter: false,
    groups: [['Pre-lab', null], ['Lab Reports', null]], prof: 'Lab Coordinator',
    work: [['Pre-lab', 'Pre-lab'], ['Lab Reports', 'Lab Report']]},
  {code: 'WRIT 202', title: 'Research and Writing as Inquiry', crn: '10005', credits: 4, weighted: true, hasLetter: true,
    groups: [['Short Writing', 30], ['Projects', 50], ['Participation', 20]], prof: 'Prof. Taylor Brooks',
    work: [['Short Writing', 'Reading Response'], ['Projects', 'Project'], ['Participation', 'Peer Review']]},
]
const HEAVY_EXTRA = [
  ['MATH 344', 'Introduction to Group Theory'], ['MATH 356', 'Discrete Mathematics'], ['STAT 451', 'Applied Statistics I'],
  ['PH 221', 'General Physics I'], ['PH 214', 'Physics Lab'], ['CS 161', 'Intro to Programming'],
  ['UNST 254', 'Sophomore Inquiry: Knowledge, Values & Rationality'], ['PHL 320', 'Philosophy of Mathematics'],
  ['MUS 101', 'Music Fundamentals'],
]

// Each spec: [bucket, offsetDays, extra]
// bucket drives the submission state; offsetDays positions due_at relative to "now"'s LA day.
const SCHEDULE = [
  ['graded', -24], ['graded', -17], ['graded_late', -13], ['excused', -10], ['graded', -9],
  ['missing', -6], ['submitted', -3], ['overdue_unsubmitted', -1], ['due_today', 0], ['soon', 1],
  ['soon', 3], ['next_week', 7], ['next_week', 9], ['far', 42], ['no_due', null],
]

let idSeq
function nextId(prefix = 0) { idSeq += 1; return String(prefix + idSeq) }

function makeCourse(spec, idx, now, terms, r, opts = {}) {
  const id = String(opts.id ?? 118200 + idx * 7)
  const term = opts.term || terms.current
  const sec = '001'
  const course = {
    id,
    name: opts.name || `${spec.code}-${sec}: ${spec.title} (${term.name})`,
    course_code: opts.course_code || `${spec.code}-${sec}`,
    short_code: spec.code,
    title: spec.title,
    crn: spec.crn,
    credits: spec.credits,
    sis_course_id: `${term.sis_term_id}-${spec.crn}`,
    uuid: `mock${id}uuid${String(idx).padStart(4, '0')}abcdefghijklmn`.slice(0, 40),
    account_id: '1003',
    root_account_id: '1',
    term,
    enrollment_term_id: term.id,
    start_at: term.start_at,
    end_at: term.end_at,
    created_at: addDays(term.start_at || now, -30),
    default_view: opts.default_view || (idx % 3 === 0 ? 'modules' : idx % 3 === 1 ? 'wiki' : 'syllabus'),
    workflow_state: opts.workflow_state || 'available',
    published: true,
    apply_assignment_group_weights: !!spec.weighted,
    grading_standard_enabled: !!spec.hasLetter,
    hide_final_grades: false,
    is_advising: false,
    image: null,
    enrollment_state: opts.enrollment_state || 'active',
    prof: spec.prof || 'Instructor',
    time_zone: 'America/Los_Angeles',
    syllabus_body: `<p>Welcome to ${spec.code}: ${spec.title}. Office hours are Tuesdays 2-3pm in Fariborz Maseeh Hall.</p>`,
    groups: [],
    assignments: [],
    submissions: new Map(),
    announcements: [],
    discussions: [],
    modules: [],
    pages: [],
  }
  course.groups = (spec.groups || [['Assignments', null]]).map(([name, weight], i) => ({
    id: String(+id * 10 + i + 1), name, position: i + 1, group_weight: weight ?? 0, rules: (spec.rules || {})[name] || {},
    _weight: weight,
  }))
  if (opts.noWork) return course

  const sched = opts.schedule || SCHEDULE
  const work = spec.work || [['Assignments', 'Assignment']]
  const counters = {}
  sched.forEach(([bucket, off, extra = {}], i) => {
    const g = course.groups[i % course.groups.length]
    const label = (work.find(w => w[0] === g.name) || work[0])[1]
    const n = (counters[label] = (counters[label] || 0) + 1)
    const aid = String(+id * 100 + i + 1)
    const due = off == null ? null : bucket === 'due_today' ? dayAt(now, 0, 23, 59) : dayAt(now, off, i % 2 ? 23 : 17, i % 2 ? 59 : 0)
    const isQuiz = /Quiz|Exam|Midterm|Final/.test(label)
    const isDiscussion = /Response|Peer Review/.test(label) && i % 2 === 0
    const pts = isQuiz ? (label.includes('Final') ? 150 : label.includes('Quiz') ? 10 : 100) : label.includes('Pre-lab') ? 5 : label.includes('Project') ? 50 : 20
    const gradingType = extra.grading_type || (label === 'Pre-lab' ? 'pass_fail' : label === 'Peer Review' ? 'complete_incomplete' : 'points')
    const a = {
      id: aid,
      course_id: id,
      name: label === 'Final Exam' ? (['Final Exam Review Quiz', 'Final Exam Practice', 'Final Exam Part I', 'Final Exam Part II', 'Final Exam'][n - 1] || `Final Exam ${n}`) : label === 'Midterm' ? (['Midterm 1', 'Midterm 1 Corrections', 'Midterm 2', 'Midterm 2 Corrections', 'Midterm Retake'][n - 1] || `Midterm ${n}`) : `${label} ${n}`,
      description: `<p>Complete ${label.toLowerCase()} ${n}. Show all work.</p>`,
      due_at: due,
      unlock_at: due ? addDays(due, -14) : null,
      lock_at: null,
      points_possible: pts,
      grading_type: gradingType === 'complete_incomplete' ? 'pass_fail' : gradingType,
      assignment_group_id: g.id,
      position: i + 1,
      submission_types: isQuiz ? ['online_quiz'] : isDiscussion ? ['discussion_topic'] : label.includes('Mastering') ? ['external_tool'] : ['online_upload', 'online_text_entry'],
      is_quiz: isQuiz,
      quiz_id: isQuiz ? String(+aid + 5000) : null,
      is_discussion: isDiscussion,
      published: true,
      omit_from_final_grade: false,
      created_at: addDays(due || now, -20),
      updated_at: addDays(due || now, -2),
      bucket,
    }
    course.assignments.push(a)
    course.submissions.set(aid, makeSubmission(a, bucket, now, r))
  })
  return course
}

function makeSubmission(a, bucket, now, r) {
  const base = {
    id: String(+a.id + 9000000), assignment_id: a.id, user_id: USER.id, attempt: null, body: null,
    grade: null, score: null, entered_grade: null, entered_score: null, submitted_at: null, graded_at: null,
    posted_at: null, submission_type: null, workflow_state: 'unsubmitted', excused: false, late: false,
    missing: false, late_policy_status: null, points_deducted: null, seconds_late: 0, grader_id: null,
    cached_due_date: a.due_at, extra_attempts: null, redo_request: false, custom_grade_status_id: null,
    sticky: null, comments: [], read_state: 'read', grade_matches_current_submission: true,
    student_entered_score: null,
  }
  const subType = a.submission_types[0] === 'online_upload' ? 'online_upload' : a.submission_types[0]
  const graded = score => {
    const s = a.grading_type === 'pass_fail' ? (score >= a.points_possible * 0.5 ? a.points_possible : 0) : score
    Object.assign(base, {
      workflow_state: 'graded', score: s, entered_score: s, grade: gradeFor(a, s), entered_grade: gradeFor(a, s),
      graded_at: addDays(a.due_at || now, 3), posted_at: addDays(a.due_at || now, 3), grader_id: '1180001', attempt: 1,
    })
  }
  const pct = 0.8 + r() * 0.2
  switch (bucket) {
    case 'graded':
      Object.assign(base, {submitted_at: addDays(a.due_at, -0.3), submission_type: subType})
      graded(Math.round(a.points_possible * pct * 2) / 2)
      if (r() < 0.5) base.comments.push({id: String(+a.id + 7000000), author_name: 'Instructor', comment: 'Nice work. See the note on part (b).', created_at: base.graded_at})
      if (r() < 0.4) base.read_state = 'unread'
      break
    case 'graded_late':
      Object.assign(base, {submitted_at: addDays(a.due_at, 1.2), submission_type: subType, late: true, seconds_late: Math.round(1.2 * 86400)})
      graded(Math.round(a.points_possible * (pct - 0.1) * 2) / 2)
      base.points_deducted = Math.round(a.points_possible * 0.1 * 10) / 10
      break
    case 'excused':
      Object.assign(base, {excused: true, workflow_state: 'graded', grade: null, posted_at: addDays(a.due_at, 1), graded_at: addDays(a.due_at, 1)})
      break
    case 'missing':
      Object.assign(base, {missing: true})
      if (a.points_possible <= 20 && r() < 0.7) { base.late_policy_status = 'missing'; base.score = 0; base.grade = gradeFor(a, 0); base.entered_score = 0; base.workflow_state = 'graded'; base.posted_at = addDays(a.due_at, 2); base.graded_at = base.posted_at }
      break
    case 'overdue_unsubmitted':
      Object.assign(base, {missing: true})
      break
    case 'submitted':
      Object.assign(base, {submitted_at: addDays(a.due_at, -0.1), submission_type: subType, workflow_state: a.is_quiz ? 'pending_review' : 'submitted', attempt: 1})
      break
    case 'soon':
      if (r() < 0.25) Object.assign(base, {submitted_at: addDays(now, -0.2), submission_type: subType, workflow_state: 'submitted', attempt: 1})
      break
    default:
      break
  }
  return base
}

function gradeFor(a, score) {
  if (score == null) return null
  switch (a.grading_type) {
    case 'pass_fail': return score > 0 ? 'complete' : 'incomplete'
    case 'percent': return `${Math.round((score / a.points_possible) * 1000) / 10}%`
    case 'letter_grade': return letterFor((score / a.points_possible) * 100)
    default: return String(score)
  }
}

function addCourseContent(course, now, r, idx) {
  // Announcements
  const ann = [
    ['Welcome to the course!', -26, true],
    ['Office hours moved this week', -4, false],
    [`Reminder: ${course.assignments.find(a => a.bucket === 'next_week')?.name || 'next assignment'} due next week`, -1, false],
  ]
  ann.forEach(([title, off, read], i) => {
    course.announcements.push({
      id: String(+course.id * 1000 + 100 + i), title, message: `<p>${title}. — ${course.prof}</p>`,
      posted_at: dayAt(now, off, 9 + i, 15), read_state: read ? 'read' : 'unread', author: course.prof,
      unread_count: 0, discussion_subentry_count: 0,
    })
  })
  // Discussions
  ;['Introduce yourself', 'Week 3 discussion', 'Questions about the midterm'].forEach((title, i) => {
    course.discussions.push({
      id: String(+course.id * 1000 + 200 + i), title, message: `<p>${title}</p>`,
      posted_at: dayAt(now, -25 + i * 9, 10, 0), last_reply_at: dayAt(now, -2 + i, 14, 30),
      discussion_subentry_count: 4 + i * 3, unread_count: i === 1 ? 3 : 0, read_state: i === 2 ? 'unread' : 'read',
      author: i === 1 ? 'Classmate' : course.prof, pinned: i === 0, locked: false,
      assignment_id: null,
    })
  })
  for (const a of course.assignments.filter(a => a.is_discussion)) {
    course.discussions.push({
      id: String(+a.id + 3000000), title: a.name, message: a.description, posted_at: a.created_at,
      last_reply_at: addDays(now, -1), discussion_subentry_count: 6, unread_count: 2, read_state: 'read',
      author: course.prof, pinned: false, locked: false, assignment_id: a.id,
    })
    a.discussion_topic_id = String(+a.id + 3000000)
  }
  // Pages
  const ts = course.term?.start_at || addDays(now, -30)
  course.pages.push(
    {url: 'syllabus-and-schedule', title: 'Syllabus and Schedule', front_page: course.default_view === 'wiki', created_at: addDays(ts, -5), updated_at: addDays(ts, 1)},
    {url: 'office-hours-and-contact', title: 'Office Hours and Contact', front_page: false, created_at: addDays(ts, -5), updated_at: addDays(now, -9)},
    {url: 'course-resources', title: 'Course Resources', front_page: false, created_at: addDays(ts, -2), updated_at: addDays(now, -3)},
  )
  seedFiles(course, now)
  // Modules: Week 1..N, assignments distributed
  const weeks = 4
  for (let w = 0; w < weeks; w++) {
    const mod = {
      id: String(+course.id * 10 + 500 + w), name: `Week ${w * 2 + 1}–${w * 2 + 2}`, position: w + 1,
      unlock_at: null, state: w < 2 ? 'completed' : w === 2 ? 'started' : 'unlocked', items: [],
      require_sequential_progress: false, published: true,
    }
    if (w === 0) mod.items.push({type: 'Page', title: 'Syllabus and Schedule', page_url: 'syllabus-and-schedule', completed: true, req: 'must_view'})
    course.assignments.filter((_, i) => i % weeks === w).forEach(a => {
      const sub = course.submissions.get(a.id)
      mod.items.push({type: a.is_quiz ? 'Quiz' : a.is_discussion ? 'Discussion' : 'Assignment', title: a.name, content_id: a.id, assignment: a, completed: ['graded', 'submitted', 'pending_review'].includes(sub?.workflow_state) && !sub.missing, req: 'must_submit'})
    })
    const lecture = (course.files || []).find(f => f.display_name.startsWith(`Lecture ${w + 1}`))
    if (w === 0 && course.files?.[0]) mod.items.splice(1, 0, {type: 'File', title: course.files[0].display_name, file_id: course.files[0].id, completed: true, req: 'must_view'})
    if (lecture) mod.items.push({type: 'File', title: lecture.display_name, file_id: lecture.id, completed: w < 2, req: 'must_view'})
    if (w === 1) mod.items.push({type: 'ExternalUrl', title: 'Course textbook (OpenStax)', external_url: 'https://openstax.org/', completed: false, req: null})
    if (w === 2) mod.items.push({type: 'SubHeader', title: 'Optional practice', completed: false, req: null})
    course.modules.push(mod)
  }
}

// ---- 'weeks' scenario: 10 weekly modules per course, named differently in each course ----------
function laDayDiff(a, b) {
  const pa = laParts(a), pb = laParts(b)
  return Math.round((Date.UTC(pa.year, pa.month - 1, pa.day) - Date.UTC(pb.year, pb.month - 1, pb.day)) / 864e5)
}
function weekStart(terms, w) { return addDays(terms.current.start_at, (w - 1) * 7) } // Monday 00:00 LA of week w
function weeksSchedule(now, terms) {
  const out = []
  for (let w = 1; w <= 10; w++) {
    for (const d of [2, 4]) { // Wednesday, Friday of week w
      const off = laDayDiff(addDays(weekStart(terms, w), d), now)
      const k = out.length
      const bucket = off < -7 ? (k % 7 === 3 ? 'graded_late' : 'graded') : off < 0 ? ['submitted', 'missing', 'graded', 'overdue_unsubmitted'][k % 4] : off === 0 ? 'due_today' : off <= 3 ? 'soon' : off <= 10 ? 'next_week' : 'far'
      out.push([bucket, off])
    }
  }
  return out
}
const SHORT_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ONE_TO_TEN = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const CHEM101_TOPICS = ['Atoms and Molecules', 'Stoichiometry', 'Reactions in Solution', 'Gases', 'Thermochemistry', 'Quantum Theory', 'Electron Configuration', 'Periodic Trends', 'Chemical Bonding', 'Molecular Geometry']
const WRITING_TOPICS = ['Getting Started', 'Reading as Inquiry', 'Asking Research Questions', 'Finding Sources', 'Annotated Bibliography', 'Synthesis', 'Drafting the Project', 'Peer Review Workshop', 'Revision', 'Final Portfolio']
function weekName(courseIdx, w, terms) {
  const ws = weekStart(terms, w), we = addDays(ws, 6)
  const p = laParts(ws), q = laParts(we)
  switch (courseIdx) {
    case 0: return `Week ${w}`
    case 1: return `Week ${ONE_TO_TEN[w - 1]}`
    case 2: return CHEM101_TOPICS[w - 1]
    case 3: return [`Week of ${SHORT_MON[p.month - 1]} ${p.day}`, `${SHORT_MON[p.month - 1]} ${p.day}–${SHORT_MON[q.month - 1]} ${q.day}`, `${p.month}/${p.day}–${q.month}/${q.day}`][(w - 1) % 3]
    default: return WRITING_TOPICS[w - 1]
  }
}
function weekModules(c, courseIdx, now, terms) {
  const done = a => { const s = c.submissions.get(a.id); return ['graded', 'submitted', 'pending_review'].includes(s?.workflow_state) && !s.missing }
  const mods = []
  if (courseIdx === 1) {
    mods.push({id: String(+c.id * 10 + 499), name: 'Syllabus', unlock_at: null, state: 'completed', require_sequential_progress: false, published: true,
      items: [{type: 'Page', title: 'Syllabus', page_url: 'syllabus', completed: true, req: 'must_view'}, {type: 'ExternalUrl', title: 'Course textbook (OpenStax)', external_url: 'https://openstax.org/', completed: false, req: null}]})
    c.pages.push({url: 'syllabus', title: 'Syllabus', front_page: false, created_at: addDays(terms.current.start_at, -4), updated_at: addDays(terms.current.start_at, -1)})
  }
  if (courseIdx === 2) c.pages.push({url: 'syllabus', title: 'Syllabus', front_page: false, created_at: addDays(terms.current.start_at, -6), updated_at: addDays(terms.current.start_at, 2)})
  for (let w = 1; w <= 10; w++) {
    const ws = weekStart(terms, w), we = addDays(ws, 7)
    const unlock = courseIdx === 2 ? ws : null // CHEM 101: unlock_at = Monday 00:00 of its week
    const notesUrl = `week-${w}-notes`
    const created = addDays(ws, -2) < now ? addDays(ws, -2) : addDays(terms.current.start_at, -3) // pre-built before term
    c.pages.push({url: notesUrl, title: `${weekName(courseIdx, w, terms)}: notes`, front_page: false, created_at: created, updated_at: addDays(ws, 1) < now ? addDays(ws, 1) : created})
    const items = [{type: 'Page', title: `${weekName(courseIdx, w, terms)}: notes`, page_url: notesUrl, completed: ws < now, req: 'must_view'}]
    const lec = (c.files || []).find(f => f.display_name.startsWith(`Lecture ${w}`) && /^Lecture \d+( |\.)/.test(f.display_name) && f.display_name.match(/^Lecture (\d+)/)[1] === String(w))
    if (lec) items.push({type: 'File', title: lec.display_name, file_id: lec.id, completed: ws < now, req: 'must_view'})
    for (const a of c.assignments.filter(a => a.due_at && a.due_at >= ws && a.due_at < we)) {
      items.push({type: a.is_quiz ? 'Quiz' : a.is_discussion ? 'Discussion' : 'Assignment', title: a.name, content_id: a.id, assignment: a, completed: done(a), req: 'must_submit'})
    }
    const state = unlock && unlock > now ? 'locked' : we <= now ? (items.every(i => i.completed) ? 'completed' : 'started') : ws <= now ? 'started' : 'unlocked'
    mods.push({id: String(+c.id * 10 + 500 + w), name: weekName(courseIdx, w, terms), unlock_at: unlock, state, require_sequential_progress: false, published: true, items})
  }
  c.modules = mods
}

// Course files: a syllabus plus weekly lecture PDFs, created across the past weeks
export function seedFiles(course, now) {
  const ts = course.term?.start_at || addDays(now, -30)
  const files = [{name: 'Syllabus.pdf', at: addDays(ts, -3), size: 184320}]
  for (let k = 1; k <= 4; k++) {
    const at = addDays(ts, (k - 1) * 7 + 0.4)
    if (at > now) break
    files.push({name: k % 2 === 0 ? `Lecture ${k} slides.pdf` : `Lecture ${k}.pdf`, at, size: 420000 + k * 13377})
  }
  course.files = files.map((f, i) => ({
    id: String(+course.id * 100 + 60 + i), display_name: f.name, filename: f.name.replace(/ /g, '+'),
    content_type: f.ct || 'application/pdf', size: f.size, created_at: f.at, updated_at: f.at, folder_id: String(+course.id * 10 + 9),
  }))
  // CHEM 107 hides its Files tab: the API answers 403 and the tab/card link disappear
  course.files_hidden = course.short_code === 'CHEM 107'
}

// item ids/positions shared by the modules page and the modules API
export function finalizeModules(course) {
  course.modules.forEach((mod, mi) => {
    mod.position = mi + 1
    mod.items.forEach((it, i) => { it.id ||= String(+mod.id * 100 + i + 1); it.position = i + 1; it.indent ??= it.type === 'SubHeader' ? 0 : 0 })
  })
}

function makeAdvising(now, terms, id) {
  const c = makeCourse({code: 'ADVISING', title: 'Academic Advising', groups: [['Assignments', null]]}, 0, now, terms, rng(9), {
    id, term: terms.default, name: 'Academic Advising: College of Arts & Sciences', course_code: 'CAS Advising', noWork: true, default_view: 'wiki',
  })
  c.is_advising = true
  c.grading_standard_enabled = false
  c.announcements.push({id: String(+id * 1000 + 1), title: 'Winter registration opens Nov 9', message: '<p>Check your registration time in the student portal.</p>', posted_at: dayAt(now, -2, 8, 0), read_state: 'unread', author: 'CAS Advising', unread_count: 0, discussion_subentry_count: 0})
  c.pages.push({url: 'advising-resources', title: 'Advising Resources', front_page: true})
  return c
}

// --- grade computation (mirrors Canvas' GradeCalculator closely enough for display) ---------
export function computeScores(course, {inPeriod = null, store = true} = {}) {
  // Mirrors Canvas' GradeCalculator for the cases the mock produces: per-group sums, drop_lowest /
  // drop_highest on the "current" (graded-only) and "final" (ungraded = 0) sets, then group weights.
  const groups = course.groups.map(g => {
    const cur = [], fin = []
    for (const a of course.assignments) {
      if (a.assignment_group_id !== g.id || !a.published || a.omit_from_final_grade) continue
      if (inPeriod && !inPeriod(a)) continue
      const s = course.submissions.get(a.id)
      if (s?.excused) continue
      const posted = s && s.posted_at && s.score != null && s.workflow_state === 'graded'
      if (posted) cur.push([s.score, a.points_possible])
      fin.push([posted ? s.score : 0, a.points_possible])
    }
    const drop = list => {
      let l = [...list]
      const lo = g.rules?.drop_lowest || 0, hi = g.rules?.drop_highest || 0
      const ratio = x => (x[1] ? x[0] / x[1] : 0)
      if (lo && l.length > lo) l = l.sort((a, b) => ratio(a) - ratio(b)).slice(lo)
      if (hi && l.length > hi) l = l.sort((a, b) => ratio(b) - ratio(a)).slice(hi)
      return l.reduce((acc, x) => [acc[0] + x[0], acc[1] + x[1]], [0, 0])
    }
    return {g, cur: drop(cur), fin: drop(fin)}
  })
  const pct = which => {
    if (course.apply_assignment_group_weights) {
      let tot = 0, wsum = 0
      for (const x of groups) {
        const [e, p] = x[which]
        if (p > 0) { tot += (e / p) * (x.g._weight || 0); wsum += x.g._weight || 0 }
      }
      return wsum > 0 ? Math.round((tot / wsum) * 100 * 100) / 100 : null
    }
    const e = groups.reduce((s, x) => s + x[which][0], 0)
    const p = groups.reduce((s, x) => s + x[which][1], 0)
    return p > 0 ? Math.round((e / p) * 100 * 100) / 100 : null
  }
  const current = pct('cur'), final = pct('fin')
  const scheme = course.scheme || DEFAULT_SCHEME
  const scores = {
    current_score: current, final_score: final,
    current_grade: course.grading_standard_enabled ? letterFor(current, scheme) : null,
    final_grade: course.grading_standard_enabled ? letterFor(final, scheme) : null,
  }
  if (!store) return scores
  course.groupScores = groups.map(x => ({id: x.g.id, current: x.cur, final: x.fin}))
  course.scores = scores
  if (course.gradingPeriods) {
    course.periodScores = {}
    for (const gp of course.gradingPeriods) {
      course.periodScores[gp.id] = computeScores(course, {inPeriod: a => periodOf(course, a)?.id === gp.id, store: false})
    }
  }
  return course.scores
}

// --- scenario assembly ------------------------------------------------------------------------
export function buildScenario(name, now) {
  idSeq = 0
  const terms = termFor(now)
  const r = rng(name === 'heavy' ? 1234 : 42)
  const S = {
    name, now, user: {...USER}, terms,
    courses: [], pastCourses: [], futureCourses: [],
    colors: {}, nicknames: {}, favorites: null, dashboardPositions: {},
    calendarEvents: [], conversations: [], plannerNotes: [], plannerOverrides: [],
    seq: 800000,
    dashboardView: null, // set by PUT /dashboard/view; else MOCK_DASHBOARD_VIEW env; else 'cards'
  }
  if (name === 'empty') return finish(S)

  if (name === 'heavy') {
    const all = [...DEFAULT_COURSES, ...HEAVY_EXTRA.map(([code, title], i) => ({
      code, title, crn: String(44000 + i), credits: 4, weighted: i % 2 === 0, hasLetter: true,
      groups: [['Assignments', 40], ['Quizzes', 20], ['Exams', 40]], prof: 'Staff',
      work: [['Assignments', 'Assignment'], ['Quizzes', 'Quiz'], ['Exams', 'Exam']],
    }))]
    // 13 courses: 12 x 24 + 1 x 15 = 303 assignments, plus Advising = 14 courses
    const sched = []
    for (let k = 0; k < 24; k++) {
      const off = Math.round(-35 + k * 3.7)
      const bucket = off < -20 ? 'graded' : off < -8 ? (k % 4 === 0 ? 'missing' : k % 5 === 0 ? 'excused' : 'graded') : off < 0 ? (k % 3 === 0 ? 'submitted' : k % 3 === 1 ? 'graded_late' : 'overdue_unsubmitted') : off === 0 ? 'due_today' : off <= 3 ? 'soon' : off <= 10 ? 'next_week' : 'far'
      sched.push([bucket, k === 23 ? null : off])
    }
        all.slice(0, 13).forEach((spec, i) => S.courses.push(makeCourse(spec, i, now, terms, r, {schedule: i === 12 ? sched.slice(0, 15) : sched})))
    S.courses.push(makeAdvising(now, terms, '100100'))
  } else if (name === 'weeks') {
    DEFAULT_COURSES.forEach((spec, i) => S.courses.push(makeCourse(spec, i, now, terms, r, {schedule: weeksSchedule(now, terms)})))
    S.courses.push(makeAdvising(now, terms, '100100'))
  } else {
    DEFAULT_COURSES.forEach((spec, i) => S.courses.push(makeCourse(spec, i, now, terms, r)))
    S.courses.push(makeAdvising(now, terms, '100100'))
  }
  S.courses.forEach((c, i) => { if (!c.is_advising) addCourseContent(c, now, r, i) })
  if (name === 'heavy') S.courses.forEach(c => { if (!c.is_advising) c.pages.push(
    {url: 'study-guide', title: 'Study Guide', front_page: false, created_at: addDays(now, -20), updated_at: addDays(now, -6)},
    {url: 'exam-information', title: 'Exam Information', front_page: false, created_at: addDays(now, -15), updated_at: addDays(now, -1)}) })
  if (name === 'weeks') S.courses.forEach((c, i) => { if (!c.is_advising) weekModules(c, i, now, terms) })

  // Past and future enrollments for /courses
  S.pastCourses.push(makeCourse({code: 'MATH 261', title: 'Introduction to Linear Algebra', crn: '30110', groups: [['Homework', null]], work: [['Homework', 'Homework']]}, 20, now, terms, r, {term: terms.past, noWork: true, enrollment_state: 'completed', workflow_state: 'completed'}))
  S.pastCourses.push(makeCourse({code: 'WRIT 121', title: 'College Writing', crn: '30777', groups: [['Assignments', null]]}, 21, now, terms, r, {term: terms.past, noWork: true, enrollment_state: 'completed', workflow_state: 'completed'}))
  S.futureCourses.push(makeCourse({code: 'MATH 402', title: 'Abstract Algebra II', crn: '50211', groups: [['Homework', null]]}, 22, now, terms, r, {term: terms.future, noWork: true, enrollment_state: 'active'}))
  for (const c of [...S.pastCourses]) { c.scores = {current_score: 91.2, final_score: 91.2, current_grade: 'A-', final_grade: 'A-'} }

  // Colors: Canvas assigns the default palette in order the first time cards render
  S.courses.forEach((c, i) => { S.colors[`course_${c.id}`] = DEFAULT_COLORS[i % DEFAULT_COLORS.length] })

  if (name === 'grading') {
    // weighted groups + drop rules + a custom scheme + grading periods + hidden totals, one per course
    const [alg, ana, chem, lab, wr] = S.courses
    alg.scheme = PSU_STYLE_SCHEME
    alg.schemeTitle = 'MATH 401 Grading Scale'
    alg.groups[0].rules = {drop_lowest: 1}
    const mid = new Date((terms.current.start_at.getTime() + terms.current.end_at.getTime()) / 2)
    ana.gradingPeriods = [
      {id: '7101', title: 'Weeks 1–5', start_date: terms.current.start_at, end_date: new Date(mid.getTime() - 1000), close_date: addDays(mid, 7), weight: null, is_closed: false},
      {id: '7102', title: 'Weeks 6–11', start_date: mid, end_date: terms.current.end_at, close_date: addDays(terms.current.end_at, 7), weight: null, is_closed: false},
    ]
    ana.gradingPeriodSet = {id: '710', title: 'Fall quarter halves', weighted: false, display_totals_for_all_grading_periods: true}
    chem.groups[0].rules = {drop_lowest: 2}
    chem.groups[1].rules = {drop_lowest: 1, drop_highest: 1}
    wr.hide_final_grades = true
    lab.apply_assignment_group_weights = true
    lab.groups[0]._weight = lab.groups[0].group_weight = 25
    lab.groups[1]._weight = lab.groups[1].group_weight = 75
  }

  if (name === 'nicknames') {
    const [alg, ana, chem, lab, wr] = S.courses
    Object.assign(S.nicknames, {[alg.id]: 'Algebra 🧮', [ana.id]: 'Real Analysis', [chem.id]: 'Chem', [wr.id]: 'Writing'})
    Object.assign(S.colors, {[`course_${alg.id}`]: '#6A1B9A', [`course_${ana.id}`]: '#00796B', [`course_${chem.id}`]: '#E65100', [`course_${lab.id}`]: '#F9A825', [`course_${wr.id}`]: '#1565C0'})
    chem.image = '/mock-assets/card-images/flask.svg'
    // a custom order (dashboard_positions) with the lab first
    S.courses.forEach((c, i) => { S.dashboardPositions[`course_${c.id}`] = i + 1 })
    S.dashboardPositions[`course_${lab.id}`] = 0
    // favorites: everything except advising
    S.favorites = new Set(S.courses.filter(c => !c.is_advising).map(c => c.id))
  }

  // Calendar events (personal + course)
  const c0 = S.courses[0]
  S.calendarEvents.push(
    {id: '61001', title: 'Study group', context_code: `user_${USER.id}`, start_at: dayAt(now, 1, 16, 0), end_at: dayAt(now, 1, 17, 30), location_name: 'Library 160', all_day: false, description: null},
    {id: '61002', title: `${c0?.short_code || 'MTH'} review session`, context_code: `course_${c0?.id}`, start_at: dayAt(now, 5, 15, 0), end_at: dayAt(now, 5, 16, 0), location_name: 'Room 462', all_day: false, description: '<p>Bring questions.</p>'},
    {id: '61003', title: 'Veterans Day — no classes', context_code: `user_${USER.id}`, start_at: startOfLaDay(dayAt(now, 21, 0, 0)), end_at: startOfLaDay(dayAt(now, 21, 0, 0)), all_day: true, location_name: null, description: null},
  )
  if (!c0) S.calendarEvents.length = 0

  // Planner notes (to-dos)
  S.plannerNotes.push(
    {id: '7001', title: 'Email advisor about MATH 402 override', details: '', todo_date: dayAt(now, 0, 12, 0), course_id: null, workflow_state: 'active', linked_object_type: null},
    {id: '7002', title: 'Print lab notebook pages', details: 'Library printer', todo_date: dayAt(now, 2, 9, 0), course_id: S.courses[3]?.id || null, workflow_state: 'active', linked_object_type: null},
  )

  // Conversations
  const convo = (i, subject, from, ctx, unread, off, body) => ({
    id: String(91000 + i), subject, workflow_state: unread ? 'unread' : 'read', last_message: body, last_message_at: dayAt(now, off, 10 + i, 5),
    message_count: 1 + (i % 3), subscribed: true, private: true, starred: i === 2, properties: i % 2 ? ['last_author'] : [],
    context_code: ctx ? `course_${ctx.id}` : null, context_name: ctx ? ctx.name : null, from, audience: [from.id],
  })
  if (S.courses.length > 3) {
    S.conversations.push(
      convo(0, 'Question about Problem Set 3', {id: '1180001', name: 'Alex Rivera'}, S.courses[0], true, -1, 'Yes, you may use the result from lecture without proof.'),
      convo(1, 'Lab section swap', {id: '1180044', name: 'Casey Morgan'}, S.courses[3], true, -2, 'I can move you to the Thursday section.'),
      convo(2, 'Group project', {id: '4217801', name: 'Riley Chen'}, S.courses[4], false, -3, 'Want to meet Friday?'),
      convo(3, 'Midterm regrade', {id: '1180002', name: 'Jordan Lee'}, S.courses[1], false, -6, 'Updated, thanks for flagging.'),
      convo(4, 'Registration reminder', {id: '1180090', name: 'CAS Advising'}, S.courses[5], false, -9, 'Winter registration opens soon.'),
    )
  }
  return finish(S)
}

// Canvas assigns an assignment to the grading period containing its due date (undated -> last period)
export function periodOf(course, a) {
  const gps = course.gradingPeriods || []
  if (!gps.length) return null
  if (!a.due_at) return gps[gps.length - 1]
  return gps.find(g => a.due_at >= g.start_date && a.due_at <= g.end_date) || null
}
export function currentPeriod(course, now) {
  return (course.gradingPeriods || []).find(g => now >= g.start_date && now <= g.end_date) || null
}

// An instructor scale of the kind the pilot school faculty commonly set (A from 93%), used by the 'grading' scenario
export const PSU_STYLE_SCHEME = [['A', 0.93], ['A-', 0.9], ['B+', 0.87], ['B', 0.83], ['B-', 0.8], ['C+', 0.77], ['C', 0.73], ['C-', 0.7], ['D+', 0.67], ['D', 0.63], ['D-', 0.6], ['F', 0]]

function finish(S) {
  for (const c of S.courses) finalizeModules(c)
  for (const c of S.courses) computeScores(c)
  return S
}
