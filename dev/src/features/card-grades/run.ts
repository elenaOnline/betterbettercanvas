// card-grades runtime: loaded lazily (chunks/card-grades.js) on the dashboard.
import type { Ctx } from '../../core/ctx.ts';
import type { Course } from '../../core/canvas/data.ts';
import type { Instance } from '../../core/feature.ts';
import type { Values } from '../../core/settings/schema.ts';
import { widgetHost } from '../../core/dom.ts';
import { SEL, cardCourseId } from '../card-assignments/anchors.ts';
import { chipFor } from './grade.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;

const STYLE = `
:host { all: initial; display: block; font-family: inherit; }
a { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: var(--b2c-radius-sm, 2px);
  background: color-mix(in srgb, var(--b2c-w-bg, #fff) 92%, transparent); color: var(--b2c-w-text, #2d3b45); font-size: 13px; font-weight: 600;
  font-variant-numeric: tabular-nums; text-decoration: none; white-space: nowrap; line-height: 1; }
a.none { color: var(--b2c-w-text-secondary, #6b7780); font-weight: 400; }
a:hover { text-decoration: underline; }
a:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 2px; }
:host([hidden]) { display: none; }
`;

class GradeChip {
  readonly host: HTMLElement;
  private a: HTMLAnchorElement;
  constructor(readonly courseId: string) {
    const w = widgetHost('card-grade', STYLE);
    this.host = w.host;
    this.host.hidden = true;
    this.a = document.createElement('a');
    this.a.href = `/courses/${encodeURIComponent(courseId)}/grades`;
    w.root.appendChild(this.a);
  }
  render(c: Course | undefined) {
    const chip = chipFor(c);
    if (chip.kind === 'hidden') {
      this.host.hidden = true;
      return;
    }
    this.host.hidden = false;
    this.a.textContent = chip.text;
    this.a.className = chip.kind === 'none' ? 'none' : '';
    const name = c?.name ?? 'this course';
    this.a.setAttribute('aria-label', chip.kind === 'none' ? `Grades for ${name}: no grade yet` : `Grades for ${name}: ${chip.text.replace('%', ' percent')}`);
    this.a.title = chip.kind === 'none' ? 'No current score yet' : 'Current score (ungraded work excluded), as Canvas shows it';
  }
}

export function start(ctx: Ctx): Instance<S> {
  let byId = new Map<string, Course>();
  const chips = new Set<GradeChip>();
  let stopped = false;

  const renderAll = () => {
    if (stopped) return;
    for (const c of chips) {
      if (!c.host.isConnected) chips.delete(c);
      else c.render(byId.get(c.courseId));
    }
  };

  ctx.data
    .courses(list => {
      byId = new Map(list.map(c => [String(c.id), c]));
      renderAll();
    })
    .catch(() => {
      /* keep whatever the cache showed; no chip beats a wrong one */
    });

  const off = ctx.dom.each(SEL.card, el => {
    const id = cardCourseId(el);
    const header = el.querySelector(SEL.header);
    if (!id || !header) return;
    const chip = new GradeChip(id);
    chip.render(byId.get(id));
    header.appendChild(chip.host);
    chips.add(chip);
    return () => {
      chip.host.remove();
      chips.delete(chip);
    };
  });

  return {
    update() {
      // hoverOnly is pure CSS (mirror attribute); nothing to redo.
    },
    stop() {
      stopped = true;
      off();
      for (const c of chips) c.host.remove();
      chips.clear();
    },
  };
}
