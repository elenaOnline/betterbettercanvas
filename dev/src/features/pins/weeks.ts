// The week model: which of a course's modules is "this week's"? Pure, so it
// can be unit-tested across naming patterns.
//
// Rules, in Research's order (research/v2-weeks-search.md §A3; names alone
// resolve little in the owner's courses, so rules 2 and 4 carry most of them):
//   1. 'dates': a date range in the module name ("Oct 14–20", "10/14–10/20",
//      "Week of Oct 14", "Week 3 (Jan 22 - Jan 28)");
//   2. 'unlock': unlock_at on at least 3 modules, rising with position;
//   3. 'numbering': "Week 3", "Wk 3", "W3", "Week Three", "Weeks 3–4" (and
//      "Unit/Module/Lesson N" when units look weekly), placed by an anchor:
//      the course start when enrolment is restricted to course dates, else
//      the term start, else learned from due dates; then corrected when due
//      dates say otherwise for 2+ modules;
//   4. 'due': the module whose earliest open due date is soonest within
//      [now−3d, now+10d], from modules with 2+ dated items;
//   5. 'manual': a module the user picked (handled by the resolver).
// The first rule that applies to the course decides; the others only flag a
// disagreement ("unlock dates say X, numbering says Y").
//
// Everything works in whole local days (day 0 = 1970-01-01 in the user's
// time zone), so DST and time zones never shift a week boundary.

import type { Module, ModuleItem } from '../../core/canvas/data.ts';

export const DAY_MS = 86_400_000;

// ── Days ────────────────────────────────────────────────────────────────────

const fmts = new Map<string, Intl.DateTimeFormat | null>();
function partsFmt(tz: string): Intl.DateTimeFormat | null {
  if (!fmts.has(tz)) {
    try {
      fmts.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }));
    } catch {
      fmts.set(tz, null);
    }
  }
  return fmts.get(tz)!;
}

/** Local day number of an instant (in `tz` when given, else the runtime's zone). */
export function dayOf(t: Date | string | number, tz?: string): number {
  const d = t instanceof Date ? t : new Date(t);
  const f = tz ? partsFmt(tz) : null;
  if (f) {
    let y = 0, m = 0, dd = 0;
    for (const p of f.formatToParts(d)) {
      if (p.type === 'year') y = +p.value;
      else if (p.type === 'month') m = +p.value;
      else if (p.type === 'day') dd = +p.value;
    }
    return Date.UTC(y, m - 1, dd) / DAY_MS;
  }
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

/** Day number of a calendar date. */
export const dayFromYMD = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / DAY_MS;

/** Monday on or before `day`. (Day 0 was a Thursday.) */
export const weekStart = (day: number) => day - (((day + 3) % 7) + 7) % 7;

/** 0 = Monday … 6 = Sunday. */
export const weekday = (day: number) => (((day + 3) % 7) + 7) % 7;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ymd(day: number): { y: number; m: number; d: number } {
  const dt = new Date(day * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** "Oct 19" */
export function fmtDay(day: number): string {
  const { m, d } = ymd(day);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

/** "Oct 19–25", "Oct 26 – Nov 1" for [from, to). */
export function fmtSpan(from: number, to: number): string {
  const last = to - 1;
  if (last <= from) return fmtDay(from);
  const a = ymd(from), b = ymd(last);
  return a.m === b.m ? `${fmtDay(from)}–${b.d}` : `${fmtDay(from)} – ${fmtDay(last)}`;
}

// ── Names ───────────────────────────────────────────────────────────────────

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
};
const WORD_ALT = Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|');
const NUM = `(\\d{1,2}|${WORD_ALT})(?:st|nd|rd|th)?\\b`;
const toNum = (s: string) => (/^\d+$/.test(s) ? +s : WORDS[s.toLowerCase()] ?? NaN);

const WEEK_WORD = `(?:weeks?|wks?\\.?)`;
const RANGE_SEP = `\\s*(?:-|–|—|&|\\+|,|/|to|and|through|thru)\\s*`;
/** "Week 3", "Wk. 3", "Weeks 3–4", "Week Three", "Week #3", "W3". */
const WEEK_RE = new RegExp(
  `(?:\\b${WEEK_WORD}\\s*#?\\s*|\\bw(?=\\d))${NUM}(?:${RANGE_SEP}(?:${WEEK_WORD}\\s*|w(?=\\d))?${NUM})?(?![\\d/])`,
  'i',
);
/** "3rd week", "Third Week". */
const ORD_WEEK_RE = new RegExp(`\\b${NUM}\\s+${WEEK_WORD}\\b`, 'i');
/** "Unit 3", "Module 3", "Topic 3", "Lesson 3", "Part 3". */
const UNIT_RE = new RegExp(`\\b(?:unit|module|topic|lesson|part)\\s*#?\\s*${NUM}(?:${RANGE_SEP}${NUM})?(?![\\d/])`, 'i');

const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const monthNum = (s: string) => {
  const k = s.slice(0, 3).toLowerCase();
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(k) + 1;
};

interface MD { m: number; d: number; y?: number }

export type NameInfo =
  | { kind: 'dates'; from: MD; to?: MD; weekOf: boolean }
  | { kind: 'week'; from: number; to: number }
  | { kind: 'unit'; from: number; to: number };

/** Date tokens in order: "Oct 14", "October 14th", "10/14", "10/14/26". Bare "–20" after a month day continues it. */
function dateTokens(name: string): MD[] {
  const re = new RegExp(
    `\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s*(?:-|–|—|to|through|thru)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?![/.:\\d]))?` +
      `|\\b(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\b`,
    'gi',
  );
  const out: MD[] = [];
  for (const m of name.matchAll(re)) {
    if (m[1]) {
      const mo = monthNum(m[1]);
      const d = +m[2]!;
      if (mo && d >= 1 && d <= 31) {
        out.push({ m: mo, d });
        if (m[3]) {
          const d2 = +m[3];
          if (d2 >= 1 && d2 <= 31) out.push(d2 >= d ? { m: mo, d: d2 } : { m: (mo % 12) + 1, d: d2 });
        }
      }
    } else if (m[4]) {
      // "Week 3/4" is two weeks, not March 4.
      if (/\bweeks?\s*#?\s*$/i.test(name.slice(0, m.index))) continue;
      const mo = +m[4], d = +m[5]!;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        const y = m[6] ? (m[6].length === 2 ? 2000 + +m[6] : +m[6]) : undefined;
        out.push(y ? { m: mo, d, y } : { m: mo, d });
      }
    }
  }
  return out;
}

/** What a module's name says about its week, if anything. */
export function parseName(name: string): NameInfo | null {
  const dates = dateTokens(name);
  if (dates.length) {
    return { kind: 'dates', from: dates[0]!, ...(dates[1] ? { to: dates[1] } : {}), weekOf: /\bweek\s+of\b/i.test(name) };
  }
  const w = name.match(WEEK_RE);
  if (w) {
    const a = toNum(w[1]!), b = w[2] ? toNum(w[2]) : a;
    if (a >= 1 && a <= 30 && b >= a && b - a <= 4) return { kind: 'week', from: a, to: b };
  }
  const o = name.match(ORD_WEEK_RE);
  if (o) {
    const a = toNum(o[1]!);
    if (a >= 1 && a <= 30) return { kind: 'week', from: a, to: a };
  }
  const u = name.match(UNIT_RE);
  if (u) {
    const a = toNum(u[1]!), b = u[2] ? toNum(u[2]) : a;
    if (a >= 0 && a <= 30 && b >= a && b - a <= 4) return { kind: 'unit', from: a, to: b };
  }
  return null;
}

/** The day of a month/day nearest to `ref` (within the surrounding years). */
export function nearestDay(md: MD, ref: number): number {
  if (md.y) return dayFromYMD(md.y, md.m, md.d);
  const y = ymd(ref).y;
  let best = dayFromYMD(y, md.m, md.d);
  for (const yy of [y - 1, y + 1]) {
    const c = dayFromYMD(yy, md.m, md.d);
    if (Math.abs(c - ref) < Math.abs(best - ref)) best = c;
  }
  return best;
}

// ── Rules ───────────────────────────────────────────────────────────────────

export type Rule = 'dates' | 'unlock' | 'numbering' | 'due' | 'manual' | 'position';

/** Plain words for "how we know", shown on the pin (Design: surfaces/pins.md). */
export const RULE_LABEL: Record<Rule, string> = {
  dates: 'by module name',
  unlock: 'by unlock dates',
  numbering: 'by module name',
  due: 'by due dates',
  manual: 'picked by you',
  position: 'by position',
};

/** A module placed on the calendar: local days [from, to). */
export interface Span {
  from: number;
  to: number;
}

export interface WeekOpts {
  now: Date;
  /** The course's time zone (Course.time_zone), else the user's. */
  tz?: string;
  termStart?: string | null;
  termEnd?: string | null;
  /** Course start, only when enrolment is restricted to course dates. */
  courseStart?: string | null;
}

/** Monday of week 1 from a start date: a weekend start means the next Monday. */
export function termAnchor(start: string, tz?: string): number {
  const d = dayOf(start, tz);
  return weekday(d) >= 5 ? weekStart(d) + 7 : weekStart(d);
}

const anchorOf = (o: WeekOpts) => (o.courseStart ? termAnchor(o.courseStart, o.tz) : o.termStart ? termAnchor(o.termStart, o.tz) : null);

/** "Week N of the term" for now, or null without a start date (or outside the term). */
export function termWeek(o: WeekOpts): number | null {
  const a = anchorOf(o);
  if (a === null) return null;
  const today = dayOf(o.now, o.tz);
  const n = Math.floor((today - a) / 7) + 1;
  if (n < 1) return null;
  if (o.termEnd && today > dayOf(o.termEnd, o.tz)) return null;
  return n;
}

/** Most common value; ties go to the smallest. */
function mode(xs: number[]): { value: number; count: number; share: number } | null {
  if (!xs.length) return null;
  const c = new Map<number, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best = xs[0]!, n = 0;
  for (const [v, k] of c) if (k > n || (k === n && v < best)) (best = v), (n = k);
  return { value: best, count: n, share: n / xs.length };
}

const median = (xs: number[]) => xs[Math.floor((xs.length - 1) / 2)]!;

function dueDays(m: Module, tz?: string): number[] {
  const out: number[] = [];
  for (const it of m.items ?? []) {
    const due = it.content_details?.due_at;
    if (due) out.push(dayOf(due, tz));
  }
  return out.sort((a, b) => a - b);
}

const SKIP = /\b(archived?|hidden)\b/i;
const ITEM_DONE = (it: ModuleItem) => it.completion_requirement?.completed === true;

/**
 * Modules worth considering: published, not archived/hidden. A single module
 * holding the whole course with week SubHeaders ("Week 3") becomes one
 * pseudo-module per header; its id is "<module>:<header item>".
 */
export function prepare(mods: readonly Module[]): Module[] {
  const live = mods.filter(m => m.published !== false && !SKIP.test(m.name));
  const anyNamed = live.filter(m => parseName(m.name)).length >= 2;
  if (anyNamed) return live;
  const out: Module[] = [];
  for (const m of live) {
    const items = m.items ?? [];
    const heads = items.filter(it => it.type === 'SubHeader' && parseName(it.title));
    if (heads.length < 2) {
      out.push(m);
      continue;
    }
    let cur: Module | null = null;
    for (const it of items) {
      if (it.type === 'SubHeader' && parseName(it.title)) {
        cur = { id: `${m.id}:${it.id}`, name: it.title, position: m.position + out.length / 1000, unlock_at: m.unlock_at ?? null, items: [] };
        out.push(cur);
      } else if (cur) cur.items!.push(it);
    }
  }
  return out;
}

interface Entry {
  m: Module;
  s: Span;
}

export interface RuleResult {
  rule: Rule;
  entries: Entry[];
  /** Rule 4 picks by soonest open due date rather than spans. */
  soonest?: (target: 'this' | 'next') => Module | null;
}

/** Rule 1: dates in names. Applies when 2+ modules carry them. */
function byDates(mods: Module[], o: WeekOpts): RuleResult | null {
  const ref = o.termStart ? dayOf(o.termStart, o.tz) + 35 : dayOf(o.now, o.tz);
  const entries: Entry[] = [];
  for (const m of mods) {
    const n = parseName(m.name);
    if (n?.kind !== 'dates') continue;
    const from = nearestDay(n.from, ref);
    const end = n.to ? nearestDay(n.to, from) : null;
    if (end !== null && end >= from && end - from <= 20) entries.push({ m, s: { from, to: end + 1 } });
    else if (n.weekOf) entries.push({ m, s: { from, to: from + 7 } });
    else entries.push({ m, s: { from: weekStart(from), to: weekStart(from) + 7 } });
  }
  return entries.length >= 2 ? { rule: 'dates', entries } : null;
}

/** Rule 2: unlock_at on 3+ modules, never falling as position rises. */
function byUnlock(mods: Module[], o: WeekOpts): RuleResult | null {
  const un = mods
    .filter(m => m.unlock_at)
    .map(m => ({ m, d: dayOf(m.unlock_at!, o.tz) }))
    .sort((a, b) => a.m.position - b.m.position);
  if (un.length < 3) return null;
  for (let i = 1; i < un.length; i++) if (un[i]!.d < un[i - 1]!.d) return null;
  const distinct = [...new Set(un.map(u => u.d))];
  if (distinct.length < 2) return null; // everything opened at once: not a schedule
  const entries = un.map(({ m, d }) => {
    const next = distinct.find(x => x > d);
    return { m, s: { from: d, to: next ?? d + 7 } };
  });
  return { rule: 'unlock', entries };
}

/** Rule 3: week numbers (and weekly-looking units) placed by an anchor. */
function byNumbering(mods: Module[], o: WeekOpts): RuleResult | null {
  const tz = o.tz;
  const termWeeks = o.termStart && o.termEnd ? Math.round((dayOf(o.termEnd, tz) - termAnchor(o.termStart, tz)) / 7) : null;
  const numbered = (kind: 'week' | 'unit') =>
    mods.flatMap(m => {
      const n = parseName(m.name);
      if (n?.kind !== kind) return [];
      // "Week 14" can't exist in a 10-week quarter (+ finals week).
      if (termWeeks !== null && n.to > termWeeks + 1) return [];
      return [{ m, from: n.from, to: n.to }];
    });
  let list = numbered('week');
  let units = false;
  if (list.length < 2) {
    list = numbered('unit');
    units = true;
    if (list.length < 3) return null;
  }

  // Anchor: course/term start, else learned from due dates.
  const evidence = list.flatMap(x => {
    const dd = dueDays(x.m, tz);
    return dd.length >= 2 ? [{ x, mid: median(dd) }] : [];
  });
  let anchor = anchorOf(o);
  if (anchor === null) {
    const learned = mode(evidence.map(e => weekStart(e.mid) - (e.x.from - 1) * 7));
    if (!learned || (evidence.length >= 2 && learned.count < 2)) return null;
    anchor = learned.value;
  } else {
    // Cross-check: due dates landing a week off for 2+ modules shift the anchor.
    const offs = evidence.map(e => weekStart(e.mid) - (anchor! + (e.x.from - 1) * 7));
    const off = mode(offs);
    if (off && off.value !== 0 && off.count >= 2 && off.share >= 0.6) anchor += off.value;
  }

  // Units count only when they look weekly: due dates agree, or there are about as many as the term has weeks.
  if (units) {
    const fits = evidence.filter(e => {
      const from = anchor! + (e.x.from - 1) * 7;
      return e.mid >= from && e.mid < anchor! + e.x.to * 7;
    }).length;
    const agree = evidence.length >= 2 && fits / evidence.length >= 0.6;
    const sized = termWeeks !== null && list.length >= termWeeks - 4 && list.length <= termWeeks + 2;
    if (!agree && !(sized && evidence.length === 0)) return null;
  }

  const entries = list.map(x => ({ m: x.m, s: { from: anchor! + (x.from - 1) * 7, to: anchor! + x.to * 7 } }));
  return { rule: 'numbering', entries };
}

/** Rule 4: due dates. Modules with 2+ dated items. */
function byDue(mods: Module[], o: WeekOpts): RuleResult | null {
  const tz = o.tz;
  const dated = mods.filter(m => dueDays(m, tz).length >= 2);
  if (!dated.length) return null;
  const now = o.now.getTime();
  const entries: Entry[] = [];
  for (const m of dated) {
    const dd = dueDays(m, tz);
    const lo = dd[0]!, hi = dd[dd.length - 1]!;
    if (hi - lo <= 13) entries.push({ m, s: { from: weekStart(lo), to: weekStart(hi) + 7 } });
  }
  const soonest = (target: 'this' | 'next') => {
    const today = dayOf(o.now, tz);
    const [lo, hi] =
      target === 'this'
        ? [now - 3 * DAY_MS, now + 10 * DAY_MS]
        : [(weekStart(today) + 7 - today) * DAY_MS + now - (now % DAY_MS) - 12 * 3_600_000, now + 17 * DAY_MS];
    let best: { m: Module; at: number } | null = null;
    for (const m of dated) {
      const open = (m.items ?? [])
        .filter(it => it.content_details?.due_at && !ITEM_DONE(it))
        .map(it => Date.parse(it.content_details!.due_at!))
        .filter(t => t >= now - 3 * DAY_MS)
        .sort((a, b) => a - b);
      const first = open[0];
      if (first === undefined || first < lo || first > hi) continue;
      if (!best || first < best.at || (first === best.at && m.position > best.m.position)) best = { m, at: first };
    }
    return best?.m ?? null;
  };
  return { rule: 'due', entries, soonest };
}

/** Every rule that applies to these modules, strongest first. */
export function rules(mods: readonly Module[], o: WeekOpts): RuleResult[] {
  const ms = prepare(mods);
  return [byDates(ms, o), byUnlock(ms, o), byNumbering(ms, o), byDue(ms, o)].filter((r): r is RuleResult => !!r);
}

// ── Picking ─────────────────────────────────────────────────────────────────

export type Which = 'this-week' | 'next-week' | 'latest';

export interface Pick {
  module: Module;
  rule: Rule;
  span: Span | null;
  /**
   * 'upcoming': nothing covers today but this one starts within days (shown from Thursday on);
   * 'last': nothing covers the week; this is the most recent one, as a stand-in.
   */
  fallback?: 'upcoming' | 'last';
  /** A weaker rule picks a different module. */
  conflict?: { rule: Rule; module: Module };
}

export interface PickOpts extends WeekOpts {
  /** In a gap, show the next module from this weekday on (0 = Mon … 6 = Sun; 7 = never). Default 3 (Thursday). */
  upcomingFrom?: number;
}

const byLatest = (a: Entry, b: Entry) => b.s.from - a.s.from || b.m.position - a.m.position;

/** A locked module isn't "this week's" unless it opens within a day. */
const openSoon = (m: Module, o: WeekOpts) => !m.unlock_at || Date.parse(m.unlock_at) <= o.now.getTime() + DAY_MS;

function pickWith(r: RuleResult, which: Which, o: PickOpts): Pick | null {
  const today = dayOf(o.now, o.tz);
  const entries = r.rule === 'unlock' ? r.entries : r.entries.filter(e => openSoon(e.m, o));
  const spanOf = (m: Module) => r.entries.find(e => e.m === m)?.s ?? null;
  const started = entries.filter(e => e.s.from <= today).sort(byLatest);

  if (which === 'latest') {
    const e = started[0];
    return e ? { module: e.m, rule: r.rule, span: e.s } : null;
  }
  if (r.soonest) {
    const m = r.soonest(which === 'this-week' ? 'this' : 'next');
    if (m && openSoon(m, o)) return { module: m, rule: r.rule, span: spanOf(m) };
    if (which === 'next-week') return null;
    const last = started[0];
    return last ? { module: last.m, rule: r.rule, span: last.s, fallback: 'last' } : null;
  }
  const target = which === 'this-week' ? today : weekStart(today) + 7 + 2;
  const cover = entries.filter(e => e.s.from <= target && target < e.s.to).sort(byLatest);
  if (cover[0]) return { module: cover[0].m, rule: r.rule, span: cover[0].s };
  if (which === 'next-week') return null;
  const from = o.upcomingFrom ?? 3;
  if (weekday(today) >= from) {
    const next = r.entries.filter(e => e.s.from > today && e.s.from - today <= 6).sort((a, b) => a.s.from - b.s.from)[0];
    if (next) return { module: next.m, rule: r.rule, span: next.s, fallback: 'upcoming' };
  }
  const last = started[0];
  return last ? { module: last.m, rule: r.rule, span: last.s, fallback: 'last' } : null;
}

/**
 * The module for a week, by the first rule that applies to the course.
 * 'this-week' covers today; 'next-week' covers the middle of next week;
 * 'latest' is the most recently started module (or, with no rule, the last
 * open module by position). Null when nothing fits (topic-only courses with
 * no due dates, or a term that hasn't started).
 */
export function pickModule(mods: readonly Module[], which: Which, o: PickOpts): Pick | null {
  const rs = rules(mods, o);
  const first = rs[0];
  if (!first) {
    if (which !== 'latest') return null;
    const today = dayOf(o.now, o.tz);
    const open = prepare(mods)
      .filter(m => !m.unlock_at || dayOf(m.unlock_at, o.tz) <= today)
      .sort((a, b) => b.position - a.position);
    return open[0] ? { module: open[0], rule: 'position', span: null } : null;
  }
  const p = pickWith(first, which, o);
  if (!p || p.fallback || which === 'latest') return p;
  // Flag a weaker rule that picks a different module.
  for (const r of rs.slice(1)) {
    const q = pickWith(r, which, o);
    if (!q || q.fallback || q.module.id === p.module.id) continue;
    return { ...p, conflict: { rule: q.rule, module: q.module } };
  }
  return p;
}

/** Module items due in the current week (for the "no weekly modules" fallback). */
export function dueThisWeek(mods: readonly Module[], o: WeekOpts): number {
  const ws = weekStart(dayOf(o.now, o.tz));
  let n = 0;
  for (const m of mods) for (const it of m.items ?? []) {
    const due = it.content_details?.due_at;
    if (!due || ITEM_DONE(it)) continue;
    const d = dayOf(due, o.tz);
    if (d >= ws && d < ws + 7) n++;
  }
  return n;
}
