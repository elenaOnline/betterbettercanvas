// Scheduled dark mode flips exactly at the boundary, with one timer and no
// polling (dark-mode.md §2). nextBoundaryMs() says how long to wait.

import type { CondAttr } from './feature.ts';

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
};

/**
 * Milliseconds from `now` until the next start or end of any time window in
 * `conds` (local wall clock), or null if there are none. Always > 0, so a
 * timer fired exactly at a boundary schedules the following one.
 */
export function nextBoundaryMs(conds: readonly CondAttr[], now: Date): number | null {
  let best: number | null = null;
  for (const c of conds) {
    if (!('start' in c.when)) continue;
    for (const t of [c.when.start, c.when.end]) {
      const target = new Date(now);
      const mins = minutes(t);
      target.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
      const ms = target.getTime() - now.getTime();
      if (best === null || ms < best) best = ms;
    }
  }
  return best;
}
