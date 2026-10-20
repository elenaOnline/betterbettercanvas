// The ⌘K overlay: an open shadow root with a combobox and a grouped listbox.
// Dumb view: run.ts owns searching; this renders rows and reports intent.

import { widgetHost } from '../../core/dom.ts';
import css from './palette.css';

export type RowKind =
  | 'course' | 'module' | 'assignment' | 'quiz' | 'page' | 'file'
  | 'discussion' | 'announcement' | 'link' | 'command' | 'result';

export interface Row {
  key: string;
  kind: RowKind;
  title: string;
  detail?: string;
  /** Results navigate; commands run. */
  href?: string;
  hint?: string;
  /** Query tokens to emphasise in the title. */
  marks?: string[];
}

export interface RowGroup { label: string; rows: Row[] }

export interface PaletteHooks {
  onQuery(q: string): void;
  onActivate(row: Row, newTab: boolean): void;
  onClose(): void;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

// 16 px line icons, square-cornered (the owner: square styling).
const P: Record<RowKind, string> = {
  course: 'M3 2.5h8.5v11H3zM5.5 2.5v11M13 4v10',
  module: 'M2.5 3.5h11M2.5 8h11M2.5 12.5h11',
  assignment: 'M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3M5.5 8h5M5.5 11h5',
  quiz: 'M3.5 1.5h9v13h-9zM5.5 8l2 2 3.5-4',
  page: 'M3.5 1.5h9v13h-9zM5.5 5h5M5.5 8h5M5.5 11h3',
  file: 'M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3',
  discussion: 'M2 3h12v8H7l-3 2.5V11H2z',
  announcement: 'M2.5 6h3l6-3.5v11l-6-3.5h-3zM5.5 10v3.5',
  link: 'M6.5 3H3v10h10V9.5M9 2h5v5M14 2 7.5 8.5',
  command: 'M4 5l3 3-3 3M8.5 11h4',
  result: 'M8 1.5 9.8 6h4.7l-3.8 2.9 1.4 4.6L8 10.7l-4.1 2.8 1.4-4.6L1.5 6h4.7z',
};
const NS = 'http://www.w3.org/2000/svg';
const iconTemplates = new Map<RowKind, SVGSVGElement>();
function icon(kind: RowKind): SVGSVGElement {
  let t = iconTemplates.get(kind);
  if (!t) iconTemplates.set(kind, (t = makeIcon(kind)));
  return t.cloneNode(true) as SVGSVGElement;
}
function makeIcon(kind: RowKind): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', P[kind]);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.3');
  p.setAttribute('stroke-linejoin', 'miter');
  svg.appendChild(p);
  return svg;
}

/** Title with the first occurrence of each token emphasised (word starts preferred). */
export function highlight(title: string, marks: string[] = []): (string | { m: string })[] {
  const lower = title.toLowerCase();
  const spans: [number, number][] = [];
  for (const t of marks) {
    if (!t) continue;
    let at = -1;
    for (let i = lower.indexOf(t); i >= 0; i = lower.indexOf(t, i + 1)) {
      if (i === 0 || !/[\p{L}\p{N}]/u.test(lower[i - 1]!)) {
        at = i;
        break;
      }
      if (at < 0) at = i;
    }
    if (at >= 0 && !spans.some(([a, b]) => at < b && at + t.length > a)) spans.push([at, at + t.length]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out: (string | { m: string })[] = [];
  let i = 0;
  for (const [a, b] of spans) {
    if (a > i) out.push(title.slice(i, a));
    out.push({ m: title.slice(a, b) });
    i = b;
  }
  if (i < title.length) out.push(title.slice(i));
  return out;
}

export function createPalette(hooks: PaletteHooks) {
  const { host, root } = widgetHost('search', css);
  host.hidden = true;
  host.setAttribute('data-b2c-search', '');

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Search Canvas');

  const field = document.createElement('div');
  field.className = 'field';
  const glass = document.createElementNS(NS, 'svg');
  glass.setAttribute('viewBox', '0 0 16 16');
  glass.setAttribute('width', '16');
  glass.setAttribute('height', '16');
  glass.setAttribute('aria-hidden', 'true');
  glass.innerHTML = '<path d="M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.3 10.3 14 14" fill="none" stroke="currentColor" stroke-width="1.4"/>';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search courses, work, settings';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'b2c-search-list');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-label', 'Search Canvas');
  const esc = document.createElement('kbd');
  esc.textContent = 'esc';
  field.append(glass, input, esc);

  const list = document.createElement('div');
  list.className = 'list';
  list.id = 'b2c-search-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Results');

  const foot = document.createElement('div');
  foot.className = 'foot';
  const keys = document.createElement('div');
  keys.className = 'keys';
  const key = (k: string[], label: string) => {
    const s = document.createElement('span');
    for (const x of k) {
      const kb = document.createElement('kbd');
      kb.textContent = x;
      s.appendChild(kb);
    }
    s.append(label);
    return s;
  };
  keys.append(key(['↑', '↓'], 'move'), key(['↵'], 'open'), key([MOD, '↵'], 'new tab'));
  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('aria-live', 'polite');
  foot.append(keys, status);

  panel.append(field, list, foot);
  root.append(scrim, panel);

  let rows: Row[] = [];
  let els: HTMLElement[] = [];
  let sel = 0;
  let restoreFocus: Element | null = null;
  let mounted = false;
  /** Pointer selection only when the pointer actually moves (not when rows re-render under it). */
  let lastXY = '';

  const select = (i: number, scroll = true) => {
    if (!els.length) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    sel = (i + els.length) % els.length;
    els.forEach((el, j) => el.setAttribute('aria-selected', String(j === sel)));
    const el = els[sel]!;
    input.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  };

  const activate = (i: number, newTab: boolean) => {
    const row = rows[i];
    if (row) hooks.onActivate(row, newTab);
  };

  // Row elements are reused across keystrokes (keyed by row key): typing
  // mostly re-highlights titles instead of rebuilding ~30 rows.
  interface Cached { el: HTMLElement; title: HTMLElement; detail: HTMLElement; hint: HTMLElement; marks: string; row: Row }
  const cache = new Map<string, Cached>();
  function setTitle(c: Cached, r: Row) {
    const sig = (r.marks ?? []).join('\u0000');
    if (c.row.title === r.title && c.marks === sig && c.title.firstChild) return;
    c.marks = sig;
    c.title.replaceChildren();
    for (const part of highlight(r.title, r.marks)) {
      if (typeof part === 'string') c.title.append(part);
      else {
        const m = document.createElement('mark');
        m.textContent = part.m;
        c.title.appendChild(m);
      }
    }
  }
  function rowEl(r: Row, ck: string): HTMLElement {
    let c = cache.get(ck);
    if (c && (c.el.tagName === 'A') !== !!r.href) {
      cache.delete(ck);
      c = undefined;
    }
    if (!c) {
      const el = document.createElement(r.href ? 'a' : 'div');
      el.className = 'row';
      el.tabIndex = -1;
      el.setAttribute('role', 'option');
      el.dataset.kind = r.kind;
      el.dataset.key = r.key;
      const text = document.createElement('span');
      text.className = 'text';
      const title = document.createElement('span');
      title.className = 'title';
      const detail = document.createElement('span');
      detail.className = 'detail';
      text.append(title, detail);
      const hint = document.createElement('span');
      el.append(icon(r.kind), text, hint);
      c = { el, title, detail, hint, marks: '\u0001', row: r };
      cache.set(ck, c);
    }
    setTitle(c, r);
    c.row = r;
    if (r.href && (c.el as HTMLAnchorElement).getAttribute('href') !== r.href) (c.el as HTMLAnchorElement).href = r.href;
    if (c.detail.textContent !== (r.detail ?? '')) c.detail.textContent = r.detail ?? '';
    c.detail.hidden = !r.detail;
    const hintText = r.hint ?? '↵';
    if (c.hint.textContent !== hintText) c.hint.textContent = hintText;
    c.hint.className = r.hint ? 'hint' : 'hint enter';
    return c.el;
  }

  let renderedQ: string | null = null;
  let scrolled = false;
  list.addEventListener('scroll', () => (scrolled = list.scrollTop > 0), { passive: true });
  function render(groups: RowGroup[], empty?: string) {
    // Same query re-rendered (the index filled in): keep the selected row.
    const keep = renderedQ === input.value ? rows[sel]?.key : undefined;
    // Never read or write scroll offsets unless needed: each forces a layout.
    const top = keep && scrolled ? list.scrollTop : 0;
    renderedQ = input.value;
    const frag = document.createDocumentFragment();
    const seen = new Set<string>();
    rows = [];
    els = [];
    for (const g of groups) {
      if (!g.rows.length) continue;
      const gid = `b2c-g-${rows.length}`;
      const wrap = document.createElement('div');
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-labelledby', gid);
      const label = document.createElement('div');
      label.className = 'group-label';
      label.id = gid;
      label.setAttribute('role', 'presentation');
      label.textContent = g.label;
      wrap.appendChild(label);
      for (const r of g.rows) {
        const i = rows.length;
        // The same item twice (Recent and Courses): a second element.
        const ck = seen.has(r.key) ? `${r.key}\u0002` : r.key;
        const el = rowEl(r, ck);
        el.id = `b2c-o-${i}`;
        el.setAttribute('aria-selected', 'false');
        seen.add(ck);
        rows.push(r);
        els.push(el);
        wrap.appendChild(el);
      }
      frag.appendChild(wrap);
    }
    if (!rows.length && empty) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = empty;
      frag.appendChild(e);
    }
    list.replaceChildren(frag);
    // Keep only rows still shown (bounded; cheap to rebuild the rest).
    for (const k of cache.keys()) if (!seen.has(k)) cache.delete(k);
    const i = keep ? rows.findIndex(r => r.key === keep) : -1;
    if (scrolled) {
      list.scrollTop = i >= 0 ? top : 0;
      scrolled = list.scrollTop > 0;
    }
    select(Math.max(i, 0), false);
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  input.addEventListener('input', () => hooks.onQuery(input.value));
  input.addEventListener('keydown', e => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (e.isComposing) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        select(sel + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        select(sel - 1);
        break;
      case 'n':
      case 'p':
        if (e.ctrlKey && !e.metaKey && isMac) {
          e.preventDefault();
          select(sel + (e.key === 'n' ? 1 : -1));
        }
        break;
      case 'Enter':
        e.preventDefault();
        activate(sel, mod);
        break;
      case 'Escape':
        e.preventDefault();
        hooks.onClose();
        break;
      case 'Tab':
        e.preventDefault(); // focus stays in the box; arrows move
        select(sel + (e.shiftKey ? -1 : 1));
        break;
    }
    // Keys typed in the box are the palette's, not Canvas's shortcuts.
    e.stopPropagation();
  });
  // Swallow keyup/keypress too, so Canvas's global shortcut handlers stay quiet.
  for (const t of ['keyup', 'keypress'] as const) input.addEventListener(t, e => e.stopPropagation());

  scrim.addEventListener('mousedown', e => {
    e.preventDefault();
    hooks.onClose();
  });
  list.addEventListener('mousemove', e => {
    const xy = `${e.clientX},${e.clientY}`;
    if (xy === lastXY) return;
    lastXY = xy;
    const el = (e.target as Element).closest<HTMLElement>('.row');
    const i = el ? els.indexOf(el) : -1;
    if (i >= 0 && i !== sel) select(i, false);
  });
  list.addEventListener('mousedown', e => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', e => {
    const el = (e.target as Element).closest<HTMLElement>('.row');
    const i = el ? els.indexOf(el) : -1;
    if (i < 0) return;
    const newTab = e.metaKey || e.ctrlKey || e.shiftKey;
    e.preventDefault();
    activate(i, newTab);
  });
  list.addEventListener('auxclick', e => {
    if (e.button !== 1) return;
    const el = (e.target as Element).closest<HTMLElement>('.row');
    const i = el ? els.indexOf(el) : -1;
    if (i < 0) return;
    e.preventDefault();
    activate(i, true);
  });

  return {
    host,
    input,
    get isOpen() {
      return !host.hidden;
    },
    open(query = '') {
      if (!mounted) {
        document.documentElement.appendChild(host);
        mounted = true;
      }
      restoreFocus = document.activeElement;
      host.hidden = false;
      renderedQ = null;
      input.value = query;
      input.focus({ preventScroll: true });
      input.select();
    },
    close() {
      if (host.hidden) return;
      host.hidden = true;
      const back = restoreFocus as HTMLElement | null;
      restoreFocus = null;
      if (back && back.isConnected && typeof back.focus === 'function' && back !== document.body) back.focus({ preventScroll: true });
    },
    render,
    /** Status line, and host[data-state] (loading | updating | ready) for tests and Design. */
    setStatus(text: string, state: 'loading' | 'updating' | 'ready' = 'ready') {
      if (status.textContent !== text) status.textContent = text;
      host.dataset.state = state;
    },
    get query() {
      return input.value;
    },
    destroy() {
      host.remove();
      mounted = false;
    },
  };
}

export type Palette = ReturnType<typeof createPalette>;
