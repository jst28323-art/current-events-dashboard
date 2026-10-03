// The shared order key (src/order.ts): one rule for the Hub and the page.
import { describe, expect, test } from 'vitest'
import { dayInEt, earlierPublicationDate, orderKeyMs, postedMs, startOfDayEtMs } from '../src/index.js'

const t = (times: Record<string, string | null>, result?: Record<string, unknown>) =>
  ({ times: { occurred_at: null, first_seen_at: '2026-10-03T03:00:00Z', ...times }, ...(result ? { result } : {}) }) as never

describe('startOfDayEtMs / dayInEt', () => {
  test('midnight Eastern in daylight and standard time, and on both DST switch days', () => {
    expect(new Date(startOfDayEtMs('2026-10-02')!).toISOString()).toBe('2026-10-02T04:00:00.000Z') // EDT
    expect(new Date(startOfDayEtMs('2026-12-01')!).toISOString()).toBe('2026-12-01T05:00:00.000Z') // EST
    expect(new Date(startOfDayEtMs('2026-11-01')!).toISOString()).toBe('2026-11-01T04:00:00.000Z') // ends 02:00: midnight still EDT
    expect(new Date(startOfDayEtMs('2026-03-08')!).toISOString()).toBe('2026-03-08T05:00:00.000Z') // starts 02:00: midnight EST
  })
  test('rejects non-dates', () => {
    expect(startOfDayEtMs('2026-02-30')).toBeNull()
    expect(startOfDayEtMs('Oct 2')).toBeNull()
  })
  test('the Eastern day of an instant (03:00Z on Oct 3 is still Oct 2 in ET)', () => {
    expect(dayInEt(Date.parse('2026-10-03T03:00:00Z'))).toBe('2026-10-02')
    expect(dayInEt(Date.parse('2026-10-03T04:00:00Z'))).toBe('2026-10-03')
  })
})

describe('orderKeyMs', () => {
  test('occurred_at first', () => {
    expect(orderKeyMs(t({ occurred_at: '2026-10-02T15:15:00Z' }, { publication_date: '2026-09-30' }))).toBe(Date.parse('2026-10-02T15:15:00Z'))
  })
  test('then the posting time, only when not later than first sighting', () => {
    expect(orderKeyMs(t({ source_published_at: '2026-09-29T21:23:48Z' }))).toBe(Date.parse('2026-09-29T21:23:48Z'))
    expect(postedMs(t({ source_published_at: '2026-10-04T00:00:00Z' }))).toBeNull()
  })
  test('then the start of an EARLIER publication day (a backfilled FR document), never a later or the same day', () => {
    // first seen 2026-10-03T03:00Z = Oct 2, 23:00 ET
    expect(earlierPublicationDate(t({}, { publication_date: '2026-09-30' }))).toBe('2026-09-30')
    expect(orderKeyMs(t({}, { publication_date: '2026-09-30' }))).toBe(Date.parse('2026-09-30T04:00:00Z'))
    expect(earlierPublicationDate(t({}, { publication_date: '2026-10-02' }))).toBeNull() // same ET day: first seen orders it
    expect(orderKeyMs(t({}, { publication_date: '2026-10-02' }))).toBe(Date.parse('2026-10-03T03:00:00Z'))
    expect(earlierPublicationDate(t({}, { publication_date: '2026-10-05' }))).toBeNull() // a future date (PI)
    expect(earlierPublicationDate(t({}, { publication_date: 'soon' }))).toBeNull()
  })
  test('a backfilled week-old document sorts BELOW a timed item of a later day', () => {
    const old = t({}, { publication_date: '2026-09-28' })
    const filed = t({ occurred_at: '2026-10-02T12:45:00Z' })
    expect(orderKeyMs(filed)).toBeGreaterThan(orderKeyMs(old))
  })
})
