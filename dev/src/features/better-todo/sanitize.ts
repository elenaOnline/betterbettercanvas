// Allow-list sanitizer for preview HTML (assignment descriptions, announcement
// messages). Output keeps structure (paragraphs, lists, emphasis, links,
// equation images, tables) and drops everything else: scripts, styles,
// classes, event handlers, iframes, forms.

const KEEP = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'small', 'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'pre',
  'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea', 'template', 'noscript', 'video', 'audio', 'link', 'meta', 'head', 'title']);
const ATTRS: Record<string, string[]> = { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] };

function safeUrl(v: string, base: string): string | null {
  try {
    const u = new URL(v, base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Returns sanitized HTML. `base` resolves relative links (the Canvas origin). */
export function sanitize(html: string, base: string): string {
  // An inert document: nothing loads or runs while we walk it.
  const doc = document.implementation.createHTMLDocument('');
  const src = doc.createElement('div');
  src.innerHTML = html;
  const out = doc.createElement('div');

  const walk = (from: Node, to: Element) => {
    for (const n of Array.from(from.childNodes)) {
      if (n.nodeType === 3) {
        to.appendChild(doc.createTextNode(n.textContent ?? ''));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const el = n as Element;
      const tag = el.tagName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (!KEEP.has(tag)) {
        walk(el, to); // unwrap unknown tags, keep their text
        continue;
      }
      const copy = doc.createElement(/^h[1-6]$/.test(tag) ? 'strong' : tag);
      for (const a of ATTRS[tag] ?? []) {
        const v = el.getAttribute(a);
        if (v === null) continue;
        if (a === 'href' || a === 'src') {
          const u = safeUrl(v, base);
          if (u) copy.setAttribute(a, u);
        } else copy.setAttribute(a, v.slice(0, 200));
      }
      if (tag === 'a') {
        copy.setAttribute('target', '_blank');
        copy.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'img' && !copy.hasAttribute('src')) continue;
      if (tag === 'img') copy.setAttribute('loading', 'lazy');
      walk(el, copy);
      to.appendChild(copy);
      if (/^h[1-6]$/.test(tag)) to.appendChild(doc.createElement('br'));
    }
  };
  walk(src, out);
  return out.innerHTML.trim();
}

/** Plain text → HTML (planner note details). */
export function textToHtml(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** True when the HTML has no visible text and no images. */
export function isEmptyHtml(html: string): boolean {
  if (/<img\b/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '') === '';
}
