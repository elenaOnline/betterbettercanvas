// Which Canvas page are we on? Path-based, so it works at document_start.

export type PageKind =
  | 'dashboard'
  | 'courses'
  | 'course-home'
  | 'course-grades'
  | 'assignments'
  | 'assignment'
  | 'modules'
  | 'announcements'
  | 'discussions'
  | 'course-other'
  | 'calendar'
  | 'inbox'
  | 'profile'
  | 'login'
  | 'quiz-taking'
  | 'other';

export interface Page {
  kind: PageKind;
  /** Canvas course id when on a course page. */
  courseId: string | null;
  /** Item id for show pages (assignment id, …). */
  itemId: string | null;
}

/**
 * Assessment routes where b²c must never interfere (quiz-safe-mode). Classic
 * quizzes take at /courses/:id/quizzes/:id/take; New Quizzes runs in a
 * cross-origin LTI frame that our content scripts never match anyway.
 */
// Canvas ids may be shard-qualified ("1234~5678"); match both forms.
export const QUIZ_TAKING = /^\/courses\/\d+(?:~\d+)?\/quizzes\/\d+(?:~\d+)?\/take(?:\/|$)/;

export function detectPage(path: string): Page {
  if (QUIZ_TAKING.test(path)) return { kind: 'quiz-taking', courseId: path.split('/')[2] ?? null, itemId: path.split('/')[4] ?? null };
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/') return { kind: 'dashboard', courseId: null, itemId: null };
  if (p === '/courses') return { kind: 'courses', courseId: null, itemId: null };
  if (p.startsWith('/calendar')) return { kind: 'calendar', courseId: null, itemId: null };
  if (p.startsWith('/conversations')) return { kind: 'inbox', courseId: null, itemId: null };
  if (p.startsWith('/profile')) return { kind: 'profile', courseId: null, itemId: null };
  if (p.startsWith('/login')) return { kind: 'login', courseId: null, itemId: null };

  const m = p.match(/^\/courses\/(\d+(?:~\d+)?)(?:\/([^/]+)(?:\/([^/]+))?)?/);
  if (m) {
    const [, courseId, section, item] = m;
    const c = courseId ?? null;
    const it = item ?? null;
    switch (section) {
      case undefined: return { kind: 'course-home', courseId: c, itemId: null };
      case 'grades': return { kind: 'course-grades', courseId: c, itemId: null };
      case 'assignments':
        return it && it !== 'syllabus'
          ? { kind: 'assignment', courseId: c, itemId: it }
          : { kind: 'assignments', courseId: c, itemId: null };
      case 'modules': return { kind: 'modules', courseId: c, itemId: null };
      case 'announcements': return { kind: 'announcements', courseId: c, itemId: it };
      case 'discussion_topics': return { kind: 'discussions', courseId: c, itemId: it };
      default: return { kind: 'course-other', courseId: c, itemId: it };
    }
  }
  return { kind: 'other', courseId: null, itemId: null };
}
