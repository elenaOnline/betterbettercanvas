// Palette engine runtime: loaded lazily (chunks/dark-mode.js) on pages where
// the feature runs. Show original, no-transition flips, the nav contrast
// fallback, and the inline-colour pass. Scheduled/system flips are core's
// (main.ts arms the boundary timer and media listeners).
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import { applyMirror, forPath, readMirror, resolveAttrs } from '../../core/mirror.ts';
import { QUIZ_TAKING } from '../../core/canvas/page.ts';
import { contrast, inkFor, parseColor } from './color.ts';
import { bgRole } from './ink.ts';
import { setSuppressed, suppressedAttrs } from './original.ts';
import { DOCS_MSG, ENGINE_ATTRS, MSG, SCHEME_ATTR, SLOT_ATTR, THEME_ATTR } from './attrs.ts';

// Inline colours anywhere: teacher HTML, and Canvas's own React inline styles
// (course colours as text in the calendar and planner, widget stat colours).
const INK_SEL = ':is([style*="color" i], font[color])';
const BG_SEL = ':is([style*="background" i], [bgcolor])';

const inUserContent = (el: Element) => !!el.closest('.user_content, .show-content');

type S = { useDark: string; light: string; documents?: string };

export function start(ctx: Ctx, initial: S): Instance<S> {
  let s = initial;
  const root = document.documentElement;
  const path = location.pathname;
  const isQuiz = (p: string) => QUIZ_TAKING.test(p);
  // Canvas's own widget-dashboard dark mode is on while b²c's theme here is a
  // light one (Design, rice.md): b²c paints nothing on this page. Held per tab
  // and path in sessionStorage (like Show original, via core's suppression,
  // so it's pre-paint on reload), and kept apart from Show original.
  const NATIVE_KEY = 'b2c:native-dark';
  const nativeDark = () => { try { return sessionStorage.getItem(NATIVE_KEY) === path; } catch { return false; } };
  const original = () => suppressedAttrs(path).includes(THEME_ATTR) && !nativeDark();

  /** The engine is painting here per settings, ignoring "Show original". */
  const onByMirror = () => {
    const m = readMirror();
    return !!m && resolveAttrs(forPath(m, path, isQuiz), ctx.now())[THEME_ATTR] === 'on';
  };
  const reapply = () => {
    const m = readMirror();
    if (m) applyMirror(forPath(m, path, isQuiz), ctx.now());
  };

  // ── Show original on this page (core's applyMirror drops suppressed attrs pre-paint) ──
  const onMessage = (msg: { type?: string; op?: string }, _s: unknown, reply: (r: unknown) => void) => {
    if (msg?.type !== MSG) return;
    if (msg.op === 'on' || msg.op === 'off') {
      for (const a of ENGINE_ATTRS) setSuppressed(a, msg.op === 'on' || nativeDark(), path);
      reapply();
    }
    reply({ original: original(), dark: onByMirror(), nativeDark: nativeDark() });
  };
  chrome.runtime.onMessage.addListener(onMessage);

  // ── Flip without transitions (dark-mode.md §5); re-check the nav ──
  let raf = 0;
  const flip = new MutationObserver(() => {
    root.setAttribute('data-b2c-switching', '');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => root.removeAttribute('data-b2c-switching'))));
    checkNav();
    tellDocs();
    lateInstui();
  });
  flip.observe(root, { attributes: true, attributeFilter: [THEME_ATTR, SLOT_ATTR] });

  // ── Nav: a school colour that fails 4.5:1 with the palette's nav text falls back to surface ──
  const checkNav = () => {
    root.style.removeProperty('--b2c-dm-nav');
    const slot = root.getAttribute(SLOT_ATTR);
    if (!slot || root.getAttribute(THEME_ATTR) !== 'on') return;
    const cs = getComputedStyle(root);
    if (cs.getPropertyValue(`--b2c-pl-${slot}-nav`).trim()) return; // a set nav colour wins
    const navText = parseColor(cs.getPropertyValue('--b2c-dm-nav-text').trim());
    const nav = parseColor(cs.getPropertyValue('--ic-brand-global-nav-bgd').trim());
    if (navText && nav && contrast(nav, navText) < 4.5) root.style.setProperty('--b2c-dm-nav', 'var(--b2c-dm-surface)');
  };
  const onLoad = () => checkNav();
  if (document.readyState === 'complete') checkNav();
  else addEventListener('load', onLoad, { once: true });

  // ── Canvas's own widget-dashboard dark + a b²c light theme ──
  const schemeByMirror = () => {
    const m = readMirror();
    return m ? resolveAttrs(forPath(m, path, isQuiz), ctx.now())[SCHEME_ATTR] : undefined;
  };
  let nativeOn = false;
  const syncNative = () => {
    const yield_ = nativeOn && schemeByMirror() === 'light';
    if (yield_ === nativeDark()) return;
    try {
      if (yield_) sessionStorage.setItem(NATIVE_KEY, path);
      else sessionStorage.removeItem(NATIVE_KEY);
    } catch {
      /* storage off: the page just isn't held */
    }
    for (const a of ENGINE_ATTRS) setSuppressed(a, yield_, path);
    reapply();
  };
  let nativeObs: MutationObserver | null = null;
  if (ctx.page.kind === 'dashboard') {
    let seen = false;
    const check = () => {
      const on = !!document.getElementById('widget-dashboard-dark-mode');
      if (!on && !seen) return; // ENV may say "on" before the widget's style lands
      seen ||= on;
      if (on !== nativeOn) ((nativeOn = on), syncNative());
    };
    // ENV says so before the widget's own style lands (env-main, document_end).
    void ctx.env().then(e => {
      const probe = (e as { probe?: { widgetDarkMode?: boolean | null } } | null)?.probe;
      if (probe?.widgetDarkMode === true && !nativeOn) ((nativeOn = true), syncNative());
    });
    nativeObs = new MutationObserver(check);
    nativeObs.observe(document.head ?? root, { childList: true });
    check();
  }

  // ── Documents in dark mode (Director ruling, dark-mode.md §7): the DocViewer
  //    is a cross-origin frame (canvadocs); docs.ts inside it applies the look
  //    we post: light (untouched), dimmed or dark, only while the scheme is dark. ──
  const docsMode = () => (root.getAttribute(THEME_ATTR) === 'on' && root.getAttribute(SCHEME_ATTR) === 'dark' ? (s.documents ?? 'light') : 'light');
  const post = (f: HTMLIFrameElement) => {
    try {
      const u = new URL(f.src, location.href);
      if (!/^canvadocs/.test(u.hostname)) return;
      f.contentWindow?.postMessage({ type: DOCS_MSG, mode: docsMode() }, u.origin);
    } catch {
      /* not a URL we can address */
    }
  };
  const frames = new Set<HTMLIFrameElement>();
  const tellDocs = () => frames.forEach(post);
  const offDocs = ctx.dom.each('iframe[src*="canvadoc"]', el => {
    const f = el as HTMLIFrameElement;
    frames.add(f);
    const onFrameLoad = () => post(f);
    f.addEventListener('load', onFrameLoad);
    post(f);
    return () => {
      f.removeEventListener('load', onFrameLoad);
      frames.delete(f);
    };
  });
  // The frame asks on its own start too (it may load before we see it).
  const onWindowMessage = (e: MessageEvent) => {
    const d = e.data as { type?: string; ask?: boolean } | null;
    if (!d || d.type !== DOCS_MSG || !d.ask || !/^https:\/\/canvadocs/.test(e.origin)) return;
    (e.source as Window | null)?.postMessage({ type: DOCS_MSG, mode: docsMode() }, e.origin);
  };
  addEventListener('message', onWindowMessage);

  // ── Inline colours (dark-mode.md §4 course colours as text, §7 user content) ──
  // Pre-paint CSS covers the common authored forms (style.css); this covers
  // the rest. The attributes are polarity-free; style.css decides per
  // polarity (a lift only applies on dark palettes).
  let inkOff: Array<() => void> = [];
  const startInk = () => {
    if (inkOff.length) return;
    inkOff.push(
      ctx.dom.each(BG_SEL, el => {
        const h = el as HTMLElement;
        const role = bgRole(h.style.backgroundColor || h.getAttribute('bgcolor'), inUserContent(h));
        if (!role) return;
        h.setAttribute('data-b2c-ink-bg', role);
        return () => h.removeAttribute('data-b2c-ink-bg');
      }),
      ctx.dom.each(INK_SEL, el => {
        const h = el as HTMLElement;
        // Colour budget (Design, COLOUR-PASS): the card hero carries the course
        // colour, so a card title is plain text (palette.css), never re-inked.
        if (h.closest('.ic-DashboardCard__header-title')) return;
        const authored = h.tagName === 'FONT' ? h.getAttribute('color') : h.style.color;
        const rgb = authored ? parseColor(authored) : null;
        if (!rgb) return;
        // Text on an inline coloured background keeps its pair, unless that
        // background is itself remapped to a palette role.
        const bgHost = h.closest('[style*="background" i], [bgcolor]') as HTMLElement | null;
        if (bgHost && !bgRole(bgHost.style.backgroundColor || bgHost.getAttribute('bgcolor'), inUserContent(bgHost))) return;
        const ink = inkFor(rgb);
        if (ink.kind === 'keep') return;
        h.setAttribute('data-b2c-ink', ink.kind);
        if (ink.kind === 'lift') h.style.setProperty('--b2c-ink', ink.css);
        return () => {
          h.removeAttribute('data-b2c-ink');
          h.style.removeProperty('--b2c-ink');
        };
      }),
    );
  };
  const stopInk = () => {
    for (const off of inkOff) off();
    inkOff = [];
  };
  // The page world's InstUI layer missed document_start (no or stale mirror):
  // install it now that the engine (or Canvas corners) is painting. One event,
  // ignored when already installed (the listener is registered only then).
  const lateInstui = () => {
    if (root.getAttribute(THEME_ATTR) === 'on' || root.hasAttribute('data-b2c-shape')) document.dispatchEvent(new CustomEvent('b2c:instui-install'));
  };
  lateInstui();
  const engineConfigured = () => s.useDark !== 'never' || (s.light ?? 'canvas') !== 'canvas';
  const apply = () => {
    if (engineConfigured()) startInk();
    else stopInk();
    checkNav();
  };
  apply();

  return {
    update(next) {
      s = next;
      apply();
      tellDocs();
      syncNative(); // the theme's scheme may have changed
    },
    stop() {
      chrome.runtime.onMessage.removeListener(onMessage);
      flip.disconnect();
      cancelAnimationFrame(raf);
      root.removeAttribute('data-b2c-switching');
      removeEventListener('load', onLoad);
      root.style.removeProperty('--b2c-dm-nav');
      stopInk();
      offDocs();
      nativeObs?.disconnect();
      removeEventListener('message', onWindowMessage);
    },
  };
}
