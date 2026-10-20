// Extra /api/v1 endpoints for the global pages (calendar, inbox, profile). Loaded by server.mjs after
// api/routes.mjs returns null. Default export (S, req) => {status, headers?, body} | null.
//   GET    /api/v1/users/:id/colors                           (Calendar#colorizeContexts uses the numeric id)
//   POST   /api/v1/calendar_events/save_selected_contexts     (calendar sidebar, CalendarEventsApiController)
//   GET    /api/v1/conversations/:id                          (inbox message detail; marks read, as Canvas does)
//   PUT    /api/v1/conversations/:id                          (conversation[workflow_state|starred|subscribed])
//   DELETE /api/v1/conversations/:id
//   PUT    /api/v1/conversations                              (batch: conversation_ids[] + event=mark_as_read|mark_as_unread|star|unstar|archive|destroy)
//   POST   /api/v1/conversations                              (compose; never leaves the mock)
//   GET    /api/v1/search/recipients                          (address book)
import {conversationJson} from './serializers.mjs'
import {iso} from '../lib/time.mjs'

const BASE = 'https://canvas.example.edu'
const ok = (body, headers = {}) => ({status: 200, headers, body})
const notFound = () => ({status: 404, body: {errors: [{message: 'The specified resource does not exist.'}]}})

function parseBody(req) {
  const ct = req.headers['content-type'] || ''
  const raw = req.rawBody || ''
  if (ct.includes('application/json')) { try { return JSON.parse(raw || '{}') } catch { return {} } }
  const o = {}
  for (const [k, v] of new URLSearchParams(raw)) {
    const kk = k.replace(/\[\]$/, '')
    if (k.endsWith('[]')) (o[kk] ||= []).push(v)
    else o[kk] = v
  }
  for (const [k, v] of req.query) if (!(k.replace(/\[\]$/, '') in o)) o[k.replace(/\[\]$/, '')] = v
  return o
}
const field = (b, name, sub) => b[`${name}[${sub}]`] ?? b[name]?.[sub]

// Messages of a conversation: the mock stores only the last message, so expand it into a short,
// stable thread (message_count messages, newest first) alternating between the sender and the user.
export function conversationMessages(S, cv) {
  const out = []
  const n = cv.message_count || 1
  for (let i = 0; i < n; i++) {
    const fromOther = i % 2 === 0 ? !(cv.properties || []).includes('last_author') : (cv.properties || []).includes('last_author')
    const author = fromOther ? cv.from : {id: S.user.id, name: S.user.name}
    const at = new Date(cv.last_message_at.getTime() - i * 5 * 3600000)
    out.push({
      id: +cv.id * 10 + (n - i), created_at: iso(at), body: i === 0 ? cv.last_message : i === n - 1 ? `Hi, ${i % 2 ? cv.from.name.split(' ')[0] : S.user.first_name}. ${cv.subject}?` : 'Thanks, that helps.',
      author_id: +author.id, generated: false, media_comment: null, forwarded_messages: [], attachments: [],
      participating_user_ids: [+S.user.id, +cv.from.id],
    })
  }
  return out
}

function convoDetail(S, cv) {
  return {
    ...conversationJson(S, cv),
    messages: conversationMessages(S, cv),
    submissions: [],
    participants: [
      {id: +S.user.id, name: S.user.name, full_name: S.user.name, pronouns: null, avatar_url: S.user.avatar_url},
      {id: +cv.from.id, name: cv.from.name, full_name: cv.from.name, pronouns: null, avatar_url: `${BASE}/images/messages/avatar-50.png`},
    ],
  }
}

function applyEvent(cv, event) {
  switch (event) {
    case 'mark_as_read': cv.workflow_state = 'read'; break
    case 'mark_as_unread': cv.workflow_state = 'unread'; break
    case 'star': cv.starred = true; break
    case 'unstar': cv.starred = false; break
    case 'archive': cv.workflow_state = 'archived'; break
    case 'destroy': cv.deleted = true; break
  }
}

export default function extraGlobal(S, req) {
  const {method} = req
  const p = req.path.replace(/^\/api\/v1/, '').replace(/\/$/, '')
  let m

  if (method === 'GET' && (m = p.match(/^\/users\/(\d+)\/colors$/)) && m[1] === S.user.id) return ok({custom_colors: S.colors})

  if (method === 'POST' && p === '/calendar_events/save_selected_contexts') {
    const b = parseBody(req)
    let sel = b.selected_contexts
    if (sel === '[]' || sel == null) sel = []
    if (!Array.isArray(sel)) sel = [sel]
    S.calendarSelectedContexts = sel
    return ok({status: 'ok'})
  }

  // ---- inbox ----
  if ((m = p.match(/^\/conversations\/(\d+)$/))) {
    const cv = S.conversations.find(c => c.id === m[1] && !c.deleted)
    if (!cv) return notFound()
    if (method === 'GET') {
      // ConversationsController#show marks the conversation read unless auto_mark_as_read=false
      if (req.query.get('auto_mark_as_read') !== 'false' && cv.workflow_state === 'unread') cv.workflow_state = 'read'
      return ok(convoDetail(S, cv))
    }
    if (method === 'PUT') {
      const b = parseBody(req)
      const ws = field(b, 'conversation', 'workflow_state')
      const star = field(b, 'conversation', 'starred')
      if (ws && ['read', 'unread', 'archived'].includes(ws)) cv.workflow_state = ws
      if (star != null) cv.starred = star === true || star === 'true' || star === '1'
      return ok(conversationJson(S, cv))
    }
    if (method === 'DELETE') { cv.deleted = true; return ok({...conversationJson(S, cv), workflow_state: 'read'}) }
  }
  if (method === 'PUT' && p === '/conversations') {
    const b = parseBody(req)
    const ids = [].concat(b.conversation_ids || [])
    for (const id of ids) { const cv = S.conversations.find(c => c.id === String(id)); if (cv) applyEvent(cv, b.event) }
    return ok({id: 1, url: `${BASE}/api/v1/progress/1`, workflow_state: 'completed', completion: 100, tag: 'conversation_batch_update'})
  }
  if (method === 'POST' && p === '/conversations') {
    // Accept and drop: the mock never delivers messages anywhere.
    const b = parseBody(req)
    const body = String(b.body || '')
    if (!body.trim()) return {status: 400, body: {errors: [{attribute: 'body', message: 'blank'}]}}
    const id = String(91900 + (S.seq++ % 100))
    const recipients = [].concat(b.recipients || [])
    const cv = {
      id, subject: b.subject || '', workflow_state: 'read', last_message: body, last_message_at: new Date(), message_count: 1,
      subscribed: true, private: recipients.length === 1, starred: false, properties: ['last_author'], context_code: b.context_code || null,
      context_name: null, from: {id: String(recipients[0] || S.user.id), name: 'Recipient'}, audience: recipients, sent: true,
    }
    S.sentConversations ||= []
    S.sentConversations.unshift(cv)
    return {status: 201, body: [conversationJson(S, cv)]}
  }

  if (method === 'GET' && p === '/search/recipients') {
    const search = (req.query.get('search') || '').toLowerCase()
    const ctx = req.query.get('context')
    const people = new Map()
    for (const cv of S.conversations) people.set(cv.from.id, {id: cv.from.id, name: cv.from.name, full_name: cv.from.name, pronouns: null, avatar_url: `${BASE}/images/messages/avatar-50.png`, common_courses: cv.context_code ? {[cv.context_code.slice(7)]: ['TeacherEnrollment']} : {}, common_groups: {}})
    let list = []
    if (!ctx) {
      list = S.courses.map(c => ({id: `course_${c.id}`, name: S.nicknames[c.id] || c.name, avatar_url: `${BASE}/images/messages/avatar-group-50.png`, type: 'context', user_count: 30, permissions: {}, context_name: c.term?.name}))
    }
    list = list.concat([...people.values()])
    if (search) list = list.filter(x => x.name.toLowerCase().includes(search))
    return ok(list)
  }

  return null
}
