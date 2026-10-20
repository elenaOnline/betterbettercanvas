// pins (v2): week-aware bookmarks. A pin is { id, label, icon?, target }; the
// target is a link or a query resolved live against Canvas data ("this week's
// module in MATH 401", "newest lecture file", "next thing due").
//
// This is the definition that lives in main.js on every page, so it stays
// tiny: settings, the pre-paint mirror, and a start() that only registers the
// ⌘K commands and the Pins result source as thin wrappers. Everything else
// (resolvers, week model, dock, editor) is run.ts, a lazy chunk loaded only
// where the dock shows, or when a command or a search actually needs it.

import { defineFeature, preloadRuntime, type MirrorPart } from '../../core/feature.ts';
import { bool, json, oneOf, type Values } from '../../core/settings/schema.ts';
import { anchors } from './anchors.ts';
import type { Pin } from './model.ts';

/** Cheap shape check for storage; run.ts validates each pin fully before use. */
const listLike = (v: unknown): v is Pin[] =>
  Array.isArray(v) && v.length <= 24 && v.every(p => !!p && typeof p === 'object' && typeof p.id === 'string' && typeof p.label === 'string' && !!p.target && typeof p.target === 'object');

const settings = {
  enabled: bool(false),
  list: json<Pin[]>([], { area: 'sync', check: listLike }),
  /** Show the dock on the dashboard. */
  dashboard: bool(true),
  /** Show the dock under the course navigation. */
  courseNav: bool(true),
  /** On a course page: that course's pins (and course-less ones), or every pin. */
  scope: oneOf(['course', 'all'], 'course'),
  /** From this day on, a week pin also shows next week's module (and fills a gap with it). */
  upcomingFrom: oneOf(['thu', 'fri', 'never'], 'thu'),
};

export type PinSettings = Values<typeof settings>;
type Run = typeof import('./run.ts');
const runtime = () => preloadRuntime('pins', 'chunks/pins.js') as unknown as Promise<Run>;

export default defineFeature({
  id: 'pins',
  settings,
  pages: 'all',
  anchors,
  // Reserve the dashboard bar's row before first paint (style.css).
  mirror: (s): MirrorPart => (s.dashboard ? { attrs: { 'data-b2c-pins-dash': '' } } : {}),

  start(ctx, initial) {
    let s = initial;
    const get = () => s;
    const p = ctx.page;
    let dock: { update(): void; stop(): void } | null = null;
    let stopped = false;
    const wanted = () => (p.kind === 'dashboard' && s.dashboard) || (!!p.courseId && s.courseNav);
    const sync = () => {
      if (dock && !wanted()) (dock.stop(), (dock = null));
      else if (dock) dock.update();
      else if (wanted()) void runtime().then(r => !stopped && !dock && wanted() && (dock = r.startDock(ctx, get)));
    };

    const offs: (() => void)[] = [];
    const cmd = (id: string, title: string, which: 'page' | 'week') =>
      offs.push(ctx.commands.register({ id, title, keywords: ['pin', 'bookmark', 'dock'], run: async () => (await runtime()).pinHere(ctx, get, which) }));
    if (p.kind !== 'dashboard') cmd('pins.pin-this-page', 'Pin this page', 'page');
    if (p.courseId && (p.kind === 'course-home' || p.kind === 'modules' || /\/pages\/[^/]*w(ee)?k/i.test(location.pathname)))
      cmd('pins.pin-this-week', "Pin this week's module in this course", 'week');
    offs.push(ctx.commands.source({ id: 'pins', group: 'Pins', search: async q => (s.list.length ? (await runtime()).searchPins(ctx, get, q) : []) }));

    sync();
    return {
      update(next) {
        s = next;
        sync();
      },
      stop() {
        stopped = true;
        offs.forEach(f => f());
        dock?.stop();
        dock = null;
      },
    };
  },
});
