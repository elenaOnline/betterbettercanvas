// gpa-calculator runtime: loaded lazily (chunks/gpa-calculator.js) on the dashboard.
import { h, render } from 'preact';
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import type { Values } from '../../core/settings/schema.ts';
import { widgetHost } from '../../core/dom.ts';
import type { Course } from '../../core/canvas/data.ts';
import { resolveScale } from './gpa.ts';
import { buildModel, type CourseMap, type CourseSetting } from './model.ts';
import { openSettings } from '../../core/settings-link.ts';
import { keepAttached } from '../grade-engine/mount.ts';
import { mountInSidePanel } from '../../core/side-panel.ts';
import { ANCHORS } from './anchors.ts';
import { css } from './style.ts';
import { View } from './view.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;

export function start(ctx: Ctx, initial: S): Instance<S> {
  let s = initial;
  let courses: Course[] | null = null;
  let editing = false;
  let stopped = false;
  // Course edits are written optimistically: quick successive edits (Tab, Tab) must not
  // overwrite each other with a stale copy of the setting.
  let courseMap = s.courses;
  let writes = 0;
  const writeCourses = (m: CourseMap) => {
    courseMap = m;
    writes++;
    void ctx.set({ 'gpa-calculator.courses': m }).finally(() => { writes--; if (!writes) redraw(); });
    draw();
  };
  let pendingDraw = false;
  let focusCourse: string | null = null;

  const { host, root } = widgetHost('gpa', css);
  const mount = document.createElement('div');
  root.appendChild(mount);

  const draw = () => {
    if (stopped) return;
    const eff = resolveScale(s.scale, s.rounding, location.hostname);
    const model = courses
      ? buildModel(courses, courseMap, eff.scale, { creditWeighted: true, rounding: eff.rounding, weights: s.weights, prior: s.includePrevious && s.priorCredits > 0 ? { gpa: s.priorGpa, credits: s.priorCredits } : null }, ctx.now())
      : null;
    // A focused field may hold text not yet committed; a re-render must not wipe it.
    const ae = root.activeElement;
    const keep = ae instanceof HTMLInputElement ? { el: ae, v: ae.value } : null;
    render(
      h(View, {
        model, scale: eff.scale, weights: s.weights, creditWeighted: true, rounding: eff.rounding, includePrevious: s.includePrevious,
        priorGpa: s.priorGpa, priorCredits: s.priorCredits, collapsed: s.collapsed, editing,
        act: {
          openSettings: () => openSettings('gpa-calculator'),
          toggleCollapsed: () => void ctx.set({ 'gpa-calculator.collapsed': !s.collapsed }),
          toggleEdit: id => { editing = id ? true : !editing; focusCourse = id ?? null; draw(); },
          patchCourse: (id, patch) => writeCourses(mergeCourse(courseMap, id, patch)),
          set: values => void ctx.set(Object.fromEntries(Object.entries(values).map(([k, v]) => [`gpa-calculator.${k}`, v]))),
        },
      }),
      mount,
    );
    if (keep && keep.el.isConnected && keep.el.value !== keep.v) keep.el.value = keep.v;
    if (focusCourse) {
      const el = root.querySelector<HTMLElement>(`[data-credits="${CSS.escape(focusCourse)}"]`);
      el?.focus();
      focusCourse = null;
    }
  };

  // Data and settings changes must not clobber a half-typed field.
  const typing = () => root.activeElement instanceof HTMLInputElement && root.activeElement.type === 'number';
  const redraw = () => {
    if (typing()) {
      if (!pendingDraw) {
        pendingDraw = true;
        root.addEventListener('focusout', () => { pendingDraw = false; queueMicrotask(draw); }, { once: true });
      }
      return;
    }
    draw();
  };

  // ── placement ───────────────────────────────────────────────────────────
  let unplace: (() => void) | null = null;
  const place = () => {
    unplace?.();
    if (s.aboveCards) {
      unplace = keepAttached(host, () => {
        const cards = document.querySelector(ANCHORS.cards);
        if (cards) return void cards.parentElement?.insertBefore(host, cards);
        // New dashboard (the owner's): above the grid inside the Courses tab.
        const tab = document.querySelector(ANCHORS.coursesTab);
        if (tab && tab.firstElementChild !== host) tab.prepend(host);
      });
    } else {
      unplace = mountInSidePanel(ctx.dom, host, 30);
    }
  };
  place();
  draw();

  ctx.data.courses(c => {
    courses = c;
    redraw();
  }).catch(e => console.warn('[b2c] gpa-calculator: courses unavailable', e));

  return {
    update(next) {
      const moved = next.aboveCards !== s.aboveCards;
      s = next;
      if (!writes) courseMap = next.courses;
      if (moved) place();
      redraw();
    },
    stop() {
      stopped = true;
      unplace?.();
      host.remove();
      render(null, mount);
    },
  };
}

function mergeCourse(map: CourseMap, id: string, patch: CourseSetting): CourseMap {
  const next: CourseSetting = { ...(map[id] ?? {}), ...patch };
  // Keep the stored map small: drop empty/default fields.
  if (next.credits == null) delete next.credits;
  if (!next.assume) delete next.assume;
  if (!next.pnp) delete next.pnp;
  if (!next.weight) delete next.weight;
  const out = { ...map };
  if (Object.keys(next).length) out[id] = next;
  else delete out[id];
  return out;
}
