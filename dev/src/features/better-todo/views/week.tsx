// Week view (todo-views.md §3). In the panel: a mini week bar (LATE pinned
// left in danger, then Mon–Sun, today shaded), one square per item (filled =
// done), a count under each column; then the day list, "2 of 3 done" per day.
// In the wide strip the same day sections become 8 real columns (container
// query in week.css), and the mini bar goes away.

import { useRef } from 'preact/hooks';
import { DoneGroup } from '../rows.tsx';
import type { ViewProps } from '../types.ts';
import { countWords, progress, splitDone, weekColumns } from './model.ts';
import css from './week.css';

const SQUARES = 4;

export default function WeekView({ lists, p, span, day, dayName, row }: ViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cols = weekColumns(lists.all, span, day, p.now);
  const prog = progress(lists.all, span, day, p.now);
  const late = cols[0]!;
  const jump = (id: string) => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-day="${id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el?.querySelector<HTMLElement>('h3')?.focus();
  };
  const head = (c: (typeof cols)[number]) => (c.day === null ? 'Overdue' : dayName(c.day, 'long'));

  return (
    <div class="week-view" ref={ref}>
      <style>{css}</style>
      <div class="wk-bar" role="group" aria-label={`Week, ${span.noun}`}>
        {cols.map(c => {
          // Up to 4 squares; past that, 3 and a "+n" count, so the stack never outgrows the column.
          const shown = c.rows.length > SQUARES ? c.rows.slice(0, SQUARES - 1) : c.rows;
          const more = c.rows.length - shown.length;
          const words = c.day === null ? `Overdue: ${c.total}` : `${head(c)}: ${c.total ? `${c.done} of ${c.total} done` : 'nothing due'}`;
          return (
            <button type="button" class={`wk-col${c.today ? ' today' : ''}${c.day === null ? ' late' : ''}`} aria-label={words} onClick={() => jump(c.id)} key={c.id}>
              <span class="wd" aria-hidden="true">
                {c.day === null ? 'LATE' : dayName(c.day).slice(0, 2).toUpperCase()}
              </span>
              <span class="dn" aria-hidden="true">
                {c.day === null ? '' : dayName(c.day).split(' ')[1]}
              </span>
              <span class="sqs" aria-hidden="true">
                {more > 0 && <span class="sq-more">+{more}</span>}
                {shown.map(r => (
                  <span class={`sq${r.complete ? ' on' : ''}`} key={r.key} />
                ))}
              </span>
              <span class="cnt" aria-hidden="true">
                {c.day === null ? (c.total || '') : c.total ? `${c.done}/${c.total}` : '–'}
              </span>
            </button>
          );
        })}
      </div>
      <p class="wk-sum">
        <b>{countWords(prog, span)}</b>
        {late.total > 0 && <span class="od"> · {late.total} overdue</span>}
      </p>
      <div class="wk-days">
        {cols.map(c => {
          const { open, done } = splitDone(c.rows, p.session);
          if (c.day === null && !c.rows.length) return <section class="wk-day late none" data-day={c.id} key={c.id} aria-hidden="true" />;
          return (
            <section class={`wk-day${c.today ? ' today' : ''}${c.day === null ? ' late' : ''}`} data-day={c.id} key={c.id}>
              <h3 class={`gl${c.day === null ? ' danger' : ''}`} tabIndex={-1}>
                <span>
                  {c.day === null ? 'Overdue' : dayName(c.day).toUpperCase()}
                  {c.today && ' · Today'}
                </span>
                <span class="gl-n">{c.day === null ? c.total : c.total ? `${c.done} of ${c.total} done` : 'Nothing due'}</span>
              </h3>
              {open.length > 0 && <ul class="list">{open.map(r => row(r, { kind: c.day === null ? 'range' : 'day' }))}</ul>}
              <DoneGroup id={`wk-${c.id}`} label={`${done.length} done`} rows={done}>
                {r => row(r, { kind: 'day' })}
              </DoneGroup>
            </section>
          );
        })}
      </div>
    </div>
  );
}
