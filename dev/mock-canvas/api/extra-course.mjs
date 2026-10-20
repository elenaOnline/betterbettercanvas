// Extra /api/v1 endpoints used by the course pages (pages/announcements.mjs, discussions.mjs).
// Consulted by server.mjs after api/routes.mjs returns null.
import {findCourse} from '../data/state.mjs'

export default function extraCourse(S, req) {
  const p = req.path.replace(/^\/api\/v1/, '').replace(/\/$/, '')
  let m
  // PUT /api/v1/courses/:course_id/discussion_topics/read_all  (discussion_topics_api#mark_all_topic_read)
  // Announcements "Mark All as Read" sends {only_announcements: true}.
  if (req.method === 'PUT' && (m = p.match(/^\/courses\/(\d+)\/discussion_topics\/read_all$/))) {
    const c = findCourse(S, m[1])
    if (!c) return {status: 404, body: {errors: [{message: 'The specified resource does not exist.'}]}}
    let body = {}
    try { body = JSON.parse(req.rawBody || '{}') } catch { body = Object.fromEntries(new URLSearchParams(req.rawBody || '')) }
    const onlyAnn = body.only_announcements === true || body.only_announcements === 'true' || req.query.get('only_announcements') === 'true'
    for (const t of onlyAnn ? c.announcements : [...c.discussions, ...c.announcements]) { t.read_state = 'read'; t.unread_count = 0 }
    return {status: 204, body: null}
  }
  // PUT/DELETE /api/v1/courses/:course_id/discussion_topics/:topic_id/subscribed
  if ((req.method === 'PUT' || req.method === 'DELETE') && (m = p.match(/^\/courses\/(\d+)\/discussion_topics\/(\d+)\/subscribed$/))) {
    const c = findCourse(S, m[1])
    const t = c && [...c.discussions, ...c.announcements].find(x => x.id === m[2])
    if (!t) return {status: 404, body: {errors: [{message: 'The specified resource does not exist.'}]}}
    t.subscribed = req.method === 'PUT'
    return {status: 204, body: null}
  }
  return null
}
