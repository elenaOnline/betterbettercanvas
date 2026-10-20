#!/usr/bin/env node
// Loads every mock page headlessly (after late rendering) and checks each Canvas selector that
// Better Canvas 9.9.1 / 5.12.6 uses (data/bc-selectors.json) against the pages it applies to.
//   node dev/mock-canvas/check-selectors.mjs [--all] [--write-md] [--scenario default]
// --all       also report low-priority (dark-theme CSS) selectors in the console
// --write-md  rewrite the generated section of SELECTORS.md
// Exit code 1 if a high-priority selector that is expected to match does not.
// House rules: chrome-headless-shell only, throwaway profile, the server runs in-process.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {launch, startMock, mockCookies} from './tools/browser.mjs'
import {VARIANTS} from './tools/variants.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const ALL = args.includes('--all')
const WRITE_MD = args.includes('--write-md')
const SCENARIO = args.includes('--scenario') ? args[args.indexOf('--scenario') + 1] : 'default'

// Selectors that cannot or should not match a static, untouched mock page. Reason shown in the report.
const EXPECTED_ABSENT = [
  [/^\.(css-|eMdva_|fOyUs_|ergWt_|dUOHu_|fCrpb_|bGBk_|enRcg_|fQfxa_|qBMHb_|cECYn_|faJyW_|ycEVK_|fRQLd_|eHiXd_|bDzpk_|dqmEO_|caGd_|ePCDa_)/, 'InstUI emotion/legacy hashed class from a specific Canvas build; not stable, not reproduced'],
  [/\.ui-tooltip|ui-tooltip-content/, 'jQuery UI tooltip; exists only while hovering'],
  [/#file-preview|\.ef-file-preview/, 'file preview overlay; only while previewing a file (page not mocked)'],
  [/\.tox-edit-area__iframe|\.tox-/, 'TinyMCE editor; only on edit/reply forms (not mocked)'],
  [/\[NewDashCardAssignments\]/, 'a log string bc searches for, not a selector'],
  [/:hover|:focus|:active/, 'state selector; checked without the state'],
  [/^#grades_summary th\.details$/, 'grade_summary.html.erb: the details <th> has no class (only td.details exists); bc CSS for an older table'],
  [/^\.ic-DashboardCard__header-(title|subtitle) a$/, 'DashboardCard.tsx has no <a> inside title/subtitle (a.ic-DashboardCard__link wraps them); older card markup'],
  [/^\.ic-DashboardCard__action-layout img$|course-grade-card"\] img$/, 'only matches images bc itself injects'],
  [/^\[data-testid\*="course-card"\]/, 'K5/elementary dashboard cards; not rendered for the pilot school students'],
  [/^\.ui-button$/, 'jQuery UI dialog buttons; exist only while a legacy dialog is open'],
  [/^\.section-tabs\b/, 'Canvas renders ul#section-tabs (an id, no class) — bc\'s class form never matches production either'],
]

function normalize(sel) {
  // turn bc's template-literal selectors into checkable CSS
  let s = sel.replace(/\[([\w-]+)="([^"]*?)\$\{…\}([^"]*?)"\]/g, (m, a, pre, post) => `${pre ? `[${a}^="${pre}"]` : ''}${post ? `[${a}$="${post}"]` : ''}` || `[${a}]`)
  s = s.replace(/::?(before|after|placeholder|-webkit-[\w-]+|selection)\b/g, '')
  s = s.replace(/:(hover|focus|focus-within|focus-visible|active|visited)\b/g, '')
  return s.trim()
}

async function main() {
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/bc-selectors.json'), 'utf8'))
  const mock = await startMock()
  const {ctx, close} = await launch({port: mock.port})
  const results = {} // selector -> {matches: {variant: count}, errors}
  const pageErrors = {}
  try {
    for (const v of VARIANTS) {
      await ctx.clearCookies()
      await ctx.addCookies(mockCookies({scenario: v.scenario || SCENARIO, delay: 50, ...(v.cookies || {})}))
      const page = await ctx.newPage()
      const errs = []
      page.on('pageerror', e => errs.push(e.message))
      page.on('console', m => m.type() === 'error' && errs.push(m.text()))
      const resp = await page.goto('https://canvas.example.edu' + v.url, {waitUntil: 'load'})
      await page.waitForTimeout(1200)
      if (v.interact === 'courses-tray') { await page.click('#global_nav_courses_link'); await page.waitForTimeout(400) }
      if (v.interact === 'compose') {
        const btn = await page.$('[data-testid="compose"], #compose-btn, button:has-text("Compose")')
        if (btn) { await btn.click().catch(() => {}); await page.waitForTimeout(500) }
      }
      pageErrors[v.name] = {status: resp?.status(), errors: errs}
      const sels = all.filter(s => s.pages.some(p => v.pages.includes(p)))
      const counts = await page.evaluate(list => list.map(s => {
        try { return document.querySelectorAll(s).length } catch (e) { return -1 }
      }), sels.map(s => normalize(s.selector)))
      sels.forEach((s, i) => {
        const r = (results[s.selector] ||= {entry: s, matches: {}, invalid: false})
        if (counts[i] === -1) r.invalid = true
        else r.matches[v.name] = counts[i]
      })
      await page.close()
    }
  } finally {
    await close()
    await mock.close()
  }

  const rows = Object.values(results).map(r => {
    const total = Object.values(r.matches).reduce((a, b) => a + b, 0)
    const absent = EXPECTED_ABSENT.find(([re]) => re.test(r.entry.selector))
    const status = total > 0 ? 'ok' : r.invalid ? 'not-a-selector' : absent ? 'expected-absent' : 'MISSING'
    return {selector: r.entry.selector, priority: r.entry.priority, source: r.entry.source, pages: r.entry.pages.join(','), status, where: Object.entries(r.matches).filter(([, n]) => n > 0).map(([k]) => k).join(' '), reason: absent ? absent[1] : '', feature: r.entry.feature}
  }).sort((a, b) => (a.priority > b.priority ? 1 : -1) || a.status.localeCompare(b.status) || a.selector.localeCompare(b.selector))

  const tally = (pri) => {
    const t = {}
    for (const r of rows.filter(x => x.priority === pri)) t[r.status] = (t[r.status] || 0) + 1
    return t
  }
  console.log('high:', tally('high'), '\nlow:', tally('low'))
  for (const r of rows.filter(r => r.status === 'MISSING' && (ALL || r.priority === 'high'))) {
    console.log(`MISSING [${r.priority}] ${r.selector}   (pages: ${r.pages}) — ${r.feature}`)
  }
  for (const [k, v] of Object.entries(pageErrors)) if (v.status !== 200 || v.errors.length) console.log(`page ${k}: HTTP ${v.status}`, v.errors.slice(0, 3))

  fs.mkdirSync(path.join(ROOT, 'fixtures'), {recursive: true})
  fs.writeFileSync(path.join(ROOT, 'fixtures/selector-report.json'), JSON.stringify({scenario: SCENARIO, generated: new Date().toISOString(), pages: pageErrors, rows}, null, 1))

  if (WRITE_MD) {
    const mdPath = path.join(ROOT, 'SELECTORS.md')
    const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''
    const esc = s => String(s).replace(/\|/g, '\\|')
    const table = (pri) => ['| Status | Selector | bc | Pages | Matched on | Note |', '|---|---|---|---|---|---|',
      ...rows.filter(r => r.priority === pri).map(r => `| ${r.status} | \`${esc(r.selector)}\` | ${r.source} | ${r.pages} | ${esc(r.where)} | ${esc(r.reason || r.feature || '')} |`)].join('\n')
    const gen = `<!-- generated by check-selectors.mjs --write-md; do not edit by hand -->
Generated ${new Date().toISOString().slice(0, 16)}Z, scenario \`${SCENARIO}\`.

**High priority** (used from bc's JS or feature CSS): ${JSON.stringify(tally('high'))}

${table('high')}

**Low priority** (bc's dark-theme CSS): ${JSON.stringify(tally('low'))}

<details><summary>Low-priority table</summary>

${table('low')}

</details>
<!-- end generated -->`
    const out = md.includes('<!-- generated by check-selectors.mjs')
      ? md.replace(/<!-- generated by check-selectors\.mjs[\s\S]*<!-- end generated -->/, gen)
      : md + '\n\n' + gen + '\n'
    fs.writeFileSync(mdPath, out)
  }
  const missingHigh = rows.filter(r => r.priority === 'high' && r.status === 'MISSING').length
  process.exitCode = missingHigh ? 1 : 0
}

main().catch(e => { console.error(e); process.exitCode = 2 })
