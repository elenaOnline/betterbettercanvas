// Page routing table. Each page module's default export is
//   render(S, ctx, params) -> page descriptor for layout.renderPage, or {raw, status?, contentType?}, or {redirect}
// Modules are imported lazily so a missing page degrades to a 404, not a crash.
import fs from 'node:fs'
import path from 'node:path'
import {ROOT} from '../lib/html.mjs'

export const PAGES = [
  // [method, pattern, module, export, name used by export.mjs/check-selectors.mjs, sample path]
  ['GET', /^\/$/, 'dashboard.mjs', 'default', 'dashboard', '/'],
  ['GET', /^\/dashboard-sidebar$/, 'dashboard.mjs', 'sidebar', null, null],
  ['GET', /^\/courses$/, 'courses_index.mjs', 'default', 'courses', '/courses'],
  ['GET', /^\/courses\/(?<course>\d+)$/, 'course_home.mjs', 'default', 'course_home', '/courses/:course'],
  ['GET', /^\/courses\/(?<course>\d+)\/assignments$/, 'assignments_index.mjs', 'default', 'assignments', '/courses/:course/assignments'],
  ['GET', /^\/courses\/(?<course>\d+)\/assignments\/syllabus$/, 'syllabus.mjs', 'default', 'syllabus', '/courses/:course/assignments/syllabus'],
  ['GET', /^\/courses\/(?<course>\d+)\/assignments\/(?<assignment>\d+)$/, 'assignment_show.mjs', 'default', 'assignment', '/courses/:course/assignments/:assignment'],
  ['GET', /^\/courses\/(?<course>\d+)\/grades(?:\/\d+)?$/, 'grades.mjs', 'default', 'grades', '/courses/:course/grades'],
  ['GET', /^\/courses\/(?<course>\d+)\/quizzes\/(?<quiz>\d+)\/take$/, 'quiz.mjs', 'take', 'quiz_take', '/courses/:course/quizzes/:quiz/take'],
  ['GET', /^\/courses\/(?<course>\d+)\/quizzes\/(?<quiz>\d+)$/, 'quiz.mjs', 'show', 'quiz', '/courses/:course/quizzes/:quiz'],
  ['GET', /^\/courses\/(?<course>\d+)\/modules$/, 'modules.mjs', 'default', 'modules', '/courses/:course/modules'],
  ['GET', /^\/courses\/(?<course>\d+)\/announcements$/, 'announcements.mjs', 'default', 'announcements', '/courses/:course/announcements'],
  ['GET', /^\/courses\/(?<course>\d+)\/discussion_topics$/, 'discussions.mjs', 'default', 'discussions', '/courses/:course/discussion_topics'],
  ['GET', /^\/calendar$/, 'calendar.mjs', 'default', 'calendar', '/calendar'],
  ['GET', /^\/conversations$/, 'conversations.mjs', 'default', 'inbox', '/conversations'],
  ['GET', /^\/profile\/settings$/, 'profile_settings.mjs', 'default', 'profile_settings', '/profile/settings'],
  ['GET', /^\/(?:login\/canvas|login)$/, 'login.mjs', 'default', 'login', '/login/canvas'],
  ['GET', /^\/grades$/, 'grades.mjs', 'allGrades', 'all_grades', '/grades'],
]

const cache = new Map()

export function matchPage(method, p) {
  for (const [m, re, file, exp] of PAGES) {
    if (m !== method && !(m === 'GET' && method === 'HEAD')) continue
    const hit = p.match(re)
    if (!hit) continue
    const f = path.join(ROOT, 'pages', file)
    if (!fs.existsSync(f)) return null
    return {
      params: hit.groups || {},
      render: async (...args) => {
        if (!cache.has(f)) cache.set(f, await import(f))
        const fn = cache.get(f)[exp]
        if (!fn) throw new Error(`pages/${file} has no export ${exp}`)
        return fn(...args)
      },
    }
  }
  return null
}
