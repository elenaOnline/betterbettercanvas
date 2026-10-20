// Canvas read-safety: the one list core, features and the agent contract share
// (agentkit/CONTRACT.md §2 `readSafety`, research/canvas-read-safety.md).
// Opening a URL that matches MARKS_READ_PATHS changes state in Canvas (marks
// grades, announcements, topics or threads read; ticks "must view" module
// steps). READ_SAFE_API lists the GET endpoints that never do.

/** Page paths whose *navigation* marks something read. `*` = one path segment; a trailing `*` = any suffix. */
export const MARKS_READ_PATHS: readonly string[] = [
  '/courses/*/grades',
  '/courses/*/announcements/*',
  '/courses/*/discussion_topics/*',
  '/conversations*',
  '/courses/*/modules/items/*',
];

/**
 * Paths that change state only sometimes, published for path-only agents
 * (contract §2 "Other field rules"). Never used for matching: b²c decides
 * these from its caches (an open must-view module requirement).
 */
export const MARKS_READ_CONDITIONAL: readonly string[] = ['/courses/*/assignments/* (when a must-view module requirement is open)'];

/** readSafety.marksReadPaths as describe publishes it. */
export const MARKS_READ_PUBLISHED: readonly string[] = [...MARKS_READ_PATHS, ...MARKS_READ_CONDITIONAL];

/** Read-only list endpoints (research/canvas-read-safety.md "Safe"). */
export const READ_SAFE_API: readonly string[] = [
  'GET /api/v1/users/self',
  'GET /api/v1/users/self/colors',
  'GET /api/v1/users/self/course_nicknames',
  'GET /api/v1/courses',
  'GET /api/v1/dashboard/dashboard_cards',
  'GET /api/v1/planner/items',
  'GET /api/v1/courses/:id/modules',
  'GET /api/v1/courses/:id/assignment_groups',
  'GET /api/v1/courses/:id/assignments',
  'GET /api/v1/courses/:id/pages',
  'GET /api/v1/courses/:id/files',
  'GET /api/v1/courses/:id/discussion_topics',
  'GET /api/v1/announcements',
];

// An inner `*` is one path segment (an id or slug); a trailing `*` is any suffix.
const toRegExp = (glob: string) => {
  const parts = glob.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  const last = parts.length - 1;
  const body = parts.map((s, i) => (i === 0 ? s : (i === last && s === '' ? '.*' : '[^/]+') + s)).join('');
  return new RegExp(`^${body}(?:/.*)?$`);
};
const MARKS_READ_RE = MARKS_READ_PATHS.map(toRegExp);

/** Does navigating to this path (or absolute URL on any origin) mark something read? */
export function marksRead(pathOrUrl: string): boolean {
  let p = pathOrUrl;
  if (/^[a-z]+:/i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return false;
    }
  }
  p = p.split(/[?#]/)[0] ?? '';
  return MARKS_READ_RE.some(r => r.test(p));
}
