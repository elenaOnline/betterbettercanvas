#!/usr/bin/env node
// Headless screenshots of key mock pages into screenshots/. chrome-headless-shell (never a window),
// throwaway profile, server in-process.
//   node dev/mock-canvas/screenshots.mjs
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {launch, startMock, mockCookies} from './tools/browser.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = [
  {file: 'dashboard.png', url: '/'},
  {file: 'dashboard-widget-courses.png', url: '/', cookies: {view: 'widget', tab: 'courses'}},
  {file: 'dashboard-widget-dashboard.png', url: '/', cookies: {view: 'widget', tab: 'dashboard'}},
  {file: 'dashboard-planner.png', url: '/', cookies: {view: 'planner'}},
  {file: 'grades.png', url: '/courses/118207/grades'},
  {file: 'grades-grading-periods.png', url: '/courses/118207/grades', scenario: 'grading'},
]

const mock = await startMock()
const {ctx, close} = await launch({port: mock.port})
try {
  fs.mkdirSync(path.join(ROOT, 'screenshots'), {recursive: true})
  for (const s of SHOTS) {
    await ctx.clearCookies()
    await ctx.addCookies(mockCookies({scenario: s.scenario || 'default', delay: 50, ...(s.cookies || {})}))
    const page = await ctx.newPage()
    const r = await page.goto('https://canvas.example.edu' + s.url, {waitUntil: 'load'})
    if (r?.status() !== 200) { console.warn('skip', s.file, r?.status()); await page.close(); continue }
    await page.waitForTimeout(1500)
    await page.screenshot({path: path.join(ROOT, 'screenshots', s.file)})
    await page.close()
    console.log('wrote screenshots/' + s.file)
  }
} finally {
  await close()
  await mock.close()
}
