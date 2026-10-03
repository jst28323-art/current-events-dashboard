// Naive America/New_York wall times -> UTC, the ONE helper every Congress adapter uses (scratch/phase2/DESIGN.md §1.6,
// §0.3 "never guess a time"). Congress sources print Eastern wall clock with no offset; Node's Date.parse would read
// such a string in the MACHINE's zone (senate.schedule and pressgallery scouts), so a naive string is never parsed by
// Date. Each source keeps its own TEXT parser (formats differ); they all end here with numbers.
//
// Policy (R-13): a wall time that does not exist (spring-forward gap) is drift for official XML sources; an ambiguous one
// (fall-back hour) is `null` + `result.time_note`; human-written text (press gallery) is `null` in both cases. This
// module only reports which case it is; the adapter applies the policy.

export type EtResult = { ok: true; utc: string } | { ok: false; reason: 'invalid' | 'nonexistent' | 'ambiguous' }

const ET = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'long',
})

export interface EtParts { y: number; mo: number; d: number; h: number; mi: number; s: number; weekday: string }

/** The Eastern wall-clock parts of an instant (ms since epoch). */
function partsAt(ms: number): EtParts {
  const out: Record<string, string> = {}
  for (const p of ET.formatToParts(new Date(ms))) out[p.type] = p.value
  return {
    y: Number(out.year), mo: Number(out.month), d: Number(out.day),
    // Some ICU builds print midnight as "24" even under h23; normalize defensively.
    h: Number(out.hour) % 24, mi: Number(out.minute), s: Number(out.second), weekday: out.weekday ?? '',
  }
}

const isInt = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi

/** Days in a month of the proleptic Gregorian calendar (no Date roll-over). */
export function daysInMonth(y: number, mo: number): number {
  return [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] ?? 0
}

/** True when y-mo-d is a real calendar date (range-checked, no Date roll-over: "2026-02-30" is false). */
export function isRealDate(y: number, mo: number, d: number): boolean {
  return isInt(y, 1900, 2200) && isInt(mo, 1, 12) && isInt(d, 1, daysInMonth(y, mo))
}

/** "2026-09-16T23:05:00Z" (seconds precision, no milliseconds). */
export function isoZ(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Naive America/New_York wall time -> UTC "…Z". Tries both offsets (-04:00, -05:00); keeps those whose UTC instant
 * formats back (Intl, timeZone America/New_York, h23) to the same wall time. 0 matches = nonexistent (spring-forward
 * gap), 2 = ambiguous (fall-back hour), 1 = ok. Every part is range-checked first (no Date roll-over).
 */
export function easternToUtc(y: number, mo: number, d: number, h: number, mi: number, s = 0): EtResult {
  if (!isRealDate(y, mo, d) || !isInt(h, 0, 23) || !isInt(mi, 0, 59) || !isInt(s, 0, 59)) return { ok: false, reason: 'invalid' }
  const hits: number[] = []
  for (const offsetH of [4, 5]) {
    const ms = Date.UTC(y, mo - 1, d, h + offsetH, mi, s)
    const p = partsAt(ms)
    if (p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi && p.s === s) hits.push(ms)
  }
  if (hits.length === 0) return { ok: false, reason: 'nonexistent' }
  if (hits.length > 1) return { ok: false, reason: 'ambiguous' }
  return { ok: true, utc: isoZ(hits[0]!) }
}

/** The Eastern wall-clock parts of a UTC instant ("…Z"); null when the text is not a real instant. */
export function easternParts(utc: string): EtParts | null {
  const ms = Date.parse(utc)
  if (!/Z$/.test(utc) || Number.isNaN(ms)) return null
  return partsAt(ms)
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** "YYYY-MM-DD" from numbers (no validation; pair with isRealDate). */
export function ymd(y: number, mo: number, d: number): string {
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}`
}

/** The Eastern calendar date ("YYYY-MM-DD") of a UTC instant ("…Z"); null when not an instant. */
export function easternDate(utc: string): string | null {
  const p = easternParts(utc)
  return p ? ymd(p.y, p.mo, p.d) : null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** The weekday name of a calendar date ("Monday"); the date is a wall date, so no time zone is involved. */
export function weekdayOf(y: number, mo: number, d: number): string {
  return WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]!
}

/** Title wording for a date: "Monday, October 5" (DESIGN §3.3/§3.4 titles; the year is left out as in those templates). */
export function fmtWeekdayMonthDay(y: number, mo: number, d: number): string {
  return `${weekdayOf(y, mo, d)}, ${MONTHS[mo - 1]} ${d}`
}

/** Title wording for a wall-clock time: "4:30 p.m.", "12:00 p.m." (noon), "12:05 a.m." (just after midnight). */
export function fmtClock12(h: number, mi: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(mi)} ${h < 12 ? 'a.m.' : 'p.m.'}`
}

/** 12-hour clock -> 0..23 (12 AM = 0, 12 PM = 12); null when the hour is not 1..12. */
export function hour24(h12: number, pm: boolean): number | null {
  if (!isInt(h12, 1, 12)) return null
  return (h12 % 12) + (pm ? 12 : 0)
}
