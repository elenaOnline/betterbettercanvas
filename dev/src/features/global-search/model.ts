// global-search model: index documents, built from read-safe list responses,
// and the ranking. Pure: no DOM, no chrome.*, no network. Unit-tested.

export type Kind =
  | 'course' | 'module' | 'assignment' | 'quiz' | 'page' | 'file'
  | 'discussion' | 'announcement' | 'link';

/** One searchable thing. Compact: the whole index is held in memory while the palette is open. */
export interface Doc {
  kind: Kind;
  /** Unique within the index: `<kind>:<course>:<id>`. */
  key: string;
  title: string;
  /** Same-origin path (+ hash). Never an API URL. */
  url: string;
  /** Course id (absent only for courses themselves… which carry their own id here too). */
  course: string;
  /** Module name, for context ("Week 3"). */
  module?: string;
  /** Due date (assignments, quizzes) or posted date (announcements), ISO. */
  date?: string;
  /** Last change Canvas reports (pages, files, discussions), ISO. */
  updated?: string;
}

export interface CourseInfo {
  id: string;
  name: string;
  code: string;
  /** Term window, ISO; null = open-ended. */
  start: string | null;
  end: string | null;
  /** Set when the user nicknamed the course. */
  original?: string;
}

// ── Building docs from list responses ───────────────────────────────────────

/** Path (+ search + hash) of a Canvas URL; '' for other origins or junk. */
export function localPath(u: string | null | undefined, origin?: string): string {
  if (!u) return '';
  try {
    const url = new URL(u, origin ?? 'https://canvas.invalid');
    if (/^https?:\/\//.test(u) && origin && url.origin !== origin) {
      // API JSON may name the school's canonical host; keep only the path.
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return '';
  }
}

interface RawAssignment {
  id: string | number;
  name: string;
  due_at?: string | null;
  html_url?: string;
  quiz_id?: string | number | null;
  is_quiz_assignment?: boolean;
  submission_types?: string[];
  discussion_topic?: { id: string | number; html_url?: string } | null;
  published?: boolean;
  updated_at?: string;
}

interface RawModuleItem {
  id: string | number;
  title: string;
  type: string;
  html_url?: string;
  page_url?: string;
  content_id?: string | number;
  external_url?: string;
  content_details?: { due_at?: string | null };
}

interface RawModule { id: string | number; name: string; items?: RawModuleItem[] | null }
interface RawPage { page_id?: string | number; url: string; title: string; html_url?: string; updated_at?: string; published?: boolean }
interface RawFile { id: string | number; display_name: string; updated_at?: string; created_at?: string; hidden?: boolean; locked_for_user?: boolean }
interface RawTopic { id: string | number; title: string; html_url?: string; posted_at?: string | null; last_reply_at?: string | null; updated_at?: string; assignment_id?: string | number | null; context_code?: string; published?: boolean }

export interface CourseLists {
  modules?: RawModule[] | null;
  assignments?: RawAssignment[] | null;
  pages?: RawPage[] | null;
  files?: RawFile[] | null;
  discussions?: RawTopic[] | null;
  announcements?: RawTopic[] | null;
}

const S = (x: string | number | null | undefined) => (x === null || x === undefined ? '' : String(x));
const isQuiz = (a: RawAssignment) => !!a.quiz_id || !!a.is_quiz_assignment || !!a.submission_types?.includes('online_quiz');
const isDiscussion = (a: RawAssignment) => !!a.discussion_topic || !!a.submission_types?.includes('discussion_topic');

/** The course's own doc. */
export function courseDoc(c: CourseInfo): Doc {
  return { kind: 'course', key: `course:${c.id}:${c.id}`, title: c.name, url: `/courses/${c.id}`, course: c.id };
}

/**
 * Turn one course's list responses into docs. Module items that point at
 * something another list already indexed don't make a second result; they
 * lend that result their module name instead. A list that is null or absent
 * (forbidden, failed) is simply skipped.
 */
export function courseDocs(courseId: string, lists: CourseLists): Doc[] {
  const c = courseId;
  const out = new Map<string, Doc>();
  const put = (d: Doc) => {
    if (d.title && d.url && !out.has(d.key)) out.set(d.key, d);
  };

  // Discussions first, so graded discussions resolve to the topic.
  const topicIds = new Set<string>();
  for (const t of lists.discussions ?? []) {
    if (t.published === false) continue;
    topicIds.add(S(t.id));
    put({ kind: 'discussion', key: `discussion:${c}:${t.id}`, title: t.title, url: localPath(t.html_url) || `/courses/${c}/discussion_topics/${t.id}`, course: c, updated: t.last_reply_at ?? t.updated_at ?? t.posted_at ?? undefined });
  }
  const dueByTopic = new Map<string, string>();
  for (const a of lists.assignments ?? []) {
    if (a.published === false) continue;
    if (isDiscussion(a)) {
      const tid = S(a.discussion_topic?.id);
      if (tid && topicIds.has(tid)) {
        if (a.due_at) dueByTopic.set(tid, a.due_at);
        continue;
      }
      if (tid) {
        put({ kind: 'discussion', key: `discussion:${c}:${tid}`, title: a.name, url: localPath(a.discussion_topic?.html_url) || `/courses/${c}/discussion_topics/${tid}`, course: c, date: a.due_at ?? undefined });
        continue;
      }
    }
    if (isQuiz(a) && a.quiz_id) {
      put({ kind: 'quiz', key: `quiz:${c}:${a.quiz_id}`, title: a.name, url: `/courses/${c}/quizzes/${a.quiz_id}`, course: c, date: a.due_at ?? undefined });
    } else {
      put({ kind: isQuiz(a) ? 'quiz' : 'assignment', key: `assignment:${c}:${a.id}`, title: a.name, url: localPath(a.html_url) || `/courses/${c}/assignments/${a.id}`, course: c, date: a.due_at ?? undefined });
    }
  }
  for (const [tid, due] of dueByTopic) {
    const d = out.get(`discussion:${c}:${tid}`);
    if (d) d.date = due;
  }
  for (const p of lists.pages ?? []) {
    if (p.published === false) continue;
    put({ kind: 'page', key: `page:${c}:${p.url}`, title: p.title, url: localPath(p.html_url) || `/courses/${c}/pages/${p.url}`, course: c, updated: p.updated_at });
  }
  for (const f of lists.files ?? []) {
    if (f.hidden) continue;
    put({ kind: 'file', key: `file:${c}:${f.id}`, title: f.display_name, url: `/courses/${c}/files/${f.id}`, course: c, updated: f.updated_at ?? f.created_at });
  }
  for (const n of lists.announcements ?? []) {
    put({ kind: 'announcement', key: `announcement:${c}:${n.id}`, title: n.title, url: localPath(n.html_url) || `/courses/${c}/discussion_topics/${n.id}`, course: c, date: n.posted_at ?? undefined });
  }

  // Modules, and their items: link to what's indexed, or index the item.
  const lend = (key: string, module: string) => {
    const d = out.get(key);
    if (d && !d.module) d.module = module;
    return !!d;
  };
  for (const m of lists.modules ?? []) {
    put({ kind: 'module', key: `module:${c}:${m.id}`, title: m.name, url: `/courses/${c}/modules#module_${m.id}`, course: c });
    for (const it of m.items ?? []) {
      const id = S(it.content_id);
      let linked = false;
      switch (it.type) {
        case 'SubHeader':
          continue;
        case 'Page':
          linked = !!it.page_url && lend(`page:${c}:${it.page_url}`, m.name);
          break;
        case 'File':
          linked = lend(`file:${c}:${id}`, m.name);
          break;
        case 'Discussion':
          linked = lend(`discussion:${c}:${id}`, m.name);
          break;
        case 'Assignment':
          linked = lend(`assignment:${c}:${id}`, m.name);
          break;
        case 'Quiz':
          linked = lend(`quiz:${c}:${id}`, m.name) || [...out.values()].some(d => d.kind === 'quiz' && d.url.endsWith(`/quizzes/${id}`) && lend(d.key, m.name));
          break;
      }
      if (linked) continue;
      const kind: Kind =
        it.type === 'Page' ? 'page' : it.type === 'File' ? 'file' : it.type === 'Discussion' ? 'discussion'
        : it.type === 'Assignment' ? 'assignment' : it.type === 'Quiz' ? 'quiz' : 'link';
      // Module item URLs (/modules/items/:id) open the item through Canvas,
      // which is what a click on the Modules page does too.
      put({ kind, key: `item:${c}:${it.id}`, title: it.title, url: localPath(it.html_url) || `/courses/${c}/modules/items/${it.id}`, course: c, module: m.name, date: it.content_details?.due_at ?? undefined });
    }
  }
  return [...out.values()];
}

// ── Matching and ranking ────────────────────────────────────────────────────

/** Lowercase, strip accents, unify punctuation to spaces. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function tokens(q: string): string[] {
  const n = norm(q);
  return n ? n.split(' ') : [];
}

/** Optimal string alignment distance ≤ 1 (one substitution, insertion, deletion or adjacent swap). */
export function within1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** A doc prepared for matching. */
export interface Prepared<T = Doc> {
  item: T;
  /** Normalized title. */
  t: string;
  /** Title words. */
  w: string[];
  /** Title without spaces ("math401"). */
  sq: string;
  /** Normalized context: course code and name, module. */
  cx: string;
  cw: string[];
  /** Static boost (course standing, due soon, recency). */
  boost: number;
}

export function prepare<T>(item: T, title: string, context: string, boost = 0): Prepared<T> {
  const t = norm(title);
  const cx = norm(context);
  return { item, t, w: t ? t.split(' ') : [], sq: t.replace(/ /g, ''), cx, cw: cx ? cx.split(' ') : [], boost };
}

export const SCORE = {
  titlePrefix: 100,
  wordStart: 70,
  exactWord: 8,
  substring: 30,
  squashed: 24,
  fuzzy: 16,
  ctxWordStart: 20,
  ctxSubstring: 8,
  phrase: 40,
} as const;

/** Score one token against a prepared doc; 0 = no match. */
export function tokenScore(p: Prepared<unknown>, tok: string): number {
  if (p.t.startsWith(tok)) return SCORE.titlePrefix + (p.w[0] === tok ? SCORE.exactWord : 0);
  let ws = false, exact = false;
  for (const w of p.w) {
    if (w.startsWith(tok)) {
      ws = true;
      if (w === tok) {
        exact = true;
        break;
      }
    }
  }
  if (ws) return SCORE.wordStart + (exact ? SCORE.exactWord : 0);
  if (p.t.includes(tok)) return SCORE.substring;
  if (tok.length >= 3 && p.sq.includes(tok)) return SCORE.squashed;
  for (const w of p.cw) if (w.startsWith(tok)) return SCORE.ctxWordStart;
  if (tok.length >= 3 && p.cx.includes(tok)) return SCORE.ctxSubstring;
  if (tok.length >= 4) {
    for (const w of p.w) {
      // Whole word, or the start of a longer word while still typing.
      if (within1(tok, w) || (w.length > tok.length && within1(tok, w.slice(0, tok.length)))) return SCORE.fuzzy;
    }
  }
  return 0;
}

/** Score a doc against all query tokens (AND). 0 = no match. */
export function score(p: Prepared<unknown>, toks: string[], phrase: string): number {
  if (!toks.length) return 0;
  let s = 0;
  for (const tok of toks) {
    const x = tokenScore(p, tok);
    if (!x) return 0;
    s += x;
  }
  if (toks.length > 1 && p.t.includes(phrase)) s += SCORE.phrase;
  // Shorter titles win ties: "Homework 4" over "Homework 4 (resubmission)".
  return s + p.boost - Math.min(p.t.length, 120) * 0.05;
}

export interface Hit<T> { item: T; score: number; p: Prepared<T> }

/**
 * Incremental searcher: a query that extends the previous one only rescans
 * the previous matches. `limit` caps the sorted output.
 */
export function createSearcher<T>(all: Prepared<T>[]) {
  let lastQ = '';
  let lastPool: Prepared<T>[] = all;
  return {
    size: all.length,
    search(q: string, limit = 200): Hit<T>[] {
      const toks = tokens(q);
      const phrase = toks.join(' ');
      if (!toks.length) {
        lastQ = '';
        lastPool = all;
        return [];
      }
      // Narrowing is only safe when every old token is still a prefix of
      // the same new token and no typo tolerance kicks in newly; fuzzy
      // matches are monotone for prefixes only while length < 4, so rescan
      // when a token crosses that threshold.
      const prev = tokens(lastQ);
      const narrows =
        lastQ !== '' && prev.length <= toks.length &&
        prev.every((t, i) => toks[i]!.startsWith(t) && !(t.length < 4 && toks[i]!.length >= 4) && !(t.length < 3 && toks[i]!.length >= 3)) &&
        // A token that grows can lose its fuzzy/substring match but never gain one, except the cases above.
        true;
      const pool = narrows ? lastPool : all;
      const hits: Hit<T>[] = [];
      const kept: Prepared<T>[] = [];
      for (const p of pool) {
        const s = score(p, toks, phrase);
        if (s > 0) {
          hits.push({ item: p.item, score: s, p });
          kept.push(p);
        }
      }
      lastQ = q;
      lastPool = kept;
      hits.sort((a, b) => b.score - a.score || (a.p.t < b.p.t ? -1 : a.p.t > b.p.t ? 1 : 0));
      return hits.length > limit ? hits.slice(0, limit) : hits;
    },
  };
}

// ── Standing: which courses come first ──────────────────────────────────────

const DAY = 86_400_000;

/** Course standing boost: the course you're in, current term, past term. */
export function courseBoost(c: CourseInfo | undefined, now: number, currentCourse: string | null): number {
  if (!c) return 0;
  let b = 0;
  if (currentCourse && c.id === currentCourse) b += 25;
  const start = c.start ? Date.parse(c.start) : NaN;
  const end = c.end ? Date.parse(c.end) : NaN;
  if (Number.isFinite(end) && end < now) b -= 20;
  else if (Number.isFinite(start) && start > now + 14 * DAY) b -= 10;
  else b += 12;
  return b;
}

/** Docs dated soon (due this week, posted lately) edge ahead. */
export function dateBoost(d: Doc, now: number): number {
  if (!d.date) return 0;
  const t = Date.parse(d.date);
  if (!Number.isFinite(t)) return 0;
  if (d.kind === 'announcement') return now - t < 7 * DAY ? 4 : 0;
  const dt = t - now;
  if (dt >= -DAY && dt <= 7 * DAY) return 8;
  if (dt > 7 * DAY && dt <= 21 * DAY) return 3;
  return 0;
}

/** Recently opened from the palette: newest first, up to RECENT_MAX. */
export const RECENT_MAX = 12;

export function recentBoost(rank: number): number {
  return rank < 0 ? 0 : Math.max(0, 30 - rank * 2);
}

export function pushRecent(list: readonly string[], key: string): string[] {
  return [key, ...list.filter(k => k !== key)].slice(0, RECENT_MAX);
}

// ── Grouping ────────────────────────────────────────────────────────────────

export interface Group<T> { id: string; label: string; hits: Hit<T>[] }

export const KIND_GROUP: Record<Kind, string> = {
  course: 'Courses',
  module: 'Modules',
  assignment: 'Assignments',
  quiz: 'Quizzes',
  page: 'Pages',
  file: 'Files',
  discussion: 'Discussions',
  announcement: 'Announcements',
  link: 'Links',
};

/**
 * Group hits by label; groups are ordered by their best hit, so the top
 * result is always first. Each group keeps at most `per` hits.
 */
export function groupHits<T>(hits: Hit<T>[], labelOf: (h: Hit<T>) => string, per = 5, maxGroups = 8): Group<T>[] {
  const groups = new Map<string, Group<T>>();
  for (const h of hits) {
    const label = labelOf(h);
    let g = groups.get(label);
    if (!g) groups.set(label, (g = { id: label.toLowerCase().replace(/\W+/g, '-'), label, hits: [] }));
    if (g.hits.length < per) g.hits.push(h);
  }
  return [...groups.values()].slice(0, maxGroups);
}

/** "Oct 23" style date for result details (local time). */
const fmts = new Map<string, Intl.DateTimeFormat>();
export function shortDate(iso: string | undefined, locale?: string, timeZone?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const k = `${locale}|${timeZone}`;
  let f = fmts.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone });
    } catch {
      f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
    }
    fmts.set(k, f);
  }
  const memoKey = `${k}|${iso}`;
  let out = dateMemo.get(memoKey);
  if (out === undefined) {
    out = f.format(t);
    if (dateMemo.size > 5000) dateMemo.clear();
    dateMemo.set(memoKey, out);
  }
  return out;
}
const dateMemo = new Map<string, string>();
