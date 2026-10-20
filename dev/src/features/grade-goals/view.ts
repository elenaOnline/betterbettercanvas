import { h, type ComponentChild } from 'preact';
import type { Course } from '../grade-engine/engine.ts';
import { periodLabel, periodState, type PeriodState } from '../grade-engine/periods.ts';
import { boxState, pct, sentence, type BoxState, type Goal, type Scheme } from './model.ts';
import type { Course as ApiCourse } from '../../core/canvas/data.ts';

export interface ViewProps {
  loading: boolean;
  course: Course | null;
  api: Pick<ApiCourse, 'hide_final_grades' | 'enrollments'> | null;
  goal: Goal | null;
  scheme: Scheme | null;
  /** Items present in Canvas that do not count toward the grade. */
  omitted: number;
  setGoal(g: Goal | null): void;
  openSettings(): void;
}

const CUSTOM = '__custom';
const label = (l: string) => l.replace(/-$/, '−');

function picker(p: ViewProps): ComponentChild {
  const g = p.goal;
  const num = h('input', {
    type: 'number', min: 0, max: 200, step: 0.5, inputMode: 'decimal', 'aria-label': 'Goal percent', placeholder: '%',
    value: g ? pct(g.pct) : '',
    onChange: (e: Event) => {
      const v = (e.currentTarget as HTMLInputElement).value.trim();
      if (v === '') return p.setGoal(null);
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 200) p.setGoal({ pct: n });
    },
  });
  if (!p.scheme) return [num, h('span', { class: 'hint' }, '%')];
  const match = g?.label && p.scheme.some(([l]) => l === g.label) ? g.label : g ? CUSTOM : '';
  return [
    h('select', {
      'aria-label': 'Goal grade', value: match,
      onChange: (e: Event) => {
        const v = (e.currentTarget as HTMLSelectElement).value;
        if (v === '') p.setGoal(null);
        else if (v === CUSTOM) p.setGoal({ pct: g?.pct ?? 90 });
        else {
          const row = p.scheme!.find(([l]) => l === v);
          if (row) p.setGoal({ pct: Math.round(row[1] * 10000) / 100, label: v });
        }
      },
    },
      h('option', { value: '' }, 'Choose…'),
      p.scheme.map(([l, min]) => h('option', { value: l }, `${label(l)} (${pct(min * 100)}%)`)),
      h('option', { value: CUSTOM }, 'Custom %'),
    ),
    match === CUSTOM ? [num, h('span', { class: 'hint' }, '%')] : null,
  ];
}

function how(course: Course, omitted: number, period: PeriodState): ComponentChild {
  const c = course;
  return h('details', null,
    h('summary', null, 'How is this computed?'),
    h('p', { class: 'small' },
      c.weighted
        ? 'This course uses weighted assignment groups. Each group’s percent is multiplied by its weight, and weights are renormalised over groups that have work in them.'
        : 'This course is unweighted: all points are pooled.',
      ' Drop rules (lowest/highest dropped, never-drop items) are applied as Canvas does.'),
    c.weighted ? h('table', null, h('tbody', null, c.groups.map(g => h('tr', null,
      h('td', null, g.name),
      h('td', null, `${pct(g.weight)}%`),
      h('td', { class: 'small' }, [g.dropLowest ? `drop lowest ${g.dropLowest}` : '', g.dropHighest ? `drop highest ${g.dropHighest}` : '', g.neverDrop.length ? 'some never dropped' : ''].filter(Boolean).join(', ')),
    )))) : null,
    h('p', { class: 'small' }, 'Remaining work is every posted assignment that is not graded yet. Work your instructor has not posted is not included. The average is assumed equal across all remaining items.'),
    period.kind === 'current' ? h('p', { class: 'small' }, 'Only work in the current grading period counts, as on Canvas’s Grades page.') : null,
    omitted ? h('p', { class: 'small' }, `${omitted} item${omitted === 1 ? '' : 's'} don’t count toward the grade.`) : null,
  );
}

const periodLine = (period: PeriodState): ComponentChild => {
  const l = periodLabel(period);
  return l ? h('p', { class: 'small period' }, l) : null;
};

function body(p: ViewProps, st: BoxState): ComponentChild {
  switch (st.kind) {
    case 'hidden': return null;
    case 'no-score': return h('p', { class: 'warn' }, 'Set a goal once you have a graded assignment.');
    case 'periods-unknown': return h('p', { class: 'warn', title: 'This course has grading periods, but Canvas did not say which one is current.' }, 'Grading periods: can’t tell which applies, so goals are off here.');
    case 'mismatch': return h('p', { class: 'warn', title: `b²c calculated ${st.ours === null ? 'no score' : pct(st.ours) + '%'}; Canvas shows ${pct(st.canvas)}%. A goal built on a number that disagrees would mislead you.` }, 'b²c’s maths doesn’t match Canvas’s total for this course, so goals are off here.');
    case 'no-goal': return [h('p', { class: 'hint' }, 'Pick a grade to see what you need on the rest.'), periodLine(st.period)];
    case 'goal': {
      const s = sentence(st.result, st.target);
      const rem = st.remaining;
      return [
        h('p', { class: 'answer', role: 'status' }, h('span', { class: s.strong ? '' : 'lead' }, s.lead), s.strong ? h('strong', null, s.strong) : null, s.tail),
        periodLine(st.period),
        st.result.kind === 'need'
          ? h('p', { class: 'small' }, `Now ${pct(st.result.current ?? 0)}% · ${pct(st.result.floor)}% with zeros on the rest · ${pct(st.result.ceiling)}% with full marks`)
          : null,
        rem.length ? h('div', null,
          h('p', { class: 'small' }, 'Remaining:'),
          h('ul', null,
            rem.slice(0, 6).map(i => h('li', null, i.name, ' ', h('span', null, `(${pct(i.possible)})`))),
            rem.length > 6 ? h('li', null, `+ ${rem.length - 6} more`) : null)) : null,
      ];
    }
  }
}

export function View(p: ViewProps): ComponentChild {
  // Declines that need no assignment data come first, so they show even when no groups were requested.
  const st: BoxState | null = !p.api ? null
    : p.api.hide_final_grades ? { kind: 'hidden' }
    : periodState(p.api).kind === 'unknown' ? { kind: 'periods-unknown' }
    : p.course ? boxState(p.course, p.api, p.goal?.pct ?? null) : null;
  if (st?.kind === 'hidden') return null;
  return h('section', { class: 'goal', 'aria-label': 'Grade goal (hypothetical)' },
    h('header', null,
      h('h2', null, 'Goal'),
      st && st.kind !== 'no-score' && st.kind !== 'mismatch' && st.kind !== 'periods-unknown' ? picker(p) : null,
      h('button', { type: 'button', class: 'gear', 'aria-label': 'Grade goal settings', title: 'Settings', onClick: p.openSettings }, '⚙')),
    p.loading || !st ? h('p', { class: 'hint' }, ' ') : body(p, st),
    st && (st.kind === 'goal') && p.course ? how(p.course, p.omitted, st.period) : null,
  );
}
