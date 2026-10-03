import { describe, expect, test } from 'vitest'
import type { Affiliation } from '@ced/schema'
import { emphasis, healthLabel, isStale, originChips, skippedNote, statusChip } from '../src/lib/labels.js'
import { piEvent, sourceStatus } from '../e2e/fixture-events.js'

const withAffiliation = (affiliation: Affiliation | string, confidence: string = 'high') => {
  const e = piEvent('2026-20439', 'P0')
  return { sources: [{ ...e.sources[0]!, affiliation: affiliation as Affiliation }], provenance: { parser: 'x', confidence: confidence as 'high' } }
}

describe('origin chips (D-009 words, by sources[0].affiliation)', () => {
  test.each([
    ['official-nonpartisan', 'official'],
    ['executive-messaging', 'White House'],
    ['official-partisan', 'partisan'],
    ['third-party', 'third-party'],
    ['unofficial', 'unofficial'],
    ['independent', 'independent'],
  ])('%s -> %s', (aff, label) => {
    expect(originChips(withAffiliation(aff))).toEqual([label])
  })

  test('inferred confidence adds an "inferred" chip', () => {
    expect(originChips(withAffiliation('official-nonpartisan', 'inferred'))).toEqual(['official', 'inferred'])
  })

  test('an unknown confidence is never presented as high', () => {
    expect(originChips(withAffiliation('official-nonpartisan', 'certain'))).toEqual(['official', 'inferred'])
  })

  test('an unknown affiliation is never labeled official', () => {
    expect(originChips(withAffiliation('official'))).toEqual(['origin unknown'])
    expect(originChips(withAffiliation('toString'))).toEqual(['origin unknown'])
  })

  test('the real fixture events get their chips', () => {
    expect(originChips(piEvent('2026-20439', 'P0'))).toEqual(['official'])
  })
})

describe('importance emphasis', () => {
  test.each([
    ['P0', 'major'],
    ['P1', 'major'],
    ['P2', 'normal'],
    ['P3', 'minor'],
    ['P4', 'minor'],
    [undefined, 'normal'],
  ] as const)('%s -> %s', (tier, out) => {
    expect(emphasis(tier)).toBe(out)
  })
})

describe('source health chip', () => {
  const T0 = Date.parse('2026-10-02T18:00:00Z')
  const iso = (ms: number) => new Date(ms).toISOString()

  test('fresh and ok', () => {
    expect(healthLabel(sourceStatus('fr.api', iso(T0)), T0 + 60_000)).toBe('ok')
  })

  test('stale by the client clock once the last success is older than freshness_slo_s, even if the server says not stale', () => {
    const s = sourceStatus('fr.api', iso(T0)) // slo 120 s, stale: false
    expect(isStale(s, T0 + 120_000)).toBe(false)
    expect(healthLabel(s, T0 + 120_000)).toBe('ok')
    expect(isStale(s, T0 + 121_000)).toBe(true)
    expect(healthLabel(s, T0 + 121_000)).toBe('stale')
  })

  test("the server's stale flag wins even when the client clock says fresh", () => {
    expect(healthLabel(sourceStatus('fr.api', iso(T0), { stale: true }), T0)).toBe('stale')
  })

  test('never polled', () => {
    expect(healthLabel(sourceStatus('wh.feeds', null), T0)).toBe('not polled yet')
  })

  test('error within the freshness window shows error; past it, stale', () => {
    const s = sourceStatus('fr.api', iso(T0), { health: 'error', error_streak: 1 })
    expect(healthLabel(s, T0 + 30_000)).toBe('error')
    expect(healthLabel(s, T0 + 600_000)).toBe('stale')
  })

  test('drift counts as error; an error that never succeeded says error', () => {
    expect(healthLabel(sourceStatus('fr.api', iso(T0), { health: 'drift' }), T0)).toBe('error')
    expect(healthLabel(sourceStatus('fr.api', null, { health: 'error', stale: true }), T0)).toBe('error')
  })

  test('empty and not_modified are healthy answers', () => {
    expect(healthLabel(sourceStatus('fr.api', iso(T0), { health: 'empty' }), T0)).toBe('ok')
    expect(healthLabel(sourceStatus('fr.api', iso(T0), { health: 'not_modified' }), T0)).toBe('ok')
  })

  test('an undefined health value fails closed', () => {
    expect(healthLabel(sourceStatus('fr.api', iso(T0), { health: 'great' as 'ok' }), T0)).toBe('error')
  })

  test('a missing last success is stale (no data is not "quiet")', () => {
    expect(isStale(sourceStatus('fr.api', null, { health: 'ok', stale: false }), T0)).toBe(true)
  })
})

// Review fixes (2026-10-02): W4 (status chip lookup), W6 (skipped note wording).
describe('status chip (W4)', () => {
  test.each([
    ['live', 'LIVE'],
    ['scheduled', 'scheduled'],
    ['postponed', 'postponed'],
    ['cancelled', 'cancelled'],
    ['rescheduled', 'rescheduled'],
    ['corrected', 'corrected'],
    ['retracted', 'retracted'],
    ['ended', null],
    ['published', null],
  ] as const)('%s -> %s', (status, chip) => {
    expect(statusChip(status)).toBe(chip)
  })

  test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'LIVE', ''])('a status outside the contract (%s) gets no chip', (s) => {
    expect(statusChip(s)).toBeNull()
  })
})

describe('skipped note (W6)', () => {
  test('one item', () => {
    expect(skippedNote(1)).toBe('1 item was skipped because the API sent it malformed.')
  })
  test('several items', () => {
    expect(skippedNote(4)).toBe('4 items were skipped because the API sent them malformed.')
  })
})
