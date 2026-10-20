// b2c check <file>: Dev's planTheme (format, size, CSS sanitising, contrast floors,
// High Contrast gate, fixTheme suggestions) via theme-adapter, plus Design's
// design/spec/themes/check_themes.py as a subprocess for what planTheme doesn't
// cover (marked "Design:"; see agentkit/bin/README.md for the comparison).
// One line per finding:  error|warn  <json.path>  <what>  → <fix>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEngine, DESIGN, KNOWN, ROLES, OPTIONAL_ROLES } from './theme-adapter.mjs';

const CHECKER = path.join(DESIGN, 'themes/check_themes.py');

function nearest(word, options) {
  const d = (a, b) => {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1));
    return m[a.length][b.length];
  };
  let best = null, bd = Infinity;
  for (const o of options) { const x = d(word, o); if (x < bd) { bd = x; best = o; } }
  return bd <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

const FIX_HINT = {
  '$b2c': 'start the file with "$b2c": "theme", "v": 1',
  v: 'set "v": 1',
  name: 'add "name": "Your theme"',
  '(size)': 'drop fields or move styling into palette roles; a theme is tokens, not CSS',
  '$': 'fix the JSON syntax (a trailing comma or a missing quote?)',
};

/** Run Design's checker on a normalised copy (effective palettes, lowercase hex). */
export function designContrast(theme, effective, fileBase) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2c-check-'));
  const tmp = path.join(dir, fileBase.replace(/\.b2c-rice\.json$/, '.b2c-theme.json'));
  // Status roles are optional and only informational in Design's checker; fill blanks with text.
  const pal = Object.fromEntries(Object.entries(effective).map(([k, p]) => [k, Object.fromEntries(ROLES.map(r => [r, String(p[r] || (OPTIONAL_ROLES.includes(r) ? p.text : '')).toLowerCase()]))]));
  const doc = { $b2c: 'theme', v: 1, name: theme.name || 'theme', palette: pal };
  const list = theme.cards?.colors?.list;
  if (Array.isArray(list)) doc.cards = { colors: { list: list.map(c => String(c).toLowerCase()) } };
  fs.writeFileSync(tmp, JSON.stringify(doc));
  const py = process.env.PYTHON || 'python3';
  const r = spawnSync(py, ['-I', CHECKER, '-q', tmp], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.error) return { ran: false, why: `${py} not runnable (${r.error.code})`, lines: [], status: null };
  return { ran: true, status: r.status, lines: (r.stdout + r.stderr).split('\n'), raw: r.stdout };
}

/** Turn check_themes.py output lines into findings with JSON paths. */
export function parseDesign(lines, theme, fixes) {
  const out = [];
  const list = (theme.cards?.colors?.list ?? []).map(c => String(c).toLowerCase());
  const fixFor = (scheme, role) => fixes[scheme]?.find(f => f.role === role);
  for (const ln of lines) {
    const t = ln.trim();
    if (/^warn\s/.test(t)) {   // Design's taste warnings (link vs text, course colours): pass through as warn
      const tg = /\[([^\]]*)\]\s*$/.exec(t)?.[1] ?? '';
      const sc = / · (light|dark)$/.exec(tg)?.[1];
      const what = t.replace(/^warn\s+/, '').replace(/\s*\[[^\]]*\]\s*$/, '');
      let p = '(design)', fix = 'see agentkit/skills/theme/SKILL.md';
      if (/^link\b/.test(what)) { p = `palette.${sc ?? '?'}.link`; fix = 'give the link more chroma (≥ 0.05) and distance from text (ΔEok ≥ 0.10)'; }
      else if (/course colours|cards\.colors/.test(what)) { p = 'cards.colors.list'; fix = /no cards\.colors\.list/.test(what) ? 'add 6–8 course colours drawn from the palette (white text ≥ 3:1)' : 'spread these apart in hue (ΔEok ≥ 0.045)'; }
      else if (/nav\b/.test(what)) { p = `palette.${sc ?? '?'}.nav`; fix = 'darken a large saturated nav to L ≤ .35 so it reads as chrome'; }
      out.push({ level: 'warn', path: p, what, fix });
      continue;
    }
    if (!/^(LOW|FAIL)\b/.test(t)) continue;
    const tag = /\[([^\]]*)\]\s*$/.exec(t)?.[1] ?? '';
    const scheme = / · (light|dark)$/.exec(tag)?.[1];
    const body = t.replace(/\s*\[[^\]]*\]\s*$/, '').replace(/^LOW\s+/, '');
    let m;
    if ((m = /^HC (white on accent) (#\w+)\s+([\d.]+):1/.exec(body))) {
      out.push({ level: 'warn', path: `palette.${scheme}.accent`, what: `High Contrast: white on accent ${m[3]}:1 (AAA 7:1)`, fix: 'darken the accent (b²c lowers it to L .42 under Canvas High Contrast; it still misses)' });
    } else if ((m = /^HC control border on bg\s+([\d.]+):1/.exec(body))) {
      out.push({ level: 'warn', path: `palette.${scheme}.textTertiary`, what: `High Contrast: control border (= textTertiary) on bg ${m[1]}:1 (needs 3:1)`, fix: 'move textTertiary further from bg' });
    } else if ((m = /^HC (\w+)\s+on (\w+)\s+([\d.]+):1/.exec(body))) {
      out.push({ level: 'warn', path: `palette.${scheme}.${m[1]}`, hc: true, on: `${m[3]}:1 on ${m[2]}`, floor: 'AAA 7:1', fix: `move ${m[1]} further from the surfaces in lightness` });
    } else if ((m = /^white on accent (#\w+)\s+([\d.]+):1\s+\(floor ([\d.]+):1\)/.exec(body))) {
      const f = fixFor(scheme, 'accent');
      out.push({ level: 'error', path: `palette.${scheme}.accent`, what: `white label on accent ${m[1]} is ${m[2]}:1 (floor ${m[3]}:1)`, fix: f ? `use ${f.to} (OKLCH lightness only)` : 'darken the accent' });
    } else if ((m = /^white on course (#\w+)\s+([\d.]+):1\s+\(floor ([\d.]+):1\)/.exec(body))) {
      const i = list.indexOf(m[1]);
      const f = fixes.course?.[i];
      out.push({ level: 'error', path: `cards.colors.list[${i}]`, what: `white course title on ${m[1]} is ${m[2]}:1 (floor ${m[3]}:1)`, fix: f ? `use ${f} (OKLCH lightness only)` : 'darken this colour' });
    } else if ((m = /^cards\.colors\.list has (\d+) entries/.exec(body))) {
      out.push({ level: 'warn', path: 'cards.colors.list', what: `${m[1]} colours; Design's presets carry 6–8`, fix: 'give 6–8 colours so most card grids get distinct ones' });
    } else if ((m = /^(\w+)\s+on (\w+)\s+([\d.]+):1\s+Lc\s+([\d.]+)\s+\(floor ([\d.]+):1, Lc (\d+)\)/.exec(body))) {
      const f = fixFor(scheme, m[1]);
      const where = m[1] === 'navText' ? 'on the nav' : 'on bg, surface and surfaceRaised';
      out.push({ level: 'error', path: `palette.${scheme}.${m[1]}`, on: `${m[3]}:1 Lc ${m[4]} on ${m[2]}`, floor: `floor ${m[5]}:1 and Lc ${m[6]}`, fix: f ? `use ${f.to} (OKLCH lightness only; passes ${where})` : `move ${m[1]} or ${m[2]} apart in lightness` });
    } else if ((m = /^FAIL [^:]*?(?: \[(\w+)\])?: missing roles (.*)$/.exec(t))) {
      out.push({ level: 'error', path: `palette.${m[1]}`, what: `missing roles ${m[2]}`, fix: 'give all 14 roles' });
    } else if ((m = /^FAIL [^:]*: (\w+) (.*) is not #rrggbb lowercase$/.exec(t))) {
      out.push({ level: 'error', path: `palette.?.${m[1]}`, what: `${m[2]} is not #rrggbb`, fix: 'write colours as #rrggbb' });
    } else {
      out.push({ level: 'error', path: '(contrast)', what: `Design's checker: ${t}`, fix: 'see design/spec/themes/README.md (floors)' });
    }
  }
  // One line per role: merge the per-surface rows; drop High Contrast notes for roles that already fail.
  const merged = [];
  for (const f of out) {
    if (!f.on) { merged.push(f); continue; }
    const prev = merged.find(g => g.on && g.path === f.path && !!g.hc === !!f.hc);
    if (prev) prev.on += `, ${f.on}`; else merged.push({ ...f });
  }
  const failing = new Set(merged.filter(f => f.level === 'error').map(f => f.path));
  return merged
    .filter(f => !(f.hc && failing.has(f.path)))
    .map(f => (f.on ? { level: f.level, path: f.path, what: `${f.hc ? 'High Contrast: ' : ''}${f.on} (${f.floor})`, fix: f.fix } : f));
}

/** Group Dev's failing contrast checks into one finding per role. */
function devContrast(r, fixes) {
  const out = [];
  for (const [scheme, rep] of Object.entries(r.contrast ?? {})) {
    const byRole = new Map();
    for (const c of rep.failing) {
      const key = c.role === 'courseColor' ? `cards.colors.list[${c.index}]` : `palette.${scheme}.${c.role}`;
      if (!byRole.has(key)) byRole.set(key, { c, items: [] });
      byRole.get(key).items.push(`${c.ratio.toFixed(2)}:1${c.lc != null ? ` Lc ${c.lc.toFixed(1)}` : ''} ${c.pair.replace(/^\w+ on /, 'on ')}`);
    }
    for (const [key, { c, items }] of byRole) {
      const f = c.role === 'courseColor' ? fixes.course[c.index] : fixes[scheme]?.[c.role];
      const what = c.role === 'courseColor' ? `white course title: ${items.join(', ')} (floor ${c.floor})`
        : c.role === 'accent' ? `white label ${items.join(', ')} (floor ${c.floor})` : `${c.role}: ${items.join(', ')} (floor ${c.floor})`;
      out.push({ level: 'error', path: key, what, fix: f ? `use ${f} (Fix contrast: OKLCH lightness only)` : 'move it apart from the surfaces in lightness' });
    }
    const hc = rep.hc;
    if (hc && !hc.pass) {
      const swaps = hc.failing.map(role => `${role} → ${hc.fallback[role]}`).join(', ');
      out.push({ level: 'warn', path: `palette.${scheme}`, what: `under Canvas High Contrast, b²c ${hc.whole ? `swaps in the whole ${scheme === 'dark' ? 'Black' : 'High contrast'} palette` : `swaps ${swaps}`} (AAA gate)`, fix: `raise contrast of ${hc.failing.join(', ')} to keep your colours there` });
    }
  }
  return out;
}

/** Check one theme or rice file. → { file, ok, findings, theme, engine, notes } */
export async function checkFile(file) {
  const engine = await loadEngine();
  const findings = [];
  const add = (level, p, what, fix = '') => findings.push({ level, path: p, what, fix });
  const base = path.basename(file);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    add('error', '$', `can't read ${file} (${e.code})`, 'check the path');
    return { file, ok: false, findings, theme: null, engine };
  }
  const isRice = base.endsWith('.b2c-rice.json');
  let raw = null;
  try { raw = JSON.parse(text); } catch {}
  if (raw && !isRice && !base.endsWith('.b2c-theme.json')) add('warn', '(file)', `"${base}" isn't named <name>.b2c-theme.json or <name>.b2c-rice.json`, 'rename it: .b2c-theme.json (tokens only) or .b2c-rice.json (with css)');

  const r = await engine.planTheme(text);
  for (const e of r.errors) add('error', e.path, e.msg.replace(/, so (it|the list) was left out\.$/, ' (b²c would leave it out)'), FIX_HINT[e.path] || 'fix the value to match design/spec/rice.md "Theme file v1"');
  for (const u of r.unknown) {
    const parent = u.includes('.') ? u.slice(0, u.lastIndexOf('.')) : '';
    const leaf = u.slice(u.lastIndexOf('.') + 1);
    const guess = KNOWN[parent] ? nearest(leaf, KNOWN[parent]) : null;
    add('warn', u, "unknown field: b²c keeps it but doesn't use it", guess ? `did you mean "${guess}"?` : 'remove it, or check rice.md for the field name');
  }
  const notes = [...(r.notes ?? [])];
  if (r.kind && !['theme', 'rice'].includes(r.kind)) notes.push(`read as ${r.kind}, converted to a b²c theme (b²c's Import does the same)`);
  const theme = r.theme;
  if (!theme) return { file, ok: false, findings, theme: null, engine, notes };
  if (!raw) raw = theme; // a share code or another format: measure the converted theme

  // Size: css is capped at THEME_LIMITS.cssBytes (32 KB, rice.md); over riceCssBytes (8 KB) is only a soft note.
  const { css: rawCss, ...rest } = raw;
  const bytes = Buffer.byteLength(JSON.stringify(rest));
  const cssBytes = typeof rawCss === 'string' ? Buffer.byteLength(rawCss) : 0;
  if (cssBytes > engine.limits.cssBytes) add('error', 'css', `${cssBytes} bytes; b²c accepts at most ${engine.limits.cssBytes}`, 'trim the CSS; move colours into palette roles');
  else if (cssBytes > engine.limits.riceCssBytes) add('warn', 'css', `${cssBytes} bytes of CSS is large (over ${engine.limits.riceCssBytes}); every rule runs on every Canvas page`, 'keep only what no token or setting covers');
  if (typeof rawCss === 'string' && rawCss.trim() && !isRice) add('warn', 'css', 'a .b2c-theme.json is a theme share (tokens only); css travels only in a full rice', 'rename the file to <name>.b2c-rice.json, or drop css');
  for (const x of r.cssRemoved) add('error', 'css', `the sanitiser would remove ${x.reason.replace(/\.$/, '')}: ${x.rule.replace(/\s+/g, ' ').slice(0, 80)}`, 'use only data: URIs and bundled fonts; no remote url() or @import');

  // Palette spelling and partial palettes.
  for (const scheme of ['light', 'dark']) {
    const p = theme.palette?.[scheme];
    if (!p || typeof p !== 'object') continue;
    const rp = raw.palette?.[scheme] ?? {};
    const missing = ROLES.filter(k => !(k in p) && !OPTIONAL_ROLES.includes(k));
    if (missing.length) add('warn', `palette.${scheme}`, `missing ${missing.join(', ')}: b²c fills ${missing.length === 1 ? 'it' : 'them'} from its ${scheme === 'dark' ? 'Dark' : 'Paper'} preset, and contrast pairs with ${missing.length === 1 ? 'it' : 'them'} aren't checked`, 'name all 14 roles so the theme looks the same everywhere');
    for (const k of ROLES) if (typeof rp[k] === 'string' && rp[k] !== 'school' && /^#?[0-9a-fA-F]{3,6}$/.test(rp[k]) && rp[k] !== String(p[k])) add('warn', `palette.${scheme}.${k}`, `"${rp[k]}" is read as ${p[k]}`, `write ${p[k]} (#rrggbb, lowercase)`);
  }

  // What this b²c can't apply yet (Dev's planner).
  for (const n of r.planNotes) if (n.kind === 'skipped') add('warn', n.path, "this b²c can't apply it yet, so it does nothing today", 'keep it if you want it later; nothing to fix');

  // Contrast: Dev's report (Design's floors in TS) with fixTheme's values.
  const fixes = { course: [] };
  for (const f of r.fixes) {
    if (f.role === 'courseColor') fixes.course[f.index] = f.to;
    else (fixes[f.scheme] ??= {})[f.role] = f.to;
  }
  findings.push(...devContrast(r, fixes));

  // Design's checker: anything it reports that Dev's didn't (path not already flagged).
  const full = {};
  for (const scheme of ['light', 'dark']) {
    const p = theme.palette?.[scheme];
    if (p && ROLES.every(k => OPTIONAL_ROLES.includes(k) || (typeof p[k] === 'string' && p[k]))) full[scheme] = p;
  }
  const design = { ran: false, extra: 0 };
  if (Object.keys(full).length) {
    const d = designContrast(theme, full, base);
    if (!d.ran) add('warn', '(contrast)', `Design's checker not run: ${d.why}`, 'install Python 3 or set PYTHON=');
    else {
      design.ran = true;
      const dfix = { course: fixes.course };
      for (const [k, v] of Object.entries(fixes)) if (k !== 'course') dfix[k] = Object.entries(v).map(([role, to]) => ({ role, to }));
      const flagged = new Set(findings.map(f => f.path));
      for (const f of parseDesign(d.lines, theme, dfix)) {
        const covered = flagged.has(f.path) || (f.what.startsWith('High Contrast') && findings.some(g => g.path === f.path.split('.').slice(0, 2).join('.') && /High Contrast/.test(g.what)));
        if (!covered) { findings.push({ ...f, what: `Design: ${f.what}` }); design.extra++; }
      }
    }
  }
  if (Object.values(theme.palette ?? {}).some(SCHOOL_IN)) notes.push('"school" roles were checked against a sample school brand (Design\'s reference); a real school\'s colours differ.');
  if (!theme.palette) notes.push('no palette: nothing to check for contrast (an identity theme leaves Canvas as it is).');
  return { file, ok: !findings.some(f => f.level === 'error'), devOk: r.ok, findings, theme, engine, notes, bytes, cssBytes, design };
}
const SCHOOL_IN = p => p && typeof p === 'object' && Object.values(p).includes('school');

export function formatCheck(res, { color = false } = {}) {
  const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const lines = [];
  const w = Math.min(34, Math.max(8, ...res.findings.map(f => f.path.length)));
  for (const f of res.findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1)))
    lines.push(`${f.level === 'error' ? c(31, 'error') : c(33, 'warn ')}  ${f.path.padEnd(w)}  ${f.what}${f.fix ? `  → ${f.fix}` : ''}`);
  const e = res.findings.filter(f => f.level === 'error').length, wn = res.findings.length - e;
  const size = res.bytes != null ? `, ${res.bytes} B of ${res.engine.limits.themeBytes}${res.cssBytes ? `, css ${res.cssBytes} B of ${res.engine.limits.cssBytes}` : ''}` : '';
  lines.push(`${res.ok ? c(32, 'OK  ') : c(31, 'FAIL')}  ${path.basename(res.file)}: ${e} error${e === 1 ? '' : 's'}, ${wn} warning${wn === 1 ? '' : 's'}${size}`);
  for (const n of res.notes ?? []) lines.push(`      note: ${n}`);
  lines.push(`      checked with: ${res.engine.label}${res.design?.ran ? ' + design/spec/themes/check_themes.py' : ''}${res.engine.kind === 'fallback' ? '  [PROVISIONAL]' : ''}`);
  return lines.join('\n');
}
