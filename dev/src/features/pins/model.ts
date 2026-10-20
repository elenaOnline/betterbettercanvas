// Pins: the stored shape and its validation. Small and dependency-free so the
// feature definition (index.ts) can use it without loading the runtime.

export type Which = 'this-week' | 'next-week' | 'latest' | 'pinned';

export type Target =
  | { kind: 'url'; href: string }
  | { kind: 'module'; course: string; which: Which; /** For 'pinned' (manual pick). */ module?: string }
  | { kind: 'next-due'; course?: string }
  | { kind: 'latest-file'; course: string; match: string }
  | { kind: 'page'; course: string; match: string }
  | { kind: 'assignments'; course: string }
  | { kind: 'grades'; course: string };

export type Kind = Target['kind'];

export interface Pin {
  id: string;
  label: string;
  icon?: string;
  target: Target;
}

export const KINDS: readonly Kind[] = ['module', 'next-due', 'latest-file', 'page', 'assignments', 'grades', 'url'];
const WHICH: readonly Which[] = ['this-week', 'next-week', 'latest', 'pinned'];
const COURSE = /^\d{1,20}$/;
export const MAX_PINS = 24;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

export function isTarget(t: unknown): t is Target {
  if (!t || typeof t !== 'object') return false;
  const o = t as Record<string, unknown>;
  const course = () => typeof o.course === 'string' && COURSE.test(o.course);
  switch (o.kind) {
    case 'url': return str(o.href, 2000) && /^(\/|https:\/\/)/.test(o.href);
    case 'module': return course() && WHICH.includes(o.which as Which) && (o.which !== 'pinned' || (str(o.module, 64) && o.module !== ''));
    case 'next-due': return o.course === undefined || course();
    case 'latest-file':
    case 'page': return course() && str(o.match, 200) && o.match.trim() !== '';
    case 'assignments':
    case 'grades': return course();
    default: return false;
  }
}

export function isPin(p: unknown): p is Pin {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return str(o.id, 64) && o.id !== '' && str(o.label, 80) && (o.icon === undefined || str(o.icon, 8)) && isTarget(o.target);
}

/** Validator for the `pins.list` setting. */
export const isPinList = (v: unknown): v is Pin[] =>
  Array.isArray(v) && v.length <= MAX_PINS && v.every(isPin) && new Set(v.map(p => (p as Pin).id)).size === v.length;

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Course a pin belongs to, if any. */
export const pinCourse = (p: Pin): string | null =>
  'course' in p.target && p.target.course ? p.target.course : p.target.kind === 'url' ? (p.target.href.match(/^(?:https:\/\/[^/]+)?\/courses\/(\d+)/)?.[1] ?? null) : null;

/** A stable signature of what a pin points at (cache key for its last resolution). */
export const targetSig = (t: Target) => JSON.stringify(t);

/** Plain words for a kind, for the editor and ⌘K. */
export const KIND_LABEL: Record<Kind, string> = {
  module: 'Module for the week',
  'next-due': 'Next thing due',
  'latest-file': 'Newest file matching',
  page: 'Page matching',
  assignments: 'Assignments',
  grades: 'Grades',
  url: 'Link',
};

export const WHICH_LABEL: Record<Which, string> = {
  'this-week': 'This week',
  'next-week': 'Next week',
  latest: 'Latest',
  pinned: 'A module I pick',
};
