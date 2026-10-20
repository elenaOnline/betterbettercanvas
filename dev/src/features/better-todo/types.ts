// Shared types for the panel, its rows, and the lazily loaded views.
import type { ComponentType, VNode } from 'preact';
import type { FmtOpts } from './format.ts';
import type { GroupId, Labels, Lists, Row } from './logic.ts';
import type { RangeId, Span, ViewId } from './views/model.ts';

export interface CourseOpt { id: string; label: string }

/** Where a row is drawn decides its due text and whether it shows the course. */
export type Where =
  | { kind: 'todo'; group: GroupId }
  | { kind: 'done' }
  | { kind: 'ann' }
  /** Week day list: the day header says the day, so time only. */
  | { kind: 'day' }
  /** By course: the block header says the course, so no course chip. */
  | { kind: 'course' }
  /** Ring list: weekday and time. */
  | { kind: 'range' };

export interface PanelProps {
  lists: Lists | null; // null = cold, no data yet
  count: number;
  showAnnouncements: boolean;
  courseColors: boolean;
  sync: boolean;
  labels: Labels;
  colors: Record<string, string>;
  /** Row chip: nickname or short code. */
  courseLabel(id: string | null, row?: Row): string;
  /** Full name (nickname if set), for headers. */
  courseName(id: string | null, row?: Row): string;
  courses: CourseOpt[];
  fmt: FmtOpts;
  now: Date;
  /** Fresh data failed; `cached` = we still show the last good list. */
  error: { cached: boolean; at: number | null } | null;
  collapsed: { todo?: boolean; announcements?: boolean };
  narrow: boolean;
  /** agentkit/CONTRACT.md §3: html[data-b2c-agent] is present, so rows carry anchors. */
  agent: boolean;
  /** Ticked this page session: they stay in place, crossed off (polish B). */
  session: ReadonlySet<string>;
  /** Removed a moment ago: still fading out. */
  settling: ReadonlySet<string>;
  view: ViewId;
  range: RangeId;
  /** The active view's component, once its chunk has loaded (list is built in). */
  View: ComponentType<ViewProps> | null;
  on: {
    toggleDone(r: Row): void;
    toggleRemoved(r: Row): void;
    setLabel(r: Row, text: string): void;
    remove(r: Row): void; // delete an own item
    add(v: { title: string; courseId: string | null; date: string; time: string }): Promise<boolean>;
    collapse(section: 'todo' | 'announcements', v: boolean): void;
    retry(): void;
    undo(): void;
    preview(key: string): void;
    closePreview(): void;
    /** The surface ⚙: Settings → To-do. */
    openSettings(): void;
    setView(v: ViewId): void;
    setRange(r: RangeId): void;
  };
}

/** What every lazily loaded view gets. */
export interface ViewProps {
  lists: Lists;
  p: PanelProps;
  range: RangeId;
  span: Span;
  /** Day number in the Canvas time zone. */
  day(d: Date): number;
  /** "Mon 19" for a day number. */
  dayName(d: number, style?: 'short' | 'long'): string;
  /** Draws one row (checkbox, title, menu, preview) exactly as the list does. */
  row(r: Row, where: Where): VNode;
}
