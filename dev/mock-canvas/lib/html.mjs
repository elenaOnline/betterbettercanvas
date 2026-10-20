// HTML helpers shared by server-rendered pages and (as a string) by the client hydration scripts.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// tagged template: html`<a href="${x}">` escapes interpolations unless wrapped in raw()
class Raw { constructor(s) { this.s = s } toString() { return this.s } }
export const raw = s => new Raw(String(s ?? ''))
export function html(strings, ...vals) {
  let out = strings[0]
  for (let i = 0; i < vals.length; i++) {
    out += flatten(vals[i]) + strings[i + 1]
  }
  return raw(out)
}
function flatten(v) {
  if (v == null || v === false) return ''
  if (v instanceof Raw) return v.s
  if (Array.isArray(v)) return v.map(flatten).join('')
  return esc(v)
}

// InstUI icons (vendor-built/icons.json, from @instructure/ui-icons). Renders the same DOM as
// InstUI's <SVGIcon>: <svg name="IconX" viewBox=... class="css-<hash>-inlineSVG-svgIcon">
let ICONS
export function instIcon(name, {variant = 'Line', size = null, label = null, className = ''} = {}) {
  ICONS ||= JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor-built/icons.json'), 'utf8'))
  const ic = ICONS[`${name}:${variant}`] || ICONS[`${name}:Line`]
  if (!ic) return ''
  const pascal = 'Icon' + name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')
  const sizeCls = size ? ` css-mock-icon-${size}` : ''
  const a11y = label
    ? `role="img" aria-label="${esc(label)}"`
    : 'aria-hidden="true" role="presentation"'
  const title = label ? `<title>${esc(label)}</title>` : ''
  return `<svg name="${pascal}" viewBox="${ic.viewBox}" rotate="0" width="1em" height="1em" ${a11y} focusable="false" class="css-1uh2md0-inlineSVG-svgIcon${sizeCls}${className ? ' ' + esc(className) : ''}" style="width: 1em; height: 1em;">${title}<g role="presentation">${ic.inner}</g></svg>`
}

// Global nav SVG partials copied from canvas-lms app/views/shared/svg
const svgCache = new Map()
export function navSvg(name) {
  if (!svgCache.has(name)) {
    const f = path.join(ROOT, 'vendor-built/svg', name + '.svg')
    svgCache.set(name, fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/<\?xml[^>]*>\s*/, '') : '')
  }
  return svgCache.get(name)
}

export function json(v) {
  // safe for embedding in <script>
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
