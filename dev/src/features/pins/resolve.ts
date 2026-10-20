// Resolvers: a pin's target + a snapshot of Canvas data → where it goes now.
// Pure. The runtime fills the snapshot from ctx.data (cache first, then fresh)
// and re-resolves on every update. Read-safe: only list endpoints feed it.

import type { CanvasFile, Course, Module, ModuleItem, PlannerItem, WikiPage } from '../../core/canvas/data.ts';
import type { Pin, Target } from './model.ts';
import { RULE_LABEL, dayOf, dueThisWeek, fmtDay, fmtSpan, pickModule, termWeek, weekday, type Rule } from './weeks.ts';

export interface Snapshot {
  now: Date;
  tz?: string;
  /** undefined = not loaded yet. */
  courses?: Course[];
  modules: Record<string, Module[] | undefined>;
  pages: Record<string, WikiPage[] | undefined>;
  /** 'hidden' = the course's Files tab refuses the list (401/403). */
  files: Record<string, CanvasFile[] | 'hidden' | undefined>;
  planner?: PlannerItem[];
  /** Canvas course colours, { course_<id>: '#hex' }. */
  colors?: Record<string, string>;
  /** Week pins: in a gap, show the next module from this weekday on (3 = Thu; 7 = never). */
  upcomingFrom?: number;
}

export const emptySnapshot = (now: Date, tz?: string): Snapshot => ({ now, tz, modules: {}, pages: {}, files: {} });

export interface Resolved {
  /** False when the query found nothing (the href is then a sensible fallback). */
  ok: boolean;
  href: string;
  /** What it resolved to (module name, file name, assignment title). */
  title: string;
  /** A short second line: dates, due time, "Nothing this week". */
  detail: string;
  /** Data this needs hasn't loaded yet; show the last resolution if there is one. */
  pending?: boolean;
  /** Week pins: the rule that fired, and how we know ("Oct 19–25 · by unlock dates"). */
  rule?: Rule;
  why?: string;
  /** Two rules disagree ("Unlock dates say Week 4; numbering says Week 3"). */
  flag?: string;
  /**
   * 'fallback': no rule placed this week; it shows a stand-in (this week's due items, the last module).
   * 'gone': what it pointed at is gone (deleted, unpublished, nothing matches). Never removed silently.
   */
  state?: 'fallback' | 'gone';
  /** Week pins from `upcomingFrom` on: next week's module (the pin itself still opens this week's). */
  next?: { title: string; href: string };
}

const RULE_NAME: Record<Rule, string> = { dates: 'Dates', unlock: 'Unlock dates', numbering: 'Numbering', due: 'Due dates', manual: 'You', position: 'Position' };
const says = (r: Rule) => `${RULE_NAME[r]} ${/s$/.test(RULE_NAME[r]) ? 'say' : 'says'}`;

export type Need =
  | { kind: 'courses' }
  | { kind: 'modules'; course: string }
  | { kind: 'pages'; course: string }
  | { kind: 'files'; course: string }
  | { kind: 'planner' }
  /** Course colours, for the chips' left edge (dock only). */
  | { kind: 'colors' };

/** The data a target reads. */
export function needs(t: Target): Need[] {
  switch (t.kind) {
    case 'url': return [];
    case 'module': return [{ kind: 'courses' }, { kind: 'modules', course: t.course }];
    case 'next-due': return [{ kind: 'planner' }, { kind: 'courses' }];
    case 'latest-file': return [{ kind: 'files', course: t.course }, { kind: 'modules', course: t.course }];
    case 'page': return [{ kind: 'pages', course: t.course }, { kind: 'modules', course: t.course }];
    case 'assignments':
    case 'grades': return [{ kind: 'courses' }];
  }
}

export const needKey = (n: Need) => ('course' in n ? `${n.kind}:${n.course}` : n.kind);

// ── Matching ────────────────────────────────────────────────────────────────

/**
 * "lecture" → case-insensitive substring; "lecture|slides" → either;
 * "/^Lec \d+/i" → a regular expression. Bad regexes match nothing.
 */
export function matcher(match: string): (s: string) => boolean {
  const re = match.trim().match(/^\/(.+)\/([a-z]*)$/);
  if (re) {
    try {
      const r = new RegExp(re[1]!, re[2]!.includes('i') ? re[2] : re[2] + 'i');
      return s => r.test(s);
    } catch {
      return () => false;
    }
  }
  const alts = match.toLowerCase().split('|').map(a => a.trim()).filter(Boolean);
  return s => {
    const l = s.toLowerCase();
    return alts.some(a => l.includes(a));
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Short course name: her nickname if she set one, else the code without its section ("MATH 401-001" → "MATH 401"). */
export function courseName(c: Course | undefined, id: string): string {
  if (!c) return `Course ${id}`;
  if (c.original_name && c.name) return c.name;
  const code = c.course_code || c.name;
  return code.replace(/^([A-Za-z&]{1,6}\s?\d{2,4}[A-Za-z]?)[-.]\d{1,4}$/, '$1');
}

const coursePath = (id: string) => `/courses/${id}`;
/** Canvas returns absolute html_urls; keep same-origin ones as paths so a cached resolution works on any host alias. */
export const pathOf = (href: string) => href.replace(/^https:\/\/[^/]+(?=\/)/, '');
const hostOf = (href: string) => href.match(/^https:\/\/([^/]+)/)?.[1] ?? '';

/** "today 11:59 PM", "tomorrow 9 AM", "Fri 11:59 PM", "Oct 30". */
export function fmtDue(due: Date, now: Date, tz?: string): string {
  const d = dayOf(due, tz) - dayOf(now, tz);
  const opt = (o: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => {
    if (!tz) return o;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return { ...o, timeZone: tz };
    } catch {
      return o;
    }
  };
  const time = new Intl.DateTimeFormat('en-US', opt({ hour: 'numeric', minute: '2-digit' })).format(due).replace(':00', '');
  if (d === 0) return `today ${time}`;
  if (d === 1) return `tomorrow ${time}`;
  if (d > 1 && d < 7) return `${new Intl.DateTimeFormat('en-US', opt({ weekday: 'short' })).format(due)} ${time}`;
  return fmtDay(dayOf(due, tz));
}

function moduleItems(mods: Module[] | undefined): { item: ModuleItem; mod: Module }[] {
  return (mods ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .flatMap(mod => (mod.items ?? []).map(item => ({ item, mod })));
}

const DONE_TYPES = new Set(['announcement', 'planner_note', 'calendar_event', 'assessment_request']);

function isOpen(i: PlannerItem): boolean {
  if (DONE_TYPES.has(i.plannable_type)) return false;
  if (i.planner_override?.marked_complete || i.planner_override?.dismissed) return false;
  if (i.submissions && (i.submissions.submitted || i.submissions.excused || i.submissions.graded)) return false;
  return true;
}

const dueOf = (i: PlannerItem) => i.plannable.due_at ?? i.plannable.todo_date ?? i.plannable_date;

// ── Resolve ─────────────────────────────────────────────────────────────────

const pending = (href: string, title: string): Resolved => ({ ok: true, href, title, detail: '', pending: true });

export function resolve(pin: Pin, s: Snapshot): Resolved {
  const t = pin.target;
  switch (t.kind) {
    case 'url':
      return { ok: true, href: t.href, title: pin.label, detail: t.href.startsWith('https://') ? hostOf(t.href) : '' };

    case 'assignments':
    case 'grades': {
      const c = s.courses?.find(x => x.id === t.course);
      return {
        ok: true,
        href: `${coursePath(t.course)}/${t.kind}`,
        title: t.kind === 'grades' ? 'Grades' : 'Assignments',
        detail: s.courses ? courseName(c, t.course) : '',
      };
    }

    case 'module': {
      const modsPage = `${coursePath(t.course)}/modules`;
      const mods = s.modules[t.course];
      if (!mods || !s.courses) return pending(modsPage, 'Modules');
      const c = s.courses.find(x => x.id === t.course);
      const o = {
        now: s.now,
        tz: c?.time_zone || s.tz,
        termStart: c?.term?.start_at ?? null,
        termEnd: c?.term?.end_at ?? null,
        courseStart: c?.restrict_enrollments_to_course_dates ? c.start_at ?? null : null,
        upcomingFrom: s.upcomingFrom,
      };
      const hrefOf = (id: string) => {
        const [mod, item] = id.split(':');
        return item ? `${modsPage}#context_module_item_${item}` : `${modsPage}#module_${mod}`;
      };
      if (t.which === 'pinned') {
        const m = mods.find(x => x.id === t.module);
        return m
          ? { ok: true, href: hrefOf(m.id), title: m.name, detail: m.name, rule: 'manual', why: RULE_LABEL.manual }
          : { ok: false, href: modsPage, title: 'Modules', detail: 'Not found', state: 'gone' };
      }
      const wk = termWeek(o);
      const p = pickModule(mods, t.which, o);
      if (!p) {
        if (t.which === 'this-week') {
          const n = dueThisWeek(mods, o);
          return {
            ok: false,
            href: `${coursePath(t.course)}/assignments`,
            title: "This week's due items",
            detail: "This week's due items · fallback",
            why: `Couldn't find a week in this course's modules; showing this week's due items${n ? ` (${n})` : ''}.`,
            state: 'fallback',
          };
        }
        const nothing = t.which === 'next-week' ? 'Nothing dated next week' : 'No modules open yet';
        return { ok: false, href: modsPage, title: 'Modules', detail: `${nothing} · fallback`, state: 'fallback' };
      }
      const href = hrefOf(p.module.id);
      const when = p.span ? fmtSpan(p.span.from, p.span.to) : '';
      const why = [when, RULE_LABEL[p.rule]].filter(Boolean).join(' · ');
      const flag = p.conflict ? `${says(p.rule)} ${p.module.name}; ${says(p.conflict.rule).toLowerCase()} ${p.conflict.module.name}` : undefined;
      if (p.fallback === 'last') return { ok: false, href, title: p.module.name, detail: `Last: ${p.module.name} · fallback`, rule: p.rule, why, state: 'fallback' };
      if (p.fallback === 'upcoming') return { ok: true, href, title: p.module.name, detail: `Next: ${p.module.name}`, rule: p.rule, why: `starts ${when.split(/–| – /)[0]} · ${RULE_LABEL[p.rule]}` };
      const lead = t.which === 'this-week' && wk && !/\b(week|wk)\b/i.test(p.module.name) ? `Week ${wk} · ` : '';
      // From upcomingFrom (Thu by default), also say what next week holds.
      let next: Resolved['next'];
      if (t.which === 'this-week' && weekday(dayOf(s.now, o.tz)) >= (s.upcomingFrom ?? 3)) {
        const q = pickModule(mods, 'next-week', o);
        if (q && q.module.id !== p.module.id) next = { title: q.module.name, href: hrefOf(q.module.id) };
      }
      const detail = lead + p.module.name + (next ? ` · next: ${next.title}` : '');
      return { ok: true, href, title: p.module.name, detail, rule: p.rule, why, ...(flag ? { flag } : {}), ...(next ? { next } : {}) };
    }

    case 'next-due': {
      if (!s.planner) return pending(t.course ? `${coursePath(t.course)}/assignments` : '/', 'Next due');
      const now = s.now.getTime();
      const next = s.planner
        .filter(i => isOpen(i) && (!t.course || i.course_id === t.course))
        .map(i => ({ i, at: Date.parse(dueOf(i)) }))
        .filter(x => Number.isFinite(x.at) && x.at >= now)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) {
        return { ok: false, href: t.course ? `${coursePath(t.course)}/assignments` : '/', title: 'Next due', detail: 'Nothing due soon' };
      }
      const nc = !t.course && next.i.course_id ? s.courses?.find(c => c.id === next.i.course_id) : undefined;
      const course = t.course ? undefined : nc ? courseName(nc, nc.id) : next.i.context_name;
      return {
        ok: true,
        href: pathOf(next.i.html_url),
        title: next.i.plannable.title,
        detail: [`due ${fmtDue(new Date(next.at), s.now, s.tz)}`, course].filter(Boolean).join(' · '),
      };
    }

    case 'latest-file': {
      const m = matcher(t.match);
      const files = s.files[t.course];
      const mods = s.modules[t.course];
      if (files === undefined && mods === undefined) return pending(`${coursePath(t.course)}/files`, 'Files');
      if (Array.isArray(files)) {
        const hits = files.filter(f => m(f.display_name) || (f.filename ? m(f.filename) : false));
        hits.sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''));
        const f = hits[0];
        if (f) {
          return {
            ok: true,
            href: `${coursePath(t.course)}/files/${f.id}`,
            title: f.display_name,
            detail: f.created_at ? `added ${fmtDay(dayOf(f.created_at, s.tz))}` : '',
          };
        }
      }
      // Files hidden (or nothing matched there): the newest matching file in modules.
      const inMods = moduleItems(mods).filter(x => x.item.type === 'File' && m(x.item.title));
      const last = inMods[inMods.length - 1];
      if (last) return { ok: true, href: pathOf(last.item.html_url ?? `${coursePath(t.course)}/modules`), title: last.item.title, detail: `in ${last.mod.name}` };
      if (files === undefined && Array.isArray(mods)) return pending(`${coursePath(t.course)}/files`, 'Files');
      return { ok: false, href: files === 'hidden' ? `${coursePath(t.course)}/modules` : `${coursePath(t.course)}/files`, title: 'Files', detail: 'Not found', why: `No file matching “${t.match}”`, state: 'gone' };
    }

    case 'page': {
      const m = matcher(t.match);
      const pages = s.pages[t.course];
      const mods = s.modules[t.course];
      const syllabus = /^syllabus$/i.test(t.match.trim());
      if (pages === undefined && mods === undefined) return pending(syllabus ? `${coursePath(t.course)}/assignments/syllabus` : `${coursePath(t.course)}/pages`, pin.label);
      const page = (pages ?? []).find(p => m(p.title));
      if (page) return { ok: true, href: pathOf(page.html_url), title: page.title, detail: page.updated_at ? `updated ${fmtDay(dayOf(page.updated_at, s.tz))}` : '' };
      const item = moduleItems(mods).find(x => (x.item.type === 'Page' || x.item.type === 'File') && m(x.item.title));
      if (item) return { ok: true, href: pathOf(item.item.html_url ?? `${coursePath(t.course)}/modules`), title: item.item.title, detail: `in ${item.mod.name}` };
      if (pages === undefined || mods === undefined) return pending(`${coursePath(t.course)}/pages`, pin.label);
      if (syllabus) return { ok: true, href: `${coursePath(t.course)}/assignments/syllabus`, title: 'Syllabus', detail: 'Course syllabus' };
      return { ok: false, href: `${coursePath(t.course)}/pages`, title: 'Pages', detail: 'Not found', why: `No page matching “${t.match}”`, state: 'gone' };
    }
  }
}

// ── Labels ──────────────────────────────────────────────────────────────────

/** A default label for a new pin. */
export function defaultLabel(t: Target, courses: Course[] | undefined): string {
  const cn = 'course' in t && t.course ? courseName(courses?.find(c => c.id === t.course), t.course) : '';
  switch (t.kind) {
    case 'url': return 'Link';
    case 'module': return `${cn} ${t.which === 'this-week' ? 'this week' : t.which === 'next-week' ? 'next week' : t.which === 'latest' ? 'latest' : 'module'}`;
    case 'next-due': return cn ? `${cn} next due` : 'Next due';
    case 'latest-file': return `${cn} ${t.match.replace(/^\/|\/[a-z]*$/g, '')}`;
    case 'page': return `${cn} ${t.match.replace(/^\/|\/[a-z]*$/g, '')}`;
    case 'assignments': return `${cn} assignments`;
    case 'grades': return `${cn} grades`;
  }
}
