// One shared MutationObserver for all features. each(selector, fn) fires for
// every current and future match exactly once per element (per registration).
// Callbacks run inside the observer callback, i.e. before the next paint, so
// features can decorate React-rendered DOM without a visible pop-in.

type Cleanup = void | (() => void);

interface Reg {
  selector: string;
  fn: (el: Element) => Cleanup;
  seen: WeakSet<Element>;
  cleanups: Map<Element, () => void>;
}

export function createDom(doc: Document = document) {
  const regs = new Set<Reg>();
  let observer: MutationObserver | null = null;

  const visit = (reg: Reg, el: Element) => {
    if (reg.seen.has(el)) return;
    reg.seen.add(el);
    try {
      const c = reg.fn(el);
      if (typeof c === 'function') reg.cleanups.set(el, c);
    } catch (e) {
      console.error('[b2c]', reg.selector, e);
    }
  };

  const scan = (reg: Reg, root: ParentNode) => {
    if (root instanceof Element && root.matches(reg.selector)) visit(reg, root);
    for (const el of Array.from(root.querySelectorAll(reg.selector))) visit(reg, el);
  };

  const ensureObserver = () => {
    if (observer) return;
    observer = new MutationObserver(records => {
      for (const r of records) {
        for (const n of Array.from(r.addedNodes)) {
          if (n.nodeType !== 1) continue;
          for (const reg of regs) scan(reg, n as Element);
        }
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  };

  return {
    /** Run fn for each current and future element matching selector. Returns a disposer. */
    each(selector: string, fn: (el: Element) => Cleanup): () => void {
      const reg: Reg = { selector, fn, seen: new WeakSet(), cleanups: new Map() };
      regs.add(reg);
      ensureObserver();
      scan(reg, doc);
      return () => {
        regs.delete(reg);
        for (const c of reg.cleanups.values()) c();
        reg.cleanups.clear();
        if (regs.size === 0) {
          observer?.disconnect();
          observer = null;
        }
      };
    },

    /** First element matching selector, waiting for it if needed. */
    first(selector: string, timeoutMs = 15_000): Promise<Element | null> {
      const now = doc.querySelector(selector);
      if (now) return Promise.resolve(now);
      return new Promise(resolve => {
        let done = false;
        const off = this.each(selector, el => {
          if (done) return;
          done = true;
          queueMicrotask(() => off());
          resolve(el);
        });
        setTimeout(() => {
          if (done) return;
          done = true;
          off();
          resolve(null);
        }, timeoutMs);
      });
    },

    stopAll() {
      for (const reg of regs) for (const c of reg.cleanups.values()) c();
      regs.clear();
      observer?.disconnect();
      observer = null;
    },
  };
}

export type Dom = ReturnType<typeof createDom>;

/** Create an open shadow host for an injected widget. */
export function widgetHost(tag: string, css?: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement('b2c-' + tag);
  const root = host.attachShadow({ mode: 'open' });
  if (css) {
    // A <style> child rather than adoptedStyleSheets: constructed sheets from
    // an isolated world have had cross-world bugs; a plain element never has.
    const style = document.createElement('style');
    style.textContent = css;
    root.appendChild(style);
  }
  return { host, root };
}
