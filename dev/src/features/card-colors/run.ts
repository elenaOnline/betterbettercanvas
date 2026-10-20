// card-colors runtime: loaded lazily (chunks/card-colors.js) on any Canvas page.
import type { Ctx } from '../../core/ctx.ts';
import { ApiError } from '../../core/canvas/api.ts';
import type { DashboardCard } from '../../core/canvas/data.ts';
import type { Values } from '../../core/settings/schema.ts';
import { SEL, cardColor, cardCourseId, currentCards, paintCard } from '../card-assignments/anchors.ts';
import { acquireToast, hideToast, showToast } from '../../core/toast.ts';
import { colorsFor, makeColorRequest, normHex, type ColorRequest } from './palettes.ts';
import type { Instance } from '../../core/feature.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;

const DAY = 86_400_000;

export function start(ctx: Ctx, initial: S): Instance<S> {
  let s = initial;
  let stopped = false;
  let busy = false;
  /** Colours this page has painted; reapplied if Canvas re-renders a card. */
  const painted = new Map<string, string>();
  const releaseToast = acquireToast();
  const onDashboard = ctx.page.kind === 'dashboard';

  const repaint = (courseId: string, hex: string) => {
    for (const c of currentCards()) if (c.courseId === courseId) paintCard(c.el, hex);
  };

  const off = onDashboard
    ? ctx.dom.each(SEL.card, el => {
        const id = cardCourseId(el);
        const hex = id ? painted.get(id) : undefined;
        if (hex) paintCard(el, hex);
      })
    : () => {};

  const first = <T>(f: (cb: (v: T) => void) => Promise<unknown>) =>
    new Promise<T>((resolve, reject) => {
      let done = false;
      f(v => {
        if (!done) {
          done = true;
          resolve(v);
        }
      }).then(
        () => {},
        e => (done ? undefined : reject(e)),
      );
    });

  async function courseOrder(): Promise<string[]> {
    // Dashboard order is Canvas's (dashboard_positions); the cards on the page
    // are the same list when we're on the dashboard.
    const dom = currentCards().map(c => c.courseId);
    if (dom.length) return [...new Set(dom)];
    const cards = await first<DashboardCard[]>(cb => ctx.data.dashboardCards(cb));
    return cards.map(c => String(c.id));
  }

  async function apply(req: ColorRequest) {
    if (busy) return;
    busy = true;
    try {
      // Claim it first, so a second Canvas tab doesn't apply it too.
      await ctx.set({ 'card-colors.applied': req.id });
      const ids = await courseOrder();
      if (!ids.length) return;
      const current = await first<Record<string, string>>(cb => ctx.data.colors(cb)).catch(() => ({}) as Record<string, string>);
      const before: Record<string, string> = {};
      for (const id of ids) {
        const domHex = currentCards().find(c => c.courseId === id)?.el;
        const hex = current[`course_${id}`] ?? (domHex ? cardColor(domHex) : null);
        if (hex) before[id] = normHex(hex) ?? hex;
      }

      let target: Record<string, string> = {};
      if (req.mode === 'revert') {
        const p = s.previous;
        if (!p || ctx.now().getTime() - p.at > DAY) return;
        target = { ...p.colors };
      } else {
        const list = colorsFor(req, ids.length);
        if (!list) return;
        ids.forEach((id, i) => (target[id] = list[i]!));
      }

      // Optimistic: paint everything now.
      for (const [id, hex] of Object.entries(target)) {
        painted.set(id, hex);
        repaint(id, hex);
      }
      if (req.mode !== 'revert') await ctx.set({ 'card-colors.previous': { at: ctx.now().getTime(), colors: before } });
      else await ctx.set({ 'card-colors.previous': null });

      // Write to Canvas one at a time (Canvas rate-limits bursts).
      const failed: string[] = [];
      let refused = false;
      for (const [id, hex] of Object.entries(target)) {
        if (stopped) return;
        try {
          await ctx.data.setColor(id, hex);
        } catch (e) {
          failed.push(id);
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) refused = true;
          const old = before[id];
          if (old) {
            painted.set(id, old);
            repaint(id, old);
          } else painted.delete(id);
        }
      }
      if (!onDashboard) return;
      if (refused) showToast({ message: "This school doesn't allow changing course colors" });
      else if (failed.length) {
        showToast({
          message: `Couldn't save ${failed.length} card color${failed.length > 1 ? 's' : ''} to Canvas`,
          action: { label: 'Retry', run: () => void ctx.set({ 'card-colors.request': { ...req, id: req.id + '-r' } }) },
        });
      } else if (req.mode === 'revert') showToast({ message: 'Card colors restored' });
      else
        showToast({
          message: 'Card colors saved to Canvas',
          action: { label: 'Undo', undo: true, run: () => void ctx.set({ 'card-colors.request': makeColorRequest({ mode: 'revert' }) }) },
        });
    } finally {
      busy = false;
    }
  }

  // Exactly once across tabs: a Web Lock (shared by every tab on this
  // Canvas origin), then a fresh read of `applied` inside it.
  const claimAndApply = async (r: ColorRequest) => {
    const run = async () => {
      const fresh = (await chrome.storage.local.get('card-colors.applied'))['card-colors.applied'];
      if (stopped || fresh === r.id) return;
      await apply(r);
    };
    if (navigator.locks) await navigator.locks.request('b2c:card-colors', run);
    else await run();
  };
  const check = () => {
    const r = s.request;
    if (!stopped && r && r.id !== s.applied) void claimAndApply(r);
  };
  check();

  return {
    update(next) {
      s = next;
      check();
    },
    stop() {
      stopped = true;
      off();
      // Canvas's own colours stay as written (they're Canvas state); only
      // our in-page paint memory goes.
      painted.clear();
      hideToast();
      releaseToast();
    },
  };
}
