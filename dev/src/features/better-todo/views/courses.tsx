// By course (todo-views.md §4): per course a header ("CHEM 101 General
// Chemistry · 1 of 3 this week · 1 overdue"), a segmented bar with one cell
// per item that fills when it's ticked, then its items. A course with nothing
// in range collapses to one line. In the wide strip courses sit side by side.

import { DoneGroup } from '../rows.tsx';
import type { ViewProps } from '../types.ts';
import { countWords, progress, splitDone, type CourseProgress } from './model.ts';
import css from './courses.css';

export default function CoursesView({ lists, p, span, day, row }: ViewProps) {
  const prog = progress(lists.all, span, day, p.now);
  const colorOf = (id: string | null) => {
    const c = id ? p.colors[`course_${id}`] : undefined;
    return p.courseColors && c ? (c.startsWith('#') ? c : `#${c}`) : 'var(--b2c-w-text-tertiary, #6b7780)';
  };
  // Every current course gets a block, so "nothing this week" is said, not hidden.
  const have = new Set(prog.courses.map(c => c.courseId ?? ''));
  const idle: CourseProgress[] = p.courses.filter(c => !have.has(c.id)).map(c => ({ courseId: c.id, done: 0, total: 0, rows: [], overdue: [] }));
  const blocks = [...prog.courses.filter(c => c.courseId !== null), ...idle, ...prog.courses.filter(c => c.courseId === null)];

  return (
    <div class="courses-view">
      <style>{css}</style>
      <p class="cv-sum">
        <b>{countWords(prog, span)}</b>
      </p>
      <div class="cv-blocks">
        {blocks.map(c => {
          const id = c.courseId;
          const code = id ? p.courseLabel(id) : 'Personal';
          // "CHEM 107-001: General Chemistry Laboratory I (Fall 2026)" → "General Chemistry Laboratory I (Fall 2026)": the code is already beside it.
          const name = id ? p.courseName(id).replace(/^[^:]{2,24}:\s+/, '') : 'Your own items';
          const { open, done } = splitDone(c.rows, p.session);
          const empty = !c.total && !c.overdue.length;
          const counts = c.total ? `${c.done} of ${c.total} ${span.noun.replace(/^in /, '')}` : `Nothing due ${span.noun}`;
          return (
            <section class={`cv-block${empty ? ' empty-course' : ''}`} key={id ?? ''} style={{ '--c': colorOf(id) }} aria-label={`${code}: ${counts}${c.overdue.length ? `, ${c.overdue.length} overdue` : ''}`}>
              <h3 class="cv-h">
                <span class="sw" aria-hidden="true" />
                <span class="code">{code}</span>
                <span class="name" title={name}>
                  {name}
                </span>
                <span class="cv-n">
                  {counts}
                  {c.overdue.length > 0 && <span class="od"> · {c.overdue.length} overdue</span>}
                </span>
              </h3>
              {c.total > 0 && (
                <div class="cells" aria-hidden="true">
                  {c.rows.map(r => (
                    <span class={`cell${r.complete ? ' on' : ''}`} key={r.key} />
                  ))}
                </div>
              )}
              {(c.overdue.length > 0 || open.length > 0) && (
                <ul class="list">
                  {c.overdue.map(r => row(r, { kind: 'course' }))}
                  {open.map(r => row(r, { kind: 'course' }))}
                </ul>
              )}
              <DoneGroup id={`cv-${id ?? ''}`} label={`${done.length} done`} rows={done}>
                {r => row(r, { kind: 'course' })}
              </DoneGroup>
            </section>
          );
        })}
      </div>
    </div>
  );
}
