// The Goal box's behaviour, shared by the Grades-page widget (index.ts) and the
// dashboard popover (popover.ts): loads the course, its assignment groups and
// grading scheme, and draws the box into a shadow root.

import { h, render } from 'preact';
import type { Ctx } from '../../core/ctx.ts';
import type { AssignmentGroup, Course as ApiCourse } from '../../core/canvas/data.ts';
import { openSettings } from '../../core/settings-link.ts';
import { fromApi } from '../grade-engine/engine.ts';
import { periodKey, periodOpts, periodState } from '../grade-engine/periods.ts';
import { boxState, parseScheme, type Goal, type GoalMap, type Scheme } from './model.ts';
import { View } from './view.ts';

export interface BoxSource {
  /** Current goals (the setting). */
  goals(): GoalMap;
  /** Persist the full goals map. */
  save(next: GoalMap): void;
}

export interface Box {
  /** Settings or goals changed: draw again (never clobbers a half-typed field). */
  refresh(): void;
  stop(): void;
}

export function mountGoalBox(ctx: Ctx, courseId: string, root: ShadowRoot, src: BoxSource): Box {
  let groups: AssignmentGroup[] | null = null;
  /** Which period's groups we asked for; a late answer for another key is ignored. */
  let groupsKey: string | null = null;
  let apiCourse: ApiCourse | null = null;
  let scheme: Scheme | null = null;
  let stopped = false;
  let pendingDraw = false;

  const mount = document.createElement('div');
  root.appendChild(mount);

  const draw = () => {
    if (stopped) return;
    const course = groups ? fromApi(groups, apiCourse?.apply_assignment_group_weights) : null;
    const omitted = groups ? groups.reduce((n, g) => n + (g.assignments ?? []).filter(a => a.omit_from_final_grade).length, 0) : 0;
    const goal = src.goals()[courseId] ?? null;
    // A focused field may hold text not yet committed; a re-render must not wipe it.
    const ae = root.activeElement;
    const keep = ae instanceof HTMLInputElement ? { el: ae, v: ae.value } : null;
    render(
      h(View, {
        loading: !groups || !apiCourse, course, api: apiCourse, goal, scheme, omitted,
        openSettings: () => openSettings('grade-goals'),
        setGoal: (g: Goal | null) => {
          const next = { ...src.goals() };
          if (g) next[courseId] = g;
          else delete next[courseId];
          src.save(next);
        },
      }),
      mount,
    );
    if (keep && keep.el.isConnected && keep.el.value !== keep.v) keep.el.value = keep.v;
    // A course that hides its totals draws nothing: take the empty host's space away too.
    (root.host as HTMLElement).style.display = mount.childElementCount === 0 ? 'none' : '';
    // Surface disagreement in the console for the health pass; never show a wrong number.
    if (course && apiCourse) {
      const st = boxState(course, apiCourse, null);
      if (st.kind === 'mismatch') console.warn(`[b2c] grade-goals: engine ${st.ours?.toFixed(2)} vs Canvas ${st.canvas.toFixed(2)} for course ${courseId}; goals are off`);
    }
  };
  const refresh = () => {
    if (root.activeElement instanceof HTMLInputElement) {
      if (!pendingDraw) {
        pendingDraw = true;
        root.addEventListener('focusout', () => { pendingDraw = false; queueMicrotask(draw); }, { once: true });
      }
      return;
    }
    draw();
  };

  draw();
  void ctx.env().then(env => {
    scheme = parseScheme((env as Record<string, unknown> | null)?.course_active_grading_scheme);
    refresh();
  });
  // The groups request depends on the course's current grading period, which
  // comes with the courses data (cached, so a warm load asks at once).
  const requestGroups = () => {
    if (!apiCourse) return;
    const period = periodState(apiCourse);
    const opts = periodOpts(period);
    if (opts === null) { groups = null; groupsKey = null; return; } // can't tell which period: the box declines
    const key = periodKey(period);
    if (key === groupsKey) return;
    groupsKey = key;
    groups = null;
    ctx.data.assignmentGroups(courseId, g => {
      if (groupsKey !== key) return;
      groups = g;
      refresh();
    }, opts).catch(e => console.warn('[b2c] grade-goals: assignment groups unavailable', e));
  };
  ctx.data.courses(cs => {
    apiCourse = cs.find(c => c.id === courseId) ?? apiCourse;
    requestGroups();
    refresh();
  }).catch(e => console.warn('[b2c] grade-goals: courses unavailable', e));

  return {
    refresh,
    stop() {
      stopped = true;
      render(null, mount);
      mount.remove();
    },
  };
}
