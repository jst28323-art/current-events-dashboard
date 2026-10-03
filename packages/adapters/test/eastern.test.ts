// lib/eastern.ts (scratch/phase2/DESIGN.md §1.6): naive America/New_York wall time -> UTC, with the spring-forward gap
// and the fall-back hour reported instead of guessed. The cases are the design's required list; the first three are
// real fixture times (roll314, roll009, roll2025_139), the DST pair is the senate.schedule trap.
import { describe, expect, test } from 'vitest'
import {
  easternDate, easternParts, easternToUtc, fmtClock12, fmtWeekdayMonthDay, hour24, isRealDate, weekdayOf,
} from '../src/lib/eastern.js'

describe('easternToUtc', () => {
  const ok: Array<[string, [number, number, number, number, number, number?], string]> = [
    ['roll314: 16-Sep-2026 19:05 EDT', [2026, 9, 16, 19, 5], '2026-09-16T23:05:00Z'],
    ['roll009: 8-Jan-2026 15:23 EST', [2026, 1, 8, 15, 23], '2026-01-08T20:23:00Z'],
    ['roll2025_139: 00:29, the next calendar day in UTC', [2025, 5, 22, 0, 29], '2025-05-22T04:29:00Z'],
    ['Nov 9 2026 15:00 EST (after the fall-back)', [2026, 11, 9, 15, 0], '2026-11-09T20:00:00Z'],
    ['Oct 5 2026 16:00 EDT (before it): same UTC as the line above', [2026, 10, 5, 16, 0], '2026-10-05T20:00:00Z'],
    ['Nov 2 2026 16:30 EST', [2026, 11, 2, 16, 30], '2026-11-02T21:30:00Z'],
    ['seconds kept (floor for-search)', [2026, 10, 1, 11, 33, 10], '2026-10-01T15:33:10Z'],
    ['the hour after the gap exists', [2026, 3, 8, 3, 0], '2026-03-08T07:00:00Z'],
    ['the hour before the fall-back is EDT', [2026, 11, 1, 0, 59], '2026-11-01T04:59:00Z'],
    ['the hour after it is EST', [2026, 11, 1, 2, 0], '2026-11-01T07:00:00Z'],
    ['leap day', [2028, 2, 29, 12, 0], '2028-02-29T17:00:00Z'],
  ]
  for (const [name, args, utc] of ok) {
    test(name, () => expect(easternToUtc(...args)).toEqual({ ok: true, utc }))
  }
  test('2026-11-01 01:30 is ambiguous (fall-back hour)', () => {
    expect(easternToUtc(2026, 11, 1, 1, 30)).toEqual({ ok: false, reason: 'ambiguous' })
  })
  test('2026-03-08 02:30 and 2027-03-14 02:30 do not exist (spring-forward gap)', () => {
    expect(easternToUtc(2026, 3, 8, 2, 30)).toEqual({ ok: false, reason: 'nonexistent' })
    expect(easternToUtc(2027, 3, 14, 2, 30)).toEqual({ ok: false, reason: 'nonexistent' })
  })
  const invalid: Array<[string, [number, number, number, number, number, number?]]> = [
    ['Feb 30', [2026, 2, 30, 12, 0]],
    ['Feb 29 in a common year', [2026, 2, 29, 12, 0]],
    ['month 13', [2026, 13, 1, 12, 0]],
    ['hour 24', [2026, 10, 1, 24, 0]],
    ['minute 60', [2026, 10, 1, 12, 60]],
    ['second 60', [2026, 10, 1, 12, 0, 60]],
    ['a fractional minute', [2026, 10, 1, 12, 0.5]],
    ['NaN (an unparsed field)', [2026, Number.NaN, 1, 12, 0]],
  ]
  for (const [name, args] of invalid) {
    test(`invalid: ${name}`, () => expect(easternToUtc(...args)).toEqual({ ok: false, reason: 'invalid' }))
  }
})

describe('the other direction and title wording', () => {
  test('easternParts / easternDate of an instant', () => {
    expect(easternParts('2026-10-01T01:29:00Z')).toMatchObject({ y: 2026, mo: 9, d: 30, h: 21, mi: 29, s: 0, weekday: 'Wednesday' })
    expect(easternDate('2026-10-01T03:59:59Z')).toBe('2026-09-30')
    expect(easternDate('2026-10-01T04:00:00Z')).toBe('2026-10-01')
    expect(easternDate('2026-01-08T04:59:00Z')).toBe('2026-01-07') // EST: -05:00
    expect(easternDate('not a time')).toBeNull()
    expect(easternDate('2026-10-01T04:00:00')).toBeNull() // naive text is refused, never read in the machine's zone
  })
  test('weekday and "Monday, October 5"', () => {
    expect(weekdayOf(2026, 10, 5)).toBe('Monday')
    expect(fmtWeekdayMonthDay(2026, 10, 5)).toBe('Monday, October 5')
    expect(fmtWeekdayMonthDay(2026, 11, 9)).toBe('Monday, November 9')
  })
  test('12-hour clock wording and parsing (12 AM = 0, 12 PM = 12)', () => {
    expect(fmtClock12(16, 30)).toBe('4:30 p.m.')
    expect(fmtClock12(12, 0)).toBe('12:00 p.m.')
    expect(fmtClock12(0, 5)).toBe('12:05 a.m.')
    expect(fmtClock12(9, 0)).toBe('9:00 a.m.')
    expect([hour24(12, false), hour24(12, true), hour24(1, false), hour24(9, true), hour24(13, true)]).toEqual([0, 12, 1, 21, null])
  })
  test('isRealDate has no roll-over', () => {
    expect(isRealDate(2026, 2, 28)).toBe(true)
    expect(isRealDate(2026, 4, 31)).toBe(false)
    expect(isRealDate(2000, 2, 29)).toBe(true)
    expect(isRealDate(1900, 2, 29)).toBe(false)
  })
})
