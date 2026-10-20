// Pure course-grade engine for grade-goals (and, later, grade-impact).
// Follows Canvas's algorithm: points are pooled when the course is unweighted;
// when group weights apply, each group's percent is weighted and the weights
// are renormalised over groups that have something in them. Drop rules are
// applied per group. "Final" counts unscored work as 0; "current" ignores it.
// Unverified against Canvas for weight sums over 100 (treated as extra credit:
// divided by 100). The widget compares `current` with Canvas's own number and
// says so when they disagree.

import type { AssignmentGroup } from '../../core/canvas/data.ts';

export interface Item {
  id: string;
  name: string;
  /** Points possible (null/0 = nothing to earn). */
  possible: number;
  /** Points earned; null = not graded yet. */
  score: number | null;
  /** Past due date, for display only. */
  dueAt?: string | null;
}

export interface Group {
  id: string;
  name: string;
  /** Percent weight (only used when the course is weighted). */
  weight: number;
  dropLowest: number;
  dropHighest: number;
  neverDrop: string[];
  items: Item[];
}

export interface Course {
  weighted: boolean;
  groups: Group[];
}

/** Hypothetical score for every unscored item, as a fraction of its points (0.9 = 90%). */
export type Assume = number | null;

interface Entry { id: string; s: number; p: number }

/**
 * Keep-set after drop rules, maximising the group's kept percent (Canvas drops
 * the items that help the student most). Fixed-cardinality fractional
 * programming, solved by Dinkelbach iteration.
 */
export function applyDrops(entries: Entry[], dropLowest: number, dropHighest: number, neverDrop: readonly string[]): Entry[] {
  const keep = (list: Entry[], k: number, best: boolean): Entry[] => {
    // Choose the k entries (of `list`) maximising (best) or minimising sum(s)/sum(p).
    if (k >= list.length) return list;
    if (k <= 0) return [];
    const sign = best ? 1 : -1;
    let q = list.reduce((a, e) => a + e.s, 0) / (list.reduce((a, e) => a + e.p, 0) || 1);
    let chosen = list;
    for (let i = 0; i < 50; i++) {
      chosen = [...list].sort((a, b) => sign * ((b.s - q * b.p) - (a.s - q * a.p))).slice(0, k);
      const p = chosen.reduce((a, e) => a + e.p, 0);
      const nq = p > 0 ? chosen.reduce((a, e) => a + e.s, 0) / p : q;
      if (Math.abs(nq - q) < 1e-12) break;
      q = nq;
    }
    return chosen;
  };
  if (dropLowest <= 0 && dropHighest <= 0) return entries;
  const fixed = entries.filter(e => neverDrop.includes(e.id));
  const free = entries.filter(e => !neverDrop.includes(e.id));
  // Canvas always leaves at least one item.
  let dl = Math.min(dropLowest, Math.max(0, free.length - 1));
  let dh = Math.min(dropHighest, Math.max(0, free.length - 1 - dl));
  let kept = free;
  if (dl > 0) kept = keep(kept, kept.length - dl, true);
  if (dh > 0) kept = keep(kept, kept.length - dh, false);
  return [...fixed, ...kept];
}

export interface GroupSum { id: string; name: string; weight: number; earned: number; possible: number; items: number }

/** Sum one group. `mode` 'current' skips unscored items; 'final' scores them via `assume` (default 0). */
export function groupSum(g: Group, mode: 'current' | 'final', assume: Assume = null): GroupSum {
  const entries: Entry[] = [];
  for (const it of g.items) {
    if (!(it.possible > 0)) continue;
    if (it.score !== null) entries.push({ id: it.id, s: it.score, p: it.possible });
    else if (mode === 'final') entries.push({ id: it.id, s: (assume ?? 0) * it.possible, p: it.possible });
  }
  const kept = applyDrops(entries, g.dropLowest, g.dropHighest, g.neverDrop);
  return {
    id: g.id,
    name: g.name,
    weight: g.weight,
    earned: kept.reduce((a, e) => a + e.s, 0),
    possible: kept.reduce((a, e) => a + e.p, 0),
    items: kept.length,
  };
}

/** Course percent (0-100+), or null when nothing counts. */
export function coursePercent(c: Course, mode: 'current' | 'final', assume: Assume = null): number | null {
  const sums = c.groups.map(g => groupSum(g, mode, assume));
  if (!c.weighted) {
    const e = sums.reduce((a, s) => a + s.earned, 0);
    const p = sums.reduce((a, s) => a + s.possible, 0);
    return p > 0 ? (e / p) * 100 : null;
  }
  const rel = sums.filter(s => s.possible > 0 && s.weight > 0);
  if (!rel.length) return null;
  const wsum = rel.reduce((a, s) => a + s.weight, 0);
  const num = rel.reduce((a, s) => a + (s.earned / s.possible) * s.weight, 0);
  return (num / Math.min(wsum, 100)) * 100;
}

/** Unscored, earnable items (what is "left"). */
export function remainingItems(c: Course): Item[] {
  return c.groups.flatMap(g => g.items.filter(i => i.score === null && i.possible > 0));
}

export type GoalResult =
  | { kind: 'no-remaining'; current: number | null; final: number | null }
  | { kind: 'secured'; floor: number; current: number | null } //   target met even with 0 on the rest
  | { kind: 'unreachable'; ceiling: number; current: number | null } // target missed even with full marks
  | {
      kind: 'need';
      /** Average percent needed on the remaining items (0-100). */
      needed: number;
      /** Points needed across the remaining items, at that average. */
      neededPoints: number;
      remainingPoints: number;
      remainingCount: number;
      current: number | null;
      floor: number;
      ceiling: number;
    };

/**
 * What average percent on every unscored item ends the course at `target`
 * percent? Final percent is monotone in that average (more is never worse),
 * so bisection is exact to the tolerance. Full marks is `ceiling`; 0 is `floor`.
 * `maxAssume` lets extra-credit-capable courses be asked beyond 100%; default 1.
 */
export function solveGoal(c: Course, target: number, maxAssume = 1): GoalResult {
  const rem = remainingItems(c);
  const current = coursePercent(c, 'current');
  const floor = coursePercent(c, 'final', 0);
  if (!rem.length) return { kind: 'no-remaining', current, final: floor };
  const ceiling = coursePercent(c, 'final', maxAssume);
  if (floor === null || ceiling === null) return { kind: 'no-remaining', current, final: floor };
  const eps = 1e-9;
  if (floor + eps >= target) return { kind: 'secured', floor, current };
  if (ceiling + eps < target) return { kind: 'unreachable', ceiling, current };
  let lo = 0, hi = maxAssume;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const v = coursePercent(c, 'final', mid)!;
    if (v >= target) hi = mid;
    else lo = mid;
  }
  const remainingPoints = rem.reduce((a, i) => a + i.possible, 0);
  // Round the average UP to 0.01 so that "need N%" really lands on target.
  const needed = Math.ceil(hi * 10000 - 1e-6) / 100;
  return { kind: 'need', needed, neededPoints: (needed / 100) * remainingPoints, remainingPoints, remainingCount: rem.length, current, floor, ceiling };
}

// ── Canvas API -> engine ────────────────────────────────────────────────────

/** Build the engine's course from /assignment_groups?include[]=assignments&include[]=submission. */
export function fromApi(groups: readonly AssignmentGroup[], applyWeights?: boolean): Course {
  const out: Group[] = groups.map(g => ({
    id: String(g.id),
    name: g.name,
    weight: Number(g.group_weight) || 0,
    dropLowest: g.rules?.drop_lowest ?? 0,
    dropHighest: g.rules?.drop_highest ?? 0,
    neverDrop: (g.rules?.never_drop ?? []).map(String),
    items: (g.assignments ?? [])
      .filter(a => a.published !== false && !a.omit_from_final_grade && !a.submission?.excused)
      .map(a => ({
        id: String(a.id),
        name: a.name,
        possible: typeof a.points_possible === 'number' ? a.points_possible : 0,
        score: typeof a.submission?.score === 'number' ? a.submission.score : null,
        dueAt: a.due_at ?? null,
      })),
  }));
  const weighted = applyWeights ?? out.reduce((a, g) => a + g.weight, 0) > 0;
  return { weighted, groups: out };
}

// ── Assignment impact (grade-impact) ────────────────────────────────────────

export interface Impact {
  /** Course percent now (graded work only). */
  base: number;
  /** Course percent if this item scores 0. */
  ifZero: number;
  /** Course percent if this item scores full marks. */
  ifFull: number;
  /** How far the grade falls at 0 (>= 0 normally), in percentage points. */
  down: number;
  /** How far it rises at full marks (>= 0 normally), in percentage points. */
  up: number;
}

/** Find an item and return a copy of the course where it has `score`. */
function withScore(c: Course, itemId: string, score: number | null): Course {
  return { ...c, groups: c.groups.map(g => ({ ...g, items: g.items.map(i => (i.id === itemId ? { ...i, score } : i)) })) };
}

/**
 * How much one unscored item can move the course grade. null when the item
 * is not an unscored, earnable item (already graded, excused, zero points,
 * unknown), or when no work is graded yet (a change from "nothing" is noise).
 */
export function impactOf(c: Course, itemId: string): Impact | null {
  const item = c.groups.flatMap(g => g.items).find(i => i.id === itemId);
  if (!item || item.score !== null || !(item.possible > 0)) return null;
  const base = coursePercent(c, 'current');
  if (base === null) return null;
  const ifZero = coursePercent(withScore(c, itemId, 0), 'current');
  const ifFull = coursePercent(withScore(c, itemId, item.possible), 'current');
  if (ifZero === null || ifFull === null) return null;
  return { base, ifZero, ifFull, down: base - ifZero, up: ifFull - base };
}

/** Does our maths agree with the number Canvas itself shows? (tolerance in points) */
export function agreesWithCanvas(ours: number | null, canvas: number | null, tol = 0.1): boolean {
  if (ours === null || canvas === null) return ours === canvas;
  return Math.abs(ours - canvas) <= tol;
}
