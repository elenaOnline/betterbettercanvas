export interface CssError { line: number; message: string }
const lineAt = (css: string, offset: number) => css.slice(0, offset).split('\n').length;

function declarationError(css: string, body: string, offset: number): CssError | null {
  let start = 0, quote = '', parentheses = 0, comment = false;
  const probe = document.createElement('span').style;
  const check = (end: number) => {
    const source = body.slice(start, end);
    const text = source.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const position = offset + start + Math.max(0, source.search(/\S/));
    start = end + 1;
    // Nested rules have their own CSSOM parsing. This checks declarations,
    // including ones the forgiving CSSOM parser would silently discard.
    if (!text || /[{}]/.test(text)) return null;
    probe.cssText = text;
    return probe.length ? null : { line: lineAt(css, position), message: 'Invalid CSS declaration.' };
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (comment) { if (ch === '*' && body[i + 1] === '/') { comment = false; i++; } continue; }
    if (ch === '\\') { i++; continue; }
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '/' && body[i + 1] === '*') { comment = true; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') parentheses++;
    if (ch === ')') parentheses--;
    if (ch === ';' && !parentheses) { const error = check(i); if (error) return error; }
  }
  return check(body.length);
}

/** CSSOM is forgiving inside declarations. Check structural errors before asking
 * it to parse each top-level rule, retaining source offsets for inline feedback. */
export function cssError(css: string): CssError | null {
  let depth = 0, start = 0, quote = '', comment = false, escaped = false;
  const sheet = new CSSStyleSheet();
  const parse = (end: number): CssError | null => {
    const rule = css.slice(start, end).trim();
    const offset = start + css.slice(start, end).search(/\S/);
    start = end;
    if (!rule || !rule.replace(/\/\*[\s\S]*?\*\//g, '').trim()) return null;
    try {
      const index = sheet.insertRule(rule, sheet.cssRules.length);
      const parsed = sheet.cssRules[index]!;
      const opening = rule.indexOf('{');
      if ('selectorText' in parsed && opening >= 0) {
        const error = declarationError(css, rule.slice(opening + 1, rule.lastIndexOf('}')), offset + opening + 1);
        if (error) return error;
      } else if (/^@(media|supports|container|layer|scope|starting-style)\b/.test(rule) && opening >= 0) {
        const error = cssError(rule.slice(opening + 1, rule.lastIndexOf('}')));
        if (error) return { ...error, line: lineAt(css, offset + opening + 1) + error.line - 1 };
      }
    }
    catch { return { line: lineAt(css, offset), message: 'Invalid CSS rule.' }; }
    return null;
  };
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]!;
    if (comment) { if (ch === '*' && css[i + 1] === '/') { comment = false; i++; } continue; }
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '/' && css[i + 1] === '*') { comment = true; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      if (--depth < 0) return { line: lineAt(css, i), message: 'Unexpected closing brace.' };
      if (!depth) { const error = parse(i + 1); if (error) return error; }
    }
    if (!depth && ch === ';') { const error = parse(i + 1); if (error) return error; }
  }
  if (depth || quote || comment) return { line: lineAt(css, css.length), message: 'Unclosed rule, string or comment.' };
  return parse(css.length);
}

/** Within @scope, root selectors must explicitly name :scope to include the
 * scoping root itself. Rewrite selector tokens only, never strings or values. */
export function scopedSelector(selector: string): string {
  let out = '', quote = '', brackets = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!;
    if (ch === '\\') { out += ch + (selector[++i] ?? ''); continue; }
    if (quote) { out += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; continue; }
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
    const tail = selector.slice(i);
    if (!brackets && /^:root(?![\w-])/i.test(tail)) { out += ':scope'; i += 4; }
    else if (!brackets && /^html(?![\w-])/i.test(tail) && (i === 0 || /[\s>+~,(|]/.test(selector[i - 1]!))) { out += ':scope'; i += 3; }
    else out += ch;
  }
  return out;
}
/** At-rules that must stay at the top level: @scope can't contain them (or
 *  they'd be scoped meaninglessly). Parity audit: custom CSS kept dropping them. */
const HOISTED = ['CSSFontFaceRule', 'CSSKeyframesRule', 'CSSPropertyRule', 'CSSNamespaceRule', 'CSSLayerStatementRule', 'CSSCounterStyleRule', 'CSSFontFeatureValuesRule'];

/** Leading @import statements (constructed sheets refuse @import, so they are
 *  taken out of the text first and emitted verbatim at the top). */
function splitImports(css: string): { imports: string[]; rest: string } {
  const imports: string[] = [];
  let rest = css;
  const re = /^\s*(?:\/\*[\s\S]*?\*\/\s*)*(@import\s+[^;]+;)/;
  for (let m = rest.match(re); m; m = rest.match(re)) {
    imports.push(m[1]!);
    rest = rest.slice(m[0].length);
  }
  return { imports, rest };
}

export function scopedCss(css: string): string {
  const { imports, rest } = splitImports(css);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(rest);
  const serialize = (rule: CSSRule): string => {
    const children = 'cssRules' in rule ? Array.from((rule as CSSGroupingRule).cssRules, serialize).join('\n') : '';
    if ('selectorText' in rule) {
      const style = rule as CSSStyleRule;
      return `${scopedSelector(style.selectorText)} { ${style.style.cssText} ${children}}`;
    }
    if ('cssRules' in rule) return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${children}}`;
    return rule.cssText;
  };
  const rules = Array.from(sheet.cssRules);
  const top = rules.filter(r => HOISTED.includes(r.constructor.name)).map(r => r.cssText);
  const scoped = rules.filter(r => !HOISTED.includes(r.constructor.name)).map(serialize);
  return [...imports, ...top, `@scope (html[data-b2c-custom-css]) {\n${scoped.join('\n')}\n}`].join('\n');
}
