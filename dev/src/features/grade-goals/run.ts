// grade-goals runtime: loaded lazily (chunks/grade-goals.js) on the Grades page.
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import type { Values } from '../../core/settings/schema.ts';
import { widgetHost } from '../../core/dom.ts';
import { keepAttached } from '../grade-engine/mount.ts';
import { ANCHORS } from './anchors.ts';
import { mountGoalBox } from './box.ts';
import { css } from './style.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;

export function start(ctx: Ctx, initial: S): Instance<S> | undefined {
  const courseId = ctx.page.courseId;
  if (!courseId) return;
  let s = initial;
  const { host, root } = widgetHost('grade-goals', css);
  const box = mountGoalBox(ctx, courseId, root, {
    goals: () => s.goals,
    save: next => void ctx.set({ 'grade-goals.goals': next }),
  });
  const detach = keepAttached(host, () => {
    const right = document.querySelector(ANCHORS.rightContent) ?? document.querySelector(ANCHORS.rightSide);
    if (right) right.prepend(host);
  });

  return {
    update(next) {
      s = next;
      box.refresh();
    },
    stop() {
      box.stop();
      detach();
    },
  };
}
