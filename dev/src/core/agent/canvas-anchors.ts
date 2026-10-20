// agentkit/CONTRACT.md §3 on Canvas's own elements. Applied only after a
// describe call, kept current by the shared observer (ctx.dom.each), removed
// on stop. Selectors live here and nowhere else (the health view reads ANCHORS).

import type { Dom } from '../dom.ts';
import type { PageKind } from '../canvas/page.ts';
import { ATTR, anchorAttrs, setAttrs } from './anchors.ts';
import { opensChange, type ChangeFacts, type DueOut } from './model.ts';
import { marksRead } from './read-safety.ts';

export const ANCHORS = {
  link: 'a[href]',
  dashboardCard: 'a.ic-DashboardCard__link[href]',
  assignmentRow: '.ig-row[id^="assignment_"]',
  moduleItem: 'li.context_module_item[id^="context_module_item_"]',
  calendarEvent: 'a.fc-event',
  todoSidebarLink: '.ToDoSidebarItem a[href]',
} as const;

export interface AnchorModel {
  origin: string;
  page: { kind: PageKind; courseId: string | null };
  due: readonly DueOut[];
  /** What b²c knows about state-changing views (must-view requirements, read state). */
  facts?: ChangeFacts;
}

const pathOf = (href: string | null, origin: string): string | null => {
  if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return null;
  try {
    const u = new URL(href, location.href);
    return u.origin === origin ? u.pathname.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
};

/** `type:id` from a Canvas item path. */
export function idFromPath(path: string): string | null {
  const m = path.match(/^\/courses\/[^/]+\/(assignments|quizzes|discussion_topics|announcements)\/(\d+(?:~\d+)?)$/);
  if (!m) return null;
  return `${{ assignments: 'assignment', quizzes: 'quiz', discussion_topics: 'discussion_topic', announcements: 'announcement' }[m[1]!]}:${m[2]}`;
}

/** Content `type:id` from a module item's classes (`assignment_123`, `quizzes/quiz_45`, …). */
export function moduleContentId(classes: Iterable<string>): string | null {
  const T: Record<string, string> = { assignment: 'assignment', 'quizzes/quiz': 'quiz', discussion_topic: 'discussion_topic', wiki_page: 'wiki_page', attachment: 'file' };
  for (const c of classes) {
    const m = c.match(/^(assignment|quizzes\/quiz|discussion_topic|wiki_page|attachment)_(\d+(?:~\d+)?)$/);
    if (m && m[2] !== '0') return `${T[m[1]!]}:${m[2]}`;
  }
  return null;
}

/** Start anchoring. Returns stop(), which removes every attribute it set. */
export function anchorCanvas(dom: Dom, model: AnchorModel): () => void {
  const byId = new Map(model.due.map(d => [d.id, d]));
  const byPath = new Map<string, DueOut>();
  for (const d of model.due) {
    const p = d.url ? pathOf(d.url, model.origin) : null;
    if (p) byPath.set(p, d);
  }
  const courseId = model.page.courseId;
  const stamp = (el: Element, id: string, course: string | null) => {
    const d = byId.get(id);
    setAttrs(el, anchorAttrs({ id, courseId: d?.courseId ?? course, due: d?.due, state: d?.state }));
    return () => {
      for (const k of [ATTR.id, ATTR.courseId, ATTR.due, ATTR.state]) el.removeAttribute(k);
    };
  };
  const offs: (() => void)[] = [];

  // Any link whose navigation changes state in Canvas (§2 marksRead: read marks, must-view requirements).
  offs.push(
    dom.each(ANCHORS.link, el => {
      const p = pathOf(el.getAttribute('href'), model.origin);
      if (!p || !(model.facts ? opensChange(p, model.facts) : marksRead(p))) return;
      el.setAttribute(ATTR.marksRead, 'true');
      return () => el.removeAttribute(ATTR.marksRead);
    }),
  );

  // Dashboard cards: the card element, by its course link.
  offs.push(
    dom.each(ANCHORS.dashboardCard, link => {
      const m = pathOf(link.getAttribute('href'), model.origin)?.match(/^\/courses\/(\d+(?:~\d+)?)$/);
      if (!m) return;
      return stamp(link.closest('.ic-DashboardCard') ?? link, `course:${m[1]}`, m[1]!);
    }),
  );

  // Assignments list rows (quizzes and graded discussions list here too; the title link says which).
  offs.push(
    dom.each(ANCHORS.assignmentRow, row => {
      const link = row.querySelector('a.ig-title[href]');
      const p = link ? pathOf(link.getAttribute('href'), model.origin) : null;
      const raw = row.getAttribute('data-item-id') ?? row.id.replace(/^assignment_/, '');
      const id = (p && idFromPath(p)) ?? (/^\d/.test(raw) ? `assignment:${raw}` : null);
      return id ? stamp(row, id, courseId) : undefined;
    }),
  );

  // Modules item rows: the <li> is the module item; its .ig-row is the content.
  offs.push(
    dom.each(ANCHORS.moduleItem, li => {
      const mid = li.id.replace(/^context_module_item_/, '');
      if (!/^\d/.test(mid)) return;
      const undo = [stamp(li, `module_item:${mid}`, courseId)];
      const cid = moduleContentId(li.classList);
      const row = li.querySelector(':scope > .ig-row');
      if (cid && row) undo.push(stamp(row, cid, courseId));
      return () => undo.forEach(u => u());
    }),
  );

  // Calendar events: no ids in Canvas's DOM, so map by course class + title, only when unambiguous.
  offs.push(
    dom.each(ANCHORS.calendarEvent, ev => {
      const title = ev.getAttribute('title');
      const ctxClass = [...ev.classList].find(c => /^group_(course|user)_/.test(c));
      if (!title || !ctxClass) return;
      const course = ctxClass.match(/^group_course_(\d+(?:~\d+)?)$/)?.[1] ?? null;
      const hits = model.due.filter(d => d.title === title && (course ? d.courseId === `course:${course}` : d.type === 'planner_note'));
      return hits.length === 1 ? stamp(ev, hits[0]!.id, course) : undefined;
    }),
  );

  // Canvas's To Do sidebar: the row, by its link.
  offs.push(
    dom.each(ANCHORS.todoSidebarLink, link => {
      const p = pathOf(link.getAttribute('href'), model.origin);
      const d = p ? byPath.get(p) : undefined;
      if (!d) return;
      return stamp(link.closest('.ToDoSidebarItem') ?? link, d.id, null);
    }),
  );

  return () => offs.splice(0).forEach(off => off());
}

/** §2 onPage: every element carrying data-b2c-id, in the document and in b²c's shadow roots. */
export function collectOnPage(doc: Document = document): { id: string; selector: string; shadowHost: string | null }[] {
  const out: { id: string; selector: string; shadowHost: string | null }[] = [];
  const seen = new Set<string>();
  const sel = (id: string) => `[${ATTR.id}="${id.replace(/["\\]/g, '\\$&')}"]`;
  const add = (root: ParentNode, host: string | null) => {
    for (const el of Array.from(root.querySelectorAll(`[${ATTR.id}]`))) {
      const id = el.getAttribute(ATTR.id)!;
      const k = `${host ?? ''}|${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id, selector: sel(id), shadowHost: host });
    }
  };
  add(doc, null);
  for (const host of Array.from(doc.querySelectorAll(`[${ATTR.region}]`))) {
    if (host.shadowRoot) add(host.shadowRoot, host.tagName.toLowerCase());
  }
  return out;
}

