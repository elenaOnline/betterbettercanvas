// boot.js: document_start, synchronous. Applies the pre-paint mirror before
// Canvas paints anything. Must stay tiny and must never throw.
import { addSheets, applyMirror, checkSheets, forPath, missingSheets, readMirror, VARS_STYLE_ID, withheld } from '../core/mirror.ts';
import { QUIZ_TAKING } from '../core/canvas/page.ts';

const isQuiz = (p: string) => QUIZ_TAKING.test(p);

try {
  const root = document.documentElement;
  root.setAttribute('data-b2c', '');
  const m = readMirror();
  if (m) {
    const body = forPath(m, location.pathname, isQuiz);
    applyMirror(body);
    // Feature stylesheets are injected at document_start too. Before the
    // first frame, check they all arrived; a feature whose sheet is missing
    // (e.g. its registration was lost) stays off until main.js inserts it.
    if (body.need && window === top) {
      requestAnimationFrame(() => {
        checkSheets(Object.keys(body.need!));
        for (const a of withheld(body)) root.removeAttribute(a);
      });
    }
  }
  // Same-origin subframes (the RCE editor, previews) follow the top page live:
  // its data-b2c-* attributes (dark on/off, "Show original", schedule flips)
  // and its resolved vars. main.js runs in the top frame only.
  if (window !== top) follow(parent.document);
} catch {
  /* cross-origin parent, or main.js will apply settings shortly */
}

function follow(pd: Document) {
  const pr = pd.documentElement;
  // Like the top page, this frame needs the sheets behind the attributes it
  // copies. Registrations cover frames of schools b²c has run on; otherwise
  // (a new school, a sheet switched on live) ask for them, and keep those
  // features off here until they arrive.
  let hold = new Set<string>();
  let raf = 0;
  let busy = false;
  const heal = () => {
    raf = 0;
    const m = readMirror();
    if (!m || busy) return;
    const b = forPath(m, pd.location.pathname, isQuiz);
    checkSheets(Object.keys(b.need ?? {}));
    const miss = missingSheets(b);
    hold = withheld(b);
    if (!miss.length) return;
    sync();
    busy = true;
    chrome.runtime.sendMessage({ type: 'b2c:css', insert: miss }).then(ok => {
      busy = false;
      if (ok === true) addSheets(miss), (hold = withheld(b)), sync();
    }, () => {});
  };
  const sync = () => {
    // Read <html> each time: document.open()/write() (TinyMCE's about:blank
    // editor frame) replaces it after boot has run.
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-b2c', '');
    for (const a of Array.from(root.attributes)) {
      if (a.name.startsWith('data-b2c-') && a.name !== 'data-b2c-instance' && (!pr.hasAttribute(a.name) || hold.has(a.name))) root.removeAttribute(a.name);
    }
    for (const a of Array.from(pr.attributes)) {
      if (a.name.startsWith('data-b2c-') && a.name !== 'data-b2c-instance' && a.name !== 'data-b2c-env' && !hold.has(a.name) && root.getAttribute(a.name) !== a.value) {
        root.setAttribute(a.name, a.value);
      }
    }
    raf ||= requestAnimationFrame(heal);    const src = pd.getElementById(VARS_STYLE_ID);
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
