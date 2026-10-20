// Time helpers. Every date in the mock is derived from a "now" (see resolveNow).
// Canvas renders dates in the user's time zone; the pilot school users are America/Los_Angeles.
export const TZ = 'America/Los_Angeles'
export const DEFAULT_NOW = '2026-10-21T10:00:00-07:00' // a Wednesday

export function resolveNow(cookies = {}) {
  const raw = cookies.mock_now || process.env.MOCK_NOW || DEFAULT_NOW
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? new Date(DEFAULT_NOW) : d
}

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
})

// wall-clock parts of a Date in LA
export function laParts(date) {
  const o = {}
  for (const p of partsFmt.formatToParts(date)) o[p.type] = p.value
  return {
    year: +o.year, month: +o.month, day: +o.day, hour: +o.hour, minute: +o.minute, second: +o.second,
    weekday: o.weekday,
  }
}

// offset (minutes) of LA from UTC at the given instant, e.g. -420 in PDT
export function laOffsetMinutes(date) {
  const p = laParts(date)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

// Build an instant from LA wall-clock components.
export function laDate(year, month, day, hour = 0, minute = 0, second = 0) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  let off = laOffsetMinutes(guess)
  let d = new Date(guess.getTime() - off * 60000)
  const off2 = laOffsetMinutes(d)
  if (off2 !== off) d = new Date(guess.getTime() - off2 * 60000)
  return d
}

// Start of the LA day containing `date`, shifted by `days`, at hh:mm.
export function dayAt(now, days, hh = 23, mm = 59) {
  const p = laParts(now)
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return laDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hh, mm, hh === 23 && mm === 59 ? 59 : 0)
}

export function startOfLaDay(date) {
  const p = laParts(date)
  return laDate(p.year, p.month, p.day, 0, 0, 0)
}

export function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000)
}

export const iso = d => (d ? new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z') : null)
// Canvas API timestamps look like 2026-10-21T06:59:59Z (UTC, no millis)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS_LONG = {Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday'}

// "11:59pm", "9am" — Canvas' time_string drops ":00"
export function timeString(date) {
  const p = laParts(date)
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const ampm = p.hour < 12 ? 'am' : 'pm'
  return p.minute === 0 ? `${h12}${ampm}` : `${h12}:${String(p.minute).padStart(2, '0')}${ampm}`
}

// "Oct 21" or "Oct 21, 2025" when not the current year (relative to now)
export function dateString(date, now) {
  const p = laParts(date)
  const n = laParts(now)
  return p.year === n.year ? `${MONTHS[p.month - 1]} ${p.day}` : `${MONTHS[p.month - 1]} ${p.day}, ${p.year}`
}

// Canvas datetime_string(:due_date) -> "Oct 21 by 11:59pm"; :event / default -> "Oct 21 at 11:59pm"
export function datetimeString(date, now, kind = 'event') {
  if (!date) return ''
  const sep = kind === 'due_date' ? 'by' : 'at'
  return `${dateString(date, now)} ${sep} ${timeString(date)}`
}

export function longDate(date) {
  const p = laParts(date)
  return `${WEEKDAYS_LONG[p.weekday]}, ${MONTHS_LONG[p.month - 1]} ${p.day}`
}

export function monthName(m) { return MONTHS_LONG[m - 1] }
export function shortMonth(m) { return MONTHS[m - 1] }
