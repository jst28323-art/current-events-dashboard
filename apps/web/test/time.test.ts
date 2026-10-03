import { describe, expect, test } from 'vitest'
import { eventTime, formatClock, formatDateTime, parseUtc, sortKeyMs } from '../src/lib/time.js'
import { EO_LINK, piEvent, whExecutiveOrderEvent } from '../e2e/fixture-events.js'

// ICU may put a narrow no-break space before AM/PM; compare on plain spaces.
const norm = (s: string) => s.replace(/[  ]/g, ' ')

describe('time formatting in the viewer zone, with its abbreviation', () => {
  test('FR 2026-20439 was filed 11:15 ET (fixture filed_at 11:15-04:00)', () => {
    const e = piEvent('2026-20439', 'P0')
    expect(e.times.occurred_at).toBe('2026-10-02T15:15:00.000Z')
    expect(norm(eventTime(e, { locale: 'en-US', timeZone: 'America/New_York' })!.text)).toBe('Oct 2, 11:15 AM EDT')
    expect(norm(eventTime(e, { locale: 'en-US', timeZone: 'America/Chicago' })!.text)).toBe('Oct 2, 10:15 AM CDT')
    expect(norm(eventTime(e, { locale: 'en-US', timeZone: 'America/Los_Angeles' })!.text)).toBe('Oct 2, 8:15 AM PDT')
  })

  test('the zone abbreviation follows DST (standard time after Nov 1)', () => {
    const ms = Date.parse('2026-11-02T15:15:00Z')
    expect(norm(formatDateTime(ms, { locale: 'en-US', timeZone: 'America/Chicago' }))).toBe('Nov 2, 9:15 AM CST')
  })

  test('clock for "Last updated" carries seconds and the zone', () => {
    expect(norm(formatClock(Date.parse('2026-10-02T21:03:15Z'), { locale: 'en-US', timeZone: 'America/Chicago' }))).toBe('4:03:15 PM CDT')
  })

  test('null occurred_at shows the source posting time labeled "posted" (never as when it happened)', () => {
    const e = whExecutiveOrderEvent(EO_LINK)
    expect(e.times.occurred_at).toBeNull()
    const t = eventTime(e, { locale: 'en-US', timeZone: 'America/Chicago' })!
    expect(t.kind).toBe('posted')
    expect(t.iso).toBe(e.times.source_published_at)
    expect(norm(t.text)).toBe('Sep 29, 4:23 PM CDT') // fixture pubDate Tue, 29 Sep 2026 21:23:48 +0000
  })

  test('no occurred_at and no usable posting time: first_seen_at, labeled first seen', () => {
    const e = whExecutiveOrderEvent(EO_LINK)
    const none = { ...e, times: { ...e.times, source_published_at: null } }
    const t = eventTime(none, { locale: 'en-US', timeZone: 'America/Chicago' })!
    expect(t.kind).toBe('first_seen')
    expect(norm(t.text)).toBe('Oct 2, 1:00 PM CDT')
    // a "posted" time AFTER our first sighting cannot be the posting time: first seen wins
    const later = { ...e, times: { ...e.times, source_published_at: '2026-10-03T00:00:00Z' } }
    expect(eventTime(later, { locale: 'en-US', timeZone: 'America/Chicago' })!.kind).toBe('first_seen')
    expect(sortKeyMs(later)).toBe(Date.parse(e.times.first_seen_at))
  })

  test('parseUtc accepts only UTC "Z" instants', () => {
    expect(parseUtc('2026-10-02T15:15:00Z')).toBe(Date.parse('2026-10-02T15:15:00Z'))
    expect(parseUtc('2026-10-02T15:15:00.123Z')).not.toBeNull()
    expect(parseUtc('2026-10-02T11:15:00-04:00')).toBeNull()
    expect(parseUtc('2026-10-02 15:15')).toBeNull()
    expect(parseUtc('2026-13-45T99:00:00Z')).toBeNull()
    expect(parseUtc(null)).toBeNull()
    expect(parseUtc(1)).toBeNull()
  })

  test('sort key is coalesce(occurred_at, source_published_at if not after first_seen_at, first_seen_at)', () => {
    expect(sortKeyMs(piEvent('2026-20439', 'P0'))).toBe(Date.parse('2026-10-02T15:15:00Z'))
    const eo = whExecutiveOrderEvent(EO_LINK)
    expect(sortKeyMs(eo)).toBe(Date.parse(eo.times.source_published_at!))
  })
})

// Review fixes (2026-10-02): W8 (the year is shown when it is not this year), W12 (impossible calendar dates).
describe('the year, when it is not the current one (W8)', () => {
  const chicago = { locale: 'en-US', timeZone: 'America/Chicago' }
  const NOW = Date.parse('2026-10-02T18:01:00Z')

  test('an event from last year says which year', () => {
    expect(norm(formatDateTime(Date.parse('2025-10-02T15:15:00Z'), { ...chicago, now: NOW }))).toBe('Oct 2, 2025, 10:15 AM CDT')
  })

  test('an event from this year does not', () => {
    expect(norm(formatDateTime(Date.parse('2026-10-02T15:15:00Z'), { ...chicago, now: NOW }))).toBe('Oct 2, 10:15 AM CDT')
  })

  test('"this year" is the viewer zone\'s year, not UTC\'s', () => {
    // 2027-01-01T03:00Z is Dec 31 2026, 9 PM in Chicago; at 2027-01-01T12:00Z it is already 2027 there.
    const ev = Date.parse('2027-01-01T03:00:00Z')
    const now = Date.parse('2027-01-01T12:00:00Z')
    expect(norm(formatDateTime(ev, { ...chicago, now }))).toBe('Dec 31, 2026, 9:00 PM CST')
    expect(norm(formatDateTime(ev, { locale: 'en-US', timeZone: 'UTC', now }))).toBe('Jan 1, 3:00 AM UTC')
  })

  test('eventTime passes the clock through', () => {
    const e = piEvent('2026-20439', 'P0')
    expect(norm(eventTime(e, { ...chicago, now: Date.parse('2027-03-01T00:00:00Z') })!.text)).toBe('Oct 2, 2026, 10:15 AM CDT')
  })
})

describe('parseUtc rejects impossible calendar instants (W12)', () => {
  test.each(['2026-02-30T00:00:00Z', '2026-02-29T00:00:00Z', '2026-04-31T12:00:00Z', '2026-10-02T24:00:00Z', '2026-10-02T23:59:60Z', '2026-00-10T00:00:00Z'])(
    '%s -> null',
    (s) => {
      expect(parseUtc(s)).toBeNull()
    },
  )

  test('real instants still parse, leap day and fractions included', () => {
    expect(parseUtc('2028-02-29T00:00:00Z')).toBe(Date.parse('2028-02-29T00:00:00Z'))
    expect(parseUtc('2026-12-31T23:59:59.999Z')).toBe(Date.parse('2026-12-31T23:59:59.999Z'))
    expect(parseUtc('2026-10-02T15:15:00.123456Z')).toBe(Date.parse('2026-10-02T15:15:00.123Z'))
  })
})

describe('a backfilled FR document with only a publication DAY (2026-10-03, D-046 page of 500)', () => {
  const chicago = { locale: 'en-US', timeZone: 'America/Chicago', now: Date.parse('2026-10-03T03:00:00Z') }
  const pd = piEvent('2026-20439', 'P0')
  // A published document: no occurred_at, no posting time; published Sep 30, first seen Oct 2 at 22:00 CDT.
  const published = { ...pd, times: { occurred_at: null, first_seen_at: '2026-10-03T03:00:00Z' }, result: { publication_date: '2026-09-30' } }

  test('shows "published Sep 30" as a DATE, never a time of day, and sorts at the start of that day (Eastern)', () => {
    const t = eventTime(published, chicago)!
    expect(t.kind).toBe('published_on')
    expect(t.text).toBe('Sep 30')
    expect(t.iso).toBe('2026-09-30')
    expect(sortKeyMs(published)).toBe(Date.parse('2026-09-30T04:00:00Z'))
  })
  test('the same document published the day we first saw it is ordered and shown by our sighting', () => {
    const sameDay = { ...published, result: { publication_date: '2026-10-02' } }
    expect(eventTime(sameDay, chicago)!.kind).toBe('first_seen')
    expect(sortKeyMs(sameDay)).toBe(Date.parse('2026-10-03T03:00:00Z'))
  })
  test('so a backfill of week-old documents never sorts above a newer timed filing', () => {
    expect(sortKeyMs(pd)).toBeGreaterThan(sortKeyMs(published)) // filed Oct 2 15:15Z vs published Sep 30
  })
})
