import { describe, expect, test } from 'vitest'
import { isEvent, parseEventsResponse, parseStatusResponse } from '../src/lib/guards.js'
import { fixtureEvents, piEvent, sourceStatus } from '../e2e/fixture-events.js'

const GEN = '2026-10-02T18:01:00Z'

describe('events response', () => {
  test('a well-formed response passes with every fixture event', () => {
    const events = fixtureEvents()
    const p = parseEventsResponse({ generated_at: GEN, cursor: 'c1', has_more: false, events })
    expect(p?.skipped).toBe(0)
    expect(p?.response.events).toHaveLength(events.length)
  })

  test.each([
    ['null', null],
    ['an array', []],
    ['an HTML page parsed as a string', '<!doctype html><title>Error</title>'],
    ['no cursor', { generated_at: GEN, has_more: false, events: [] }],
    ['empty cursor', { generated_at: GEN, cursor: '', has_more: false, events: [] }],
    ['events not an array', { generated_at: GEN, cursor: 'c', has_more: false, events: {} }],
    ['has_more not boolean', { generated_at: GEN, cursor: 'c', has_more: 'no', events: [] }],
    ['generated_at not UTC', { generated_at: '2026-10-02T13:01:00-05:00', cursor: 'c', has_more: false, events: [] }],
    ['generated_at an impossible date (W12)', { generated_at: '2026-02-30T00:00:00Z', cursor: 'c', has_more: false, events: [] }],
    ['an error object', { error: 'not found' }],
  ])('garbage envelope (%s) is rejected', (_n, body) => {
    expect(parseEventsResponse(body)).toBeNull()
  })

  test('a malformed event is skipped and counted, the rest kept', () => {
    const good = piEvent('2026-20439', 'P0')
    const bad = [
      { ...good, id: '' },
      { ...good, sources: [] },
      { ...good, times: { ...good.times, first_seen_at: 'yesterday' } },
      { ...good, times: { ...good.times, occurred_at: '2026-10-02T11:15:00-04:00' } },
      { ...good, revision: 0 },
      { ...good, title: 42 },
      { ...good, provenance: null },
      'evt',
    ]
    for (const b of bad) expect(isEvent(b)).toBe(false)
    const p = parseEventsResponse({ generated_at: GEN, cursor: 'c', has_more: false, events: [good, ...bad] })
    expect(p?.response.events).toEqual([good])
    expect(p?.skipped).toBe(bad.length)
  })
})

describe('status response', () => {
  test('well formed', () => {
    const s = { generated_at: GEN, sources: [sourceStatus('fr.api', GEN), sourceStatus('wh.feeds', null)] }
    expect(parseStatusResponse(s)?.sources).toHaveLength(2)
  })

  test.each([
    ['not an object', 'ok'],
    ['no sources', { generated_at: GEN }],
    ['a source without a freshness SLO', { generated_at: GEN, sources: [{ ...sourceStatus('fr.api', GEN), freshness_slo_s: 0 }] }],
    ['a source with a non-UTC last success', { generated_at: GEN, sources: [sourceStatus('fr.api', '2026-10-02 18:00')] }],
    ['a source without a stale flag', { generated_at: GEN, sources: [{ ...sourceStatus('fr.api', GEN), stale: 'no' }] }],
  ])('rejects %s (one unreadable source fails the whole status)', (_n, body) => {
    expect(parseStatusResponse(body)).toBeNull()
  })
})
