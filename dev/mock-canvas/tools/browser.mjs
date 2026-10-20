// Headless Chromium for mock-canvas scripts (check-selectors, export, screenshots).
// House rules: headless only (chrome-headless-shell never opens a window), a throwaway
// --user-data-dir under .tools/profiles/ that is deleted afterwards, and we only ever close the
// browser we launched. Never touches Helium or any real profile.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, '.tools/package.json'))

function findExecutable() {
  if (process.env.MOCK_CHROMIUM) return process.env.MOCK_CHROMIUM
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  const cands = []
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache).sort().reverse()) {
      if (d.startsWith('chromium_headless_shell-')) {
        for (const sub of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-linux64']) {
          const ex = path.join(cache, d, sub, 'chrome-headless-shell')
          if (fs.existsSync(ex)) cands.push(ex)
        }
      }
    }
  }
  if (!cands.length) throw new Error('No chrome-headless-shell found in ~/Library/Caches/ms-playwright; set MOCK_CHROMIUM')
  return cands[0]
}

export async function launch({port = 8443, extraArgs = [], hosts = ['canvas.example.edu']} = {}) {
  let pw
  try { pw = require('playwright-core') } catch {
    throw new Error('playwright-core missing: run  (cd dev/mock-canvas/.tools && npm i playwright-core@1.56.1)')
  }
  const profile = path.join(ROOT, '.tools/profiles', 'p-' + crypto.randomBytes(4).toString('hex'))
  fs.mkdirSync(profile, {recursive: true})
  const args = [
    `--host-resolver-rules=${hosts.map(h => `MAP ${h} 127.0.0.1:${port}`).join(', ')}`,
    '--ignore-certificate-errors',
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-sync',
    ...extraArgs,
  ]
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    executablePath: findExecutable(),
    headless: true,
    args,
    ignoreHTTPSErrors: true,
    viewport: {width: 1440, height: 1000},
    timezoneId: 'America/Los_Angeles',
    locale: 'en-US',
  })
  const close = async () => {
    try { await ctx.close() } finally { fs.rmSync(profile, {recursive: true, force: true}) }
  }
  return {ctx, close}
}

// cookies helper for the mock's control cookies
export function mockCookies({scenario, now, delay, view, tab, legacyTodo, widgetLayout, widgetDark, assignmentView, quizEngine, domain = 'canvas.example.edu'} = {}) {
  const c = []
  const add = (name, value) => value != null && c.push({name, value: String(value), domain, path: '/', secure: true})
  add('mock_scenario', scenario)
  add('mock_now', now)
  add('mock_delay', delay)
  add('mock_dashboard_view', view)
  add('mock_dashboard_tab', tab)
  add('mock_legacy_todo', legacyTodo)
  add('mock_widget_layout', widgetLayout)   // 'todo' adds the To-do list widget
  add('mock_widget_dark', widgetDark)       // 1 = dark-mode flag on, 2 = also the user's preference
  add('mock_assignment_view', assignmentView) // 'legacy' = old ERB assignment page
  add('mock_quiz_engine', quizEngine)       // 'new' = New Quizzes LTI launch
  return c
}

// Start the mock server in-process on a free port (for scripts).
export async function startMock(port = 0) {
  const https = await import('node:https')
  const {handle} = await import('../server.mjs')
  const key = path.join(ROOT, '.certs/canvas.example.edu.key')
  if (!fs.existsSync(key)) throw new Error('run make-cert.sh first')
  const srv = https.createServer({key: fs.readFileSync(key), cert: fs.readFileSync(path.join(ROOT, '.certs/canvas.example.edu.crt'))}, (q, s) => handle(q, s).catch(e => { s.writeHead(500); s.end(String(e)) }))
  await new Promise(r => srv.listen(port, '127.0.0.1', r))
  return {port: srv.address().port, close: () => new Promise(r => srv.close(r))}
}
