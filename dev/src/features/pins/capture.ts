// "Pin this page": what a pin made here should point at. Pure: works from the
// path and the page title, so index.ts can name its ⌘K commands without
// loading the runtime or any data. The first suggestion is the smart one.

import type { Target } from './model.ts';

export interface Suggestion {
  /** Command / button wording: "This week's module in this course". */
  title: string;
  target: Target;
  /** Label to start from when no course name is known yet. */
  label: string;
}

const strip = (t: string) => t.split(/\s*[:|]\s*/)[0]!.trim().slice(0, 60) || 'This page';

/** Canvas titles look like "Modules: MATH-401-001: Abstract Algebra I (Fall 2026)". */
export const labelFromTitle = (title: string) => strip(title);

export function suggest(path: string, search = '', title = ''): Suggestion[] {
  const here: Suggestion = { title: 'This page', target: { kind: 'url', href: path + search }, label: labelFromTitle(title) };
  const m = path.replace(/\/+$/, '').match(/^\/courses\/(\d+)(?:\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?)?$/);
  if (!m) return path === '/' ? [] : [here];
  const [, course, section, item, sub] = m as unknown as [string, string, string | undefined, string | undefined, string | undefined];
  const week: Suggestion = { title: "This week's module in this course", target: { kind: 'module', course, which: 'this-week' }, label: 'This week' };
  const nextDue: Suggestion = { title: 'The next thing due in this course', target: { kind: 'next-due', course }, label: 'Next due' };

  switch (section) {
    case undefined:
      return [week, { ...here, label: labelFromTitle(title) || 'Course home' }];
    case 'modules':
      return [week, here];
    case 'grades':
      return [{ title: 'Grades for this course', target: { kind: 'grades', course }, label: 'Grades' }];
    case 'assignments':
      if (item === 'syllabus') return [{ title: 'The syllabus', target: { kind: 'page', course, match: 'syllabus' }, label: 'Syllabus' }];
      if (!item) return [{ title: 'Assignments for this course', target: { kind: 'assignments', course }, label: 'Assignments' }, nextDue];
      return [here, nextDue];
    case 'pages':
    case 'wiki': {
      if (/syllabus/i.test(`${item ?? ''} ${title}`)) return [{ title: 'The syllabus', target: { kind: 'page', course, match: 'syllabus' }, label: 'Syllabus' }, here];
      // A weekly page ("Week 4: notes") is better as "this week's module".
      if (/\b(week|wk)\b/i.test(`${(item ?? '').replace(/-/g, ' ')} ${title}`)) return [week, here];
      return [here];
    }
    case 'files': {
      if (!item || sub) return [here];
      const word = `${title}`.match(/\b(lecture|slides|notes|handout|worksheet|recording|reading)s?\b/i)?.[1]?.toLowerCase();
      return word
        ? [{ title: `The newest ${word} file in this course`, target: { kind: 'latest-file', course, match: word }, label: `Latest ${word}` }, here]
        : [here];
    }
    default:
      return [here];
  }
}
