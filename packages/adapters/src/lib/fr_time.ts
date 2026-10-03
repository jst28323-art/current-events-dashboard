// Federal Register times and dates (docs/TRAPS.md "Time zones lie": normalize to UTC at ingest, test both offsets).
//
// FR instants carry an explicit offset: "2026-10-02T11:15:00.000-04:00" in daylight time, "-05:00" in winter. The
// offset in the text is what we trust; we never assume Eastern time ourselves. FR dates ("2026-10-05") have no time of
// day, so they never become an instant here (an honest feed does not invent 00:00 or 06:00).

const OFFSET_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isRealDate(year: number, month: number, day: number): boolean {
  return year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/** "2026-10-02T11:15:00.000-04:00" -> "2026-10-02T15:15:00Z" (whole seconds). Null when the text is not a real instant
 * with an explicit offset (Date would silently roll "09-31" over to October 1, so every part is range-checked), when
 * the offset is one no time zone uses (outside -12:00…+14:00, or minutes other than :00/:15/:30/:45), or when the UTC
 * result would leave the four-digit years ("9999-12-31T23:00-05:00" is +010000-01-01 in UTC: not a valid event time). */
export function frInstantToUtc(text: string): string | null {
  const m = OFFSET_INSTANT.exec(text)
  if (!m) return null
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3])
  const hour = Number(m[4]), minute = Number(m[5]), second = Number(m[6])
  if (!isRealDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null
  let offsetMinutes = 0
  if (m[7] !== undefined) {
    const oh = Number(m[8]), om = Number(m[9])
    const total = oh * 60 + om
    if (om % 15 !== 0 || total > (m[7] === '-' ? 12 * 60 : 14 * 60)) return null
    offsetMinutes = (m[7] === '-' ? -1 : 1) * total
  }
  // local wall time = UTC + offset, so UTC = local wall time - offset (11:15 at -04:00 is 15:15Z).
  const ms = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000
  const iso = new Date(ms).toISOString()
  if (!/^\d{4}-/.test(iso)) return null
  return iso.replace(/\.\d{3}Z$/, 'Z')
}

/** True for a real calendar date written "YYYY-MM-DD". */
export function isFrDate(text: string): boolean {
  const m = DATE_ONLY.exec(text)
  return m !== null && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** "2026-10-02" -> "October 2, 2026" (fixed English words, no locale or time zone involved). */
export function frDateInWords(date: string): string {
  const m = DATE_ONLY.exec(date)
  if (!m || !isFrDate(date)) throw new Error(`not an FR date: ${date}`)
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`
}
