// Draws the GPA section. Plain preact `h` calls (content bundles have no JSX).
// No state here: index.ts owns it and passes it in; every edit is a callback.

import { h, type ComponentChild } from 'preact';
import { format2, parseNumber, type ScaleRow, type WeightBumps } from './gpa.ts';
import type { CourseSetting, Model, Row } from './model.ts';

export interface ViewProps {
  model: Model | null;
  scale: readonly ScaleRow[];
  /** Honors/AP bumps; non-null turns on the Weight column and the weighted figure. */
  weights: WeightBumps | null;
  creditWeighted: boolean;
  rounding: 'truncate' | 'round';
  includePrevious: boolean;
  priorGpa: number;
  priorCredits: number;
  collapsed: boolean;
  editing: boolean;
  act: {
    toggleCollapsed(): void;
    openSettings(): void;
    toggleEdit(focusCourse?: string): void;
    patchCourse(id: string, patch: CourseSetting): void;
    set(values: Record<string, unknown>): void;
  };
}

const fmtCredits = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const PNP = '__pnp';
/** "CHEM 101-001" -> "CHEM 101": the section suffix only makes the label wrap. */
const short = (code: string) => code.replace(/-\d{2,4}$/, '');
/** Course names often start with their own code ("CHEM 101-001: General Chemistry"). */
const title = (r: { code: string; name: string }) => r.name.startsWith(r.code) ? r.name.slice(r.code.length).replace(/^[\s:–-]+/, '') : r.name;

function source(r: Row): string {
  if (r.setting.pnp) return 'pass/no pass';
  if (r.setting.assume) return 'set by you';
  switch (r.result.source) {
    case 'canvas': return 'Canvas';
    case 'percent': return `from ${r.score?.toFixed(1)}%`;
    default: return r.canvasLetter ? 'Canvas' : 'no grade yet';
  }
}

/** What stands in the number's place when there is no number: always a reason, never a bare dash. */
function why(p: ViewProps, m: Model): string {
  if (!m.rows.length) return 'No courses this term';
  if (m.needCredits.length) return 'Credits needed';
  if (m.term.skipped.unknownLetter) return 'Letter not on your scale';
  if (m.rows.every(r => r.result.status === 'excluded')) return 'All courses excluded';
  return 'No grades yet';
}

function figures(p: ViewProps, m: Model): ComponentChild {
  const t = m.term;
  const base = (credits: number) => (credits > 0 ? `from ${fmtCredits(credits)} credits` : '');
  const prior = p.includePrevious;
  const hasPrior = prior && p.priorCredits > 0;
  const value = (n: number | null, credits: number, reason: string) =>
    n === null ? h('span', { class: 'reason' }, reason) : [h('b', null, format2(n)), base(credits)];
  return h('dl', null,
    h('dt', null, prior ? 'Term GPA (projected)' : 'GPA (projected)'),
    h('dd', null, value(t.gpa, t.credits, why(p, m))),
    p.weights ? h('dt', null, prior ? 'Term weighted GPA (projected)' : 'Weighted GPA (projected)') : null,
    p.weights ? h('dd', null, value(t.weightedGpa, t.credits, why(p, m))) : null,
    prior ? h('dt', null, 'Cumulative GPA (projected)') : null,
    prior ? h('dd', null, value(m.cumulative, t.credits + p.priorCredits, !hasPrior ? 'Enter previous GPA and credits' : m.needCredits.length ? 'Credits needed' : why(p, m))) : null,
  );
}

function status(p: ViewProps, m: Model): ComponentChild {
  const included = m.rows.filter(r => r.input.include);
  const counted = m.term.counted;
  const bits: ComponentChild[] = [`${counted} of ${m.rows.length} course${m.rows.length === 1 ? '' : 's'} included`];
  const need = m.rows.filter(r => r.result.status === 'no-credits');
  for (const r of need.slice(0, 2)) {
    bits.push(' · ', h('button', { type: 'button', onClick: () => p.act.toggleEdit(r.id) }, `${short(r.code)} needs credits`));
  }
  if (need.length > 2) bits.push(` · ${need.length - 2} more need credits`);
  const sk = m.term.skipped;
  if (sk.noGrade) bits.push(` · ${sk.noGrade} not graded yet`);
  if (sk.pnp) bits.push(` · ${sk.pnp} pass/no pass`);
  if (sk.unknownLetter) bits.push(` · ${sk.unknownLetter} with a letter not on your scale`);
  if (m.otherTerms) bits.push(` · ${m.otherTerms} from other terms left out`);
  void included;
  return h('p', { class: 'status' }, bits);
}

function how(p: ViewProps, m: Model): ComponentChild {
  const rows = m.rows.filter(r => r.result.status === 'counted');
  if (!rows.length) return null;
  const t = m.term;
  const weighted = p.creditWeighted;
  const cum = p.includePrevious && p.priorCredits > 0 && m.cumulative !== null;
  return h('details', null,
    h('summary', null, 'How is this computed?'),
    h('table', null,
      h('thead', null, h('tr', null, ['Course', 'Letter', 'Points', ...(p.weights ? ['Weighted'] : []), weighted ? 'Credits' : '', weighted ? 'Quality pts' : ''].map(x => h('th', null, x)))),
      h('tbody', null, rows.map(r => h('tr', null,
        h('td', null, short(r.code)),
        h('td', null, r.result.letter),
        h('td', null, format2(r.result.points ?? 0)),
        p.weights ? h('td', null, format2(r.result.weightedPoints ?? r.result.points ?? 0)) : null,
        weighted ? h('td', null, fmtCredits(r.result.credits ?? 0)) : h('td', null),
        weighted ? h('td', null, format2((r.result.points ?? 0) * (r.result.credits ?? 0))) : h('td', null),
      ))),
      h('tfoot', null, h('tr', null,
        h('td', { colSpan: p.weights ? 4 : 3 }, weighted ? 'Sum ÷ credits' : 'Average of course points'),
        h('td', null, weighted ? fmtCredits(t.credits) : ''),
        h('td', null, weighted ? format2(t.qualityPoints) : ''),
      )),
    ),
    p.weights ? h('p', { class: 'note' }, `Weighted: Honors +${p.weights.honors}, AP/IB +${p.weights.ap} on courses with points above 0. (${format2(t.weightedQualityPoints)} ÷ ${fmtCredits(t.credits)}.)`) : null,
    cum ? h('p', { class: 'note' }, `Cumulative: (${format2(t.qualityPoints)} + ${p.priorGpa} × ${fmtCredits(p.priorCredits)}) ÷ ${fmtCredits(t.credits + p.priorCredits)}. Cumulative always uses credits.`) : null,
    h('p', { class: 'note' }, p.rounding === 'truncate' ? 'Truncated to 2 decimals, not rounded.' : 'Rounded to 2 decimals.'),
    h('p', { class: 'note' }, 'Projected: Canvas’s current grade stands in for the final grade.'),
  );
}

function editRow(p: ViewProps, r: Row): ComponentChild {
  const sel = r.setting.pnp ? PNP : r.setting.assume ?? '';
  const defaultLabel = r.canvasLetter ? `${r.canvasLetter} (Canvas)` : r.score !== null ? `from ${r.score.toFixed(1)}%` : 'No grade yet';
  const needs = r.result.status === 'no-credits';
  return h('div', { class: 'row' + (r.input.include ? '' : ' off'), key: r.id },
    h('div', { class: 'name', title: r.name }, short(r.code), ' ', h('span', null, title(r))),
    h('div', { class: 'controls' + (needs ? ' need' : '') },
      h('select', {
        'aria-label': `Letter grade for ${short(r.code)}`,
        value: sel,
        onChange: (e: Event) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          p.act.patchCourse(r.id, v === PNP ? { pnp: true, assume: null } : { pnp: false, assume: v || null });
        },
      },
        h('option', { value: '' }, defaultLabel),
        p.scale.map(x => h('option', { value: x.letter }, `${x.letter} (set by you)`)),
        h('option', { value: PNP }, 'Pass / no pass'),
      ),
      sel && sel !== PNP ? h('button', { type: 'button', 'aria-label': `Use ${r.canvasLetter ? 'Canvas’s' : 'the calculated'} grade for ${short(r.code)}`, onClick: () => p.act.patchCourse(r.id, { assume: null }) }, '↺') : null,
      p.weights ? h('select', {
        'aria-label': `Weight for ${short(r.code)}`, value: r.setting.weight ?? '',
        onChange: (e: Event) => p.act.patchCourse(r.id, { weight: ((e.currentTarget as HTMLSelectElement).value || undefined) as 'honors' | 'ap' | undefined }),
      },
        h('option', { value: '' }, 'Regular'),
        h('option', { value: 'honors' }, `Honors (+${p.weights.honors})`),
        h('option', { value: 'ap' }, `AP/IB (+${p.weights.ap})`),
      ) : null,
      h('label', null,
        h('input', {
          type: 'number', min: 0, max: 12, step: 0.5, inputMode: 'decimal', 'data-credits': r.id,
          'aria-label': `Credits for ${short(r.code)}`, value: r.setting.credits ?? '', placeholder: 'needed',
          onChange: (e: Event) => {
            const el = e.currentTarget as HTMLInputElement;
            const v = parseNumber(el.value, 0, 12);
            if (v === undefined) { el.classList.add('bad'); return; }
            el.classList.remove('bad');
            p.act.patchCourse(r.id, { credits: v });
          },
        }),
        'credits'),
      h('label', null,
        h('input', { type: 'checkbox', checked: r.input.include, 'aria-label': `Include ${short(r.code)} in GPA`, onChange: (e: Event) => p.act.patchCourse(r.id, { include: (e.currentTarget as HTMLInputElement).checked }) }),
        'include'),
      h('span', { class: 'src' }, `${r.result.letter ?? ''}${r.result.letter ? ' · ' : ''}${source(r)}${r.result.points !== null ? ` · ${format2(r.result.points)}` : ''}`),
    ),
  );
}

function editor(p: ViewProps, m: Model): ComponentChild {
  return h('div', { class: 'edit' },
    m.rows.length ? m.rows.map(r => editRow(p, r)) : h('p', { class: 'none' }, 'No courses this term.'),
    h('div', { class: 'opts' },
      h('label', null, h('input', { type: 'checkbox', checked: p.includePrevious, onChange: (e: Event) => p.act.set({ includePrevious: (e.currentTarget as HTMLInputElement).checked }) }), 'Include previous terms'),
      p.includePrevious ? h('div', { class: 'controls' },
        h('label', null, 'Previous GPA', h('input', {
          type: 'number', min: 0, max: 5, step: 0.01, value: p.priorGpa || '', 'aria-label': 'Previous GPA',
          onChange: (e: Event) => { const v = parseNumber((e.currentTarget as HTMLInputElement).value, 0, 5); if (v !== undefined) p.act.set({ priorGpa: v ?? 0 }); },
        })),
        h('label', null, 'Previous credits', h('input', {
          type: 'number', min: 0, max: 1000, step: 0.5, value: p.priorCredits || '', 'aria-label': 'Previous credits',
          onChange: (e: Event) => { const v = parseNumber((e.currentTarget as HTMLInputElement).value, 0, 1000); if (v !== undefined) p.act.set({ priorCredits: v ?? 0 }); },
        })),
      ) : null,
    ),
  );
}

export function View(p: ViewProps): ComponentChild {
  const m = p.model;
  return h('section', { class: 'gpa', 'aria-label': 'GPA' },
    h('header', null,
      h('button', { type: 'button', class: 'chev', 'aria-expanded': String(!p.collapsed), 'aria-label': p.collapsed ? 'Expand GPA' : 'Collapse GPA', onClick: p.act.toggleCollapsed }, '▾'),
      h('h2', null, 'GPA'),
      h('button', { type: 'button', class: 'gear', 'aria-label': 'GPA settings', title: 'Settings', onClick: p.act.openSettings }, '⚙'),
      !p.collapsed && m ? h('button', { type: 'button', onClick: () => p.act.toggleEdit() }, p.editing ? 'Done' : 'Edit') : null,
    ),
    p.collapsed || !m ? null : [figures(p, m), status(p, m), how(p, m), p.editing ? editor(p, m) : null],
  );
}
