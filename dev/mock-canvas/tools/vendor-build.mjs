#!/usr/bin/env node
// Builds vendor-built/ (committed) from the gitignored sources:
//   .vendor/canvas-lms   sparse clone of instructure/canvas-lms (see README "Provenance")
//   .tools/node_modules  sass, @instructure/ui-themes; .tools/uiicons = @instructure/ui-icons
// Outputs:
//   vendor-built/css/<bundle>.css   page bundles compiled from app/stylesheets/bundles/*.scss
//                                   (the live CDN only exposes common/login; page bundle hashes
//                                   are not discoverable without a session)
//   vendor-built/css/planner.css    the planner's runtime CSS, evaluated from ui/shared/planner/**/style.js
//   vendor-built/icons.json         InstUI Line/Solid icon paths used by React-rendered parts
//   vendor-built/svg/*.svg          global-nav SVG partials from app/views/shared/svg
//   vendor-built/SOURCE.json        commit SHA and versions used
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CANVAS = path.join(ROOT, '.vendor/canvas-lms')
const TOOLS = path.join(ROOT, '.tools')
const OUT = path.join(ROOT, 'vendor-built')
const LIVE = path.join(ROOT, 'vendor-live')
const require = createRequire(path.join(TOOLS, 'package.json'))

fs.mkdirSync(path.join(OUT, 'css'), {recursive: true})
fs.mkdirSync(path.join(OUT, 'svg'), {recursive: true})

const sha = execFileSync('git', ['-C', CANVAS, 'rev-parse', 'HEAD']).toString().trim()
const commitDate = execFileSync('git', ['-C', CANVAS, 'log', '-1', '--format=%cI']).toString().trim()

// ---------- 1. SCSS page bundles ----------
export const BUNDLES = [
  'dashboard_card', 'dashboard', 'react_todo_sidebar', 'grade_summary', 'course_show',
  'context_modules2', 'announcements_index', 'discussions_index', 'assignments', 'new_assignments',
  'calendar2', 'canvas_inbox', 'all_courses', 'course_list', 'profile_edit', 'syllabus',
  'assignments_2_student', 'discussions', 'user_grades', 'login',
  // The always-on bundles, so the mock runs without vendor-live/ (public repo).
  'common', 'fonts',
]
const sass = require('sass')

// map "/images/foo.png" -> "/dist/images/foo-<hash>.png" using the live CDN files we already have
function indexLive(dir) {
  const idx = new Map()
  const walk = d => {
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else {
        const rel = '/' + path.relative(path.join(LIVE, 'dist'), p).split(path.sep).join('/')
        const m = rel.match(/^(.*)-[0-9a-f]{10}(\.[a-z0-9]+)$/)
        if (m) idx.set(m[1] + m[2], '/dist' + rel)
      }
    }
  }
  walk(dir)
  return idx
}
const liveIdx = indexLive(path.join(LIVE, 'dist'))
const missingUrls = new Set()

// common.scss imports InstructureIcons-<V>_icon-map.scss, which canvas-lms
// generates during its own build. Recreate it from @instructure/ui-icons'
// icon-font CSS (same package and version), as `$icons-<v>: (name: "\fXXX", …)`.
for (const V of ['Line', 'Solid']) {
  const css = fs.readFileSync(path.join(TOOLS, `uiicons/package/lib/icon-font/${V}/InstructureIcons-${V}.css`), 'utf8')
  const v = V.toLowerCase()
  const rx = new RegExp(`\\.icon-${v}-([a-z0-9-]+):before\\s*\\{\\s*content:\\s*"(\\\\[0-9a-f]+)"`, 'g')
  const entries = [...css.matchAll(rx)].map(m => `  "${m[1]}": "${m[2]}"`)
  const dir = path.join(CANVAS, 'public/fonts/instructure_icons', V)
  fs.mkdirSync(dir, {recursive: true})
  fs.writeFileSync(path.join(dir, `InstructureIcons-${V}_icon-map.scss`), `$icons-${v}: (\n${entries.join(',\n')}\n);\n`)
  // The font itself (MIT), so the mock draws icons without vendor-live/.
  fs.mkdirSync(path.join(OUT, 'fonts', V), {recursive: true})
  fs.copyFileSync(path.join(TOOLS, `uiicons/package/lib/icon-font/${V}/InstructureIcons-${V}.woff2`), path.join(OUT, 'fonts', V, `InstructureIcons-${V}.woff2`))
}

const failedBundles = []
for (const b of BUNDLES) {
  let res
  try {
  res = sass.compile(path.join(CANVAS, 'app/stylesheets/bundles', b + '.scss'), {
    loadPaths: [
      path.join(CANVAS, 'app/stylesheets'),
      path.join(CANVAS, 'app/stylesheets/variants/new_styles_normal_contrast'),
    ],
    style: 'expanded',
    quietDeps: true,
    silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'mixed-decls', 'slash-div'],
    logger: sass.Logger.silent,
  })
  } catch (e) { failedBundles.push(b); console.warn('bundle failed', b, e.message.split('\n')[0]); continue }
  const css = res.css.replace(/url\((["']?)(\/(?:images|fonts)\/[^)"'?#]+)([^)"']*)\1\)/g, (all, q, p, rest) => {
    const hit = liveIdx.get(p)
    if (hit) return `url(${q}${hit}${rest}${q})`
    missingUrls.add(p)
    return all
  })
  fs.writeFileSync(
    path.join(OUT, 'css', b + '.css'),
    `/* mock-canvas: compiled from canvas-lms app/stylesheets/bundles/${b}.scss @ ${sha} (variant new_styles_normal_contrast) */\n` + css,
  )
  console.log('css', b, css.length)
}

// ---------- 2. Planner runtime CSS ----------
// ui/shared/planner/components/*/style.js export buildStyle() returning {css, classNames, theme}.
// They import getThemeVars from ../../getThemeVars; we evaluate them with the real InstUI canvas
// theme plus the pilot school brand variables.
const themes = await import(pathToFileURL(require.resolve('@instructure/ui-themes')).href)
const brandVars = JSON.parse(fs.readFileSync(path.join(LIVE, 'brand-variables.json'), 'utf8'))
const variables = {...JSON.parse(JSON.stringify(themes.canvas)), ...brandVars}
globalThis.__mockThemeVars = {variables, key: 'canvas'}
const tmpDir = path.join(TOOLS, 'planner-style-eval')
fs.rmSync(tmpDir, {recursive: true, force: true})
fs.mkdirSync(tmpDir, {recursive: true})
const compDir = path.join(CANVAS, 'ui/shared/planner/components')
let plannerCss = `/* mock-canvas: planner runtime CSS evaluated from canvas-lms ui/shared/planner/components/*/style.js @ ${sha} with @instructure/ui-themes canvas + the pilot school brand vars */\n`
for (const comp of fs.readdirSync(compDir).sort()) {
  const f = path.join(compDir, comp, 'style.js')
  if (!fs.existsSync(f)) continue
  let src = fs.readFileSync(f, 'utf8')
  src = src.replace(/import\s*\{\s*getThemeVars\s*\}\s*from\s*['"][^'"]+['"]/, 'const getThemeVars = () => globalThis.__mockThemeVars')
  const tmp = path.join(tmpDir, comp + '.mjs')
  fs.writeFileSync(tmp, src)
  try {
    const mod = await import(pathToFileURL(tmp).href)
    const out = mod.default()
    // In production each component's CSS is its own <style> element, so an unclosed block (BadgeList
    // has one upstream) is closed by the parser at the end of that element. Emulate that here.
    let css = out.css, depth = 0
    for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') depth-- }
    if (depth > 0) css += '\n' + '}'.repeat(depth) + ' /* mock-canvas: auto-closed, as the browser does per <style> */'
    plannerCss += `\n/* ${comp} */\n` + css + '\n'
  } catch (e) {
    console.warn('planner style failed', comp, e.message)
  }
}
fs.writeFileSync(path.join(OUT, 'css', 'planner.css'), plannerCss)

// ---------- 3. InstUI icons ----------
const ICONS = [
  'announcement', 'assignment', 'discussion', 'folder', 'calendar-month', 'document', 'peer-review',
  'note', 'quiz', 'x', 'warning', 'more', 'check', 'check-mark', 'arrow-open-down', 'arrow-open-up',
  'arrow-open-end', 'arrow-open-start', 'add', 'edit', 'trash', 'search', 'mini-arrow-down', 'publish',
  'unpublished', 'clock', 'compose', 'reply', 'reply-all', 'star', 'star-light', 'email', 'inbox',
  'settings', 'user', 'grades', 'module', 'complete', 'empty', 'drag-handle', 'info', 'question',
  'calendar-days', 'link', 'paperclip', 'lock', 'unlock', 'off', 'bookmark', 'filter', 'collapse', 'expand', 'gradebook', 'plus', 'eye', 'off', 'message', 'text', 'rubric', 'warning-solid', 'clock', 'trouble',
]
const iconOut = {}
for (const variant of ['Line', 'Solid']) {
  for (const name of ICONS) {
    const f = path.join(TOOLS, 'uiicons/package/svg', variant, name + '.svg')
    if (!fs.existsSync(f)) continue
    const svg = fs.readFileSync(f, 'utf8')
    const viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 1920 1920'
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()
    iconOut[`${name}:${variant}`] = {viewBox, inner}
  }
}
fs.writeFileSync(path.join(OUT, 'icons.json'), JSON.stringify(iconOut))

// ---------- 4. Global nav SVGs ----------
const svgDir = path.join(CANVAS, 'app/views/shared/svg')
for (const f of fs.readdirSync(svgDir)) {
  if (f.endsWith('.svg')) fs.copyFileSync(path.join(svgDir, f), path.join(OUT, 'svg', f.replace(/^_/, '')))
}

const uiIconsVer = JSON.parse(fs.readFileSync(path.join(TOOLS, 'uiicons/package/package.json'), 'utf8')).version
const uiThemesVer = JSON.parse(fs.readFileSync(path.join(TOOLS, 'node_modules/@instructure/ui-themes/package.json'), 'utf8')).version
const sassVer = JSON.parse(fs.readFileSync(path.join(TOOLS, 'node_modules/sass/package.json'), 'utf8')).version
fs.writeFileSync(
  path.join(OUT, 'SOURCE.json'),
  JSON.stringify({canvas_lms_sha: sha, canvas_lms_commit_date: commitDate, sass: sassVer, '@instructure/ui-icons': uiIconsVer, '@instructure/ui-themes': uiThemesVer, unresolved_css_urls: [...missingUrls].sort(), failed_bundles: failedBundles, built_at: new Date().toISOString()}, null, 2),
)
console.log('done; unresolved urls:', missingUrls.size)
