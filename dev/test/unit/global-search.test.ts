import { describe, expect, it, vi } from 'vitest';
import {
  courseBoost, courseDoc, courseDocs, createSearcher, dateBoost, groupHits, KIND_GROUP, localPath, norm, prepare,
  pushRecent, RECENT_MAX, score, tokens, tokenScore, within1, type Doc,
} from '../../src/features/global-search/model.ts';
import { isHotkey, wantsBackground, STALE_MS, IDLE_USER_MS } from '../../src/features/global-search/index.ts';
import { isReadSafe, limiter, refresh } from '../../src/features/global-search/indexer.ts';
import { settingsCommands } from '../../src/features/global-search/builtins.ts';
import { highlight } from '../../src/features/global-search/palette.ts';
import { SECTIONS, THEME_ROWS } from '../../src/ui/shared/layout.ts';

const doc = (title: string, extra: Partial<Doc> = {}): Doc => ({ kind: 'assignment', key: `assignment:1:${title}`, title, url: '/x', course: '1', ...extra });
const rank = (titles: string[], q: string, ctx = '') => {
  const s = createSearcher(titles.map(t => prepare(t, t, ctx)));
  return s.search(q).map(h => h.item);
};

describe('normalising and tokens', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(norm('  Café: HW3 — Résumé!  ')).toBe('cafe hw3 resume');
    expect(tokens('Problem   set 4')).toEqual(['problem', 'set', '4']);
    expect(tokens('  ')).toEqual([]);
  });
  it('edit distance ≤ 1 covers substitution, insertion, deletion and adjacent swaps', () => {
    expect(within1('homework', 'homework')).toBe(true);
    expect(within1('homewrok', 'homework')).toBe(true); // swap
    expect(within1('homwork', 'homework')).toBe(true); // deletion
    expect(within1('homeswork', 'homework')).toBe(true); // insertion
    expect(within1('homeworx', 'homework')).toBe(true); // substitution
    expect(within1('hmewrok', 'homework')).toBe(false);
    expect(within1('abc', 'abcde')).toBe(false);
  });
});

describe('ranking', () => {
  it('prefix beats word start beats substring', () => {
    const out = rank(['Reading quiz 4', 'Quiz 4', 'Prequiz survey'], 'quiz');
    expect(out).toEqual(['Quiz 4', 'Reading quiz 4', 'Prequiz survey']);
  });
  it('all tokens must match (AND), in any order', () => {
    expect(rank(['Problem set 4', 'Problem set 5', 'Set theory notes'], 'set 4')).toEqual(['Problem set 4']);
    expect(rank(['Problem set 4'], '4 problem')).toEqual(['Problem set 4']);
  });
  it('tolerates one typo on words of 4+ letters, never on short ones', () => {
    expect(rank(['Homework 4'], 'homewrok')).toEqual(['Homework 4']);
    expect(rank(['Homework 4'], 'hmoe')).toEqual(['Homework 4']); // prefix typo while typing, 4 letters
    expect(rank(['Lab 2 report'], 'lap')).toEqual([]); // 3 letters: no fuzzy
    // An exact match outranks a fuzzy one.
    expect(rank(['Midterm review', 'Midterms'], 'midterm')[0]).toBe('Midterm review');
  });
  it('matches squashed course codes and context words', () => {
    const p = prepare('MATH 401 Abstract Algebra', 'MATH 401 Abstract Algebra', '');
    expect(tokenScore(p, 'math401')).toBeGreaterThan(0);
    const q = prepare('Homework 4', 'Homework 4', 'MATH-401-001 Abstract Algebra Week 3 assignment');
    expect(score(q, ['homework', 'algebra'], 'homework algebra')).toBeGreaterThan(0);
    expect(score(q, ['homework', 'chemistry'], 'homework chemistry')).toBe(0);
  });
  it('a title match beats a context match', () => {
    const a = prepare('Algebra review sheet', 'Algebra review sheet', 'CHEM 101');
    const b = prepare('Homework 4', 'Homework 4', 'MATH 401 Abstract Algebra');
    const s = createSearcher([b, a]);
    expect(s.search('algebra').map(h => h.item)).toEqual(['Algebra review sheet', 'Homework 4']);
  });
  it('boosts (current course, due soon, recent) order otherwise-equal titles; shorter wins ties', () => {
    const p1 = prepare('Homework 4', 'Homework 4', '', 0);
    const p2 = prepare('Homework 4', 'Homework 4', '', 25);
    expect(createSearcher([p1, p2]).search('home')[0]!.p).toBe(p2);
    expect(rank(['Homework 4 (resubmission)', 'Homework 4'], 'homework 4')[0]).toBe('Homework 4');
  });
  it('the incremental searcher gives the same results as a fresh one', () => {
    const titles = ['Homework 1', 'Homework 2', 'Home page', 'House rules', 'Office hours', 'Homewrok typo'];
    const ps = titles.map(t => prepare(t, t, ''));
    const inc = createSearcher(ps);
    for (const q of ['h', 'ho', 'hom', 'home', 'homew', 'homewo', 'homewor', 'homework', 'homework 2', 'homework', 'o', 'off']) {
      const fresh = createSearcher(ps).search(q).map(h => h.item);
      expect(inc.search(q).map(h => h.item), q).toEqual(fresh);
    }
  });
});

describe('course standing and dates', () => {
  const now = Date.parse('2026-10-21T10:00:00-07:00');
  const course = (start: string | null, end: string | null) => ({ id: '1', name: 'X', code: 'X', start, end });
  it('current term first, then future, past last; the course you are in on top', () => {
    const cur = courseBoost(course('2026-09-28T00:00:00Z', '2026-12-12T00:00:00Z'), now, null);
    const past = courseBoost(course('2026-03-30T00:00:00Z', '2026-06-12T00:00:00Z'), now, null);
    const future = courseBoost(course('2027-01-04T00:00:00Z', '2027-03-20T00:00:00Z'), now, null);
    const here = courseBoost(course('2026-03-30T00:00:00Z', '2026-06-12T00:00:00Z'), now, '1');
    expect(cur).toBeGreaterThan(future);
    expect(future).toBeGreaterThan(past);
    expect(here).toBeGreaterThan(past);
    expect(courseBoost(course(null, null), now, null)).toBe(cur); // open-ended = current
  });
  it('due this week edges ahead; long past does not', () => {
    expect(dateBoost(doc('a', { date: '2026-10-23T23:59:00-07:00' }), now)).toBeGreaterThan(0);
    expect(dateBoost(doc('a', { date: '2026-09-01T23:59:00-07:00' }), now)).toBe(0);
    expect(dateBoost(doc('a'), now)).toBe(0);
  });
  it('recent list is newest-first, deduplicated and capped', () => {
    let r: string[] = [];
    for (let i = 0; i < 20; i++) r = pushRecent(r, `k${i}`);
    r = pushRecent(r, 'k15');
    expect(r[0]).toBe('k15');
    expect(r.filter(k => k === 'k15')).toHaveLength(1);
    expect(r).toHaveLength(RECENT_MAX);
  });
});

describe('docs from list responses', () => {
  const lists = {
    modules: [
      { id: '9', name: 'Week 3', items: [
        { id: '91', title: 'Homework 4', type: 'Assignment', content_id: '501', html_url: 'https://school.instructure.com/courses/1/modules/items/91' },
        { id: '92', title: 'Syllabus and Schedule', type: 'Page', page_url: 'syllabus', html_url: 'https://x/courses/1/modules/items/92' },
        { id: '93', title: 'OpenStax', type: 'ExternalUrl', html_url: 'https://x/courses/1/modules/items/93' },
        { id: '94', title: 'Optional practice', type: 'SubHeader' },
        { id: '95', title: 'Quiz 2', type: 'Quiz', content_id: '7001', html_url: 'https://x/courses/1/modules/items/95' },
        { id: '96', title: 'Hidden page', type: 'Page', page_url: 'hidden', html_url: 'https://x/courses/1/modules/items/96' },
      ] },
    ],
    assignments: [
      { id: '501', name: 'Homework 4', due_at: '2026-10-23T06:59:00Z', html_url: 'https://school.instructure.com/courses/1/assignments/501' },
      { id: '502', name: 'Quiz 2', quiz_id: '7001', submission_types: ['online_quiz'], due_at: null },
      { id: '503', name: 'Discussion: proofs', submission_types: ['discussion_topic'], discussion_topic: { id: '80' }, due_at: '2026-10-24T06:59:00Z' },
      { id: '504', name: 'Draft', published: false },
    ],
    pages: [{ url: 'syllabus', title: 'Syllabus and Schedule', html_url: 'https://x/courses/1/pages/syllabus', updated_at: '2026-09-01T00:00:00Z' }],
    files: [{ id: '3', display_name: 'Lecture 3 slides.pdf' }],
    discussions: [{ id: '80', title: 'Discussion: proofs', html_url: 'https://x/courses/1/discussion_topics/80' }],
    announcements: [{ id: '70', title: 'Office hours moved', html_url: 'https://x/courses/1/discussion_topics/70', posted_at: '2026-10-20T00:00:00Z' }],
  };
  const docs = courseDocs('1', lists);
  const by = (t: string) => docs.filter(d => d.title === t);

  it('module items lend their module name instead of duplicating a result', () => {
    expect(by('Homework 4')).toHaveLength(1);
    expect(by('Homework 4')[0]).toMatchObject({ kind: 'assignment', module: 'Week 3', url: '/courses/1/assignments/501', date: '2026-10-23T06:59:00Z' });
    expect(by('Syllabus and Schedule')).toHaveLength(1);
    expect(by('Syllabus and Schedule')[0]).toMatchObject({ kind: 'page', module: 'Week 3' });
  });
  it('quizzes link to the quiz; graded discussions resolve to the topic with its due date', () => {
    expect(by('Quiz 2')).toEqual([expect.objectContaining({ kind: 'quiz', url: '/courses/1/quizzes/7001', module: 'Week 3' })]);
    expect(by('Discussion: proofs')).toEqual([expect.objectContaining({ kind: 'discussion', url: '/courses/1/discussion_topics/80', date: '2026-10-24T06:59:00Z' })]);
  });
  it('items with nothing else to point at are indexed as module items; subheaders and unpublished work are not', () => {
    expect(by('OpenStax')).toEqual([expect.objectContaining({ kind: 'link', url: '/courses/1/modules/items/93', module: 'Week 3' })]);
    expect(by('Hidden page')).toEqual([expect.objectContaining({ kind: 'page', url: '/courses/1/modules/items/96' })]);
    expect(by('Optional practice')).toEqual([]);
    expect(by('Draft')).toEqual([]);
  });
  it('modules, files and announcements; every URL is a same-origin path, never an API URL', () => {
    expect(by('Week 3')[0]).toMatchObject({ kind: 'module', url: '/courses/1/modules#module_9' });
    expect(by('Lecture 3 slides.pdf')[0]).toMatchObject({ kind: 'file', url: '/courses/1/files/3' });
    expect(by('Office hours moved')[0]).toMatchObject({ kind: 'announcement', date: '2026-10-20T00:00:00Z' });
    for (const d of docs) {
      expect(d.url.startsWith('/courses/1/')).toBe(true);
      expect(d.url).not.toContain('/api/');
    }
    expect(new Set(docs.map(d => d.key)).size).toBe(docs.length);
  });
  it('missing lists (forbidden, failed) are skipped', () => {
    expect(courseDocs('1', { files: null, pages: undefined })).toEqual([]);
    expect(courseDoc({ id: '1', name: 'Abstract Algebra', code: 'MATH 401', start: null, end: null })).toMatchObject({ kind: 'course', url: '/courses/1' });
    expect(localPath('https://other.example/courses/1/x?y=1#z')).toBe('/courses/1/x?y=1#z');
    expect(localPath(undefined)).toBe('');
  });
  it('groups are ordered by their best hit and capped', () => {
    const ps = [doc('Quiz 1', { kind: 'quiz' }), doc('Quiz 2', { kind: 'quiz' }), doc('Quizzes overview', { kind: 'page' })].map(d => prepare(d, d.title, ''));
    const hits = createSearcher(ps).search('quiz');
    const groups = groupHits(hits, h => KIND_GROUP[h.item.kind], 1);
    expect(groups.map(g => g.label)).toEqual(['Quizzes', 'Pages']);
    expect(groups[0]!.hits).toHaveLength(1);
  });
});

describe('read safety', () => {
  it('allows only list endpoints', () => {
    for (const ok of [
      '/api/v1/courses?enrollment_state=active',
      '/api/v1/courses/1/modules?include[]=items',
      '/api/v1/courses/1/modules/9/items?per_page=100',
      '/api/v1/courses/1/pages?sort=updated_at',
      '/api/v1/courses/1/files',
      '/api/v1/courses/1/discussion_topics?per_page=100',
      '/api/v1/courses/1/assignment_groups?include[]=assignments',
      '/api/v1/announcements?context_codes[]=course_1',
    ]) expect(isReadSafe(ok), ok).toBe(true);
    for (const bad of [
      '/api/v1/courses/1/pages/syllabus',
      '/api/v1/courses/1/discussion_topics/80',
      '/api/v1/courses/1/discussion_topics/80/view',
      '/api/v1/courses/1/discussion_topics/80/read',
      '/api/v1/courses/1/modules/9/items/91',
      '/api/v1/courses/1/modules/9/items/91/mark_read',
      '/api/v1/courses/1/files/3',
      '/api/v1/files/3',
      '/api/v1/courses/1/assignments/501',
      '/api/v1/courses/1/submissions/bulk_mark_read',
      '/courses/1/grades',
    ]) expect(isReadSafe(bad), bad).toBe(false);
  });

  it('refresh: hidden lists are skipped, failed lists keep the previous docs, ≤ 3 requests in flight', async () => {
    let inflight = 0, peak = 0;
    const slow = <T>(v: T, fail?: number) => async () => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise(r => setTimeout(r, 2));
      inflight--;
      if (fail) throw Object.assign(new Error('x'), { status: fail });
      return v;
    };
    const fails = new Map<string, number>([['files:2', 403], ['pages:3', 500]]);
    const call = (what: string, id: string, v: unknown) => slow(v, fails.get(`${what}:${id}`))();
    const data = {
      courses: () => Promise.resolve(['1', '2', '3', '4'].map(id => ({ id, name: `Course ${id}`, course_code: `C${id}` }))),
      modules: (id: string) => call('modules', id, []),
      assignmentGroups: (id: string) => call('groups', id, [{ assignments: [{ id: `${id}01`, name: `Homework ${id}` }] }]),
      pages: (id: string) => call('pages', id, []),
      files: (id: string) => call('files', id, [{ id: `${id}9`, display_name: `Notes ${id}.pdf` }]),
    };
    const paths: string[] = [];
    const api = { get: vi.fn(async (p: string) => { paths.push(p); return slow([])(); }) };
    const puts: string[] = [];
    const store = { putCourse: vi.fn(async (r: { id: string }) => { puts.push(r.id); }), dropCourses: vi.fn(async () => {}), putMeta: vi.fn(async () => {}) };
    const prev = new Map([['3', { id: '3', t: 0, docs: [courseDoc({ id: '3', name: 'Course 3', code: 'C3', start: null, end: null })] }], ['9', { id: '9', t: 0, docs: [] }]]);
    const res = await refresh({ data: data as never, api: api as never, store: store as never, now: () => 1e12 }, prev as never);
    expect(peak).toBeLessThanOrEqual(3);
    expect(res.failed).toEqual(['3']);
    expect(puts.sort()).toEqual(['1', '2', '4']); // 3 kept its previous record
    expect(store.dropCourses).toHaveBeenCalledWith(['9']);
    const c2 = (store.putCourse.mock.calls as unknown as [{ id: string; docs: Doc[] }][]).find(([r]) => r.id === '2')![0];
    expect(c2.docs.map(d => d.kind).sort()).toEqual(['assignment', 'course']); // files 403: skipped quietly
    for (const p of paths) expect(isReadSafe('/api/v1' + p), p).toBe(true);
  });

  it('limiter never exceeds its limit', async () => {
    const lim = limiter(2);
    let n = 0, peak = 0;
    await Promise.all(Array.from({ length: 10 }, () => lim(async () => { n++; peak = Math.max(peak, n); await new Promise(r => setTimeout(r, 1)); n--; })));
    expect(peak).toBe(2);
  });
});

describe('hotkey and background policy', () => {
  const k = (o: Partial<KeyboardEvent>) => ({ key: 'k', code: 'KeyK', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o });
  it('⌘K on Mac, Ctrl+K elsewhere, nothing else', () => {
    expect(isHotkey(k({ metaKey: true }), true)).toBe(true);
    expect(isHotkey(k({ ctrlKey: true }), true)).toBe(false);
    expect(isHotkey(k({ ctrlKey: true }), false)).toBe(true);
    expect(isHotkey(k({ metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(isHotkey(k({ metaKey: true, key: 'л' }), true)).toBe(true); // Cyrillic layout, same physical key
    expect(isHotkey(k({ metaKey: true, key: 'j', code: 'KeyJ' }), true)).toBe(false);
  });
  it('no background work unless an index exists, is in use, is stale, and no tab refreshed lately', () => {
    const now = 1e12;
    expect(wantsBackground({}, 0, now)).toBe(false);
    expect(wantsBackground({ t: now - STALE_MS - 1 }, 0, now)).toBe(false); // never opened
    expect(wantsBackground({ t: now - STALE_MS - 1, used: now - 1000 }, 0, now)).toBe(true);
    expect(wantsBackground({ t: now - 1000, used: now - 1000 }, 0, now)).toBe(false); // fresh
    expect(wantsBackground({ t: now - STALE_MS - 1, used: now - IDLE_USER_MS - 1 }, 0, now)).toBe(false); // abandoned
    expect(wantsBackground({ t: now - STALE_MS - 1, used: now - 1000 }, now - 60_000, now)).toBe(false); // another tab just did
  });
});

describe('commands and highlighting', () => {
  it('settings commands cover sections and top-level rows of features in the build', () => {
    const opened: string[] = [];
    const cmds = settingsCommands(t => opened.push(t), key => key.startsWith('palette.') || key.startsWith('core.'));
    const titles = cmds.map(c => c.title);
    // Labels come from Design's layout; read them rather than hard-coding.
    const rows = [...SECTIONS.flatMap(s => s.rows), ...THEME_ROWS];
    const dark = rows.find(r => r.key === 'palette.useDark')!;
    const cards = rows.find(r => r.key === 'card-assignments.enabled')!;
    expect(titles).toContain('Open b²c settings');
    expect(titles).toContain(`Settings: ${dark.label}`);
    expect(titles).not.toContain(`Settings: ${cards.label}`); // not in this build
    cmds.find(c => c.title === `Settings: ${dark.label}`)!.run();
    expect(opened).toEqual([dark.id]);
    expect(new Set(cmds.map(c => c.id)).size).toBe(cmds.length);
  });
  it('highlights the first word-start occurrence of each token', () => {
    expect(highlight('Reading quiz 4: quizzes', ['quiz'])).toEqual(['Reading ', { m: 'quiz' }, ' 4: quizzes']);
    expect(highlight('Homework', ['work'])).toEqual(['Home', { m: 'work' }]);
    expect(highlight('Homework', [])).toEqual(['Homework']);
  });
});
