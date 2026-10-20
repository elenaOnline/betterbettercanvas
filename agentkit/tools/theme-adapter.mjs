// theme-adapter: the ONE place b2c check/render get the theme engine from.
//
// Primary: Dev's agent module, `agent/theme.mjs` (built from dev/src/core/theme/node.ts
// by every dev build; CONTRACT.md §5 "Dev exposes" 1). Exports planTheme(text, opts)
// (async), fixTheme, sanitizeCss, THEME_LIMITS, contrastReport, PRESETS.
// Where it comes from, first match wins:
//   1. $B2C_THEME_MODULE (a path to a theme.mjs)
//   2. agentkit/.scratch/b2c-test/agent/theme.mjs (render's test build), if it's current
//   3. dev/dist/agent/theme.mjs, if that build is newer than every file in dev/src
//   4. node.ts bundled on the fly (dev/node_modules' esbuild, the same entry build.mjs
//      uses) into agentkit/tools/.cache/, keyed by a hash of dev/src (~100 ms, once)
//   5. the last bundle that built (Dev's tree is edited live; a lane can break it)
//   6. a small explicit validator written from design/spec/rice.md (fallbackEngine),
//      marked PROVISIONAL in the output. render needs Dev's build and refuses.
// B2C_ENGINE=fallback forces 6 (for testing the fallback).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DEV = process.env.B2C_DEV ? path.resolve(process.env.B2C_DEV) : path.join(ROOT, 'dev');
export const DESIGN = path.join(ROOT, 'design/spec');
const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');

/** rice.md "Theme file v1" limits. */
export const RICE_LIMITS = { themeBytes: 4096, cssBytes: 8192 };

export const ROLES = ['bg', 'surface', 'surfaceRaised', 'border', 'text', 'textSecondary', 'textTertiary',
  'link', 'accent', 'nav', 'navText', 'success', 'warning', 'danger'];
export const OPTIONAL_ROLES = ['success', 'warning', 'danger'];
export const SCHOOL_ROLES = ['link', 'accent', 'nav'];

/** Known field names per level (rice.md), for "did you mean" on unknown fields. */
export const KNOWN = {
  '': ['$b2c', 'v', 'name', 'author', 'source', 'updateUrl', 'id', 'rev', 'from', 'palette', 'type', 'shape', 'density', 'cards', 'layout', 'views', 'css'],
  from: ['id', 'rev', 'name'],
  palette: ['light', 'dark'],
  'palette.light': ROLES, 'palette.dark': ROLES,
  type: ['family', 'scale'],
  shape: ['corner', 'border'],
  cards: ['style', 'height', 'overlay', 'width', 'gap', 'colors'],
  'cards.colors': ['list', 'gradient'],
  layout: ['width', 'panel', 'sections'],
  views: ['todo'],
};

// ── Dev's engine ─────────────────────────────────────────────────────────────

function srcHash() {
  const h = crypto.createHash('sha1');
  let newest = 0;
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const s = fs.statSync(p); newest = Math.max(newest, s.mtimeMs); h.update(`${p}\0${s.size}\0${s.mtimeMs}\n`); }
    }
  };
  walk(path.join(DEV, 'src'));
  return { hash: h.digest('hex').slice(0, 12), newest };
}

/** Find or make Dev's agent/theme.mjs. → { file, from } */
async function locateModule() {
  if (process.env.B2C_THEME_MODULE) return { file: path.resolve(process.env.B2C_THEME_MODULE), from: '$B2C_THEME_MODULE' };
  const { hash, newest } = srcHash();
  const { TEST_BUILD, testBuildCurrent } = await import('./devbuild.mjs');
  const tb = path.join(TEST_BUILD, 'agent/theme.mjs');
  if (fs.existsSync(tb) && testBuildCurrent()) return { file: tb, from: 'agentkit/.scratch/b2c-test/agent/theme.mjs' };
  const dist = path.join(DEV, 'dist/agent/theme.mjs');
  if (fs.existsSync(dist) && fs.statSync(dist).mtimeMs >= newest) return { file: dist, from: 'dev/dist/agent/theme.mjs' };
  const out = path.join(CACHE, `engine-${hash}.mjs`);
  if (fs.existsSync(out)) return { file: out, from: 'dev/src/core/theme/node.ts (bundled, current)' };
  try {
    const esbuild = createRequire(path.join(DEV, 'package.json'))('esbuild');
    fs.mkdirSync(CACHE, { recursive: true });
    const tmp = `${out}.${process.pid}.tmp.mjs`;
    await esbuild.build({
      entryPoints: [path.join(DEV, 'src/core/theme/node.ts')], absWorkingDir: DEV,
      bundle: true, format: 'esm', platform: 'node', target: 'node20', outfile: tmp, logLevel: 'silent', loader: { '.css': 'text' },
      define: { __B2C_BUILD_ID__: '"agentkit"', __B2C_RELEASE__: 'false', __B2C_TEST__: 'false', __B2C_FEATURE_IDS__: '[]' },
    });
    fs.renameSync(tmp, out);
    for (const f of fs.readdirSync(CACHE)) if (/^engine-.*\.mjs$/.test(f) && path.join(CACHE, f) !== out) fs.rmSync(path.join(CACHE, f), { force: true });
    return { file: out, from: 'dev/src/core/theme/node.ts (bundled, current)' };
  } catch (e) {
    const last = fs.existsSync(CACHE) ? fs.readdirSync(CACHE).filter(f => /^engine-[0-9a-f]+\.mjs$/.test(f)).map(f => path.join(CACHE, f)) : [];
    if (last.length) return { file: last[0], from: `last good bundle (dev/src doesn't build now: ${firstLine(e)})` };
    throw e;
  }
}
const firstLine = e => String(e?.errors?.[0]?.text ?? e?.message ?? e).split('\n')[0].slice(0, 160);

async function devEngine() {
  const { file, from } = await locateModule();
  const m = await import(pathToFileURL(file).href);
  if (typeof m.planTheme !== 'function') throw new Error(`${file} has no planTheme`);
  return {
    kind: 'dev',
    label: `Dev's planTheme (${from})`,
    limits: { themeBytes: m.THEME_LIMITS.themeBytes, cssBytes: m.THEME_LIMITS.cssBytes, riceCssBytes: RICE_LIMITS.cssBytes },
    /**
     * → { kind, theme|null, unknown[], errors[{path,msg}], notes[], cssRemoved[], ok,
     *     contrast: {scheme: {failing: Check[], hc: HcGate}}, planNotes[], fixes[] }
     */
    async planTheme(text) {
      const r = await m.planTheme(text, { css: true, courseColors: true });
      const fixes = r.theme ? m.fixTheme(r.theme).fixes : [];
      return { ...r, errors: r.errors.map(splitError), planNotes: r.plan?.notes ?? [], fixes };
    },
  };
}

/** Dev's messages are "path: text" (or envelope errors with no path). */
function splitError(s) {
  const m = /^([\w$.[\]]+): (.*)$/.exec(s);
  if (m) return { path: m[1], msg: m[2] };
  const guess = /no name/.test(s) ? 'name' : /"\$b2c"|older b²c/.test(s) ? '$b2c' : /version|newer b²c/.test(s) ? 'v' : /KB/.test(s) ? '(size)' : /JSON/.test(s) ? '$' : '$';
  return { path: guess, msg: s };
}

// ── Fallback: an explicit validator from rice.md (provisional) ─────────────────

function fallbackEngine(why) {
  const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const T = {
    str: max => v => typeof v === 'string' && v.trim() && v.length <= max ? null : `should be text (up to ${max} characters)`,
    int: (a, b) => v => Number.isInteger(v) && v >= a && v <= b ? null : `should be a whole number from ${a} to ${b}`,
    num: (a, b) => v => typeof v === 'number' && v >= a && v <= b ? null : `should be a number from ${a} to ${b}`,
    bool: () => v => typeof v === 'boolean' ? null : 'should be true or false',
    oneOf: xs => v => xs.includes(v) ? null : `"${v}" isn't one of ${xs.join(', ')}`,
    colors: (a, b) => v => Array.isArray(v) && v.length >= a && v.length <= b && v.every(x => typeof x === 'string' && HEX.test(x)) ? null : `should be a list of ${a} to ${b} colours (#rrggbb)`,
    sections: () => v => Array.isArray(v) && v.every(s => typeof s === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(s)) ? null : 'should be a list of section names',
  };
  const role = r => v => (v === 'school' && SCHOOL_ROLES.includes(r)) || (typeof v === 'string' && HEX.test(v)) ? null : `${JSON.stringify(v)} isn't a colour (#rrggbb${SCHOOL_ROLES.includes(r) ? ' or "school"' : ''})`;
  const pal = Object.fromEntries(ROLES.map(r => [r, role(r)]));
  const SPEC = {
    author: T.str(120), source: T.str(500), updateUrl: T.str(500), id: T.str(64), rev: T.int(0, Number.MAX_SAFE_INTEGER),
    from: { id: T.str(64), rev: T.int(0, Number.MAX_SAFE_INTEGER), name: T.str(80) },
    palette: { light: pal, dark: pal },
    type: { family: T.str(100), scale: T.num(0.9, 1.15) },
    shape: { corner: T.int(0, 12), border: T.int(0, 2) },
    density: T.oneOf(['compact', 'comfortable', 'roomy']),
    cards: { style: T.oneOf(['flat', 'gradient', 'image']), height: T.oneOf(['standard', 'condensed']), overlay: T.bool(), width: T.int(220, 360), gap: T.int(8, 48),
      colors: { list: T.colors(1, 12), gradient: T.colors(2, 2) } },
    layout: { width: T.oneOf(['standard', 'wide', 'full']), panel: T.oneOf(['right', 'left', 'hidden']), sections: T.sections() },
    views: { todo: T.oneOf(['list', 'ring', 'week', 'courses']) },
    css: v => typeof v === 'string' ? null : 'should be text',
  };
  const walk = (spec, obj, pre, out) => {
    if (!isObj(obj)) { out.errors.push({ path: pre, msg: 'should be a group of settings' }); return; }
    for (const [k, v] of Object.entries(obj)) {
      const p = pre ? `${pre}.${k}` : k;
      const s = spec[k];
      if (!s) { out.unknown.push(p); continue; }
      if (typeof s === 'function') { const e = s(v); if (e) out.errors.push({ path: p, msg: e }); }
      else walk(s, v, p, out);
    }
  };
  // Remote references a theme's css must not contain (rice.md). Regex-level: provisional.
  const cssScan = css => {
    const removed = [];
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of noComments.matchAll(/@import\b[^;]*;?/gi)) removed.push({ rule: m[0].slice(0, 100), reason: '@import is not allowed' });
    for (const m of noComments.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) if (!/^data:/i.test(m[2].trim())) removed.push({ rule: m[0].slice(0, 100), reason: 'remote url() is not allowed (only data: URIs)' });
    for (const m of noComments.matchAll(/\b(image-set|image|cross-fade|element|expression|src)\(\s*['"]/gi)) removed.push({ rule: m[0].slice(0, 100), reason: `${m[1]}() with a string can fetch a URL` });
    return removed;
  };
  return {
    kind: 'fallback',
    label: `provisional validator from rice.md (Dev's engine unavailable: ${why})`,
    limits: { ...RICE_LIMITS, riceCssBytes: RICE_LIMITS.cssBytes },
    async planTheme(text) {
      const r = this.parse(text);
      return { kind: 'theme', ...r, notes: [], contrast: {}, planNotes: [], fixes: [], ok: !!r.theme && !r.errors.length };
    },
    parse(text) {
      const out = { theme: null, unknown: [], errors: [], cssRemoved: [] };
      let raw;
      try { raw = JSON.parse(text); } catch { out.errors.push({ path: '$', msg: "isn't JSON" }); return out; }
      if (!isObj(raw) || raw.$b2c !== 'theme') { out.errors.push({ path: '$b2c', msg: 'must be "theme"' }); return out; }
      if (raw.v !== 1) { out.errors.push({ path: 'v', msg: 'must be 1' }); return out; }
      if (typeof raw.name !== 'string' || !raw.name.trim()) { out.errors.push({ path: 'name', msg: 'is required (text)' }); return out; }
      const { css, ...rest } = raw;
      const size = Buffer.byteLength(JSON.stringify(rest));
      if (size > RICE_LIMITS.themeBytes) { out.errors.push({ path: '(size)', msg: `is ${size} bytes without css; the limit is ${RICE_LIMITS.themeBytes}` }); return out; }
      const { $b2c, v, name, ...fields } = raw;
      walk(SPEC, fields, '', out);
      if (typeof css === 'string') out.cssRemoved = cssScan(css);
      out.theme = raw;
      return out;
    },
  };
}

let cached;
/** The engine: Dev's when it bundles, else the fallback. `B2C_ENGINE=fallback` forces the fallback. */
export async function loadEngine() {
  if (cached) return cached;
  if (process.env.B2C_ENGINE === 'fallback') return (cached = fallbackEngine('forced by B2C_ENGINE=fallback'));
  try { cached = await devEngine(); } catch (e) {
    cached = fallbackEngine(firstLine(e));
  }
  return cached;
}
