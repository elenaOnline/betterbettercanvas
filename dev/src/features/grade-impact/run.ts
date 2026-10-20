// grade-impact runtime: loaded lazily (chunks/grade-impact.js) on the dashboard.
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import type { Values } from '../../core/settings/schema.ts';
import { widgetHost } from '../../core/dom.ts';
import type { AssignmentGroup, Course } from '../../core/canvas/data.ts';
import { currentScore } from '../../core/canvas/data.ts';
import { periodKey, periodOpts, periodState } from '../grade-engine/periods.ts';
import { ITEM_SLOT_SELECTOR } from '../card-assignments/anchors.ts';
import { impactFor, parsePlannable, prepare, type CourseImpact } from './model.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;

// Compact "−4.2 / +1.8" after the due text on each card row (design:
// surfaces/card-assignments.md, "Grade impact"). The card lane exposes a
// light-DOM slot span per row (data-b2c-plannable / data-b2c-course), so we
// never reach into its shadow root.

const CSS = `
:host { display: inline; white-space: nowrap; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--b2c-w-text-secondary, #6b7780); margin-left: var(--b2c-space-2, 8px); }
`;

export function start(ctx: Ctx): Instance<S> {
  let stopped = false;
  const courses = new Map<string, Course>();
  const groups = new Map<string, AssignmentGroup[]>();
  const prepared = new Map<string, CourseImpact | null>();
  /** courseId -> period key the groups were requested for / have arrived for. */
  const requested = new Map<string, string>();
  const keys = new Map<string, string>();
  const byCourse = new Map<string, Set<() => void>>();

  const refresh = (courseId: string) => {
    const g = groups.get(courseId);
    const c = courses.get(courseId);
    if (!c) return;
    const period = periodState(c);
    // A course whose current grading period can't be told apart declines: no groups are asked for.
    if (period.kind === 'unknown') {
      prepared.set(courseId, prepare([], c.apply_assignment_group_weights, null, !!c.hide_final_grades, period));
    } else if (g && keys.get(courseId) === periodKey(period)) {
      prepared.set(courseId, prepare(g, c.apply_assignment_group_weights, currentScore(c), !!c.hide_final_grades, period));
    } else {
      return; // wait for the groups of the right period: never show unchecked numbers
    }
    for (const r of byCourse.get(courseId) ?? []) r();
  };

  // Groups depend on the course's current grading period, which comes with the courses data.
  const request = (courseId: string) => {
    const c = courses.get(courseId);
    if (!c) return;
    const period = periodState(c);
    const opts = periodOpts(period);
    if (opts === null) return;
    const key = periodKey(period);
    if (requested.get(courseId) === key) return;
    requested.set(courseId, key);
    ctx.data.assignmentGroups(courseId, g => {
      if (requested.get(courseId) !== key) return;
      groups.set(courseId, g);
      keys.set(courseId, key);
      refresh(courseId);
    }, opts).catch(e => console.warn('[b2c] grade-impact: assignment groups unavailable', courseId, e));
  };

  ctx.data.courses(cs => {
    for (const c of cs) courses.set(c.id, c);
    for (const id of byCourse.keys()) {
      request(id);
      refresh(id);
    }
  }).catch(e => console.warn('[b2c] grade-impact: courses unavailable', e));

  const off = ctx.dom.each(ITEM_SLOT_SELECTOR, el => {
    const plannable = el.getAttribute('data-b2c-plannable');
    const courseId = el.getAttribute('data-b2c-course');
    if (!parsePlannable(plannable) || !courseId) return;
    const { host, root } = widgetHost('impact', CSS);
    const text = document.createElement('span');
    root.appendChild(text);
    let shownKey = '';
    const draw = () => {
      if (stopped) return;
      const ci = prepared.get(courseId);
      const r = ci ? impactFor(ci, plannable!) : null;
      if (!r) {
        if (host.isConnected) host.remove();
        shownKey = '';
        return;
      }
      const key = r.shown.down + r.shown.up;
      if (key !== shownKey) {
        shownKey = key;
        text.textContent = `${r.shown.down} / ${r.shown.up}`;
        host.title = r.shown.title;
        host.setAttribute('role', 'text');
        host.setAttribute('aria-label', `Grade impact: ${r.shown.title}`);
      }
      if (!host.isConnected) el.appendChild(host);
    };
    if (!byCourse.has(courseId)) byCourse.set(courseId, new Set());
    byCourse.get(courseId)!.add(draw);
    request(courseId);
    if (prepared.has(courseId)) draw();
    else refresh(courseId);
    return () => {
      byCourse.get(courseId)?.delete(draw);
      host.remove();
    };
  });

  return {
    stop() {
      stopped = true;
      off();
      byCourse.clear();
    },
  };
}
