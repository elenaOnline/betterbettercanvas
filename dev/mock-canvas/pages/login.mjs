// GET /login/canvas and /login: the live canvas.example.edu login page (vendor-live/login-canvas.html,
// captured unauthenticated; see vendor-live/CAPTURED_AT), served with every asset made local.
//
// Changes from the capture, and why:
//  - https://du11hjcvx0uqb.cloudfront.net/dist/...  -> /dist/...  (served from vendor-live/dist)
//  - the pilot school brand uploads on S3 (account_100000000000000001/attachments/<n>/<file>)
//    -> /mock-assets/school/<n>-<file>  (served from vendor-live/school-account)
//  - the webpack-production <script src> tags are removed: the mock does not run Canvas's
//    compiled JS bundles (every page in the mock is static HTML + small client scripts), and
//    the login bundle would try to talk to real Canvas services.
//  - the the pilot school account JS (".../Example University - Production-account-script.js") is
//    removed: at runtime it loads YuJa Panorama (an accessibility overlay) from a third-party
//    host, which would make the mock reach off the box and inject UI we do not control.
//  - the captured authenticity_token values are replaced with an inert mock value.
//
// The form is never wired to anything real: it posts to the relative URL /login/canvas, which on
// the mock has no POST handler (404), and nothing here ever sends credentials anywhere.
import fs from 'node:fs'
import path from 'node:path'
import {ROOT} from '../lib/html.mjs'

let cached = null

function build() {
  const captured = path.join(ROOT, 'vendor-live/login-canvas.html')
  // Without the (non-redistributable) capture, serve a plain stand-in login page.
  if (!fs.existsSync(captured)) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Log In to Canvas</title><meta name="mock-canvas" content="page=login; source=stand-in"></head>' +
      '<body class="ic-Login-Body"><main id="content"><form id="login_form" class="ic-Login__form"><label>Email <input name="pseudonym_session[unique_id]"></label>' +
      '<label>Password <input type="password" name="pseudonym_session[password]"></label><button type="submit">Log In</button></form></main></body></html>'
  }
  let h = fs.readFileSync(captured, 'utf8')
  // remove the pilot school's account-script.js (loads YuJa Panorama from a third party at runtime)
  h = h.replace(/<script src="https:\/\/instructure-uploads\.s3\.amazonaws\.com\/account_100000000000000001\/attachments\/\d+\/[^"]*account-script\.js"[^>]*><\/script>\s*/g,
    '<!-- mock-canvas: the pilot school account-script.js removed (it loads YuJa Panorama from a third party at runtime) -->\n')
  // remove the webpack bundles (Canvas's compiled app JS); keep the brand variables + timezone scripts
  h = h.replace(/<script src="https:\/\/du11hjcvx0uqb\.cloudfront\.net\/dist\/webpack-production\/[^"]+"[^>]*><\/script>/g, '')
  // CDN -> local
  h = h.replace(/https:\/\/du11hjcvx0uqb\.cloudfront\.net\/dist\//g, '/dist/')
  // the pilot school S3 brand uploads -> local copies (file names may be URL-encoded)
  h = h.replace(/https:\/\/instructure-uploads\.s3\.amazonaws\.com\/account_100000000000000001\/attachments\/(\d+)\/([^'")\s]+)/g,
    (_, n, f) => `/mock-assets/school/${n}-${decodeURIComponent(f)}`)
  // inert CSRF tokens
  h = h.replace(/(name="authenticity_token" value=")[^"]*(")/g, '$1mock-authenticity-token$2')
  h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="mock-canvas" content="page=login; source=vendor-live/login-canvas.html">')
  return h
}

export default function render() {
  cached ||= build()
  return {raw: cached}
}
