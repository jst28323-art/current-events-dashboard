// The one order key for events (EventsResponse in api.ts), used by the Hub (workers/api) and the page (apps/web) alike,
// so the two can never sort differently again (they did twice on 2026-10-02/03: the tie direction and the "posted" rule).
import type { CedEvent } from './types.js'

type Timed = Pick<CedEvent, 'times'> & { result?: Record<string, unknown> }

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const etHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' })
const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })

/** 00:00 Eastern time on a calendar day, as epoch ms (EDT or EST, whichever is in force at that midnight). */
export function startOfDayEtMs(date: string): number | null {
  const m = DATE_RE.exec(date)
  if (!m) return null
  const utc5 = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 5) // midnight EST
  const check = new Date(utc5)
  if (check.getUTCFullYear() !== Number(m[1]) || check.getUTCMonth() !== Number(m[2]) - 1 || check.getUTCDate() !== Number(m[3])) return null
  const hour = Number(etHour.formatToParts(check).find((p) => p.type === 'hour')?.value)
  return hour === 1 ? utc5 - 3600_000 : utc5 // 05:00Z is 01:00 EDT when daylight time is in force: midnight was 04:00Z
}

/** The Eastern-time calendar day of an instant, "YYYY-MM-DD". */
export function dayInEt(ms: number): string {
  return etDate.format(new Date(ms))
}

const ms = (iso: string | null | undefined): number | null => {
  if (typeof iso !== 'string') return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** source_published_at, but only when it is not later than our first sighting (a "posted" time after we had already
 * seen the item cannot be its posting time). */
export function postedMs(e: Timed): number | null {
  const posted = ms(e.times.source_published_at ?? null)
  const seen = ms(e.times.first_seen_at)
  return posted !== null && (seen === null || posted <= seen) ? posted : null
}

/** A source that gives only a publication DATE (no time of day), e.g. a Federal Register document's
 * `result.publication_date`, when that day is EARLIER than the Eastern-time day we first saw the item (a backfill: the
 * D-046 page of 500 FR documents brought ~480 published days earlier). Null otherwise: an item published the day we
 * saw it is ordered by our sighting, which is then the closer time. Never shown as a time of day (D-034). */
export function earlierPublicationDate(e: Timed): string | null {
  const d = e.result?.publication_date
  if (typeof d !== 'string' || startOfDayEtMs(d) === null) return null
  const seen = ms(e.times.first_seen_at)
  if (seen === null) return null
  return d < dayInEt(seen) ? d : null
}

/** occurred_at; else the source's posting time (postedMs); else the start (Eastern) of an earlier publication day
 * (earlierPublicationDate; sort only); else first_seen_at. Ties are broken by id DESCENDING by the callers. */
export function orderKeyMs(e: Timed): number {
  const occurred = ms(e.times.occurred_at)
  if (occurred !== null) return occurred
  const posted = postedMs(e)
  if (posted !== null) return posted
  const day = earlierPublicationDate(e)
  if (day !== null) return startOfDayEtMs(day)!
  return ms(e.times.first_seen_at) ?? 0
}
