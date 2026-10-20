// Row pieces shared by the list and every view: the two-line row (checkbox,
// title, label, course · due, ⋯), the skeleton, and the collapsed "N done"
// group. The views (lazy chunks) import these, so every view draws the same row.

import type { ComponentChildren } from 'preact';
import { actionAttr, anchorAttrs, marksReadFor } from '../../core/agent/anchors.ts';
import { dueOf, stateOf } from '../../core/agent/model.ts';
import { isoInZone, validZone } from '../../core/agent/time.ts';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { agoShort, dayText, shortDate, sinceText, timeText, untilText } from './format.ts';
import type { Row } from './logic.ts';
import type { PanelProps, Where } from './types.ts';

export const typeName: Record<string, string> = {
  assignment: 'Assignment', quiz: 'Quiz', discussion_topic: 'Discussion', announcement: 'Announcement',
  planner_note: 'To-do', wiki_page: 'Page', sub_assignment: 'Assignment',
};

// ── icons (line, 16 px, currentColor) ───────────────────────────────────────
const paths: Record<string, string> = {
  check: 'M3.5 8.5l3 3 6-7',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  add: 'M8 3v10M3 8h10',
  chevron: 'M4 6l4 4 4-4',
  warn: 'M8 2l6.5 11.5h-13zM8 6.5v3.5M8 12h.01',
  prev: 'M10 3.5L5.5 8l4.5 4.5',
  next: 'M6 3.5l4.5 4.5L6 12.5',
  // A square-toothed gear: the surface ⚙ that opens Settings → To-do.
  gear: 'M6.5 1.5h3v2l1.5.9 1.7-1 1.5 2.6-1.7 1v1.9l1.7 1-1.5 2.6-1.7-1-1.5.9v2h-3v-2L5 12.5l-1.7 1-1.5-2.6 1.7-1V8L1.8 7l1.5-2.6 1.7 1 1.5-.9zM6.5 6.5h3v3h-3z',
};
export const Icon = ({ name }: { name: string }) => (
  <svg class={`icon icon-${name}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d={paths[name]} fill="none" stroke="currentColor" stroke-width={name === 'more' ? 2.4 : name === 'gear' ? 1.2 : 1.4} stroke-linecap="square" stroke-linejoin="miter" />
  </svg>
);

// ── rows ────────────────────────────────────────────────────────────────────
export function dueText(r: Row, where: Where, p: PanelProps): { text: string; cls?: string } {
  if (!r.date) return { text: '' };
  if (where.kind === 'ann') return { text: sinceText(r.date, p.now, p.fmt) };
  if (where.kind === 'done') return { text: r.removed && !r.complete ? 'Removed' : shortDate(r.date, p.now, p.fmt) };
  if (r.overdue) return { text: overdueWords(r, p.now), cls: 'danger' };
  const cls = r.dueSoon && !r.complete ? 'soon' : undefined;
  if (r.urgent) return { text: untilText(r.date, p.now), cls };
  if (where.kind === 'day') return { text: timeText(r.date, p.fmt), cls };
  if (where.kind === 'course' || where.kind === 'range') {
    const today = dayText(r.date, p.now, { ...p.fmt, dates: 'relative' }) === 'Today';
    return { text: today ? timeText(r.date, p.fmt) : `${dayText(r.date, p.now, p.fmt)} ${timeText(r.date, p.fmt)}`, cls };
  }
  switch (where.group) {
    case 'today':
    case 'tomorrow':
      return { text: timeText(r.date, p.fmt), cls };
    case 'week':
      return { text: `${dayText(r.date, p.now, p.fmt)} ${timeText(r.date, p.fmt)}`, cls };
    default:
      return { text: shortDate(r.date, p.now, p.fmt), cls };
  }
}

function LabelEditor({ r, p, done }: { r: Row; p: PanelProps; done(refocus: boolean): void }) {
  const ref = useRef<HTMLInputElement>(null);
  const ended = useRef(false);
  // Layout effect: focus lands in the same task as the render, before the next keystroke.
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const end = (save: boolean, refocus: boolean) => {
    if (ended.current) return;
    ended.current = true;
    if (save) p.on.setLabel(r, ref.current?.value.trim() ?? '');
    done(refocus);
  };
  return (
    <input
      ref={ref}
      class="label-input"
      maxLength={24}
      placeholder="Label"
      aria-label={`Label for ${r.title}`}
      value={p.labels[r.key]?.text ?? ''}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') end(true, true);
        else if (e.key === 'Escape') end(false, true);
      }}
      onBlur={() => end(true, false)}
    />
  );
}

export interface RowProps {
  r: Row;
  p: PanelProps;
  where: Where;
  editing: boolean;
  tabbable: boolean;
  settling: boolean;
  setEditing(k: string | null, refocus?: boolean): void;
  openMenu(r: Row, el: HTMLElement): void;
  menuOpenFor: string | null;
}

export function ItemRow({ r, p, where, editing, tabbable, settling, setEditing, openMenu, menuOpenFor }: RowProps) {
  const ann = where.kind === 'ann';
  const color = r.courseId ? p.colors[`course_${r.courseId}`] : undefined;
  const marker = p.courseColors && color ? (color.startsWith('#') ? color : `#${color}`) : undefined;
  const courseText = p.courseLabel(r.courseId, r) || (r.type === 'planner_note' ? 'Personal' : '');
  // By course: the block header already names the course.
  const course = where.kind === 'course' ? '' : courseText;
  const label = p.labels[r.key]?.text;
  const due = dueText(r, where, p);
  const kind = typeName[r.type] ?? 'To-do';
  // The shared state's word (missing, graded, late, overdue, …); "upcoming" goes unsaid.
  const state = ann ? (r.unread ? 'unread' : '') : r.state === 'upcoming' ? '' : r.state;
  // CONTRACT.md §3: the accessible name gives title, course and due ("Homework 1, MATH 301, due Sat Oct 24 11:59 PM").
  const name = [r.title, courseText, dueWords(r, p), kind, state, label && `label ${label}`].filter(Boolean).join(', ');
  const anchors = p.agent ? rowAnchors(r, p) : undefined;
  const cls = ['row', ann ? 'ann' : '', r.complete && !ann ? 'complete' : '', settling ? 'settling' : '', r.removed ? 'removed' : '', ann && r.unread ? 'unread' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <li class={cls} data-key={r.key} tabIndex={tabbable ? 0 : -1} aria-label={name} style={marker ? { '--c': marker } : undefined} {...anchors}>
      <span class="marker" aria-hidden="true" />
      {ann ? (
        <span class="lead dot" aria-hidden="true" />
      ) : (
        <label class="lead check">
          <input
            type="checkbox"
            {...(p.agent ? actionAttr(r.complete ? 'mark-undone' : 'mark-done') : undefined)}
            tabIndex={-1}
            checked={r.complete}
            disabled={r.submitted && !r.markedDone}
            onChange={e => {
              (e.currentTarget as HTMLInputElement).checked = r.complete; // state drives it
              p.on.toggleDone(r);
            }}
            aria-label={r.complete ? `Mark ${r.title} not done` : `Mark ${r.title} done`}
          />
          <span class="box" aria-hidden="true">
            <Icon name="check" />
          </span>
        </label>
      )}
      <span class="title-wrap" data-preview="">
        {r.url ? (
          <a class="title" href={r.url} tabIndex={-1} {...(p.agent && rowMarksRead(r) ? { 'data-b2c-marks-read': 'true' } : undefined)}>
            {r.title}
          </a>
        ) : (
          <span class="title">{r.title}</span>
        )}
      </span>
      {editing ? (
        <LabelEditor r={r} p={p} done={refocus => setEditing(null, refocus)} />
      ) : label ? (
        <span class="chip label" title={label}>
          {label}
        </span>
      ) : null}
      {/* Line 2: course · due. */}
      <span class="meta">
        {course && (
          <span class="chip course" title={course}>
            {course}
          </span>
        )}
        {course && due.text && (
          <span class="sep" aria-hidden="true">
            ·
          </span>
        )}
        <span class={`due${due.cls ? ' ' + due.cls : ''}`}>{due.text}</span>
      </span>
      <button
        type="button"
        class="more"
        tabIndex={-1}
        aria-label={`Actions for ${r.title}`}
        aria-haspopup="menu"
        aria-expanded={menuOpenFor === r.key}
        onClick={e => openMenu(r, e.currentTarget as HTMLElement)}
      >
        <Icon name="more" />
      </button>
    </li>
  );
}

export function Skeleton({ n }: { n: number }) {
  return (
    <ul class="list skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <li class="row" key={i}>
          <span class="marker" />
          <span class="lead" />
          <span class="bar" style={{ width: `${62 - (i % 3) * 9}%` }} />
          <span class="meta">
            <span class="bar short" />
          </span>
        </li>
      ))}
    </ul>
  );
}


/**
 * A collapsed group of done rows (polish B): "Done today · 3" at the foot of
 * List and Ring, "2 done" inside a Week day or a course block.
 */
export function DoneGroup({ id, label, rows, children }: { id: string; label: string; rows: readonly Row[]; children: (r: Row) => ComponentChildren }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return (
    <div class={`done-group${open ? ' open' : ''}`} data-group={id}>
      <button type="button" class="dg-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name="chevron" />
        {label}
      </button>
      {open && <ul class="list">{rows.map(r => children(r))}</ul>}
    </div>
  );
}

/** Full due words for the accessible name: "due Sat Oct 24 11:59 PM" (or "posted …" for announcements). */
function dueWords(r: Row, p: PanelProps): string {
  if (!r.date) return '';
  const tz = p.fmt.tz;
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(r.date);
  return `${r.type === 'announcement' ? 'posted' : 'due'} ${wd} ${shortDate(r.date, p.now, p.fmt)} ${timeText(r.date, p.fmt)}`;
}

/**
 * CONTRACT.md §3 anchors for one row, from the same facts describe() uses
 * (core/agent/model.ts dueOf / stateOf), so an agent's describe() items and
 * these rows agree. Local (b²c-only) items have no Canvas facts: id, due and
 * a date-based state.
 */
/**
 * Does opening this row's link mark something read? Agent kit ruling: an
 * announcement or discussion the planner already shows as read
 * (`new_activity: false`) doesn't; describe() says the same.
 */
export function rowMarksRead(r: Row): boolean {
  return r.type === 'announcement' || r.type === 'discussion_topic' ? marksReadFor(r.url, { unread: r.item?.new_activity }) : marksReadFor(r.url);
}

export function rowAnchors(r: Row, p: Pick<PanelProps, 'fmt' | 'now'>): Record<string, string> {
  const tz = validZone(p.fmt.tz);
  if (r.item) {
    return anchorAttrs({
      id: r.key,
      courseId: r.courseId,
      due: isoInZone(dueOf(r.item), tz),
      state: stateOf(r.item, p.now.getTime()),
      marksRead: rowMarksRead(r),
    });
  }
  return anchorAttrs({ id: r.key, courseId: r.courseId, due: isoInZone(r.date, tz), state: r.state });
}

/** The due text of a past-due row, in the shared state's words: "Missing · 3d", "Late · 3d", "Overdue 3d", "Past due 3d". */
export function overdueWords(r: Row, now: Date): string {
  const ago = r.date ? agoShort(r.date, now) : '';
  switch (r.state) {
    case 'missing':
      return `Missing · ${ago}`;
    case 'late':
      return `Late · ${ago}`;
    case 'past':
      return `Past due ${ago}`;
    default:
      return `Overdue ${ago}`;
  }
}
