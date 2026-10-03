// Time display. Every time is shown in the VIEWER's time zone with its abbreviation (Intl), never a guessed zone.
// `occurred_at` is null when the source gives no trustworthy time (docs/EVENT_MODEL.md "three clocks"); the row then
// shows when the feed first saw the item, labeled as such, never presented as when it happened.
import type { CedEvent } from '@ced/schema'
// The order rule is shared with the Hub; imported from the subpath so the page bundle does not pull in the validator.
import { earlierPublicationDate, orderKeyMs, postedMs } from '@ced/schema/order'

export interface TimeOptions {
  /** BCP 47 locale; undefined = the viewer's. */
  locale?: string
  /** IANA zone; undefined = the viewer's. */
  timeZone?: string
  /** "Now" in epoch ms, for deciding whether a date needs its year; undefined = Date.now(). */
  now?: number
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/

/** Epoch ms of a UTC instant written as the event model requires ("…Z"), or null when it is not one. */
export function parseUtc(iso: unknown): number | null {
  if (typeof iso !== 'string' || !ISO_UTC.test(iso)) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  // V8 rolls an impossible date over (Feb 30 -> Mar 2) instead of failing; a real instant prints back unchanged (the
  // same check as isRealInstant in packages/schema/src/validate.ts, kept here so the page bundles no schema runtime).
  return new Date(ms).toISOString().slice(0, 19) === iso.slice(0, 19) ? ms : null
}

function fmt(ms: number, opts: TimeOptions, parts: Intl.DateTimeFormatOptions): string {
  const o: Intl.DateTimeFormatOptions = { ...parts, timeZoneName: 'short' }
  if (opts.timeZone !== undefined) o.timeZone = opts.timeZone
  return new Intl.DateTimeFormat(opts.locale, o).format(new Date(ms))
}

/** The calendar year of `ms` in the viewer's zone (or `timeZone`). */
function yearIn(ms: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-US', timeZone === undefined ? { year: 'numeric' } : { year: 'numeric', timeZone }).format(new Date(ms))
}

/**
 * "Oct 2, 10:15 AM CDT" (date, time, zone abbreviation); "Oct 2, 2025, 10:15 AM CDT" when the year, in the viewer's
 * zone, is not the current one (a backfilled or old item must not read as today's).
 */
export function formatDateTime(ms: number, opts: TimeOptions = {}): string {
  const otherYear = yearIn(ms, opts.timeZone) !== yearIn(opts.now ?? Date.now(), opts.timeZone)
  return fmt(ms, opts, { month: 'short', day: 'numeric', ...(otherYear ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' })
}

/** "4:03:15 PM CDT" (for "Last updated": the page polls every 15 s, so seconds carry information). */
export function formatClock(ms: number, opts: TimeOptions = {}): string {
  return fmt(ms, opts, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

export interface EventTime {
  /** The instant shown, as the source's ISO string (for <time datetime>). */
  iso: string
  /** Formatted in the viewer's zone. */
  text: string
  /** occurred: when it happened; posted: when the source published it (the event's own time is not given, e.g. a
   * White House executive-order post has no signing time); first_seen: neither is given, so when the feed saw it. */
  /** published_on: the source gives only a calendar DAY, earlier than the day we saw it (a backfilled Federal Register
   * document); shown as a date with no time of day, never as one (D-034). */
  kind: 'occurred' | 'posted' | 'published_on' | 'first_seen'
}

/** "Sep 30" (or "Sep 30, 2025" when not this year) for a calendar day "YYYY-MM-DD", with no zone shift. */
export function formatDay(day: string, opts: TimeOptions = {}): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const at = Date.UTC(y, m - 1, d, 12)
  const otherYear = y !== new Date(opts.now ?? Date.now()).getUTCFullYear()
  return new Intl.DateTimeFormat(opts.locale, { timeZone: 'UTC', month: 'short', day: 'numeric', ...(otherYear ? { year: 'numeric' } : {}) }).format(at)
}

/** The time a row shows: occurred_at; else the source's posting time ("posted"); else an earlier publication DAY
 * ("published", date only); else first_seen_at ("first seen"). Same precedence as the order key. */
export function eventTime(e: Pick<CedEvent, 'times' | 'result'>, opts: TimeOptions = {}): EventTime | null {
  const occurred = parseUtc(e.times.occurred_at)
  if (occurred !== null) return { iso: e.times.occurred_at as string, text: formatDateTime(occurred, opts), kind: 'occurred' }
  const posted = postedMs(e)
  if (posted !== null) return { iso: e.times.source_published_at as string, text: formatDateTime(posted, opts), kind: 'posted' }
  const day = earlierPublicationDate(e)
  if (day !== null) return { iso: day, text: formatDay(day, opts), kind: 'published_on' }
  const seen = parseUtc(e.times.first_seen_at)
  if (seen !== null) return { iso: e.times.first_seen_at, text: formatDateTime(seen, opts), kind: 'first_seen' }
  return null
}

/** The API's order key: the one shared rule (packages/schema/src/order.ts), so page and Hub never disagree. */
export function sortKeyMs(e: Pick<CedEvent, 'times' | 'result'>): number {
  return orderKeyMs(e)
}
