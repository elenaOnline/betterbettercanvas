// The "Due" list on one card. A standalone, remountable widget: it knows
// nothing about Canvas's card DOM except the element it is given to live in.

import { widgetHost } from '../../core/dom.ts';
import { actionAttr, anchorAttrs, clearAttrs, marksReadFor, regionAttr, setAttrs } from '../../core/agent/anchors.ts';
import { dueOf as agentDueOf, stateOf } from '../../core/agent/model.ts';
import { isoInZone, validZone } from '../../core/agent/time.ts';
import { a11yDue, dueInfo, fullDate, isLocal, TYPE_LABEL, type DateOpts, type Picked, type Row } from './logic.ts';

export const ROW_H = 28;
export const HEAD_H = 30;
export const PAD_B = 8;

const STYLE = `
:host { all: initial; display: block; box-sizing: border-box; font-family: inherit; color: var(--b2c-w-text, #2d3b45);
  font-size: 14px; line-height: 20px; contain: layout paint; overflow: hidden; }
* { box-sizing: border-box; }
.head { display: flex; align-items: center; gap: 4px; height: ${HEAD_H}px; padding: 6px 12px 0; font-size: 12px; font-weight: 600;
  color: var(--b2c-w-text-secondary, #6b7780); border-top: 1px solid var(--b2c-w-border, #c7cdd1); }
.head .n { font-weight: 400; }
.head .warn { margin-left: auto; font-weight: 400; color: var(--b2c-w-text-secondary, #6b7780); }
ul { list-style: none; margin: 0; padding: 0; }
li { position: relative; display: flex; align-items: center; height: ${ROW_H}px; padding: 0 12px 0 4px; gap: 2px; overflow: hidden;
  transition: height var(--b2c-dur-slow, 280ms) var(--b2c-ease-out, ease), opacity var(--b2c-dur-slow, 280ms); }
li.gone { height: 0; opacity: 0; }
label.cb { flex: none; display: grid; place-items: center; width: 28px; height: 28px; cursor: pointer; }
input { width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: var(--b2c-w-link, #0374b5); }
input:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 2px; }
.t { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
a.t { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--b2c-w-link, #0374b5); text-decoration: none; }
a.t:hover { text-decoration: underline; }
a.t:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 1px; border-radius: var(--b2c-radius-sm, 2px); }
li.done .t, li.submitted .t { color: var(--b2c-w-text-secondary, #6b7780); }
li.done .t, li.done .d { text-decoration: line-through; }
li.done .d { font-weight: 400; color: var(--b2c-w-text-secondary, #6b7780); }
.d { flex: none; margin-left: 8px; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--b2c-w-text-secondary, #6b7780); white-space: nowrap; }
li.overdue .d { color: var(--b2c-w-danger, #e0061f); }
.d.soon { font-weight: 600; color: var(--b2c-w-text, #2d3b45); }
li.next { height: ${ROW_H * 2}px; align-items: flex-start; padding-top: 4px; }
li.next .stack { flex: 1 1 auto; min-width: 0; display: grid; }
li.next .stack .d { margin-left: 0; }
li.count { padding-left: 12px; gap: 6px; font-size: 13px; color: var(--b2c-w-text-secondary, #6b7780); font-variant-numeric: tabular-nums; }
li.count b { color: var(--b2c-w-text, #2d3b45); }
li.count .od b { font-weight: 700; } /* tonal: the danger hue stays on the rows' due text */
.chip { flex: none; margin-left: 8px; font-size: 12px; line-height: 18px; padding: 0 6px; border-radius: var(--b2c-radius-sm, 2px); background: transparent;
  border: 1px solid var(--b2c-w-border, #c7cdd1); color: var(--b2c-w-text-secondary, #6b7780); }
::slotted(*) { flex: none; white-space: nowrap; margin-left: 6px; }
li.msg { padding-left: 12px; color: var(--b2c-w-text-secondary, #6b7780); font-size: 13px; }
li.more { padding-left: 12px; font-size: 13px; }
li.more a { color: var(--b2c-w-link, #0374b5); text-decoration: none; }
li.more a:hover { text-decoration: underline; }
.sk { height: 10px; border-radius: var(--b2c-radius-sm, 2px); background: var(--b2c-w-surface, #eef0f2); animation: pulse 1.6s ease-in-out infinite; }
.sk.a { width: 60%; margin-left: 8px; } .sk.b { width: 22%; margin-left: auto; }
@keyframes pulse { 50% { opacity: .5; } }
@media (prefers-reduced-motion: reduce) { li { transition: none; } .sk { animation: none; } }
`;

export interface DueState {
  status: 'loading' | 'ok' | 'error' | 'unavailable';
  /** Fresh fetch failed but cached data is shown. */
  stale: boolean;
  lastOk: number | null;
  picked: Picked;
  count: number;
  /** rice.md views.cards */
  view: 'rows' | 'next' | 'count';
  counts: { overdue: number; week: number; total: number };
  dates: DateOpts;
  now: Date;
  courseId: string;
  /** The course's code as the card shows it, for accessible names ("MATH 301"). */
  courseLabel: string;
  /** agentkit/CONTRACT.md §3 anchors: only while html[data-b2c-agent] is present. */
  agent: boolean;
}

export interface DueHandlers {
  tick(row: Row, li: HTMLElement): void;
  untick(row: Row): void;
}

export class DueWidget {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private head: HTMLElement;
  private list: HTMLUListElement;
  private slots = new Map<string, HTMLSpanElement>();
  /** The course code shown on the card (accessible names). */
  courseLabel = '';

  constructor(readonly courseId: string, private h: DueHandlers) {
    const w = widgetHost('card-due', STYLE);
    this.host = w.host;
    this.root = w.root;
    this.host.setAttribute('data-b2c-course', courseId);
    this.head = document.createElement('div');
    this.head.className = 'head';
    this.list = document.createElement('ul');
    const sec = document.createElement('section');
    sec.setAttribute('aria-label', 'Due');
    sec.append(this.head, this.list);
    this.root.appendChild(sec);
  }

  render(s: DueState): void {
    if (s.agent) setAttrs(this.host, regionAttr('card-due'));
    else clearAttrs(this.host);
    // Keep keyboard focus on the same row across re-renders.
    const focusedKey = (this.root.activeElement as HTMLElement | null)?.closest('li')?.dataset.key;
    const focusedPart = (this.root.activeElement as HTMLElement | null)?.tagName;

    this.head.replaceChildren();
    const h = document.createElement('span');
    h.textContent = 'Due';
    this.head.appendChild(h);
    if (s.status !== 'loading' && s.picked.total > 0) {
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = `· ${s.picked.total}`;
      this.head.appendChild(n);
    }
    if (s.stale) {
      const w = document.createElement('span');
      w.className = 'warn';
      w.textContent = "⚠ Couldn't refresh";
      if (s.lastOk) w.title = `Last updated ${new Date(s.lastOk).toLocaleString()}`;
      this.head.appendChild(w);
    }

    const lis: HTMLElement[] = [];
    const keep = new Set<string>();
    const shownRows = s.status === 'ok' ? (s.view === 'rows' ? s.picked.rows : s.view === 'next' ? s.picked.rows.slice(0, 1) : []) : [];
    if (s.status === 'loading') {
      for (let i = 0; i < (s.view === 'rows' ? s.count : 1); i++) {
        const li = document.createElement('li');
        li.setAttribute('aria-hidden', 'true');
        li.innerHTML = '<span class="sk a"></span><span class="sk b"></span>';
        lis.push(li);
      }
    } else if (s.status === 'unavailable') {
      lis.push(msg("This school has turned off Canvas's planner"));
    } else if (s.status === 'error') {
      lis.push(msg("Couldn't load due items"));
    } else if (s.view === 'count') {
      lis.push(countLine(s.counts));
    } else if (s.picked.rows.length === 0) {
      lis.push(msg(s.view === 'next' ? 'Nothing due soon' : 'Nothing due in the next 4 weeks'));
    } else if (s.view === 'next') {
      const row = s.picked.rows[0]!;
      keep.add(row.key);
      lis.push(this.row(row, 0, s, true));
    } else {
      s.picked.rows.forEach((row, i) => {
        keep.add(row.key);
        lis.push(this.row(row, i, s));
      });
      if (s.picked.more > 0) {
        const li = document.createElement('li');
        li.className = 'more';
        const a = document.createElement('a');
        a.href = `/courses/${encodeURIComponent(s.courseId)}/assignments`;
        a.textContent = `+${s.picked.more} more`;
        li.appendChild(a);
        lis.push(li);
      }
    }
    this.list.replaceChildren(...lis);

    // Light-DOM hooks: keep the ones still shown, drop the rest (see anchors.ts).
    for (const [k, span] of this.slots) {
      if (!keep.has(k)) {
        span.remove();
        this.slots.delete(k);
      }
    }
    shownRows.forEach((row, i) => {
      const span = this.slots.get(row.key)!;
      span.slot = `b2c-impact-${i}`;
      if (span.parentNode !== this.host) this.host.appendChild(span);
    });

    if (focusedKey) {
      const li = this.list.querySelector<HTMLElement>(`li[data-key="${CSS.escape(focusedKey)}"]`);
      (li?.querySelector<HTMLElement>(focusedPart === 'A' ? 'a' : 'input') ?? null)?.focus();
    }
  }

  private row(row: Row, i: number, s: DueState, next = false): HTMLElement {
    const li = document.createElement('li');
    li.dataset.key = row.key;
    if (next) li.classList.add('next');
    if (row.overdue) li.classList.add('overdue');
    if (row.completed) li.classList.add('submitted');
    if (row.done) li.classList.add('done');
    const title = row.item.plannable.title;
    const type = TYPE_LABEL[row.item.plannable_type] ?? 'To do';
    // Planner notes and local items have no Canvas page to open.
    const linkable = row.item.plannable_type !== 'planner_note' && !isLocal(row.item) && !!row.item.html_url;

    const label = document.createElement('label');
    label.className = 'cb';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = row.done;
    cb.setAttribute('aria-label', row.done ? `Mark ${title} not done` : `Mark ${title} done`);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        // Struck through in the same frame; it stays crossed for this page.
        li.classList.add('done');
        this.h.tick(row, li);
      } else {
        li.classList.remove('done');
        this.h.untick(row);
      }
    });
    label.appendChild(cb);

    const a = document.createElement(linkable ? 'a' : 'span');
    a.className = 't';
    if (a instanceof HTMLAnchorElement) a.href = row.item.html_url;
    a.textContent = title;
    a.title = title;
    // Title, course and due in one name (§3), so accessibility-tree readers get the facts.
    const name = `${type}: ${title}, ${s.courseLabel}, ${a11yDue(row.due, s.dates)}${row.done ? ', done' : row.overdue ? ', overdue' : ''}`;
    a.setAttribute('aria-label', name);
    li.setAttribute('aria-label', name);
    if (s.agent) {
      const tz = validZone(s.dates.timeZone);
      setAttrs(li, anchorAttrs({
        id: row.key,
        courseId: this.courseId,
        due: isoInZone(agentDueOf(row.item), tz),
        state: stateOf(row.item, s.now.getTime()),
      }));
      setAttrs(cb, actionAttr(row.done ? 'mark-undone' : 'mark-done'));
      // Discussions and announcements the planner shows as read (new_activity false) change nothing when opened.
      const t = row.item.plannable_type;
      const known = t === 'discussion_topic' || t === 'announcement' ? { unread: row.item.new_activity } : {};
      if (a instanceof HTMLAnchorElement && marksReadFor(a.href, known)) a.setAttribute('data-b2c-marks-read', 'true');
    }

    let when: HTMLElement;
    if (row.completed) {
      when = document.createElement('span');
      when.className = 'chip';
      when.textContent = '✓ Submitted';
    } else {
      when = document.createElement('span');
      const info = dueInfo(row.due, s.now, s.dates);
      when.className = info.soon && !row.done ? 'd soon' : 'd';
      when.textContent = info.text;
      when.title = fullDate(row.due, s.dates);
    }
    if (next) {
      const stack = document.createElement('span');
      stack.className = 'stack';
      stack.append(a, when);
      li.append(label, stack);
    } else li.append(label, a, when);
    const slot = document.createElement('slot');
    slot.name = `b2c-impact-${i}`;
    li.appendChild(slot);

    if (!this.slots.has(row.key)) {
      const span = document.createElement('span');
      span.setAttribute('data-b2c-plannable', row.key);
      span.setAttribute('data-b2c-course', this.courseId);
      this.slots.set(row.key, span);
    }
    return li;
  }

  destroy(): void {
    this.host.remove();
    this.slots.clear();
  }
}

function countLine(c: { overdue: number; week: number; total: number }): HTMLElement {
  const li = document.createElement('li');
  li.className = 'count';
  const part = (n: number, label: string, cls = '') => {
    const s = document.createElement('span');
    if (cls) s.className = cls;
    const b = document.createElement('b');
    b.textContent = String(n);
    s.append(b, ` ${label}`);
    return s;
  };
  li.append(part(c.overdue, 'overdue', c.overdue ? 'od' : ''), '·', part(c.week, 'this week'), '·', part(c.total, 'total'));
  li.setAttribute('aria-label', `${c.overdue} overdue, ${c.week} due this week, ${c.total} in total`);
  return li;
}

function msg(text: string): HTMLElement {
  const li = document.createElement('li');
  li.className = 'msg';
  li.textContent = text;
  return li;
}
