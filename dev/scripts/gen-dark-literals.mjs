#!/usr/bin/env node
// Dark mode layer (b): Canvas's compiled CSS bundles + the literal map
// (src/features/palette/literals.ts, from dark-mode.md §6) → gated overrides.
//
//   node scripts/gen-dark-literals.mjs [--out FILE] [CANVAS.css ...]
//
// With no inputs it reads the vendored bundles: the pilot school's live common and RCE
// (TinyMCE) bundles in mock-canvas/vendor-live, and the page bundles rebuilt
// from canvas-lms source in mock-canvas/vendor-built/css. For every
// declaration whose colour literal is mapped, it emits the same selector,
// gated by html[data-b2c-dark="on"], with the literal replaced by the role
// variable. Coverage is complete by construction for the bundles it has seen.
// Re-run when Canvas ships new CSS. Unmapped colours go to stderr for Design.
//
// Port of Design's prototype (design/spec/tools/gen_dark_prototype.py).
// Output: src/features/palette/literals.gen.css (checked in; build includes it).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RADIUS_PROP, cornerValue, litVarDefs, rewriteValue, roleRef } from '../src/features/palette/literals.ts';

const DEV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = 'html[data-b2c-theme="on"]';

export function defaultInputs() {
  const live = path.join(DEV, 'mock-canvas/vendor-live/dist/brandable_css/new_styles_normal_contrast/bundles');
  const built = path.join(DEV, 'mock-canvas/vendor-built/css');
  const ls = (d, keep) => (fs.existsSync(d) ? fs.readdirSync(d).filter(keep).sort().map(f => path.join(d, f)) : []);
  return [
    ...ls(live, f => /^(common|what_gets_loaded_inside_the_tinymce_editor)-.*\.css$/.test(f)),
    // common/fonts in vendor-built are the standalone mock's stand-ins for the
    // production bundles above (a different Canvas version), never inputs.
    ...ls(built, f => f.endsWith('.css') && !/^(login|common|fonts)\.css$/.test(f)),
    // Canvas page CSS the mock precompiled from canvas-lms SCSS and inlines
    // (calendarApp + agenda_view, profile): production loads it as bundles.
    ...ls(path.join(DEV, 'mock-canvas/pages/client'), f => f.endsWith('.css')),
  ];
}

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Style rules as {ctx: at-rule preludes, sel, body}. Skips @font-face, @keyframes, print-only @media. */
export function parse(css) {
  const out = [];
  const n = css.length;
  const block = (i, ctx) => {
    while (i < n) {
      const j = css.indexOf('{', i), k = css.indexOf('}', i);
      if (k !== -1 && (j === -1 || k < j)) return k + 1;
      if (j === -1) return n;
      const prelude = css.slice(i, j).trim();
      if (prelude.startsWith('@')) {
        const name = prelude.split(/[\s(]/)[0];
        if (['@media', '@supports', '@layer', '@container'].includes(name)) {
          const printOnly = name === '@media' && /\bprint\b/.test(prelude) && !/\bscreen\b/.test(prelude);
          const mark = out.length;
          const end = block(j + 1, printOnly ? ctx : [...ctx, prelude]);
          if (printOnly) out.length = mark;
          i = end;
          continue;
        }
        let depth = 1, p = j + 1;
        while (depth && p < n) {
          if (css[p] === '{') depth++;
          else if (css[p] === '}') depth--;
          p++;
        }
        i = p;
        continue;
      }
      const e = css.indexOf('}', j);
      out.push({ ctx, sel: prelude, body: css.slice(j + 1, e === -1 ? n : e) });
      i = e === -1 ? n : e + 1;
    }
    return i;
  };
  block(0, []);
  return out;
}

/** Split a selector list on top-level commas. */
function splitSelectors(list) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Shorthands whose colour has a single longhand. Emitting only the colour
// keeps every generated rule colour-only: page bundles get applied on every
// page here, so a `td { border: 1px dashed … }` from the RCE bundle must not
// change borders anywhere else.
const COLOUR_LONGHAND = {
  border: 'border-color', 'border-top': 'border-top-color', 'border-right': 'border-right-color',
  'border-bottom': 'border-bottom-color', 'border-left': 'border-left-color', 'border-block': 'border-block-color',
  'border-inline': 'border-inline-color', outline: 'outline-color', 'column-rule': 'column-rule-color',
  background: 'background-color',
};
const ROLE_TOKEN = /color-mix\(in srgb, var\(--b2c-dm-[\w-]+\) \d+%, transparent\)|var\(--b2c-dm-[\w-]+\)/g;

/** [property, value] carrying only colour, or null if it can't be isolated. */
export function colourOnly(prop, value) {
  const lh = COLOUR_LONGHAND[prop];
  if (!lh) return [prop, value];
  if (prop === 'background' && /gradient\(/.test(value)) return /url\(/.test(value) ? null : ['background-image', value.replace(/^[^,]*?(?=(?:repeating-)?(?:linear|radial|conic)-gradient)/, '')];
  const toks = value.match(ROLE_TOKEN) ?? [];
  return toks.length === 1 ? [lh, toks[0]] : null;
}

export function gate(sel, g = GATE) {
  const s = sel.trim();
  if (!s || s.startsWith(':root')) return null;
  if (/^html(?![\w-])/.test(s)) return g + s.slice(4);
  return `${g} ${s}`;
}

/** The same selector, relative to a nesting parent (html[gate] { … }). */
function nested(sel) {
  const s = sel.trim();
  if (!s || s.startsWith(':root')) return null;
  if (/^html(?![\w-])/.test(s)) return '&' + s.slice(4);
  return s;
}

// ── Corners (shape feature): every non-zero radius → the corner token ─────────
const RADIUS = RADIUS_PROP;

/** Property family, for the safe-merge check (a shorthand and its longhands share one). */
const family = prop =>
  RADIUS.test(prop) ? 'radius' : /^(border|outline|background|column-rule)/.test(prop) ? prop.split('-')[0] : prop;

/**
 * The vendored bundles were compiled with one school's brand (the pilot school), so its
 * brand colours appear as literals. Map those to roles: the emitted rules
 * then hold for any school, because they name roles, not the literal.
 */
export function brandExtra(file = path.join(DEV, 'mock-canvas/vendor-live/brand-variables.json')) {
  if (!fs.existsSync(file)) return () => null;
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  const hex = k => (typeof b[k] === 'string' && /^#[0-9a-f]{6}$/i.test(b[k]) ? b[k].toLowerCase() : null);
  const map = new Map();
  const link = hex('ic-link-color');
  if (link) map.set(link, [null, 'link', 'link']);
  for (const k of ['ic-brand-primary', 'ic-brand-button--primary-bgd']) {
    const h = hex(k);
    if (h && h !== link) map.set(h, ['accent', 'link', 'link']);
  }
  return (h, kind) => map.get(h)?.[kind] ?? null;
}

/**
 * Generated overrides. kind 'colour' (palette, literals.gen.css) maps colour
 * literals to roles; kind 'corner' (shape, corners.gen.css) maps radii to the
 * corner token. Rules with identical declarations are merged into one
 * selector list when no rule between them touches the same properties (so the
 * cascade is unchanged), and with nest = true everything sits inside one
 * html[gate] { … } (CSS nesting), so the gate isn't repeated per selector.
 */
export function generate(cssTexts, { kind = 'colour', gate: g = GATE, extra = kind === 'colour' ? brandExtra() : null, nest = false } = {}) {
  const unmapped = new Map();
  const groups = []; // { ctx, sels: string[], decls, seen: Set }
  const byKey = new Map(); // ctx + decls → group index
  const lastTouch = new Map(); // family → group index
  for (const text of cssTexts) {
    for (const { ctx, sel, body } of parse(stripComments(text))) {
      const decls = [];
      for (const d of body.split(';')) {
        const c = d.indexOf(':');
        if (c < 0) continue;
        const prop = d.slice(0, c).trim().toLowerCase();
        let val = d.slice(c + 1);
        const imp = /!important/i.test(val);
        val = val.replace(/!important/i, '').trim();
        let out = null;
        if (kind === 'colour') {
          const nv = rewriteValue(prop, val, roleRef, hex => unmapped.set(`${prop} ${hex}`, (unmapped.get(`${prop} ${hex}`) ?? 0) + 1), extra ?? undefined);
          out = nv && colourOnly(prop, nv);
        } else if (RADIUS.test(prop)) {
          const v = cornerValue(val);
          out = v && [prop, v];
        }
        if (out) decls.push(`${out[0]}:${out[1]}${imp ? ' !important' : ''}`);
      }
      if (!decls.length) continue;
      const sels = splitSelectors(sel).map(x => (nest ? nested(x) : gate(x, g))).filter(Boolean);
      if (!sels.length) continue;
      const block = decls.join(';');
      const key = ctx.join('\u0000') + '\u0001' + block;
      const fams = [...new Set(decls.map(d => family(d.slice(0, d.indexOf(':')))))];
      const gi = byKey.get(key);
      if (gi !== undefined && fams.every(f => lastTouch.get(f) === gi)) {
        const grp = groups[gi];
        for (const x of sels) if (!grp.seen.has(x)) (grp.seen.add(x), grp.sels.push(x));
        continue;
      }
      const idx = groups.push({ ctx, sels: [...new Set(sels)], seen: new Set(sels), block }) - 1;
      byKey.set(key, idx);
      for (const f of fams) lastTouch.set(f, idx);
    }
  }
  const chunks = groups.map(({ ctx, sels, block }) => {
    let rule = `${sels.join(',')}{${block}}`;
    for (const c of [...ctx].reverse()) rule = `${c}{${rule}}`;
    return rule;
  });
  // Layer (c): InstUI rules are rewritten to var(--b2c-lit-*, <literal>) in
  // the page world (instui.ts); these definitions switch them on under the gate.
  const defs = kind === 'colour' ? litVarDefs() : '--b2c-lit-corner:var(--b2c-corner)';
  const css = nest ? `${g}{${defs};\n${chunks.join('\n')}\n}\n` : `${chunks.join('\n')}\n${g}{${defs}}\n`;
  return { css, rules: groups.length, unmapped };
}

export const SHAPE_GATE = 'html[data-b2c-shape]';
export const OUTPUTS = [
  { kind: 'colour', gate: GATE, file: 'src/features/palette/literals.gen.css', what: 'colour literals → palette roles (dark-mode.md §6)' },
  { kind: 'corner', gate: SHAPE_GATE, file: 'src/features/shape/corners.gen.css', what: 'border radii → the corner token' },
];
// CSS nesting (one gate per sheet): build lint accepts it since 2026-10-20. B2C_NEST_CSS=0 writes flat rules.
const NEST = process.env.B2C_NEST_CSS !== '0';

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = defaultInputs();
  const texts = files.map(f => fs.readFileSync(f, 'utf8'));
  for (const o of OUTPUTS) {
    const { css, rules, unmapped } = generate(texts, { kind: o.kind, gate: o.gate, nest: NEST });
    const header =
      `/* GENERATED by dev/scripts/gen-dark-literals.mjs: ${o.what}. Do not edit;\n` +
      `   re-run the script. Inputs: ${files.map(f => path.basename(f)).join(', ')} */\n`;
    const out = path.join(DEV, o.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, header + css);
    console.error(`${o.kind}: ${rules} rules, ${(Buffer.byteLength(css) / 1024).toFixed(1)} KB → ${o.file}`);
    const top = [...unmapped].sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (top.length) console.error('  unmapped (property colour) × uses:\n' + top.map(([k, v]) => `  ${String(v).padStart(4)}  ${k}`).join('\n'));
  }
}

export { cornerValue };
