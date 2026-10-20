// card-customization runtime: loaded lazily (chunks/card-customization.js) on the dashboard.
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import type { Values } from '../../core/settings/schema.ts';
import { widgetHost } from '../../core/dom.ts';
import { ApiError } from '../../core/canvas/api.ts';
import { openSettings } from '../../core/settings-link.ts';
import { acquireToast, hideToast, showToast } from '../../core/toast.ts';
import { SEL, cardColor, cardCourseId, currentCards, paintCard } from '../card-assignments/anchors.ts';
import { attachDrag, type DragHost } from './drag.ts';
import { CardMenu, closeCardMenu, registerCardMenuItem, type MoveTo } from './menu.ts';
import gradeGoals from '../grade-goals/index.ts';
import { openGoalPopover } from '../grade-goals/popover.ts';
import { customCss, faviconFor, moveId, orderCss, positionsAgree, withCard, type CardCustom, type Cards, type LinkSlot } from './model.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;

const GOALS_KEY = 'grade-goals.enabled';

const STYLE_ID = 'b2c-card-customization';
const CARD_ATTR = 'data-b2c-card';

const BUTTON_CSS = `
:host { all: initial; display: block; }
button { width: 36px; height: 36px; border-radius: var(--b2c-radius-md, 2px); border: 0; display: grid; place-items: center; cursor: pointer;
  background: transparent; color: #fff; }
button:hover, button[aria-expanded=true] { background: rgba(0,0,0,.28); }
button:focus-visible { outline: 2px solid #fff; outline-offset: 1px; box-shadow: 0 0 0 3px rgba(0,0,0,.5); }
svg { width: 16px; height: 16px; display: block; }
`;
/** Three square dots (no circles anywhere). */
const KEBAB = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><rect x="6.5" y="1.5" width="3" height="3"/><rect x="6.5" y="6.5" width="3" height="3"/><rect x="6.5" y="11.5" width="3" height="3"/></svg>';

const LINK_CSS = `
:host { all: initial; }
a { display: grid; place-items: center; width: 36px; height: 28px; border-radius: var(--b2c-radius-sm, 2px); }
a:hover { background: var(--b2c-w-hover, rgba(45,59,69,.06)); }
a:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 1px; }
img, svg { width: 18px; height: 18px; }
`;
const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#6b7780" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';

const HIDDEN_CSS = `
:host { all: initial; display: block; margin: 16px 0 0; font-family: inherit; font-size: 14px; color: var(--b2c-w-text, #2d3b45); }
:host([hidden]) { display: none; }
button { font: inherit; background: none; border: 0; padding: 4px 6px; border-radius: var(--b2c-radius-sm, 2px); color: var(--b2c-w-link, #0374b5); cursor: pointer; }
button:hover { text-decoration: underline; }
button:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); }
ul { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 2px; }
li { display: flex; gap: 8px; align-items: center; }
`;

function linkHost(url: string): HTMLElement {
  const { host, root } = widgetHost('card-link', LINK_CSS);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  let label = url;
  try {
    label = new URL(url).hostname;
  } catch {
    /* keep url */
  }
  a.title = label;
  a.setAttribute('aria-label', `${label} (opens in a new tab)`);
  const fav = faviconFor(url);
  if (fav) {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.src = fav;
    img.addEventListener('error', () => img.replaceWith(Object.assign(document.createElement('span'), { innerHTML: LINK_ICON })), { once: true });
    a.appendChild(img);
  } else a.innerHTML = LINK_ICON;
  root.appendChild(a);
  return host;
}

/** The element whose text is the card's name (classic wraps it in a span). */
function titleTarget(card: Element): HTMLElement | null {
  const t = card.querySelector<HTMLElement>(SEL.title);
  return t?.querySelector<HTMLElement>(':scope > span') ?? t;
}

/** b²c-local decorations on one Canvas card, reapplied and undone exactly. */
class CardDecor {
  private linkHosts: HTMLElement[] = [];
  private hiddenNatives: Element[] = [];
  private titleEl: HTMLElement | null = null;
  private titleText: string | null = null;
  private codeEl: HTMLElement | null = null;
  private codeText: string | null = null;

  constructor(readonly el: Element, readonly courseId: string) {}

  name(): string {
    return (this.titleText ?? titleTarget(this.el)?.textContent ?? this.el.getAttribute('aria-label') ?? 'this course').trim();
  }

  /** The course code as Canvas shows it (before any b²c override). */
  code(): string {
    return (this.codeText ?? this.el.querySelector(SEL.subtitle)?.textContent ?? '').trim();
  }

  apply(c: CardCustom | undefined, renameLocal: boolean) {
    this.undoLinks();
    this.undoName();
    this.undoCode();
    if (!c) return;
    if (c.links) this.applyLinks(c.links);
    if (renameLocal && c.name) this.applyName(c.name);
    if (c.code) this.applyCode(c.code);
  }

  private applyCode(code: string) {
    const el = this.el.querySelector<HTMLElement>(SEL.subtitle);
    if (!el) return;
    this.codeEl = el;
    this.codeText = el.textContent;
    el.textContent = code;
    el.title = code;
  }

  private undoCode() {
    if (this.codeEl && this.codeText !== null) {
      this.codeEl.textContent = this.codeText;
      this.codeEl.title = this.codeText;
    }
    this.codeEl = null;
    this.codeText = null;
  }

  private applyLinks(slots: LinkSlot[]) {
    const nav = this.el.querySelector(SEL.actions);
    if (!nav) return;
    const natives = Array.from(nav.querySelectorAll(`:scope > ${SEL.action}`));
    slots.slice(0, 4).forEach((slot, i) => {
      const native = natives[i];
      if (slot.kind === 'default') return;
      if (native) {
        native.setAttribute('data-b2c-slot-hidden', '');
        this.hiddenNatives.push(native);
      }
      if (slot.kind === 'custom') {
        const h = linkHost(slot.url);
        const next = native ?? natives.slice(i + 1).find(Boolean) ?? null;
        nav.insertBefore(h, next);
        this.linkHosts.push(h);
      }
    });
  }

  private applyName(name: string) {
    const target = titleTarget(this.el);
    if (!target) return;
    this.titleEl = target;
    this.titleText = target.textContent;
    target.textContent = name;
  }

  private undoLinks() {
    for (const h of this.linkHosts) h.remove();
    for (const n of this.hiddenNatives) n.removeAttribute('data-b2c-slot-hidden');
    this.linkHosts = [];
    this.hiddenNatives = [];
  }

  private undoName() {
    if (this.titleEl && this.titleText !== null) this.titleEl.textContent = this.titleText;
    this.titleEl = null;
    this.titleText = null;
  }

  destroy() {
    this.undoLinks();
    this.undoName();
    this.undoCode();
  }
}

/** How long a just-written order is held until Canvas confirms it on a later load. */
const PENDING_MS = 24 * 60 * 60 * 1000;

const refused = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403);

export function start(ctx: Ctx, initial: S): Instance<S> {
  let s = initial;
  let cards: Cards = s.cards;
  const decors = new Set<CardDecor>();
  const hiddenLists = new Set<{ host: HTMLElement; render(): void }>();
  const releaseToast = acquireToast();
  /** Courses unfavorited in this page: their cards stay hidden until reload. */
  const unfavorited = new Set<string>();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  (document.head ?? document.documentElement).appendChild(style);
  // Visual order owned by b²c after a Move (and, on a later load, until
  // Canvas confirms it). null = Canvas's own DOM order, untouched.
  const pending = s.order && Date.now() - s.order.at < PENDING_MS ? s.order : null;
  let desired: string[] | null = pending ? [...pending.ids] : null;

  const renderStyle = () => {
    const fav = [...unfavorited].map(id => customCss({ [id]: { hidden: true } })).join('\n');
    const css = [customCss(cards), fav, desired ? orderCss(desired) : ''].filter(Boolean).join('\n');
    if (style.textContent !== css) style.textContent = css;
  };
  renderStyle();

  // "Set grade goal…" on behalf of grade-goals, offered only while that
  // feature is on (its popover doesn't check).
  let goalsOn = gradeGoals.settings.enabled.default;
  void chrome.storage.sync.get(GOALS_KEY).then(r => {
    if (typeof r[GOALS_KEY] === 'boolean') goalsOn = r[GOALS_KEY];
  });
  const onGoals = (ch: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync' && GOALS_KEY in ch) goalsOn = ch[GOALS_KEY]!.newValue !== undefined ? ch[GOALS_KEY]!.newValue === true : gradeGoals.settings.enabled.default;
  };
  chrome.storage.onChanged.addListener(onGoals);
  let closeGoal: (() => void) | null = null;
  const offGoalItem = registerCardMenuItem({
    id: 'grade-goal',
    label: 'Set grade goal…',
    order: 50,
    when: () => goalsOn,
    run: (courseId, anchor) => {
      closeGoal = openGoalPopover(ctx, courseId, anchor);
    },
  });

  const renameLocal = () => s.renameVia === 'b2c';
  const refresh = () => {
    renderStyle();
    for (const d of decors) {
      if (!d.el.isConnected) decors.delete(d);
      else d.apply(cards[d.courseId], renameLocal());
    }
    for (const h of hiddenLists) {
      if (!h.host.isConnected) hiddenLists.delete(h);
      else h.render();
    }
  };

  // Optimistic: apply now, persist, and let the storage echo confirm.
  const save = (next: Cards) => {
    cards = next;
    refresh();
    void ctx.set({ 'card-customization.cards': next });
  };
  const edit = (id: string, f: (c: CardCustom) => CardCustom) => save(withCard(cards, id, f));

  const cardsOf = (id: string) => currentCards().filter(c => c.courseId === id).map(c => c.el);
  const nameOf = (id: string) => {
    for (const d of decors) if (d.courseId === id && d.el.isConnected) return d.name();
    return cards[id]?.label ?? 'Course';
  };
  /** Visible real cards in page order. */
  /** Real, visible cards in the order she sees them (ours after a Move, else DOM order). */
  const visibleOrder = () => {
    const list = currentCards().filter(c => getComputedStyle(c.el).display !== 'none');
    if (!desired) return list;
    const rank = new Map(desired.map((id, k) => [id, k]));
    return list
      .map((c, k) => ({ c, r: rank.get(c.courseId) ?? desired!.length + k }))
      .sort((a, b) => a.r - b.r)
      .map(x => x.c);
  };

  // A held order from an earlier Move: keep it while Canvas's saved
  // positions agree (Canvas may first paint a stale cached order); drop it
  // once confirmed, or if the order was changed elsewhere since.
  if (pending) {
    ctx.api
      .get<Record<string, number | null>>('/users/self/dashboard_positions', { all: false })
      .then(r => {
        const positions = (r as unknown as { dashboard_positions?: Record<string, number | null> }).dashboard_positions ?? r;
        if (!positionsAgree(pending.ids, positions)) {
          desired = null;
          renderStyle();
        }
        void ctx.set({ 'card-customization.order': null });
      })
      .catch(() => {
        /* keep holding; try again next load */
      });
  }

  // ── Canvas-state actions (optimistic, rolled back on failure) ──
  function setColor(id: string, hex: string) {
    const els = cardsOf(id);
    const before = els[0] ? cardColor(els[0]) : null;
    for (const el of els) paintCard(el, hex);
    ctx.data.setColor(id, hex).catch(e => {
      if (before) for (const el of cardsOf(id)) paintCard(el, before);
      showToast(refused(e) ? { message: "This school doesn't allow changing course colors" } : { message: "Couldn't save the color to Canvas", action: { label: 'Retry', run: () => setColor(id, hex) } });
    });
  }

  function rename(id: string, name: string | undefined) {
    if (renameLocal()) {
      edit(id, c => ({ ...c, name }));
      return;
    }
    const targets = cardsOf(id).map(titleTarget).filter((t): t is HTMLElement => !!t);
    const before = targets.map(t => t.textContent ?? '');
    if (name) for (const t of targets) t.textContent = name;
    ctx.data
      .setNickname(id, name ?? '')
      .then(r => {
        // Clearing returns the course's own name.
        const shown = name ?? (r as { name?: string } | undefined)?.name;
        if (shown) for (const t of cardsOf(id).map(titleTarget)) if (t) t.textContent = shown;
      })
      .catch(e => {
        targets.forEach((t, i) => (t.textContent = before[i] ?? t.textContent));
        showToast(refused(e) ? { message: "This school doesn't allow course nicknames" } : { message: "Couldn't save the name to Canvas", action: { label: 'Retry', run: () => rename(id, name) } });
      });
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cardElOf = (id: string) => visibleOrder().find(c => c.courseId === id)?.el ?? null;

  /** Show an order: CSS `order` only, with the other cards gliding (180 ms) to their new places. */
  function applyOrder(next: string[]) {
    const els = visibleOrder();
    const from = new Map(els.map(c => [c.el, c.el.getBoundingClientRect()]));
    desired = next;
    renderStyle();
    if (reduced.matches) return;
    const moved: HTMLElement[] = [];
    for (const { el } of els) {
      const a = from.get(el)!, b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) continue;
      el.style.setProperty('transition', 'none');
      el.style.setProperty('transform', `translate(${dx}px, ${dy}px)`);
      moved.push(el);
    }
    if (!moved.length) return;
    void document.body.offsetWidth; // commit the inverted positions
    for (const el of moved) {
      el.style.setProperty('transition', 'transform 180ms var(--b2c-ease-out, ease)');
      el.style.removeProperty('transform');
    }
    setTimeout(() => {
      for (const el of moved) if (!el.style.transform) el.style.removeProperty('transition');
    }, 220);
  }

  /** Write an order to Canvas; roll the view back if Canvas refuses. */
  function persistOrder(next: string[], before: string[] | null, retry: () => void) {
    const positions: Record<string, number> = {};
    next.forEach((cid, k) => (positions[`course_${cid}`] = k));
    ctx.data
      .setDashboardPositions(positions)
      .then(() => ctx.set({ 'card-customization.order': { ids: next, at: Date.now() } }))
      .catch(e => {
        if (desired === next) {
          if (before) applyOrder(before);
          else {
            desired = null;
            renderStyle();
          }
        }
        showToast(refused(e) ? { message: "This school doesn't allow reordering cards" } : { message: "Couldn't save the order to Canvas", action: { label: 'Retry', run: retry } });
      });
  }

  function move(id: string, to: MoveTo) {
    const before = desired;
    const current = visibleOrder().map(c => c.courseId);
    const next = moveId(current, id, to);
    if (!next) return;
    // Visual only: CSS order on Canvas's card wrappers. Canvas's React DOM is
    // never reordered, so its re-renders can't make a card jump back.
    applyOrder(next);
    persistOrder(next, before, () => move(id, to));
  }

  const dragHost: DragHost = {
    order: () => visibleOrder().map(c => c.courseId),
    cardEl: cardElOf,
    apply: ids => applyOrder(ids),
    commit: (next, before) => persistOrder(next, before, () => persistOrder(next, before, () => {})),
  };

  function unfavorite(id: string) {
    const label = nameOf(id);
    unfavorited.add(id);
    renderStyle();
    const restore = () => {
      unfavorited.delete(id);
      renderStyle();
    };
    ctx.api
      .del(`/users/self/favorites/courses/${encodeURIComponent(id)}`)
      .then(() =>
        showToast({
          message: `${label} removed from the dashboard`,
          announce: `${label} unfavorited. Undo available.`,
          action: {
            label: 'Undo',
            undo: true,
            run: () => {
              restore();
              ctx.api.post(`/users/self/favorites/courses/${encodeURIComponent(id)}`).catch(() => showToast({ message: "Couldn't favorite it again in Canvas" }));
            },
          },
        }),
      )
      .catch(e => {
        restore();
        showToast(refused(e) ? { message: "This school doesn't allow changing favorites" } : { message: "Couldn't unfavorite in Canvas", action: { label: 'Retry', run: () => unfavorite(id) } });
      });
  }

  function hide(id: string) {
    const label = nameOf(id);
    edit(id, c => ({ ...c, hidden: true, label }));
    showToast({
      message: `${label} hidden`,
      announce: `${label} hidden. Undo available.`,
      action: { label: 'Undo', undo: true, run: () => edit(id, c => ({ ...c, hidden: undefined })) },
    });
  }

  // ── one ⋮ per card, plus b²c-local decorations ──
  const offCards = ctx.dom.each(SEL.card, el => {
    const courseId = cardCourseId(el);
    const header = el.querySelector(SEL.header);
    if (!courseId || !header) return;
    const d = new CardDecor(el, courseId);
    d.apply(cards[courseId], renameLocal());
    decors.add(d);

    const { host, root } = widgetHost('card-kebab', BUTTON_CSS);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = KEBAB;
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', `Card options for ${d.name()}`);
    btn.title = 'Card options';
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.getAttribute('aria-expanded') === 'true') {
        closeCardMenu();
        return;
      }
      btn.setAttribute('aria-expanded', 'true');
      const order = visibleOrder();
      new CardMenu(
        btn,
        {
          courseId,
          name: d.name(),
          color: cardColor(el),
          custom: cards[courseId] ?? {},
          renameLocal: renameLocal(),
          index: order.findIndex(c => c.el === el),
          count: order.length,
          setColor: hex => setColor(courseId, hex),
          rename: v => rename(courseId, v),
          move: to => move(courseId, to),
          hide: () => hide(courseId),
          unfavorite: () => unfavorite(courseId),
          setImage: v => edit(courseId, c => ({ ...c, image: v })),
          code: d.code(),
          setCode: v => edit(courseId, c => ({ ...c, code: v })),
          setLinks: v => edit(courseId, c => ({ ...c, links: v })),
          openSettings: () => openSettings('card-customization'),
        },
        () => btn.setAttribute('aria-expanded', 'false'),
      );
    });
    root.appendChild(btn);
    header.appendChild(host);
    const hero = el.querySelector<HTMLElement>(`${SEL.image}, ${SEL.hero}`);
    const offDrag = hero && el instanceof HTMLElement ? attachDrag(el, courseId, hero, dragHost) : () => {};
    // Only now that our ⋮ is in place does Canvas's own one get hidden.
    el.setAttribute(CARD_ATTR, '');
    return () => {
      offDrag();
      el.removeAttribute(CARD_ATTR);
      host.remove();
      d.destroy();
      decors.delete(d);
    };
  });

  // ── "Hidden cards (n)" after the grid ──
  const offHidden = ctx.dom.each(SEL.boxContainer, container => {
    const { host, root } = widgetHost('card-hidden', HIDDEN_CSS);
    let expanded = false;
    const render = () => {
      const hidden = Object.entries(cards).filter(([, c]) => c.hidden);
      host.hidden = hidden.length === 0;
      root.querySelectorAll('button, ul').forEach(n => n.remove());
      if (!hidden.length) return;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = `Hidden cards (${hidden.length})`;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.addEventListener('click', () => {
        expanded = !expanded;
        render();
        (root.querySelector('button') as HTMLElement | null)?.focus();
      });
      root.appendChild(toggle);
      if (!expanded) return;
      const ul = document.createElement('ul');
      for (const [id, c] of hidden) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = c.label ?? `Course ${id}`;
        const un = document.createElement('button');
        un.type = 'button';
        un.textContent = 'Unhide';
        un.setAttribute('aria-label', `Unhide ${c.label ?? 'course ' + id}`);
        un.addEventListener('click', () => edit(id, x => ({ ...x, hidden: undefined })));
        li.append(name, un);
        ul.appendChild(li);
      }
      root.appendChild(ul);
    };
    render();
    container.after(host);
    const entry = { host, render };
    hiddenLists.add(entry);
    return () => {
      host.remove();
      hiddenLists.delete(entry);
    };
  });

  return {
    update(next) {
      s = next;
      cards = s.cards;
      refresh();
    },
    stop() {
      closeCardMenu();
      closeGoal?.();
      offGoalItem();
      try {
        chrome.storage.onChanged.removeListener(onGoals);
      } catch {
        /* orphaned */
      }
      offCards();
      offHidden();
      for (const d of decors) d.destroy();
      decors.clear();
      style.remove();
      hideToast();
      releaseToast();
    },
  };
}
