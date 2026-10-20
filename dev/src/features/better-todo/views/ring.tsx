// Progress ring (todo-views.md §2): the "wheel", done honestly. One arc per
// course: its length is that course's share of the range, its fill the share
// done. The centre says "4 of 11 / done this week", never a percentage or
// 0/0. Below it: overdue (listed, not counted), what's left, and the done
// items under a collapsed group.
//
// The ring is b²c's one round element (the owner, 2026-10-20), so this file and
// ring.css are the only paths exempt from the square audit. Round by default;
// --b2c-ring-corner lets a theme or rice square it (see ring.css).

import { useState } from 'preact/hooks';
import { anchorAttrs } from '../../../core/agent/anchors.ts';
import { DoneGroup, dueText } from '../rows.tsx';
import type { ViewProps } from '../types.ts';
import { arcs, progress, splitDone, summary } from './model.ts';
import css from './ring.css';

export default function RingView({ lists, p, range, span, day, row }: ViewProps) {
  // Course filter from the legend or an arc: '' = Personal, undefined = all.
  const [only, setOnly] = useState<string | undefined>(undefined);
  const prog = progress(lists.all, span, day, p.now);
  const sum = summary(prog, span, range);
  const segs = arcs(prog.courses, prog.total);
  const colorOf = (id: string | null) => {
    const c = id ? p.colors[`course_${id}`] : undefined;
    return p.courseColors && c ? (c.startsWith('#') ? c : `#${c}`) : 'var(--b2c-w-text-tertiary, #6b7780)';
  };
  const labelOf = (id: string | null) => (id ? p.courseLabel(id) : 'Personal');
  const keyOfCourse = (id: string | null) => id ?? '';
  const pick = (id: string | null) => setOnly(o => (o === keyOfCourse(id) ? undefined : keyOfCourse(id)));
  const shown = <T extends { courseId: string | null }>(r: T) => only === undefined || keyOfCourse(r.courseId) === only;

  const before = prog.before.filter(shown);
  const { open, done } = splitDone(prog.inRange.filter(shown), p.session);
  const left = open.filter(r => !r.complete).length;
  const next = sum.state === 'empty' ? lists.all.find(r => !r.complete && !r.removed && r.date && r.date.getTime() >= p.now.getTime()) : undefined;
  const groupName = `Progress ${span.noun}`;

  return (
    <div class={`ring-view st-${sum.state}`}>
      <style>{css}</style>
      <div class="ring-top" role="group" aria-label={groupName}>
        <div class="ring-box">
          <svg viewBox="0 0 112 112" aria-hidden="true">
            {sum.state === 'empty' ? (
              <rect class="trk hair" x="8" y="8" width="96" height="96" pathLength="100" />
            ) : (
              segs.map(a => {
                const c = colorOf(a.courseId);
                const dash = (len: number) => ({ strokeDasharray: `${len} ${100 - len}`, strokeDashoffset: `${-a.offset}` });
                return (
                  <g class={`arc${only !== undefined && only !== keyOfCourse(a.courseId) ? ' dim' : ''}`} data-course={keyOfCourse(a.courseId)} onClick={() => pick(a.courseId)} key={keyOfCourse(a.courseId)}>
                    <rect class="trk" x="8" y="8" width="96" height="96" pathLength="100" style={{ stroke: `color-mix(in oklab, ${c} 22%, var(--b2c-w-bg, #fff))`, ...dash(a.length) }} />
                    <rect class="trk fill" x="8" y="8" width="96" height="96" pathLength="100" style={{ stroke: c, ...dash(a.doneLength) }} />
                  </g>
                );
              })
            )}
          </svg>
          <div class="ctr">
            <span class="big">{sum.big}</span>
            {sum.small && <span class="small">{sum.small}</span>}
          </div>
        </div>
        {prog.courses.some(c => c.total) && (
          <ul class="legend">
            {prog.courses
              .filter(c => c.total)
              .map(c => (
                <li key={keyOfCourse(c.courseId)}>
                  <button
                    type="button"
                    {...(p.agent && c.courseId ? anchorAttrs({ id: `course:${c.courseId}`, courseId: c.courseId }) : undefined)}
                    aria-pressed={only === keyOfCourse(c.courseId)}
                    aria-label={`${labelOf(c.courseId)}: ${c.done} of ${c.total} done. ${only === keyOfCourse(c.courseId) ? 'Show all courses' : 'Show only this course'}`}
                    onClick={() => pick(c.courseId)}
                  >
                    <span class="sw" style={{ background: colorOf(c.courseId) }} aria-hidden="true" />
                    <span class="lg-name">{labelOf(c.courseId)}</span>
                    <span class="lg-n">
                      {c.done} of {c.total}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
      {next && (
        <p class="ring-next">
          Next: <span class="t">{next.title}</span> · {dueText(next, { kind: 'range' }, p).text}
        </p>
      )}
      {before.length > 0 && (
        <div class="group">
          <h3 class="gl danger">Overdue · {before.length}</h3>
          <ul class="list">{before.map(r => row(r, { kind: 'range' }))}</ul>
        </div>
      )}
      {open.length > 0 && (
        <div class="group">
          <h3 class="gl">
            Left {span.noun} · {left}
          </h3>
          <ul class="list">{open.map(r => row(r, { kind: 'range' }))}</ul>
        </div>
      )}
      <DoneGroup id="ring-done" label={`Done ${span.noun} · ${done.length}`} rows={done}>
        {r => row(r, { kind: 'range' })}
      </DoneGroup>
    </div>
  );
}
