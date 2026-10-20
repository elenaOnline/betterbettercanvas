// ISO 8601 times in a named time zone, with that zone's offset at that instant
// (agentkit/CONTRACT.md ground rule 5): "2026-10-24T23:59:00-07:00".

const fmts = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmts.set(tz, f);
  }
  return f;
}

/** A usable IANA zone: `tz` if the runtime knows it, else the system zone. */
export function validZone(tz: string | null | undefined): string {
  if (tz) {
    try {
      fmt(tz);
      return tz;
    } catch {
      /* unknown zone */
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Wall-clock fields of `t` in `tz`. */
function wall(t: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(new Date(t))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year!, mo: o.month!, d: o.day!, h: o.hour! % 24, mi: o.minute!, s: o.second! };
}

const offsetOf = (t: number, w: ReturnType<typeof wall>) =>
  Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000) / 60_000);

/** Offset of `tz` from UTC at instant `t`, in minutes (Los Angeles in October: -420). */
export function offsetMinutes(t: number, tz: string): number {
  return offsetOf(t, wall(t, tz));
}

// Describe formats the same handful of instants over and over (due dates).
const memo = new Map<string, string>();

const pad = (n: number, l = 2) => String(Math.abs(n)).padStart(l, '0');

/** `t` as ISO 8601 in `tz`, seconds precision, with the offset. Invalid → null. */
export function isoInZone(t: number | Date | string | null | undefined, tz: string): string | null {
  if (t == null || t === '') return null;
  const ms = typeof t === 'number' ? t : typeof t === 'string' ? Date.parse(t) : t.getTime();
  if (!Number.isFinite(ms)) return null;
  const k = `${tz}|${Math.floor(ms / 1000)}`;
  const hit = memo.get(k);
  if (hit) return hit;
  const w = wall(ms, tz);
  const off = offsetOf(ms, w);
  const sign = off < 0 ? '-' : '+';
  const out = `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}${sign}${pad(Math.trunc(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  if (memo.size > 5000) memo.clear();
  memo.set(k, out);
  return out;
}

/** The instant a calendar day (YYYY-MM-DD) starts in `tz`. */
export function dayStart(ymd: string, tz: string): number {
  const [y, mo, d] = ymd.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, mo - 1, d);
  // Two passes settle DST: the offset at the guess, then at the corrected instant.
  const first = guess - offsetMinutes(guess, tz) * 60_000;
  return guess - offsetMinutes(first, tz) * 60_000;
}

/** The calendar day (YYYY-MM-DD) of instant `t` in `tz`. */
export function dayOf(t: number, tz: string): string {
  const w = wall(t, tz);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
}

/**
 * A window bound from a request: a bare day is the start of that day (`from`)
 * or the end of it (`to`, inclusive) in `tz`; a full timestamp is taken as is.
 */
export function bound(v: unknown, tz: string, edge: 'from' | 'to'): number | null {
  if (typeof v !== 'string' || !v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const s = dayStart(v, tz);
    if (edge === 'from') return s;
    // Next day's start (DST-safe): noon of this day + 1 day, then its day start.
    return dayStart(dayOf(s + 36 * 3_600_000, tz), tz);
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
