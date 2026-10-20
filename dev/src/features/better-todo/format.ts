// Date and time text for to-do rows. Pure; times are shown in the Canvas
// user's time zone (ENV.TIMEZONE), not the machine's.

export type Clock = 'system' | '12' | '24';
export type DateStyle = 'relative' | 'absolute';

export interface FmtOpts {
  tz?: string | undefined;
  locale?: string | undefined;
  clock: Clock;
  dates: DateStyle;
  /** core.dateOrder: day/month order for dates; auto follows the locale (same rule as card-assignments). */
  order?: 'auto' | 'md' | 'dm';
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = locale + JSON.stringify(o);
  let f = fmtCache.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, o);
    } catch {
      // Unknown zone or locale: fall back to the machine's.
      const { timeZone: _tz, ...rest } = o;
      f = new Intl.DateTimeFormat('en-US', rest);
    }
    fmtCache.set(k, f);
  }
  return f;
}

const loc = (o: FmtOpts) => (o.locale && o.locale !== 'en' ? o.locale : 'en-US');

/** Days since epoch of the calendar day `d` falls on in zone `tz`. */
export function dayIndex(d: Date, tz?: string): number {
  const parts = fmt('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return Math.round(Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000);
}

export function timeText(d: Date, o: FmtOpts): string {
  const hour12 = o.clock === 'system' ? undefined : o.clock === '12';
  return fmt(loc(o), { timeZone: o.tz, hour: 'numeric', minute: '2-digit', hour12 }).format(d);
}

function monthDay(d: Date, now: Date, o: FmtOpts): string {
  const year = (x: Date) => fmt('en-CA', { timeZone: o.tz, year: 'numeric' }).format(x);
  const sameYear = year(d) === year(now);
  const order = o.order ?? 'auto';
  if (order === 'auto') return fmt(loc(o), { timeZone: o.tz, month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' }).format(d);
  const mon = fmt(loc(o), { timeZone: o.tz, month: 'short' }).format(d);
  const day = fmt('en-US', { timeZone: o.tz, day: 'numeric' }).format(d);
  const md = order === 'dm' ? `${day} ${mon}` : `${mon} ${day}`;
  return sameYear ? md : `${md}, ${year(d)}`;
}

/** "Today", "Tomorrow", "Yesterday", "Fri", or "Oct 21" (relative); "Oct 21" (absolute). */
export function dayText(d: Date, now: Date, o: FmtOpts): string {
  if (o.dates === 'absolute') return monthDay(d, now, o);
  const diff = dayIndex(d, o.tz) - dayIndex(now, o.tz);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return fmt(loc(o), { timeZone: o.tz, weekday: 'short' }).format(d);
  return monthDay(d, now, o);
}

/** "Tomorrow at 11:59 PM", "Oct 21 at 23:59". */
export function whenText(d: Date, now: Date, o: FmtOpts): string {
  return `${dayText(d, now, o)} at ${timeText(d, o)}`;
}

/** "in 45m", "in 2h 10m", "in 3h" (Design: under 3 h). */
export function untilText(d: Date, now: Date): string {
  const min = Math.max(0, Math.round((d.getTime() - now.getTime()) / 60_000));
  if (min < 60) return `in ${Math.max(1, min)}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

/** "Just now", "2h ago", "Yesterday", "Mon", "Oct 17" for a past date (announcements). */
export function sinceText(d: Date, now: Date, o: FmtOpts): string {
  const min = (now.getTime() - d.getTime()) / 60_000;
  if (min < 1) return 'Just now';
  if (min < 60) return `${Math.round(min)}m ago`;
  const days = dayIndex(now, o.tz) - dayIndex(d, o.tz);
  if (days === 0) return `${Math.round(min / 60)}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7 && o.dates === 'relative') return fmt(loc(o), { timeZone: o.tz, weekday: 'short' }).format(d);
  return monthDay(d, now, o);
}

/** Short date ("Oct 30"), for the Later group and the Done view. */
export function shortDate(d: Date, now: Date, o: FmtOpts): string {
  return monthDay(d, now, o);
}

/** "2d" / "5h" since a past date, for the Overdue chip. */
export function agoShort(d: Date, now: Date): string {
  const min = Math.max(0, (now.getTime() - d.getTime()) / 60_000);
  if (min < 60) return `${Math.max(1, Math.round(min))}m`;
  if (min < 24 * 60) return `${Math.round(min / 60)}h`;
  return `${Math.floor(min / (24 * 60))}d`;
}

/** Local date and time strings ("YYYY-MM-DD", "HH:MM") → ISO instant in zone `tz`. */
export function zonedToIso(date: string, timeHm: string, tz?: string): string | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/), t = timeHm.match(/^(\d{2}):(\d{2})$/);
  if (!m || !t) return null;
  const want = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +t[1]!, +t[2]!);
  // Guess the UTC instant, then correct by the zone's offset at that instant (twice, for DST edges).
  let guess = want;
  for (let i = 0; i < 2; i++) guess = want - offsetAt(new Date(guess), tz);
  return new Date(guess).toISOString();
}

function offsetAt(d: Date, tz?: string): number {
  const parts = fmt('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
  const g = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" for `d` in zone `tz` (form defaults). */
export function isoDay(d: Date, tz?: string): string {
  return fmt('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
