// The b²c to-do panel (design/spec/surfaces/better-todo.md): To do grouped by
// day, a Done view, Announcements, add-your-own items, a row menu, hover
// preview and a keyboard map. Rendered with Preact into the widget's shadow
// root; keyed rows, so data refreshes update in place.

import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { dayIndex, isoDay, shortDate } from './format.ts';
import { groupByDay, isDoneToday, type Row } from './logic.ts';
import { DoneGroup, Icon, ItemRow, Skeleton } from './rows.tsx';
import type { PanelProps, ViewProps, Where } from './types.ts';
import { actionAttr } from '../../core/agent/anchors.ts';
import { RingIcon } from './views/ring-icon.tsx';
import { RANGE_LABEL, spanOf, VIEW_LABEL, VIEW_NAME, VIEWS, type RangeId, type ViewId } from './views/model.ts';

export type { CourseOpt, PanelProps } from './types.ts';

// ── menu ────────────────────────────────────────────────────────────────────
interface MenuItem { label: string; run(): void; danger?: boolean; /** CONTRACT.md §3 verb when it changes state. */ action?: string }

function Menu({ anchor, items, onClose, agent }: { anchor: HTMLElement; items: MenuItem[]; onClose(refocus: boolean): void; agent: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closed = useRef(false);
  const close = (refocus: boolean) => {
    if (closed.current) return;
    closed.current = true;
    onClose(refocus);
  };
  useLayoutEffect(() => {
    const el = ref.current!;
    el.showPopover();
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.round(Math.max(8, Math.min(r.right - w, innerWidth - w - 8)))}px`;
    el.style.top = `${Math.round(r.bottom + h + 4 > innerHeight ? r.top - h - 4 : r.bottom + 4)}px`;
    el.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const onToggle = (e: Event) => (e as ToggleEvent).newState === 'closed' && close(false);
    el.addEventListener('toggle', onToggle);
    return () => el.removeEventListener('toggle', onToggle);
  }, []);
  const onKey = (e: KeyboardEvent) => {
    const all = Array.from(ref.current!.querySelectorAll<HTMLElement>('[role=menuitem]'));
    const i = all.indexOf(e.target as HTMLElement);
    const go = (j: number) => all[(j + all.length) % all.length]?.focus();
    if (e.key === 'ArrowDown' || e.key === 'j') go(i + 1);
    else if (e.key === 'ArrowUp' || e.key === 'k') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Escape') close(true);
    else if (e.key === 'Tab') close(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div ref={ref} class="menu" popover="auto" role="menu" onKeyDown={onKey}>
      {items.map(m => (
        <button
          type="button"
          role="menuitem"
          {...(agent && m.action ? actionAttr(m.action) : undefined)}
          tabIndex={-1}
          class={m.danger ? 'danger' : undefined}
          onClick={() => {
            // Hide first: the popover's own focus restoration runs now, not
            // later over whatever the action focuses (the label input).
            try {
              ref.current?.hidePopover();
            } catch {
              /* already hidden */
            }
            close(true);
            m.run();
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ── add form ────────────────────────────────────────────────────────────────
function AddForm({ p, close }: { p: PanelProps; close(): void }) {
  const title = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ title: '', courseId: '', date: isoDay(p.now, p.fmt.tz), time: '23:59' });
  useLayoutEffect(() => title.current?.focus(), []);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!v.title.trim() || busy) return;
    setBusy(true);
    const ok = await p.on.add({ title: v.title.trim(), courseId: v.courseId || null, date: v.date, time: v.time || '23:59' });
    setBusy(false);
    if (ok) close();
  };
  return (
    <form
      class="add"
      onSubmit={submit}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
    >
      <input ref={title} class="add-title" placeholder="New to-do" aria-label="Title" maxLength={255} value={v.title} onInput={e => setV({ ...v, title: (e.currentTarget as HTMLInputElement).value })} />
      <div class="add-row">
        <select aria-label="Course" value={v.courseId} onChange={e => setV({ ...v, courseId: (e.currentTarget as HTMLSelectElement).value })}>
          <option value="">Personal</option>
          {p.courses.map(c => (
            <option value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div class="add-row">
        <input type="date" aria-label="Due date" value={v.date} required onInput={e => setV({ ...v, date: (e.currentTarget as HTMLInputElement).value })} />
        <input type="time" aria-label="Time" value={v.time} onInput={e => setV({ ...v, time: (e.currentTarget as HTMLInputElement).value })} />
      </div>
      <div class="add-row end">
        <span class="hint">{p.sync ? 'Saved to your Canvas planner' : 'Saved in b²c only'}</span>
        <button type="button" class="btn" onClick={close}>
          Cancel
        </button>
        <button type="submit" class="btn primary" disabled={!v.title.trim() || busy} {...(p.agent ? actionAttr('add-item') : undefined)}>
          Add
        </button>
      </div>
    </form>
  );
}

// ── sections ────────────────────────────────────────────────────────────────
function Section(props: { id: string; title: string; count?: ComponentChildren; collapsed?: boolean; onCollapse(v: boolean): void; tools?: ComponentChildren; note?: ComponentChildren; children: ComponentChildren }) {
  const { id, collapsed } = props;
  return (
    <section class={`section${collapsed ? ' collapsed' : ''}`} aria-labelledby={`h-${id}`}>
      <header class="sec-h">
        <button type="button" class="collapse" aria-expanded={!collapsed} aria-controls={`b-${id}`} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${props.title}`} onClick={() => props.onCollapse(!collapsed)}>
          <Icon name="chevron" />
        </button>
        <h2 id={`h-${id}`}>{props.title}</h2>
        {props.count !== undefined && props.count !== null && <span class="count">· {props.count}</span>}
        <span class="tools">{props.tools}</span>
      </header>
      {props.note}
      <div id={`b-${id}`} class="sec-b" hidden={collapsed}>
        {props.children}
      </div>
    </section>
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type !== 'checkbox'));

export function Panel(p: PanelProps) {
  // `seg` is the header's To do | Done; `p.view` is the to-do view (list, ring, …).
  const [view, setView] = useState<'todo' | 'done'>('todo');
  const [weekOffset, setWeekOffset] = useState(0);
  const [shown, setShown] = useState({ todo: p.count, done: p.count, ann: p.count });
  const [adding, setAdding] = useState(false);
  const [editing, setEditingKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ r: Row; el: HTMLElement } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const lastIndex = useRef(0);

  useEffect(() => setShown({ todo: p.count, done: p.count, ann: p.count }), [p.count]);

  const rowEls = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('li[data-key]') ?? []);
  const focusRow = (el: HTMLElement | undefined) => {
    if (!el) return;
    setActive(el.dataset.key ?? null);
    el.focus();
  };
  const setEditing = (k: string | null, refocus = false) => {
    const was = editing;
    setEditingKey(k);
    if (k === null && refocus && was) requestAnimationFrame(() => focusRow(rowEls().find(e => e.dataset.key === was)));
  };

  // A focused row that leaves the list (ticked, removed): focus its neighbour.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = rowEls();
    const shadow = root.getRootNode() as ShadowRoot;
    const focused = shadow.activeElement;
    const i = active ? els.findIndex(e => e.dataset.key === active) : -1;
    if (i >= 0) lastIndex.current = i;
    else if (active && (!focused || focused === shadow.host || !root.contains(focused))) {
      const next = els[Math.min(lastIndex.current, els.length - 1)];
      if (next && document.activeElement === shadow.host) focusRow(next);
      else setActive(next?.dataset.key ?? null);
    }
  });

  const rowByKey = (k: string | undefined) => {
    if (!k || !p.lists) return null;
    const { todo, done, announcements } = p.lists;
    return todo.find(r => r.key === k) ?? done.find(r => r.key === k) ?? announcements.find(r => r.key === k) ?? null;
  };

  const openMenu = (r: Row, el: HTMLElement) => {
    p.on.closePreview();
    setMenu(m => (m?.r.key === r.key ? null : { r, el }));
  };
  const menuItems = (r: Row): MenuItem[] => {
    const ann = r.type === 'announcement';
    const own = r.source !== 'canvas' || r.type === 'planner_note';
    const items: MenuItem[] = [];
    if (!ann && r.markedDone) items.push({ label: 'Mark not done', action: 'mark-undone', run: () => p.on.toggleDone(r) });
    if (r.removed) items.push({ label: 'Restore', action: 'restore', run: () => p.on.toggleRemoved(r) });
    else if (!own || ann) items.push({ label: 'Remove from list', action: 'dismiss', run: () => p.on.toggleRemoved(r) });
    if (!ann) items.push({ label: p.labels[r.key]?.text ? 'Edit label…' : 'Label…', action: 'set-label', run: () => setEditing(r.key) });
    if (!ann && p.labels[r.key]?.text) items.push({ label: 'Clear label', action: 'clear-label', run: () => p.on.setLabel(r, '') });
    if (r.url) items.push({ label: 'Open in new tab', run: () => window.open(new URL(r.url!, location.origin).href, '_blank', 'noopener') });
    if (own && !ann) items.push({ label: 'Delete', action: 'delete-item', danger: true, run: () => p.on.remove(r) });
    return items;
  };

  const startAdd = () => {
    if (p.collapsed.todo) p.on.collapse('todo', false);
    setView('todo');
    setAdding(true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || isTyping(e.target) || e.altKey) return;
    if ((e.metaKey || e.ctrlKey) && !(e.key.toLowerCase() === 'z' && !e.shiftKey)) return;
    const li = (e.target as HTMLElement).closest?.('li[data-key]') as HTMLElement | null;
    const r = rowByKey(li?.dataset.key);
    const els = rowEls();
    const i = li ? els.indexOf(li) : -1;
    const k = e.key;
    let handled = true;
    if (k === 'j' || k === 'ArrowDown') focusRow(els[i < 0 ? 0 : Math.min(i + 1, els.length - 1)]);
    else if (k === 'k' || k === 'ArrowUp') focusRow(els[i < 0 ? 0 : Math.max(i - 1, 0)]);
    else if (k === 'z' || k === 'Z') p.on.undo();
    else if (k === 'n') startAdd();
    else if (k === 'd') setView(v => (v === 'todo' ? 'done' : 'todo'));
    else if (!r || e.target !== li) handled = false;
    else if (k === 'Enter') {
      const a = li!.querySelector<HTMLAnchorElement>('a.title');
      if (a) a.click();
      else p.on.preview(r.key);
    } else if (k === 'x' && r.type !== 'announcement' && !(r.submitted && !r.markedDone)) p.on.toggleDone(r);
    else if (k === '.') openMenu(r, li!.querySelector<HTMLElement>('.more') ?? li!);
    else if (k === ' ') p.on.preview(r.key);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const lists = p.lists;
  const todoRows = lists?.todo ?? [];
  const doneRows = lists?.done ?? [];
  const limit = view === 'todo' ? shown.todo : shown.done;
  const day = (d: Date) => dayIndex(d, p.fmt.tz);
  const today = day(p.now);
  // List: Done today · N at the foot holds the complete rows the list hid
  // (ticked on an earlier load); rows ticked this session stay in place.
  const doneToday = lists ? lists.all.filter(r => isDoneToday(r, p.now, day) && !todoRows.includes(r)) : [];
  const visibleTodo = todoRows.slice(0, shown.todo);
  const groups = groupByDay(visibleTodo, p.now, day);
  const overdueN = todoRows.filter(r => r.overdue).length;
  const openN = todoRows.filter(r => !r.complete).length;
  const tabKey = (() => {
    const keys = rowEls().map(e => e.dataset.key);
    return active && keys.includes(active) ? active : (keys[0] ?? null);
  })();
  const rowProps = (r: Row, where: Where) => ({
    key: r.key,
    r,
    p,
    where,
    editing: editing === r.key,
    tabbable: r.key === (tabKey ?? (view === 'todo' ? todoRows[0]?.key : doneRows[0]?.key)),
    settling: p.settling.has(r.key),
    setEditing,
    openMenu,
    menuOpenFor: menu?.r.key ?? null,
  });
  const row = (r: Row, where: Where): VNode => <ItemRow {...rowProps(r, where)} />;

  /** "Mon 19" (or "Monday 19") for a day number; noon UTC of that day names it in any zone. */
  const dayName = (d: number, style: 'short' | 'long' = 'short') => {
    const parts = new Intl.DateTimeFormat('en-US', { weekday: style, day: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(d * 86_400_000 + 43_200_000));
    const get = (t: string) => parts.find(x => x.type === t)?.value ?? '';
    return `${get('weekday')} ${get('day')}`;
  };
  const span = spanOf(p.view === 'week' ? 'week' : p.range, today, p.view === 'week' ? weekOffset : 0, d => shortDate(new Date(d * 86_400_000 + 12 * 3_600_000), p.now, { ...p.fmt, tz: 'UTC' }));

  const errorLine = p.error?.cached ? (
    <p class="warn" title={p.error.at ? `Last updated ${new Date(p.error.at).toLocaleString()}` : undefined}>
      <Icon name="warn" /> Couldn't refresh ·{' '}
      <button type="button" class="link" onClick={p.on.retry}>
        Retry
      </button>
    </p>
  ) : null;

  const listView = groups.length === 0 && !doneToday.length ? (
    <p class="empty">
      Nothing due in the next 4 weeks.{' '}
      <button type="button" class="link" onClick={() => setView('done')}>
        Show done
      </button>
    </p>
  ) : (
    <>
      {groups.map(g => (
        <div class="group" key={g.id}>
          <h3 class="gl" id={`g-${g.id}`}>
            {g.label}
            {g.id === 'overdue' ? ` · ${g.rows.filter(r => !r.complete).length}` : ''}
          </h3>
          <ul class="list" aria-labelledby={`g-${g.id}`}>
            {g.rows.map(r => row(r, { kind: 'todo', group: g.id }))}
          </ul>
        </div>
      ))}
      <DoneGroup id="today" label={`Done today · ${doneToday.length}`} rows={doneToday}>
        {r => row(r, { kind: 'done' })}
      </DoneGroup>
    </>
  );

  const Active = p.View;
  const body = !lists ? (
    p.error ? (
      <p class="empty">
        Couldn't load your to-do list from Canvas.{' '}
        <button type="button" class="link" onClick={p.on.retry}>
          Retry
        </button>
      </p>
    ) : (
      <Skeleton n={6} />
    )
  ) : view === 'done' ? (
    doneRows.length === 0 ? (
      <p class="empty">Nothing done in the past 2 weeks.</p>
    ) : (
      <ul class="list" aria-label="Done">
        {doneRows.slice(0, shown.done).map(r => row(r, { kind: 'done' }))}
      </ul>
    )
  ) : p.view === 'list' ? (
    listView
  ) : Active ? (
    <Active lists={lists} p={p} range={p.view === 'week' ? 'week' : p.range} span={span} day={day} dayName={dayName} row={row} />
  ) : (
    <Skeleton n={6} />
  );

  const list = view === 'todo' ? todoRows : doneRows;
  const showMore = lists && (view === 'done' || p.view === 'list') && list.length > limit;
  return (
    <div
      class="panel"
      ref={rootRef}
      data-view={p.view}
      onKeyDown={onKeyDown}
      onFocusIn={e => {
        const li = (e.target as HTMLElement).closest?.('li[data-key]') as HTMLElement | null;
        if (li?.dataset.key && li.dataset.key !== active) setActive(li.dataset.key);
      }}
    >
      <Section
        id="todo"
        title="To do"
        count={lists ? <>{openN}{p.collapsed.todo && overdueN ? <span class="count-od"> ({overdueN} overdue)</span> : null}</> : undefined}
        collapsed={p.collapsed.todo}
        onCollapse={v => p.on.collapse('todo', v)}
        note={errorLine}
        tools={
          <>
            <span class="seg" role="group" aria-label="Show">
              <button type="button" aria-pressed={view === 'todo'} onClick={() => setView('todo')}>
                To do
              </button>
              <button type="button" aria-pressed={view === 'done'} onClick={() => setView('done')}>
                Done
              </button>
            </span>
            <button ref={addBtn} type="button" class="icon-btn" aria-label="Add to-do" aria-keyshortcuts="n" aria-expanded={adding} onClick={() => (adding ? setAdding(false) : startAdd())}>
              <Icon name="add" />
            </button>
            <button type="button" class="icon-btn gear" aria-label="To-do settings" title="To-do settings" onClick={p.on.openSettings}>
              <Icon name="gear" />
            </button>
          </>
        }
      >
        {view === 'todo' && <ViewBar p={p} label={span.label} weekOffset={weekOffset} setWeekOffset={setWeekOffset} />}
        {adding && (
          <AddForm
            p={p}
            close={() => {
              setAdding(false);
              addBtn.current?.focus();
            }}
          />
        )}
        {body}
        {showMore && (
          <button type="button" class="show-more" onClick={() => setShown(s => ({ ...s, [view]: limit + p.count }))}>
            Show {Math.min(p.count, list.length - limit)} more
          </button>
        )}
      </Section>

      {p.showAnnouncements && (
        <Section
          id="ann"
          title="Announcements"
          count={lists ? lists.announcements.filter(a => a.unread).length || undefined : undefined}
          collapsed={p.collapsed.announcements}
          onCollapse={v => p.on.collapse('announcements', v)}
        >
          {!lists ? (
            p.error ? null : <Skeleton n={2} />
          ) : lists.announcements.length === 0 ? (
            <p class="empty">No announcements in the past week.</p>
          ) : (
            <ul class="list" aria-label="Announcements">
              {lists.announcements.slice(0, shown.ann).map(r => row(r, { kind: 'ann' }))}
            </ul>
          )}
          {lists && lists.announcements.length > shown.ann && (
            <button type="button" class="show-more" onClick={() => setShown(s => ({ ...s, ann: s.ann + p.count }))}>
              Show {Math.min(p.count, lists.announcements.length - shown.ann)} more
            </button>
          )}
        </Section>
      )}

      {menu && (
        <Menu
          key={menu.r.key}
          agent={p.agent}
          anchor={menu.el}
          items={menuItems(menu.r)}
          onClose={refocus => {
            const li = menu.el.closest<HTMLElement>('li[data-key]');
            setMenu(null);
            if (refocus) focusRow(li ?? undefined);
          }}
        />
      )}
    </div>
  );
}

// ── view bar (todo-views.md "The view control") ────────────────────────────
const viewIcon: Record<ViewId, string> = {
  list: 'M2.5 4h1M6 4h7.5M2.5 8h1M6 8h7.5M2.5 12h1M6 12h7.5',
  ring: '', // drawn by RingIcon (views/ring-icon.tsx): round, it depicts its data
  week: 'M2 4h12M2 7.5h2M5.5 7.5h2M9 7.5h2M12.5 7.5h1.5M2 11h2M5.5 11h2',
  courses: 'M2 3.5h9M2 6.5h12M2 9.5h7M2 12.5h11',
};

function ViewBar({ p, label, weekOffset, setWeekOffset }: { p: PanelProps; label: string; weekOffset: number; setWeekOffset(n: number): void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const i = VIEWS.indexOf(p.view);
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % VIEWS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + VIEWS.length - 1) % VIEWS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = VIEWS.length - 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    p.on.setView(VIEWS[j]!);
    requestAnimationFrame(() => refs.current[j]?.focus());
  };
  return (
    <div class="viewbar">
      <span class="vb-seg" role="radiogroup" aria-label="To-do view" onKeyDown={onKey}>
        {VIEWS.map((v, i) => (
          <button
            ref={el => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            {...(p.agent ? actionAttr('set-view') : undefined)}
            aria-checked={p.view === v}
            tabIndex={p.view === v ? 0 : -1}
            aria-label={VIEW_LABEL[v]}
            title={VIEW_LABEL[v]}
            onClick={() => p.on.setView(v)}
          >
            {v === 'ring' ? (
              <RingIcon />
            ) : (
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d={viewIcon[v]} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" />
              </svg>
            )}
            {p.view === v && <span class="vb-name">{VIEW_NAME[v]}</span>}
          </button>
        ))}
      </span>
      <span class="vb-ctl">
        {p.view === 'week' ? (
          <span class="vb-week">
            <button type="button" class="icon-btn" aria-label="Previous week" disabled={weekOffset <= -2} onClick={() => setWeekOffset(weekOffset - 1)}>
              <Icon name="prev" />
            </button>
            <span class="vb-label" aria-live="polite">{label}</span>
            <button type="button" class="icon-btn" aria-label="Next week" disabled={weekOffset >= 3} onClick={() => setWeekOffset(weekOffset + 1)}>
              <Icon name="next" />
            </button>
          </span>
        ) : p.view === 'ring' || p.view === 'courses' ? (
          <select class="vb-range" aria-label="Range" {...(p.agent ? actionAttr('set-range') : undefined)} value={p.range} onChange={e => p.on.setRange((e.currentTarget as HTMLSelectElement).value as RangeId)}>
            {(Object.keys(RANGE_LABEL) as RangeId[]).map(r => (
              <option value={r}>{RANGE_LABEL[r]}</option>
            ))}
          </select>
        ) : null}
      </span>
    </div>
  );
}
