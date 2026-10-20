// Colour-budget check for e2e tests (design/spec/rice.md "Colour budget",
// rationale design/v2/COLOUR-PASS.md). Adapted from Design's
// design/v2/studio/tools/colourmeasure.cjs `dom()`: every element (and
// ::before/::after) under a root, *including b²c's shadow roots*, whose
// computed colour, background, border, outline, box-shadow or SVG fill/stroke
// is chromatic (OKLCH C > 0.04). Shared by the to-do and card lanes.
//
// Use:
//   const m = await measureColours(page, 'b2c-todo');
//   const b = await budgetFor(page, 'b2c-todo');          // course colours + accent + danger, read live
//   const r = checkBudget(m, b);  expect(r.extra).toEqual([]);  expect(r.families).toBeLessThanOrEqual(b.courses.length + 2);
//
// At rest means: no hover, no focus, no open menu. Move the mouse away first.

import type { Page } from '@playwright/test';

export interface Painted {
  /** `#rrggbb` of the chromatic paint. */
  hex: string;
  /** OKLCH hue in degrees, chroma and lightness. */
  h: number;
  c: number;
  l: number;
  /** e.g. `li.row::before bg`, for messages. */
  where: string;
  /** data-key of the nearest row (`li[data-key]`), if any: for "one place per item". */
  item: string | null;
  /** The painted element (+ pseudo), e.g. `span.d` or `li.row::before`. */
  el: string;
}

export interface Budget {
  /** Course colours (hex) as Canvas has them (`/users/self/colors`). */
  courses: string[];
  /** The one UI accent (links, selection, focus). */
  accent: string | null;
  /** Danger (overdue): one place per item. */
  danger: string | null;
  /** The widget ground (`--b2c-w-bg`): tints of a course colour mixed toward it are that course. */
  ground?: string | null;
}

const OKLCH = `
function __oklch(r, g, b) {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  const L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s;
  const A = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s;
  const B = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}`;

export const C_MIN = 0.04;

/** Every chromatic paint under `rootSel` (light DOM and open shadow roots), visible and at rest. */
export async function measureColours(page: Page, rootSel: string): Promise<Painted[]> {
  return page.evaluate(
    ({ rootSel, C_MIN, SRC }) => {
      // eslint-disable-next-line no-eval
      const ok = (0, eval)(`(() => { ${SRC}; return __oklch; })()`) as (r: number, g: number, b: number) => [number, number, number];
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      const cache = new Map<string, { r: number; g: number; b: number; a: number }>();
      const parse = (s: string) => {
        let v = cache.get(s);
        if (!v) {
          cx.clearRect(0, 0, 1, 1);
          cx.fillStyle = '#000';
          cx.fillStyle = s;
          cx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data as unknown as number[];
          v = { r: r!, g: g!, b: b!, a: a! / 255 };
          cache.set(s, v);
        }
        return v;
      };
      const out: { hex: string; h: number; c: number; l: number; where: string; item: string | null; el: string }[] = [];
      const shadowCols = (s: string) => (s && s !== 'none' ? s.match(/(rgba?|oklch|oklab|color|hsla?)\([^)]*\)|#[0-9a-f]{3,8}/gi) ?? [] : []);
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        let e: Element | null = el;
        while (e) {
          const s = getComputedStyle(e);
          if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.05) return false;
          e = e.parentElement ?? ((e.getRootNode() as ShadowRoot).host ?? null);
        }
        return true;
      };
      const itemOf = (el: Element) => (el.closest('li[data-key]') as HTMLElement | null)?.dataset.key ?? null;
      const check = (el: Element, cs: CSSStyleDeclaration, pseudo: string) => {
        const cls = el.getAttribute('class');
        const name = `${el.tagName.toLowerCase()}${cls ? '.' + cls.split(' ')[0] : ''}${pseudo}`;
        const add = (prop: string, val: string) => {
          if (!val || val === 'none' || val === 'transparent' || val.startsWith('url(')) return;
          const c = parse(val);
          if (c.a < 0.1) return;
          const [L, C, h] = ok(c.r, c.g, c.b);
          if (C <= C_MIN) return;
          out.push({ hex: '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join(''), h: Math.round(h), c: +C.toFixed(3), l: +L.toFixed(3), where: `${name} ${prop}`, item: itemOf(el), el: name });
        };
        const ownText = !pseudo && [...el.childNodes].some(t => t.nodeType === 3 && t.textContent!.trim());
        // A pseudo-element draws text only when its content isn't empty (as in Design's colourmeasure.cjs).
        if (ownText || (pseudo && cs.content && !['none', '""', "''"].includes(cs.content))) add('color', cs.color);
        add('bg', cs.backgroundColor);
        for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const)
          if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none') add('border', cs[`border${side}Color`]);
        if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) add('outline', cs.outlineColor);
        for (const sc of shadowCols(cs.boxShadow)) add('shadow', sc);
        if (el instanceof SVGElement && !pseudo && !(el instanceof SVGSVGElement) && !(el instanceof SVGGElement)) {
          if (cs.fill !== 'none' && parseFloat(cs.fillOpacity) > 0.1) add('fill', cs.fill);
          if (cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0 && parseFloat(cs.strokeOpacity) > 0.1) add('stroke', cs.stroke);
        }
      };
      const walk = (root: ParentNode) => {
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.tagName === 'STYLE') continue;
          if (el.shadowRoot) walk(el.shadowRoot);
          if (!visible(el)) continue;
          check(el, getComputedStyle(el), '');
          for (const ps of ['::before', '::after']) {
            const pcs = getComputedStyle(el, ps);
            if (pcs.content && pcs.content !== 'none' && pcs.display !== 'none') check(el, pcs, ps);
          }
        }
      };
      for (const r of Array.from(document.querySelectorAll(rootSel))) {
        if (r.shadowRoot) walk(r.shadowRoot);
        walk(r);
      }
      return out;
    },
    { rootSel, C_MIN, SRC: OKLCH },
  );
}

/** Read the budget live: Canvas's course colours, and the accent and danger the root resolves. */
export async function budgetFor(page: Page, rootSel: string): Promise<Budget> {
  return page.evaluate(async sel => {
    const colors = (await (await fetch('/api/v1/users/self/colors', { headers: { Accept: 'application/json' } })).json()) as { custom_colors?: Record<string, string> };
    const host = document.querySelector(sel) ?? document.documentElement;
    const where = (host.shadowRoot ?? host) as ParentNode & Node;
    // Resolve through a probe element in the root's own context, so token
    // chains (var(), color-mix(), oklch()) come back as the colour they paint.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const x = cv.getContext('2d', { willReadFrequently: true })!;
    const resolve = (v: string) => {
      const el = document.createElement('span');
      el.style.color = v;
      where.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = '#000';
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data as unknown as number[];
      return a! < 26 ? null : '#' + [r!, g!, b!].map(n => n.toString(16).padStart(2, '0')).join('');
    };
    const norm = (c: string) => (c.startsWith('#') ? c : `#${c}`);
    return { courses: Object.values(colors.custom_colors ?? {}).map(norm), accent: resolve('var(--b2c-w-link)'), danger: resolve('var(--b2c-w-danger)'), ground: resolve('var(--b2c-w-bg)') };
  }, rootSel);
}

// ── pure part ──────────────────────────────────────────────────────────────
function hexToOklab(hex: string): [number, number, number] | null {
  const o = hexToOklch(hex);
  if (!o) return null;
  const [L, C, h] = o;
  return [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
}
/** Distance in OKLab from p to the segment a–b (a course colour mixed toward the ground). */
function segDist(p: number[], a: number[], b: number[]): number {
  const ab = a.map((v, i) => b[i]! - v), ap = a.map((v, i) => p[i]! - v);
  const len = ab.reduce((s, v) => s + v * v, 0);
  const t = len ? Math.max(0, Math.min(1, ab.reduce((s, v, i) => s + v * ap[i]!, 0) / len)) : 0;
  return Math.hypot(...a.map((v, i) => v + t * ab[i]! - p[i]!));
}

function hexToOklch(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin(n >> 16), g = lin((n >> 8) & 255), b = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export interface BudgetResult {
  /** Distinct colour families seen: each course in use, accent, danger. */
  families: number;
  /** Paints that are none of: a course colour (or a tint of one), the accent, danger. */
  extra: Painted[];
  /** Items (rows) painted with danger in more than one place. */
  dangerTwice: string[];
  byFamily: Record<string, number>;
}

/**
 * Sort every paint into a family: `course:<hex>` (same hue within `tol`
 * degrees: tints and mixes of a course colour, e.g. the ring's tracks),
 * `accent`, `danger`; anything else is `extra`. A paint matching both a
 * course and accent/danger counts as the role (roles win).
 */
export function checkBudget(paints: readonly Painted[], b: Budget, tol = 8): BudgetResult {
  const role = (hex: string | null) => (hex ? hexToOklch(hex) : null);
  const acc = role(b.accent), dan = role(b.danger);
  const courses = b.courses.map(h => ({ hex: h, o: hexToOklch(h) })).filter(c => c.o && c.o[1] > 0.04) as { hex: string; o: [number, number, number] }[];
  const ground = b.ground ? hexToOklab(b.ground) : null;
  const courseLab = b.courses.map(h => ({ hex: h.toLowerCase(), lab: hexToOklab(h) })).filter(c => c.lab) as { hex: string; lab: [number, number, number] }[];
  /** A course colour itself, or a mix of it toward the ground (tracks, empty cells). */
  const courseOf = (p: Painted) => {
    const exact = courseLab.find(c => c.hex === p.hex.toLowerCase());
    if (exact) return exact.hex;
    const pl = hexToOklab(p.hex);
    if (pl && ground) {
      const near = courseLab.map(c => ({ c, d: segDist(pl, c.lab, ground) })).sort((x, y) => x.d - y.d)[0];
      if (near && near.d < 0.02) return near.c.hex;
    }
    return null;
  };
  const fam: Record<string, number> = {};
  const extra: Painted[] = [];
  const dangerByItem = new Map<string, number>();
  for (const p of paints) {
    let f: string | null = null;
    const course = courseOf(p);
    if (course && !(b.danger && p.hex.toLowerCase() === b.danger.toLowerCase()) && !(b.accent && p.hex.toLowerCase() === b.accent.toLowerCase())) f = `course:${course}`;
    else if (dan && hueDist(p.h, dan[2]) <= tol && Math.abs(p.l - dan[0]) < 0.12) f = 'danger';
    else if (acc && hueDist(p.h, acc[2]) <= tol && Math.abs(p.l - acc[0]) < 0.12) f = 'accent';
    else {
      const c = courses.find(c => hueDist(p.h, c.o[2]) <= tol);
      if (c) f = `course:${c.hex}`;
    }
    if (!f) {
      extra.push(p);
      continue;
    }
    fam[f] = (fam[f] ?? 0) + 1;
    if (f === 'danger' && p.item) dangerByItem.set(p.item, (dangerByItem.get(p.item) ?? 0) + 1);
  }
  return {
    families: Object.keys(fam).length,
    extra,
    dangerTwice: [...dangerByItem].filter(([, n]) => n > 1).map(([k]) => k),
    byFamily: fam,
  };
}

// ── the cards lane's API (card-assignments-colour.spec.ts) ─────────────────
// Same measure, in Design's colourmeasure.cjs report shape.

/**
 * Chromatic paint under `rootSel` (shadow roots included):
 * `colours` = distinct hexes; `items` = one line per painted element,
 * `tag.class[::pseudo] prop:#hex [prop:#hex …]` (Design's format).
 */
export async function chromaticPaint(page: Page, rootSel: string): Promise<{ elements: number; colours: string[]; items: string[] }> {
  const paints = await measureColours(page, rootSel);
  const byEl = new Map<string, string[]>();
  let i = 0;
  let last = '';
  for (const p of paints) {
    // Consecutive paints from one element share its name; group them into one line.
    const key = p.el === last ? `${p.el}#${i}` : `${p.el}#${++i}`;
    last = p.el;
    const prop = p.where.slice(p.el.length + 1);
    (byEl.get(key) ?? byEl.set(key, []).get(key)!).push(`${prop}:${p.hex}`);
  }
  const items = [...byEl].map(([k, hits]) => `${k.replace(/#\d+$/, '')} ${hits.join(' ')}`);
  return { elements: items.length, colours: [...new Set(paints.map(p => p.hex))], items };
}

/** A CSS colour value (e.g. `var(--b2c-w-link)`) as the page resolves it, `#rrggbb`; null if transparent. */
export async function resolveColour(page: Page, value: string): Promise<string | null> {
  return page.evaluate(v => {
    const el = document.createElement('span');
    el.style.color = v;
    document.documentElement.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const x = cv.getContext('2d', { willReadFrequently: true })!;
    x.fillStyle = '#000';
    x.fillStyle = c;
    x.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data as unknown as number[];
    if (a! < 26) return null;
    return '#' + [r!, g!, b!].map(n => n.toString(16).padStart(2, '0')).join('');
  }, value);
}
