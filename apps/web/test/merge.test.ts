import { describe, expect, test } from 'vitest'
import type { CedEvent } from '@ced/schema'
import { mergeEvents, mergeEventsCounted } from '../src/lib/merge.js'
import { EO_LINK, fixtureEvents, piEvent, whExecutiveOrderEvent } from '../e2e/fixture-events.js'

/** The same document re-sent as revision n (only the revision bookkeeping changes; the facts stay the fixture's). */
function revise(e: CedEvent, n: number, over: Partial<CedEvent> = {}): CedEvent {
  return { ...e, id: `${e.id.slice(0, 16)}${String(n).padStart(4, '0')}`, revision: n, supersedes: e.id, ...over }
}

const ids = (es: CedEvent[]) => es.map((e) => e.id)

describe('mergeEvents', () => {
  test('sorts newest first by coalesce(occurred_at, source_published_at, first_seen_at)', () => {
    const [pd, eo, rule, notice] = fixtureEvents() as [CedEvent, CedEvent, CedEvent, CedEvent]
    // The 15:15Z filing first; rule and notice tie at 12:45Z; the EO post has no signing time, so it sorts by its
    // Sep 29 posting time (not by when we first saw it): last.
    const out = mergeEvents([], [notice, rule, pd, eo])
    expect(out[0]!.id).toBe(pd.id)
    expect(new Set(ids(out.slice(1, 3)))).toEqual(new Set([rule.id, notice.id]))
    expect(out[3]!.id).toBe(eo.id)
    // ties broken by id, so the order is stable whatever order they arrive in
    expect(ids(mergeEvents([], [rule, notice]))).toEqual(ids(mergeEvents([], [notice, rule])))
  })

  test('the same event polled twice is one row', () => {
    const pd = piEvent('2026-20439', 'P0')
    const out = mergeEvents(mergeEvents([], [pd]), [pd, structuredClone(pd)])
    expect(out).toHaveLength(1)
  })

  test('a revision replaces its predecessor (same dedup_key)', () => {
    const pd = piEvent('2026-20439', 'P0')
    const r2 = revise(pd, 2, { status: 'corrected' })
    const out = mergeEvents(mergeEvents([], [pd]), [r2])
    expect(out).toHaveLength(1)
    expect(out[0]!.revision).toBe(2)
    expect(out[0]!.status).toBe('corrected')
  })

  test('an older revision arriving late does not replace a newer one', () => {
    const pd = piEvent('2026-20439', 'P0')
    const r3 = revise(pd, 3)
    const out = mergeEvents(mergeEvents([], [r3]), [pd])
    expect(out).toHaveLength(1)
    expect(out[0]!.revision).toBe(3)
  })

  test('a revision and its predecessor in the same page keep only the revision, whatever the order', () => {
    const pd = piEvent('2026-20439', 'P0')
    const r2 = revise(pd, 2)
    expect(mergeEvents([], [pd, r2]).map((e) => e.revision)).toEqual([2])
    expect(mergeEvents([], [r2, pd]).map((e) => e.revision)).toEqual([2])
  })

  test('supersedes removes a predecessor stored under another dedup_key', () => {
    const eo = whExecutiveOrderEvent(EO_LINK)
    const moved = { ...eo, id: 'evt_00000000000000aa', dedup_key: `${eo.dedup_key}:relinked`, revision: 2, supersedes: eo.id }
    const out = mergeEvents(mergeEvents([], [eo]), [moved])
    expect(ids(out)).toEqual([moved.id])
  })

  test('other rows are untouched by a revision', () => {
    const all = fixtureEvents()
    const r2 = revise(all[0]!, 2)
    const out = mergeEvents(mergeEvents([], all), [r2])
    expect(out).toHaveLength(all.length)
    expect(out.find((e) => e.dedup_key === r2.dedup_key)!.id).toBe(r2.id)
  })

  test('keeps at most `max` rows, dropping the oldest', () => {
    const all = fixtureEvents()
    const out = mergeEvents([], all, 2)
    expect(out).toHaveLength(2)
    expect(ids(out)).toEqual(ids(mergeEvents([], all)).slice(0, 2))
  })
})

// Review fixes (2026-10-02): W11 (cross-key supersedes must not depend on arrival order), W9 (the cap is reported).
describe('cross-key supersedes, whatever the order (W11)', () => {
  const eo = whExecutiveOrderEvent(EO_LINK)
  const moved = { ...eo, id: 'evt_00000000000000aa', dedup_key: `${eo.dedup_key}:relinked`, revision: 2, supersedes: eo.id }

  test('successor listed BEFORE its predecessor in one page (the no-since answer is newest first)', () => {
    expect(ids(mergeEvents([], [moved, eo]))).toEqual([moved.id])
  })

  test('a predecessor re-sent in a later poll is not brought back', () => {
    const s1 = mergeEvents([], [eo, moved])
    expect(ids(s1)).toEqual([moved.id])
    expect(ids(mergeEvents(s1, [eo]))).toEqual([moved.id])
  })

  test('a row only drops for a successor of a higher revision (a supersedes cycle cannot hide both)', () => {
    const a = { ...eo, revision: 2, supersedes: moved.id }
    const b = { ...moved, revision: 2, supersedes: eo.id }
    expect(new Set(ids(mergeEvents([], [a, b])))).toEqual(new Set([eo.id, moved.id]))
  })

  test('an event naming itself in supersedes is kept', () => {
    const self = { ...eo, supersedes: eo.id }
    expect(ids(mergeEvents([], [self]))).toEqual([eo.id])
  })
})

describe('the row cap is reported (W9)', () => {
  test('mergeEventsCounted says how many rows the cap dropped', () => {
    const all = fixtureEvents()
    expect(mergeEventsCounted([], all, 2).trimmed).toBe(2)
    expect(mergeEventsCounted([], all, 4).trimmed).toBe(0)
    expect(ids(mergeEventsCounted([], all, 2).events)).toEqual(ids(mergeEvents([], all, 2)))
  })
})
