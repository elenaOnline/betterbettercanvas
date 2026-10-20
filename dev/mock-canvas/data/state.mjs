// In-memory state per (scenario, now). Writes (colors, nicknames, planner notes/overrides,
// favorites, positions, what-if scores, read state) persist until restart or POST /__mock/reset.
import {buildScenario, SCENARIOS, computeScores} from './scenarios.mjs'
import {laParts} from '../lib/time.mjs'

const cache = new Map()

export function getState(scenario, now) {
  const sc = SCENARIOS.includes(scenario) ? scenario : 'default'
  const key = `${sc}|${now.toISOString()}`
  if (!cache.has(key)) cache.set(key, buildScenario(sc, now))
  return cache.get(key)
}

export function resetState() { cache.clear() }

export function allCourses(S) { return [...S.courses, ...S.pastCourses, ...S.futureCourses] }
export function findCourse(S, id) { return allCourses(S).find(c => c.id === String(id)) }
export function findAssignment(S, aid) {
  for (const c of allCourses(S)) {
    const a = c.assignments.find(a => a.id === String(aid))
    if (a) return {course: c, assignment: a, submission: c.submissions.get(a.id)}
  }
  return null
}
export function nickname(S, c) { return S.nicknames[c.id] || c.name }
export function colorOf(S, c) { return S.colors[`course_${c.id}`] || '#626E7B' }
export function isFavorite(S, c) {
  // Canvas: with no explicit favorites, every active course is a "favorite" (shown on dashboard)
  return S.favorites ? S.favorites.has(c.id) : c.enrollment_state === 'active' && c.term?.id !== S.terms.future.id
}
export function dashboardCourses(S) {
  const list = S.courses.filter(c => isFavorite(S, c))
  // sort by dashboard_positions, then by name (Canvas default)
  return list
    .map((c, i) => ({c, pos: S.dashboardPositions[`course_${c.id}`] ?? null, i}))
    .sort((a, b) => (a.pos ?? 1e9) - (b.pos ?? 1e9) || a.c.name.localeCompare(b.c.name))
    .map(x => x.c)
}
export function nextSeq(S) { S.seq += 1; return String(S.seq) }
export function recompute(course) { return computeScores(course) }
export function nowYear(S) { return laParts(S.now).year }
