// boot.js: document_start, synchronous. Applies the pre-paint mirror before
// Canvas paints anything. Must stay tiny and must never throw.
import { applyMirror, forPath, readMirror, VARS_STYLE_ID } from '../core/mirror.ts';
import { QUIZ_TAKING } from '../core/canvas/page.ts';

try {
  const root = document.documentElement;
  root.setAttribute('data-b2c', '');
  const m = readMirror();
  if (m) applyMirror(forPath(m, location.pathname, p => QUIZ_TAKING.test(p)));
  // Same-origin subframes (the RCE editor, previews) follow the top page live:
  // its data-b2c-* attributes (dark on/off, "Show original", schedule flips)
  // and its resolved vars. main.js runs in the top frame only.
  if (window !== top) follow(parent.document);
} catch {
  /* cross-origin parent, or main.js will apply settings shortly */
}

function follow(pd: Document) {
  const pr = pd.documentElement;
  const sync = () => {
    // Read <html> each time: document.open()/write() (TinyMCE's about:blank
    // editor frame) replaces it after boot has run.
    const root = document.documentElement;
    if (!root) return;
    for (const a of Array.from(root.attributes)) {
      if (a.name.startsWith('data-b2c-') && a.name !== 'data-b2c-instance' && !pr.hasAttribute(a.name)) root.removeAttribute(a.name);
    }
    for (const a of Array.from(pr.attributes)) {
      if (a.name.startsWith('data-b2c-') && a.name !== 'data-b2c-instance' && a.name !== 'data-b2c-env' && root.getAttribute(a.name) !== a.value) {
        root.setAttribute(a.name, a.value);
      }
    }
    const src = pd.getElementById(VARS_STYLE_ID);
    let dst = document.getElementById(VARS_STYLE_ID);
    if (src && !dst) {
      dst = document.createElement('style');
      dst.id = VARS_STYLE_ID;
      (document.head ?? root).appendChild(dst);
    }
    if (src && dst && dst.textContent !== src.textContent) dst.textContent = src.textContent;
  };
  sync();
  const mo = new MutationObserver(sync);
  mo.observe(pr, { attributes: true });
  mo.observe(document, { childList: true }); // <html> replaced by document.open()
  const vars = pd.getElementById(VARS_STYLE_ID);
  if (vars) mo.observe(vars, { childList: true, characterData: true, subtree: true });
}
