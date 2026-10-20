#!/usr/bin/env node
// mock-canvas: a zero-dependency imitation of canvas.example.edu for b²c tests and design work.
//   node dev/mock-canvas/server.mjs [--port 8443] [--http-port 8080] [--host 127.0.0.1]
// Point Chromium at it with:
//   --host-resolver-rules="MAP canvas.example.edu 127.0.0.1:8443" --ignore-certificate-errors
// See README.md for scenarios, cookies, pages and endpoints.
import https from 'node:https'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {resolveNow} from './lib/time.mjs'
import {getState, resetState} from './data/state.mjs'
import {SCENARIOS} from './data/scenarios.mjs'
import {handleApi} from './api/routes.mjs'
import {renderPage} from './pages/layout.mjs'
import {matchPage} from './pages/index.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

// Page-specific API additions live in api/extra-*.mjs (default export: (S, req) => result|null)
const EXTRA_APIS = await Promise.all(
  fs.readdirSync(path.join(ROOT, 'api')).filter(f => /^extra-.*\.mjs$/.test(f)).sort()
    .map(f => import(path.join(ROOT, 'api', f)).then(m => m.default)),
)

const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.html': 'text/html; charset=utf-8',
}

export function parseCookies(header = '') {
  const o = {}
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=')
    if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return o
}

// vendor-live/ (the pilot school's public CSS/brand captures) is not
// redistributable and absent from the public repo: a missing live image falls
// back to a neutral placeholder so tests that use one as a card image still run.
// (scripts/export-public.mjs; tools/fetch-live.sh re-captures it locally.)
const PLACEHOLDER_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAB3j8WTAAAAPUlEQVR42u3OMQEAAAgDoGlsa4w/I4QG1Gm9NUYCQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBwbsF+iUBf6ftXa8AAAAASUVORK5CYII=', 'base64')

function sendFile(res, file, {rewrite} = {}) {
  if (file && /vendor-live/.test(file) && /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(file) && !fs.existsSync(file)) {
    res.writeHead(200, {'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*'})
    res.end(PLACEHOLDER_PNG)
    return true
  }
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false
  const ext = path.extname(file)
  let body = fs.readFileSync(file)
  if (rewrite) body = Buffer.from(rewrite(body.toString('utf8')))
  res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*'})
  res.end(body)
  return true
}

// Brand variables reference the pilot school images on S3; serve local copies so tests never leave the box.
const s3ToLocal = s => s.replace(/https:\/\/instructure-uploads\.s3\.amazonaws\.com\/account_100000000000000001\/attachments\/(\d+)\/([^'")\s]+)/g, '/mock-assets/school/$1-$2')

function serveStatic(req, res, p) {
  let m
  if ((m = p.match(/^\/dist\/brandable_css\/new_styles_normal_contrast\/bundles\/([a-z0-9_]+)-mock\.css$/))) {
    return sendFile(res, path.join(ROOT, 'vendor-built/css', m[1] + '.css'))
  }
  if (p.startsWith('/dist/')) {
    const f = path.join(ROOT, 'vendor-live', path.normalize(p).replace(/^(\.\.[/\\])+/, ''))
    if (!f.startsWith(path.join(ROOT, 'vendor-live'))) return false
    // Standalone (no vendor-live/): the icon fonts from @instructure/ui-icons.
    const icon = !fs.existsSync(f) && p.match(/^\/dist\/fonts\/instructure_icons\/(Line|Solid)\/InstructureIcons-\1-[0-9a-f]+\.woff2$/)
    if (icon) return sendFile(res, path.join(ROOT, 'vendor-built/fonts', icon[1], `InstructureIcons-${icon[1]}.woff2`))
    // Standalone: Canvas's "Lato Extended" files → Lato (OFL, design/spec/fonts).
    const lato = !fs.existsSync(f) && p.match(/^\/dist\/fonts\/lato\/extended\/Lato-([A-Za-z]+)-[0-9a-f]+\.woff2$/)
    if (lato) return sendFile(res, path.join(ROOT, '../../design/spec/fonts', /^Bold/.test(lato[1]) ? 'Lato-Bold.woff2' : 'Lato-Regular.woff2'))
    // Standalone (no vendor-live/): a generic Canvas default brand instead.
    if (!fs.existsSync(f) && /^\/dist\/brandable_css\/[^/]+\/variables-[^/]+\.css$/.test(p)) return sendFile(res, path.join(ROOT, 'data/default-brand-variables.css'))
    return sendFile(res, f, {rewrite: /variables-.*\.(css|js)$/.test(p) ? s3ToLocal : null})
  }
  if (p.startsWith('/mock-assets/school/')) return sendFile(res, path.join(ROOT, 'vendor-live/school-account', path.basename(p)))
  if (p.startsWith('/mock-assets/')) {
    const f = path.join(ROOT, 'mock-assets', path.normalize(p.slice('/mock-assets/'.length)).replace(/^(\.\.[/\\])+/, ''))
    return f.startsWith(path.join(ROOT, 'mock-assets')) && sendFile(res, f)
  }
  if (p === '/images/messages/avatar-50.png' || p === '/images/messages/avatar-group-50.png') {
    return sendFile(res, path.join(ROOT, 'mock-assets/avatar-50.png'))
  }
  if (p === '/favicon.ico') return sendFile(res, path.join(ROOT, 'vendor-live/school-account/305-school_logo.png'))
  return false
}

function newCsrfToken() {
  // Rails masks a 32-byte token to 64 bytes; shape matches the live cookie (base64, url-encoded)
  return encodeURIComponent(crypto.randomBytes(64).toString('base64'))
}

function csrfOk(req, cookies) {
  const header = req.headers['x-csrf-token']
  const cookie = cookies._csrf_token ? decodeURIComponent(cookies._csrf_token) : null
  if (!cookie) return false
  if (header && header === cookie) return true
  if (header && decodeURIComponent(header) === cookie) return true
  // form posts may send authenticity_token
  const m = (req.rawBody || '').match(/(?:^|&)authenticity_token=([^&]*)/)
  return !!m && decodeURIComponent(m[1].replace(/\+/g, ' ')) === cookie
}

function pageCookies(cookies, secure = true) {
  const sec = secure ? '; secure' : ''
  const out = [`_csrf_token=${newCsrfToken()}; path=/${sec}`]
  if (!cookies.canvas_session) out.push(`canvas_session=mock-session-${crypto.randomBytes(8).toString('hex')}; path=/${sec}; HttpOnly${secure ? '; SameSite=None' : ''}`)
  if (!cookies.log_session_id) out.push(`log_session_id=${crypto.randomBytes(16).toString('hex')}; path=/${sec}; HttpOnly`)
  return out
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

// The mock answers for any hostname (canvas.example.edu, *.instructure.com, localhost...). Content is
// authored with https://canvas.example.edu absolute URLs; rehost() rewrites them to the requested origin.
function originOf(req) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'canvas.example.edu').split(',')[0].trim()
  const proto = req.socket?.encrypted ? 'https' : 'http'
  return `${proto}://${host}`
}
function rehost(body, origin) {
  if (origin === 'https://canvas.example.edu' || typeof body !== 'string') return body
  return body.split('https://canvas.example.edu').join(origin).split('https:\\/\\/canvas.example.edu').join(origin.replace(/\//g, '\\/'))
}

export async function handle(req, res) {
  const origin = originOf(req)
  const url = new URL(req.url, origin)
  const p = decodeURIComponent(url.pathname)
  const cookies = parseCookies(req.headers.cookie)
  req.path = url.pathname
  req.query = url.searchParams
  req.rawBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : ''
  let method = req.method
  // Rails-style method override from forms / jQuery
  const ov = req.headers['x-http-method-override'] || (req.rawBody.match(/(?:^|&)_method=([A-Za-z]+)/) || [])[1]
  if (method === 'POST' && ov) method = ov.toUpperCase()
  req.method = method

  const now = resolveNow(cookies)
  const scenario = SCENARIOS.includes(cookies.mock_scenario) ? cookies.mock_scenario : 'default'
  const S = getState(scenario, now)
  const ctx = {path: url.pathname, query: url.searchParams, cookies, now, req}

  // --- mock control endpoints ---
  if (p === '/__mock/reset' && (method === 'POST' || method === 'GET')) {
    resetState()
    res.writeHead(200, {'Content-Type': 'application/json'})
    return res.end(JSON.stringify({ok: true}))
  }
  if (p === '/__mock/set') {
    // /__mock/set?scenario=heavy&now=2026-10-21T10:00:00-07:00&delay=0&view=planner&next=/
    const set = []
    const map = {scenario: 'mock_scenario', now: 'mock_now', delay: 'mock_delay', view: 'mock_dashboard_view', legacy_todo: 'mock_legacy_todo'}
    for (const [k, c] of Object.entries(map)) {
      if (url.searchParams.has(k)) {
        const v = url.searchParams.get(k)
        set.push(v === '' ? `${c}=; path=/; max-age=0` : `${c}=${encodeURIComponent(v)}; path=/`)
      }
    }
    res.writeHead(302, {'Set-Cookie': set, Location: url.searchParams.get('next') || '/'})
    return res.end()
  }
  if (p === '/__mock/info') {
    res.writeHead(200, {'Content-Type': 'application/json'})
    return res.end(JSON.stringify({scenario, now: now.toISOString(), courses: S.courses.map(c => ({id: c.id, name: c.name, assignments: c.assignments.length})), scenarios: SCENARIOS}, null, 2))
  }

  // --- static ---
  if (method === 'GET' && serveStatic(req, res, p)) return

  // --- GraphQL (POST '/api/graphql'), answered by api/extra-*.mjs (widget dashboard). GraphQL ids are
  // always strings (_id), so the REST id policy is not applied here. ---
  if (p === '/api/graphql' && method === 'POST') {
    if (!csrfOk(req, cookies)) {
      res.writeHead(422, {'Content-Type': 'application/json; charset=utf-8'})
      return res.end(JSON.stringify({errors: [{message: 'Invalid authenticity token'}]}))
    }
    let r = null
    for (const extra of EXTRA_APIS) { if (r) break; r = extra(S, req) }
    res.writeHead(r ? r.status : 404, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'})
    return res.end(rehost(JSON.stringify(r ? r.body : {errors: [{message: 'Not found'}]}), origin))
  }

  // --- API ---
  if (p.startsWith('/api/v1/')) {
    if (method !== 'GET' && method !== 'HEAD' && !csrfOk(req, cookies)) {
      res.writeHead(422, {'Content-Type': 'application/json; charset=utf-8'})
      return res.end(JSON.stringify({errors: [{message: 'Invalid authenticity token'}]}))
    }
    let r = handleApi(S, req)
    for (const extra of EXTRA_APIS) { if (r) break; r = extra(S, req) }
    if (!r) {
      res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'})
      return res.end(JSON.stringify({errors: [{message: 'The specified resource does not exist.'}]}))
    }
    const stringIds = /canvas-string-ids/.test(req.headers.accept || '')
    const body = rehost(r.body == null ? '' : JSON.stringify(r.body, idPolicy(stringIds)), origin)
    const headers = {...(r.headers || {})}
    if (headers.Link) headers.Link = rehost(headers.Link, origin)
    res.writeHead(r.status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers})
    return res.end(body)
  }

  // --- non-API Canvas endpoints used by pages ---
  if (p === '/dashboard/view' && method === 'PUT') {
    if (!csrfOk(req, cookies)) { res.writeHead(422); return res.end() }
    const m = req.rawBody.match(/dashboard_view=(\w+)/) || (req.rawBody.includes('{') && [null, JSON.parse(req.rawBody).dashboard_view])
    if (m && ['cards', 'planner', 'activity'].includes(m[1])) S.dashboardView = m[1]
    res.writeHead(200, {'Content-Type': 'application/json'})
    return res.end(JSON.stringify({dashboard_view: S.dashboardView}))
  }

  // --- pages ---
  const hit = matchPage(method, url.pathname)
  if (hit) {
    let out
    try {
      out = await hit.render(S, ctx, hit.params)
    } catch (e) {
      console.error(e)
      res.writeHead(500, {'Content-Type': 'text/plain'})
      return res.end('mock-canvas page error: ' + e.stack)
    }
    if (out?.redirect) {
      res.writeHead(302, {Location: out.redirect})
      return res.end()
    }
    const htmlOut = rehost(out.raw != null ? out.raw : renderPage(S, ctx, out), origin)
    res.writeHead(out.status || 200, {
      'Content-Type': out.contentType || 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': pageCookies(cookies, !!req.socket?.encrypted),
      'X-Canvas-Meta': 'mock-canvas',
    })
    return res.end(htmlOut)
  }

  res.writeHead(404, {'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': pageCookies(cookies, !!req.socket?.encrypted)})
  res.end(rehost(renderPage(S, ctx, {title: 'Page Not Found', content: `<div class="ic-Error-page"><h1>Page Not Found</h1><p>mock-canvas does not implement <code>${p.replace(/</g, '&lt;')}</code>.</p></div>`}), origin))
}

// Canvas id policy (application_controller.rb: Accept application/json+canvas-string-ids).
// With the header every id / *_id (and *_ids, audience arrays) is a string; without it, a number.
// Applied to every API body, so page modules and extra-*.mjs can't drift from the policy.
const NOT_IDS = /^(sis_|integration_|lti_|anonymous_|uuid|.*_uuid$|lti_context_id$)/
function isIdKey(k) { return typeof k === 'string' && !NOT_IDS.test(k) && (k === 'id' || k.endsWith('_id')) }
function isIdListKey(k) { return typeof k === 'string' && !NOT_IDS.test(k) && (k.endsWith('_ids') || k === 'audience') }
function idPolicy(asString) {
  const conv = v => {
    if (asString) return typeof v === 'number' && Number.isInteger(v) ? String(v) : v
    return typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : v
  }
  return function (key, value) {
    if (isIdKey(key)) return conv(value)
    if (isIdListKey(key) && Array.isArray(value)) return value.map(conv)
    return value
  }
}

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = +arg('--port', process.env.MOCK_PORT || 8443)
  const httpPort = arg('--http-port', process.env.MOCK_HTTP_PORT || null)
  const host = arg('--host', '127.0.0.1')
  const certDir = path.join(ROOT, '.certs')
  const key = path.join(certDir, 'canvas.example.edu.key')
  const cert = path.join(certDir, 'canvas.example.edu.crt')
  const wrap = (req, res) => handle(req, res).catch(e => { console.error(e); try { res.writeHead(500); res.end(String(e)) } catch {} })
  // First run (e.g. a fresh clone): make the self-signed cert ourselves, the
  // same one make-cert.sh writes. Parallel test workers race here, so each
  // generates into a private dir and renames it into place; losers reuse it.
  if (!fs.existsSync(cert)) {
    const tmp = `${certDir}.${process.pid}`
    try {
      fs.mkdirSync(tmp, {recursive: true})
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825',
        '-keyout', path.join(tmp, path.basename(key)), '-out', path.join(tmp, path.basename(cert)),
        '-subj', '/CN=canvas.example.edu/O=mock-canvas (b2c tests)', '-addext', 'subjectAltName=DNS:canvas.example.edu,DNS:localhost,IP:127.0.0.1'], {stdio: 'ignore'})
      fs.renameSync(tmp, certDir)
    } catch {
      fs.rmSync(tmp, {recursive: true, force: true})
    }
  }
  if (fs.existsSync(key) && fs.existsSync(cert)) {
    https.createServer({key: fs.readFileSync(key), cert: fs.readFileSync(cert)}, wrap).listen(port, host, () => {
      console.log(`mock-canvas https://${host}:${port}  (as canvas.example.edu)`)
    })
  } else {
    console.warn('no certificate in .certs/ and openssl failed — run make-cert.sh; HTTPS disabled')
  }
  if (httpPort) {
    http.createServer(wrap).listen(+httpPort, host, () => console.log(`mock-canvas http://${host}:${httpPort}`))
  }
}
