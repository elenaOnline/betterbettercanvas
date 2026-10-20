#!/usr/bin/env node
// Writes static, post-render snapshots of every mock page to fixtures/pages/<name>.html so Design can
// open them straight from disk (file://) and prototype on them. Scripts are removed (the DOM is
// already hydrated); /dist/... and /mock-assets/... are rewritten to relative paths under
// fixtures/assets/, and the CSS they need (plus fonts and images) is copied there.
//   node dev/mock-canvas/export.mjs [--scenario default]
// House rules: chrome-headless-shell only, throwaway profile, the server runs in-process.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {launch, startMock, mockCookies} from './tools/browser.mjs'
import {VARIANTS} from './tools/variants.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const SCENARIO = args.includes('--scenario') ? args[args.indexOf('--scenario') + 1] : 'default'
const OUT = path.join(ROOT, 'fixtures/pages')
const ASSETS = path.join(ROOT, 'fixtures/assets')

const EXTRA = [
  {name: 'grades-weighted-periods', url: '/courses/118207/grades', scenario: 'grading'},
  {name: 'grades-hidden-totals', url: '/courses/118228/grades', scenario: 'grading'},
  {name: 'dashboard-cards-empty', url: '/', scenario: 'empty'},
  {name: 'dashboard-cards-heavy', url: '/', scenario: 'heavy'},
]

// map a served URL path to a file on disk
function sourceFor(p) {
  let m
  if ((m = p.match(/^\/dist\/brandable_css\/new_styles_normal_contrast\/bundles\/([a-z0-9_]+)-mock\.css$/))) return path.join(ROOT, 'vendor-built/css', m[1] + '.css')
  if (p.startsWith('/dist/')) return path.join(ROOT, 'vendor-live', p)
  if (p.startsWith('/mock-assets/school/')) return path.join(ROOT, 'vendor-live/school-account', path.basename(p))
  if (p.startsWith('/mock-assets/')) return path.join(ROOT, 'mock-assets', p.slice('/mock-assets/'.length))
  if (p.startsWith('/images/messages/')) return path.join(ROOT, 'mock-assets/avatar-50.png')
  return null
}
const destFor = p => path.join(ASSETS, p.replace(/^\//, '').replace(/^images\/messages\//, 'mock-assets/'))
const copied = new Set()
function copyAsset(p) {
  p = p.split(/[?#]/)[0]
  if (copied.has(p)) return
  copied.add(p)
  const src = sourceFor(p)
  if (!src || !fs.existsSync(src)) return
  const dst = destFor(p)
  fs.mkdirSync(path.dirname(dst), {recursive: true})
  if (p.endsWith('.css')) {
    let css = fs.readFileSync(src, 'utf8')
    css = css.replace(/https:\/\/instructure-uploads\.s3\.amazonaws\.com\/account_100000000000000001\/attachments\/(\d+)\/([^'")\s]+)/g, '/mock-assets/school/$1-$2')
    css = css.replace(/url\((["']?)(\/(?:dist|mock-assets)\/[^)"']+)\1\)/g, (all, q, u) => {
      copyAsset(u)
      return `url(${q}${path.relative(path.dirname(dst), destFor(u.split(/[?#]/)[0])).split(path.sep).join('/')}${q})`
    })
    fs.writeFileSync(dst, css)
  } else fs.copyFileSync(src, dst)
}

async function main() {
  fs.rmSync(OUT, {recursive: true, force: true})
  fs.mkdirSync(OUT, {recursive: true})
  const mock = await startMock()
  const {ctx, close} = await launch({port: mock.port})
  const index = []
  try {
    const list = [...VARIANTS.map(v => ({...v, scenario: v.scenario || SCENARIO})), ...EXTRA]
    for (const v of list) {
      await ctx.clearCookies()
      await ctx.addCookies(mockCookies({scenario: v.scenario, delay: 50, ...(v.cookies || {})}))
      const page = await ctx.newPage()
      const resp = await page.goto('https://canvas.example.edu' + v.url, {waitUntil: 'load'})
      if (resp?.status() !== 200) { console.warn('skip', v.name, resp?.status()); await page.close(); continue }
      await page.waitForTimeout(1200)
      if (v.interact === 'courses-tray') { await page.click('#global_nav_courses_link'); await page.waitForTimeout(400) }
      let html = await page.evaluate(() => {
        document.querySelectorAll('script').forEach(s => s.remove())
        return '<!DOCTYPE html>\n' + document.documentElement.outerHTML
      })
      await page.close()
      html = html.replace(/(href|src)="(\/(?:dist|mock-assets|images\/messages)\/[^"]+)"/g, (all, attr, u) => {
        copyAsset(u)
        return `${attr}="../assets/${destFor(u.split(/[?#]/)[0]).slice(ASSETS.length + 1)}"`
      })
      html = html.replace(/url\(([^)]*?)(\/(?:dist|mock-assets)\/[^)"']+)/g, (all, pre, u) => { copyAsset(u); return `url(${pre}../assets/${u.slice(1)}` })
      html = html.replace(/<head>/, `<head>\n<!-- mock-canvas static snapshot: ${v.name}, scenario ${v.scenario}, ${new Date().toISOString()}; scripts removed after hydration -->`)
      fs.writeFileSync(path.join(OUT, v.name + '.html'), html)
      index.push(`<li><a href="${v.name}.html">${v.name}</a> <small>${v.url} · ${v.scenario}${v.cookies ? ' · ' + JSON.stringify(v.cookies) : ''}</small></li>`)
      console.log('wrote', v.name)
    }
  } finally {
    await close()
    await mock.close()
  }
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!DOCTYPE html><meta charset="utf-8"><title>mock-canvas snapshots</title><body style="font-family: system-ui; margin: 2rem"><h1>mock-canvas static snapshots</h1><p>Post-render DOM, scripts removed. Regenerate with <code>node dev/mock-canvas/export.mjs</code>.</p><ul>${index.join('\n')}</ul></body>`)
}

main().catch(e => { console.error(e); process.exitCode = 1 })
