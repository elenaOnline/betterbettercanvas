// Palette layer (c), plus shape corners: InstUI's runtime styles. InstUI (emotion) inserts
// rules with hashed class names through CSSOM, so no static selector can
// reach them. In the page world, before Canvas's scripts run, we rewrite each
// mapped literal in those rules to `var(--b2c-lit-<role>, <hex>)`.
// The variables are defined only under html[data-b2c-theme="on"]
// (literals.gen.css), so with dark mode off every rule resolves to its
// original colour, and toggling stays live with no re-scan.

import { RADIUS_PROP, cornerValue, fallbackRef, norm, rewriteValue, type Extra, type Kind } from './literals.ts';

// The school's brand colours reach InstUI as literals (Canvas feeds the brand
// variables into the InstUI theme), so they can't be in the static map. Read
// them once from Canvas's brand variables, which are loaded by the time
// React renders: link colour → link; primary/button colour → accent as a
// fill, link as text or border (the pilot school's dark green would vanish on dark).
let brand: Map<string, readonly [string | null, string | null, string | null]> | null = null;
export const brandExtra: Extra = (hex: string, kind: Kind) => {
  if (!brand) {
    const cs = getComputedStyle(document.documentElement);
    const read = (v: string) => norm(cs.getPropertyValue(v).trim())?.[0] ?? null;
    const link = read('--ic-link-color');
    if (!link) return null; // brand sheet not loaded yet: try again next rule
    brand = new Map();
    brand.set(link, [null, 'link', 'link']);
    for (const v of ['--ic-brand-primary', '--ic-brand-button--primary-bgd']) {
      const h = read(v);
      if (h && h !== link) brand.set(h, ['accent', 'link', 'link']);
    }
  }
  return brand.get(hex)?.[kind] ?? null;
};
/** For tests. */
export const resetBrand = () => (brand = null);

const DECL = /([-\w]+)\s*:\s*([^;]+)/g;

/** Rewrite the declaration blocks of one CSS rule text (may contain @media nesting). */
export function rewriteRule(text: string): string {
  if (!/#|rgb|white|black|radius/i.test(text)) return text;
  const parts = text.split(/([{}])/);
  let changed = false;
  for (let i = 0; i < parts.length; i++) {
    // A chunk followed by "}" is a declaration block; one followed by "{" is a selector or prelude.
    if (parts[i + 1] !== '}' || parts[i - 1] !== '{') continue;
    const block = parts[i]!;
    const nb = block.replace(DECL, (whole, prop: string, val: string) => {
      const imp = /!important/i.test(val);
      const p = prop.toLowerCase();
      const clean = val.replace(/!important/i, '').trim();
      // Corners (shape): var(--b2c-lit-corner) is defined only under html[data-b2c-shape].
      const v = RADIUS_PROP.test(p) ? cornerValue(clean, t => `var(--b2c-lit-corner, ${t})`) : rewriteValue(p, clean, fallbackRef, undefined, brandExtra);
      if (!v) return whole;
      changed = true;
      return `${prop}:${v}${imp ? ' !important' : ''}`;
    });
    parts[i] = nb;
  }
  return changed ? parts.join('') : text;
}

const PATCHED = Symbol.for('b2c.instui');
let nativeInsert: CSSStyleSheet['insertRule'] | null = null;

/** Patch CSSOM insertion and emotion's text-node mode. Idempotent. */
export function install(win: Window & typeof globalThis = window): void {
  const proto = win.CSSStyleSheet.prototype as CSSStyleSheet & { [PATCHED]?: true };
  if (proto[PATCHED]) return;
  proto[PATCHED] = true;

  const insertRule = proto.insertRule;
  nativeInsert = insertRule;
  proto.insertRule = function (rule: string, index?: number) {
    let r = rule;
    try {
      r = rewriteRule(rule);
    } catch {
      /* never break Canvas */
    }
    return insertRule.call(this, r, index);
  };

  // emotion without "speedy" appends text nodes to <style data-emotion>.
  const fix = (n: Node) => {
    if (n.nodeType !== 3) return;
    const p = n.parentElement;
    if (!p || p.tagName !== 'STYLE' || !p.hasAttribute('data-emotion')) return;
    const t = (n as Text).data;
    const r = rewriteRule(t);
    if (r !== t) (n as Text).data = r;
  };
  new win.MutationObserver(recs => {
    for (const rec of recs) {
      for (const n of Array.from(rec.addedNodes)) {
        if (n.nodeType === 3) fix(n);
        else if ((n as Element).tagName === 'STYLE' && (n as Element).hasAttribute('data-emotion')) n.childNodes.forEach(fix);
      }
    }
  }).observe(win.document, { childList: true, subtree: true });
}

/**
 * Late install: the page's world wasn't patched at document_start (no mirror
 * yet on a first visit, a stale one, or a theme switched on from Canvas's own
 * colours in an open tab). Patch now, then rewrite the rules emotion already
 * inserted, in place. Returns how many rules changed.
 */
export function installLate(win: Window & typeof globalThis = window): number {
  install(win);
  let n = 0;
  for (const el of Array.from(win.document.querySelectorAll('style[data-emotion]'))) {
    const sheet = (el as HTMLStyleElement).sheet;
    if (!sheet) continue;
    for (let i = 0; i < sheet.cssRules.length; i++) {
      const text = sheet.cssRules[i]!.cssText;
      const r = rewriteRule(text);
      if (r === text) continue;
      try {
        // Through the native insertRule: the patched one would rewrite again.
        sheet.deleteRule(i);
        (nativeInsert ?? CSSStyleSheet.prototype.insertRule).call(sheet, r, i);
        n++;
      } catch {
        /* leave that rule as it was */
      }
    }
  }
  return n;
}

/** The isolated world asks for a late install with this event on document. */
export const LATE_EVENT = 'b2c:instui-install';
