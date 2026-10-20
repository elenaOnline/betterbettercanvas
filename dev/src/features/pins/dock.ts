// pins runtime, part 2: the dock and its editor (design/spec/surfaces/pins.md).
// Dashboard: one row of square two-line chips that never wraps; chips that
// don't fit fold into a "+N" chip. Course pages: a short list under the
// course navigation. Plain DOM, no framework.

import type { Ctx } from '../../core/ctx.ts';
import { widgetHost } from '../../core/dom.ts';
import { anchors } from './anchors.ts';
import { suggest } from './capture.ts';
import css from './dock.css';
import type { PinSettings } from './index.ts';
import { KINDS, KIND_LABEL, MAX_PINS, WHICH_LABEL, isPin, newId, pinCourse, targetSig, type Kind, type Pin, type Target, type Which } from './model.ts';
import { courseName, defaultLabel, needs, resolve, type Resolved } from './resolve.ts';
import { addPin, dispose, pinSuggestion, pinsOf, saveList, storeFor, toast, tune, visible, type GetS, type PinStore } from './store.ts';
import { RULE_LABEL } from './weeks.ts';

type Mode = 'bar' | 'nav';

interface Dock {
  host: HTMLElement;
  render(): void;
  close(): void;
}

export function startDock(ctx: Ctx, getS: GetS): { update(): void; stop(): void } {
  const store = storeFor(ctx);
  const docks = new Set<Dock>();
  const offs: (() => void)[] = [];

  const ensureVisible = () => store.ensure([{ kind: 'colors' }, ...visible(ctx, getS()).flatMap(p => needs(p.target))]);
  ensureVisible();
  const renderAll = () => {
    for (const d of docks) {
      if (d.host.isConnected) d.render();
      else docks.delete(d);
    }
  };
  offs.push(store.onChange(renderAll));

  const mount = (mode: Mode, at: string, place: (h: HTMLElement) => void) => () => {
    const d = createDock(ctx, getS, store, mode, at);
    place(d.host);
    d.render(); // lays out (and fits the row) before the next paint
    docks.add(d);
    return () => {
      d.close();
      d.host.remove();
      docks.delete(d);
    };
  };

  if (ctx.page.kind === 'dashboard') {
    offs.push(ctx.dom.each(anchors.dashboardClassic, el => mount('bar', 'classic', h => el.before(h))()));
    offs.push(ctx.dom.each(anchors.dashboardCourses, el => mount('bar', 'courses', h => el.prepend(h))()));
  } else if (ctx.page.courseId) {
    offs.push(ctx.dom.each(anchors.courseNav, el => mount('nav', 'course', h => (el.closest('nav') ?? el).after(h))()));
  }

  return {
    update() {
      ensureVisible();
      renderAll();
    },
    stop() {
      offs.forEach(f => f());
      for (const d of docks) {
        d.close();
        d.host.remove();
      }
      docks.clear();
      dispose(ctx);
    },
  };
}

// ── DOM helpers ──

type Kid = Node | string | null | false | undefined;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k in e && typeof v !== 'string') (e as unknown as Record<string, unknown>)[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
}

const DAY_NAME = { thu: 'Thu', fri: 'Fri', never: '' } as const;

/** "Algebra this week: Week 4, Gases, resolved by unlock dates" (Design: one accessible name per chip). */
function nameFor(p: Pin, r: Resolved): string {
  if (r.state === 'gone') return `${p.label}: not found. Edit`;
  const now = (r.detail || r.title).split(' · ').join(', ');
  const rule = r.rule ? `, resolved ${RULE_LABEL[r.rule]}` : '';
  return `${p.label}: ${now}${rule}${r.flag ? `. ${r.flag}` : ''}`;
}

function createDock(ctx: Ctx, getS: GetS, store: PinStore, mode: Mode, at: string): Dock {
  const { host, root } = widgetHost('pins-dock', css);
  host.dataset.mode = mode;
  host.dataset.at = at;
  const onDash = ctx.page.kind === 'dashboard';

  const nav = el('nav', { class: 'dock', 'aria-label': 'Pins' });
  const list = el('ul', { class: 'pins' });
  const empty = el('span', { class: 'empty', text: 'Pins: links that follow the week' });
  const more = el('button', { type: 'button', class: 'chip more', hidden: true, 'aria-haspopup': 'dialog' });
  const add = el('button', { type: 'button', class: mode === 'bar' ? 'chip add' : 'add' });
  const edit = el('button', { type: 'button', class: 'icon-btn edit', 'aria-label': 'Edit pins', title: 'Edit pins', 'aria-haspopup': 'dialog', text: '⋯' });
  const panel = el('div', { class: 'panel', role: 'dialog', 'aria-label': 'Pins', hidden: true });
  if (mode === 'nav') {
    add.append(el('span', { 'aria-hidden': 'true', text: '+' }), ' Pin');
    add.setAttribute('aria-label', 'Pin this page');
    nav.append(el('div', { class: 'head' }, el('span', { class: 'title', text: 'Pins' }), edit), list, add, panel);
  } else {
    add.textContent = '+';
    add.setAttribute('aria-label', onDash ? 'New pin…' : 'Pin this page');
    add.title = onDash ? 'New pin…' : 'Pin this page';
    nav.append(list, empty, more, add, edit, panel);
  }
  root.append(nav);

  // ── state ──
  type View = { kind: 'manage' } | { kind: 'edit'; pin: Pin | 'new' } | { kind: 'menu'; pin: Pin } | { kind: 'overflow' };
  let view: View | null = null;
  let anchorEl: HTMLElement = edit;
  let hidden: Pin[] = [];
  let refreshPreview: (() => void) | null = null;
  let draft: { kind: Kind; course: string; which: Which; module: string; match: string; href: string; label: string; labelTouched: boolean } | null = null;

  // ── the row / list of pins ──
  function chip(p: Pin, r: Resolved): HTMLLIElement {
    const gone = r.state === 'gone';
    const c = pinCourse(p);
    const color = c ? store.snap.colors?.[`course_${c}`] : undefined;
    const tip = [p.label, r.detail, r.why, r.flag].filter(Boolean).join('\n');
    const a = el(
      gone ? 'button' : 'a',
      {
        class: ['pin', r.state, color ? 'has-c' : ''].filter(Boolean).join(' '),
        ...(gone ? { type: 'button', onclick: () => openView({ kind: 'edit', pin: p }, a) } : { href: r.href }),
        title: tip,
        'aria-label': nameFor(p, r),
        'data-pin': p.id,
        style: color ? `--c:${color}` : undefined,
        oncontextmenu: (e: MouseEvent) => {
          if (e.shiftKey) return; // Shift: the browser's own menu
          e.preventDefault();
          openView({ kind: 'menu', pin: p }, a);
        },
      },
      el('span', { class: 'l' }, p.icon ? `${p.icon} ${p.label}` : p.label, r.flag ? el('span', { class: 'flag', 'aria-hidden': 'true', text: '!' }) : null),
      el('span', { class: 'd', text: gone ? 'Not found · Edit' : r.detail || r.title }),
    );
    return el('li', { 'data-pin': p.id }, a);
  }

  let pins: Pin[] = [];
  let rs = new Map<string, Resolved>();
  function renderPins() {
    const s = getS();
    tune(store, s);
    pins = visible(ctx, s);
    rs = store.resolveAll(pins);
    list.replaceChildren(...pins.map(p => chip(p, rs.get(p.id)!)));
    empty.hidden = pins.length > 0 || mode === 'nav';
    fit();
  }

  /** Bar: fold chips that don't fit into "+N". The row never wraps. */
  function fit() {
    if (mode !== 'bar') return;
    const lis = [...list.children] as HTMLElement[];
    lis.forEach(li => (li.hidden = false));
    more.hidden = true;
    hidden = [];
    if (!host.isConnected || list.scrollWidth <= list.clientWidth + 1) return;
    more.hidden = false;
    more.textContent = `+${lis.length}`;
    const max = list.clientWidth;
    lis.forEach((li, i) => {
      if (li.offsetLeft + li.offsetWidth > max + 0.5) {
        li.hidden = true;
        hidden.push(pins[i]!);
      }
    });
    more.textContent = `+${hidden.length}`;
    more.setAttribute('aria-label', `${hidden.length} more pin${hidden.length === 1 ? '' : 's'}`);
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
  ro?.observe(nav);

  // ── buttons ──
  add.addEventListener('click', () => {
    if (onDash) return openView({ kind: 'edit', pin: 'new' }, add);
    closePanel();
    const g = suggest(location.pathname, location.search, document.title)[0];
    if (g) void pinSuggestion(ctx, getS, g);
    else openView({ kind: 'edit', pin: 'new' }, add);
  });
  edit.addEventListener('click', () => (view?.kind === 'manage' ? closePanel() : openView({ kind: 'manage' }, edit)));
  more.addEventListener('click', () => (view?.kind === 'overflow' ? closePanel() : openView({ kind: 'overflow' }, more)));

  // ── the popover (top layer: nothing clips it, opening it moves nothing) ──
  const canPop = typeof panel.showPopover === 'function';
  if (canPop) {
    panel.removeAttribute('hidden');
    panel.setAttribute('popover', 'manual');
  }
  const isOpen = () => view !== null;
  const place = () => {
    if (!canPop || !view) return;
    const r = anchorEl.getBoundingClientRect();
    const w = Math.min(380, innerWidth * 0.92);
    panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    // Keep clear of the bottom edge, where the Undo toast appears; open upward when there's no room below.
    const room = innerHeight - r.bottom - 96;
    if (room >= 240 || r.top < room) {
      panel.style.top = `${r.bottom + 4}px`;
      panel.style.bottom = '';
      panel.style.maxHeight = `${Math.max(160, room)}px`;
    } else {
      panel.style.top = '';
      panel.style.bottom = `${innerHeight - r.top + 4}px`;
      panel.style.maxHeight = `${Math.max(160, r.top - 16)}px`;
    }
  };
  const outside = (e: Event) => {
    if (!e.composedPath().includes(host)) closePanel();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !view) return;
    e.stopPropagation();
    if (view.kind === 'edit' && view.pin !== 'new') openView({ kind: 'manage' }, anchorEl, true);
    else closePanel(true);
  };

  function openView(v: View, from: HTMLElement, keepAnchor = false) {
    const wasOpen = isOpen();
    view = v;
    if (!keepAnchor) anchorEl = from;
    for (const b of [edit, more, add]) b.setAttribute('aria-expanded', String(b === anchorEl));
    if (v.kind === 'edit') startDraft(v.pin);
    if (!wasOpen) {
      if (canPop) {
        panel.showPopover();
        addEventListener('scroll', place, true);
        addEventListener('resize', place);
      } else panel.hidden = false;
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', onKey, true);
    }
    store.ensure([{ kind: 'courses' }]);
    place();
    renderPanel();
    (panel.querySelector('form select, form input, a, button') as HTMLElement | null)?.focus();
  }

  function closePanel(focus = false) {
    if (!view) return;
    view = null;
    draft = null;
    if (canPop) {
      panel.hidePopover();
      removeEventListener('scroll', place, true);
      removeEventListener('resize', place);
    } else panel.hidden = true;
    for (const b of [edit, more, add]) b.removeAttribute('aria-expanded');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    if (focus && anchorEl.isConnected) anchorEl.focus();
  }

  // ── list edits ──
  async function remove(p: Pin) {
    const before = pinsOf(getS());
    const i = before.findIndex(x => x.id === p.id);
    await saveList(ctx, before.filter(x => x.id !== p.id));
    toast({
      message: `Removed “${p.label}”`,
      action: {
        label: 'Undo',
        undo: true,
        run: () => {
          const now = pinsOf(getS()).filter(x => x.id !== p.id);
          now.splice(Math.min(i, now.length), 0, p);
          void saveList(ctx, now);
        },
      },
    });
  }

  async function move(p: Pin, by: -1 | 1) {
    const l = pinsOf(getS());
    const i = l.findIndex(x => x.id === p.id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j]!, l[i]!];
    await saveList(ctx, l);
  }

  // ── panel views ──
  function renderPanel() {
    if (!view) return;
    const focusKey = (root.activeElement as HTMLElement | null)?.dataset?.k;
    refreshPreview = null;
    panel.replaceChildren();
    const s = getS();
    const all = pinsOf(s);

    if (view.kind === 'overflow') {
      const ul = el('ul', { class: 'menu-list' });
      for (const p of hidden) {
        const r = rs.get(p.id) ?? store.resolveOne(p);
        ul.append(el('li', {}, chip(p, r).firstElementChild!));
      }
      panel.append(el('h3', { text: 'More pins' }), ul);
    } else if (view.kind === 'menu') {
      const p = view.pin;
      const r = store.resolveOne(p);
      const items = el('div', { class: 'menu' });
      if (r.state !== 'gone') items.append(el('a', { class: 'btn', href: r.href, 'data-k': 'open', text: `Open ${r.title && r.title !== p.label ? r.title : p.label}` }));
      if (r.next) items.append(el('a', { class: 'btn', href: r.next.href, 'data-k': 'next', text: `Open next week's: ${r.next.title}` }));
      items.append(
        el('button', { type: 'button', class: 'btn', 'data-k': 'edit', onclick: () => openView({ kind: 'edit', pin: p }, anchorEl, true), text: 'Edit…' }),
        el('button', { type: 'button', class: 'btn', 'data-k': 'remove', onclick: () => (closePanel(), void remove(p)), text: 'Remove' }),
      );
      panel.append(el('h3', { text: p.label }), ...(r.why ? [el('p', { class: 'note', text: r.why })] : []), items);
    } else if (view.kind === 'edit') {
      panel.append(el('h3', { text: view.pin === 'new' ? 'New pin' : 'Edit pin' }), editorForm());
    } else {
      const sug = onDash ? [] : suggest(location.pathname, location.search, document.title);
      if (sug.length) {
        const box = el('div', { class: 'sugg' });
        for (const g of sug) {
          const already = all.some(p => targetSig(p.target) === targetSig(g.target));
          box.append(
            el(
              'button',
              { type: 'button', class: 'btn', 'data-k': `sug:${targetSig(g.target)}`, disabled: already || all.length >= MAX_PINS, onclick: () => (closePanel(true), void pinSuggestion(ctx, getS, g)) },
              el('span', { 'aria-hidden': 'true', text: '+' }),
              `${g.title}${already ? ' (pinned)' : ''}`,
            ),
          );
        }
        panel.append(el('section', {}, el('h3', { text: 'Pin this page' }), box));
      }
      const rows = el('ul', { class: 'rows' });
      all.forEach((p, i) => {
        const r = store.resolveOne(p);
        const row = el(
          'li',
          {
            // Alt+↑/↓ reorders the focused row.
            onkeydown: (e: KeyboardEvent) => {
              if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
              e.preventDefault();
              const by = e.key === 'ArrowUp' ? -1 : 1;
              void move(p, by).then(() => (panel.querySelector(`[data-k="edit:${CSS.escape(p.id)}"]`) as HTMLElement | null)?.focus());
            },
          },
          el(
            'span',
            { class: `name${r.state === 'gone' ? ' gone' : ''}`, title: [r.detail, r.why].filter(Boolean).join('\n') },
            el('span', { class: 'n', text: p.label }),
            el('small', { class: r.state ?? '', text: r.state === 'gone' ? 'Not found' : r.detail || r.title }),
          ),
          el('button', { type: 'button', class: 'icon-btn', 'data-k': `up:${p.id}`, 'aria-label': `Move ${p.label} earlier`, disabled: i === 0, onclick: () => void move(p, -1), text: '↑' }),
          el('button', { type: 'button', class: 'icon-btn', 'data-k': `down:${p.id}`, 'aria-label': `Move ${p.label} later`, disabled: i === all.length - 1, onclick: () => void move(p, 1), text: '↓' }),
          el('button', { type: 'button', class: 'icon-btn', 'data-k': `edit:${p.id}`, 'aria-label': `Edit ${p.label}`, onclick: () => openView({ kind: 'edit', pin: p }, anchorEl, true), text: '✎' }),
          el('button', { type: 'button', class: 'icon-btn', 'data-k': `rm:${p.id}`, 'aria-label': `Remove ${p.label}`, onclick: () => void remove(p), text: '×' }),
        );
        rows.append(row);
      });
      const sec = el('section', {}, el('h3', { text: 'Your pins' }));
      if (all.length) sec.append(rows);
      else sec.append(el('p', { class: 'note', text: 'Nothing pinned yet. A pin can be a link, or a query like "this week\'s module" that follows the weeks.' }));
      sec.append(el('div', { class: 'foot' }, el('button', { type: 'button', class: 'btn', 'data-k': 'new', disabled: all.length >= MAX_PINS, onclick: () => openView({ kind: 'edit', pin: 'new' }, anchorEl, true), text: 'New pin…' })));
      panel.append(sec);
    }
    if (focusKey) (panel.querySelector(`[data-k="${CSS.escape(focusKey)}"]`) as HTMLElement | null)?.focus();
  }

  // ── the editor form ──
  function startDraft(p: Pin | 'new') {
    const t: Target = p === 'new' ? { kind: 'module', course: ctx.page.courseId ?? '', which: 'this-week' } : p.target;
    draft = {
      kind: t.kind,
      course: 'course' in t ? t.course ?? '' : ctx.page.courseId ?? '',
      which: t.kind === 'module' ? t.which : 'this-week',
      module: t.kind === 'module' ? t.module ?? '' : '',
      match: t.kind === 'latest-file' || t.kind === 'page' ? t.match : '',
      href: t.kind === 'url' ? t.href : location.pathname + location.search,
      label: p === 'new' ? '' : p.label,
      labelTouched: p !== 'new',
    };
  }

  const draftTarget = (): Target | null => {
    const d = draft;
    if (!d) return null;
    switch (d.kind) {
      case 'url': return { kind: 'url', href: d.href.trim() };
      case 'module': return d.which === 'pinned' ? { kind: 'module', course: d.course, which: 'pinned', module: d.module } : { kind: 'module', course: d.course, which: d.which };
      case 'next-due': return d.course ? { kind: 'next-due', course: d.course } : { kind: 'next-due' };
      case 'latest-file': return { kind: 'latest-file', course: d.course, match: d.match.trim() };
      case 'page': return { kind: 'page', course: d.course, match: d.match.trim() };
      case 'assignments': return { kind: 'assignments', course: d.course };
      case 'grades': return { kind: 'grades', course: d.course };
    }
  };

  async function saveDraft() {
    const t = draftTarget();
    if (!t || !draft || view?.kind !== 'edit') return;
    const editing = view.pin;
    const label = (draft.labelTouched ? draft.label : defaultLabel(t, store.snap.courses)).trim().slice(0, 80);
    const pin: Pin = { id: editing !== 'new' ? editing.id : newId(), label: label || 'Pin', target: t };
    if (!isPin(pin)) return;
    if (editing === 'new') {
      if (!(await addPin(ctx, getS, pin))) return;
    } else {
      await saveList(ctx, pinsOf(getS()).map(p => (p.id === pin.id ? pin : p)));
    }
    openView({ kind: 'manage' }, anchorEl, true);
  }

  function editorForm(): HTMLFormElement {
    const d = draft!;
    const t = draftTarget();
    const courses = store.snap.courses ?? [];
    if (t) store.ensure(needs(t));
    if (d.kind === 'module' && d.which === 'pinned' && d.course) store.ensure([{ kind: 'modules', course: d.course }]);

    const rerender = () => renderPanel();
    const field = (id: string, label: string, control: HTMLElement) => [el('label', { for: id, text: label }), ((control.id = id), control)];
    const sel = (k: string, value: string, opts: [string, string][], on: (v: string) => void) => {
      const s = el('select', { 'data-k': k, onchange: (e: Event) => (on((e.target as HTMLSelectElement).value), rerender()) });
      for (const [v, text] of opts) s.append(el('option', { value: v, text, selected: v === value }));
      return s;
    };
    const inp = (k: string, value: string, placeholder: string, on: (v: string) => void, live = true) =>
      el('input', { 'data-k': k, type: 'text', value, placeholder, spellcheck: 'false', oninput: (e: Event) => (on((e.target as HTMLInputElement).value), live && updatePreview()) });

    const form = el('form', { onsubmit: (e: Event) => (e.preventDefault(), void saveDraft()) });
    form.append(...field('pk', 'Points to', sel('kind', d.kind, KINDS.map(k => [k, KIND_LABEL[k]]), v => (d.kind = v as Kind))));
    if (d.kind !== 'url') {
      const opts: [string, string][] = courses.map(c => [c.id, `${courseName(c, c.id)}${c.name !== courseName(c, c.id) ? ` — ${c.name}` : ''}`]);
      if (d.kind === 'next-due') opts.unshift(['', 'Any course']);
      else if (!d.course && opts[0]) d.course = opts[0][0];
      if (d.course && !opts.some(o => o[0] === d.course)) opts.unshift([d.course, `Course ${d.course}`]);
      form.append(...field('pc', 'Course', sel('course', d.course, opts, v => (d.course = v))));
    }
    if (d.kind === 'module') {
      form.append(...field('pw', 'Which', sel('which', d.which, (Object.keys(WHICH_LABEL) as Which[]).map(w => [w, WHICH_LABEL[w]]), v => (d.which = v as Which))));
      if (d.which === 'pinned') {
        const mods = store.snap.modules[d.course] ?? [];
        if (!d.module && mods[0]) d.module = mods[0].id;
        form.append(...field('pm', 'Module', sel('module', d.module, mods.map(m => [m.id, m.name]), v => (d.module = v))));
      }
    }
    if (d.kind === 'latest-file' || d.kind === 'page') form.append(...field('pq', 'Matching', inp('match', d.match, d.kind === 'page' ? 'syllabus' : 'lecture', v => (d.match = v))));
    if (d.kind === 'url') form.append(...field('pu', 'Link', inp('href', d.href, '/courses/…', v => (d.href = v))));
    const auto = t ? defaultLabel(t, store.snap.courses) : '';
    form.append(...field('pl', 'Label', inp('label', d.labelTouched ? d.label : '', auto, v => ((d.label = v), (d.labelTouched = v !== '')), false)));
    const preview = el('div', { class: 'preview', 'aria-live': 'polite' });
    form.append(preview);
    const save = el('button', { type: 'submit', class: 'btn primary', 'data-k': 'save', text: view?.kind === 'edit' && view.pin === 'new' ? 'Pin' : 'Save' });
    form.append(
      el(
        'div',
        { class: 'actions' },
        el('button', { type: 'button', class: 'btn', 'data-k': 'cancel', onclick: () => openView({ kind: 'manage' }, anchorEl, true), text: 'Cancel' }),
        save,
      ),
    );

    function updatePreview() {
      const tt = draftTarget();
      const probe = tt ? ({ id: 'draft', label: 'x', target: tt } as Pin) : null;
      const valid = !!probe && isPin(probe);
      save.disabled = !valid;
      if (!valid) {
        preview.replaceChildren(d.kind === 'url' ? 'Paste a Canvas path (/courses/…) or an https:// link.' : 'Fill in the fields above.');
        return;
      }
      const r = resolve(probe, store.snap);
      if (r.pending) return void preview.replaceChildren('Looking…');
      const lines: Kid[] = [];
      if (r.state === 'fallback' && tt!.kind === 'module') {
        lines.push(
          el(
            'div',
            {},
            r.why ?? '',
            ' ',
            el('button', { type: 'button', class: 'link', 'data-k': 'change-rule', onclick: () => ((d.which = 'pinned'), rerender()), text: 'Change rule…' }),
          ),
        );
      } else if (r.state === 'gone') {
        lines.push(el('div', {}, el('b', { text: 'Not found' }), r.why ? `: ${r.why}.` : ''));
      } else {
        const now = tt!.kind === 'module' ? (r.next ? r.detail.replace(/ · next: .*$/, '') : r.detail || r.title) : [r.title, r.detail].filter(Boolean).join(' · ');
        const rule = r.rule ? ` (${RULE_LABEL[r.rule]})` : '';
        lines.push(el('div', {}, el('b', { text: 'Now:' }), ` ${now}${rule}`, r.flag ? ` · ${r.flag}` : ''));
      }
      const day = DAY_NAME[getS().upcomingFrom];
      if (tt!.kind === 'module' && tt!.which === 'this-week' && day) {
        const n = resolve({ ...probe!, target: { ...tt!, which: 'next-week' } as Target }, store.snap);
        if (!n.pending && n.ok) lines.push(el('div', {}, el('b', { text: `Next week from ${day}:` }), ` ${n.title}`));
      }
      preview.replaceChildren(...lines.filter((x): x is Node => !!x && typeof x !== 'string'));
    }
    updatePreview();
    refreshPreview = updatePreview;
    return form;
  }

  // ── render on data and settings ──
  const render = () => {
    renderPins();
    if (!view) return;
    // Keep typing undisturbed: while a text field has focus, only the preview updates.
    const active = root.activeElement as HTMLElement | null;
    if (active?.tagName === 'INPUT' && refreshPreview) refreshPreview();
    else renderPanel();
  };

  return {
    host,
    render,
    close: () => {
      closePanel();
      ro?.disconnect();
    },
  };
}
