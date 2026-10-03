// The merge rule as a pure function (src/merge.ts), below the HubDO's payload checks: even if a payload that lists
// someone else's entry got past checkPayload, only the payload's LEAD source decides whether it may change the facts.
import { describe, expect, test } from 'vitest'
import { eventId } from '@ced/schema'
import { mergeEvent } from '../src/merge.js'
import { DOCS, MIN, T0, docEvent } from './fakes.js'

const EO = DOCS[0]!
const MIRROR = { source_id: 'fake.mirror', affiliation: 'third-party' as const, url: 'https://mirror.example/fr/2026-20321' }

describe('mergeEvent owner rule', () => {
  test('listing the owner somewhere in sources[] does not make a payload the owner', () => {
    const stored = docEvent(EO, T0) // owner: fake.fr, official-nonpartisan
    const m = docEvent(EO, T0 + MIN, MIRROR)
    const incoming = { ...m, title: 'FORGED', sources: [...m.sources, stored.sources[0]!] }
    const r = mergeEvent(stored, incoming)
    expect(r.kind).toBe('merged') // provenance only
    if (r.kind !== 'merged') return
    expect(r.event.title).toBe(stored.title)
    expect(r.event.revision).toBe(1)
    expect(r.event.sources.map((s) => s.source_id)).toEqual(['fake.fr', 'fake.mirror'])
  })

  test('the owner revises; a strictly higher-ranked lead takes over; an equal or lower rank does not', () => {
    const stored = docEvent(EO, T0)
    const fromOwner = mergeEvent(stored, { ...docEvent(EO, T0 + MIN), title: 'Corrected' })
    expect(fromOwner).toMatchObject({ kind: 'revised', event: { title: 'Corrected', revision: 2, supersedes: stored.id } })

    const peer = docEvent(EO, T0 + MIN, { source_id: 'fake.peer', affiliation: 'official-nonpartisan', url: 'https://peer.example/x' })
    expect(mergeEvent(stored, { ...peer, title: 'Peer words' }).kind).toBe('merged')

    const ownedByMirror = { ...docEvent(EO, T0, MIRROR), title: 'mirror words' }
    const takeover = mergeEvent(ownedByMirror, docEvent(EO, T0 + MIN))
    expect(takeover).toMatchObject({ kind: 'revised', event: { title: stored.title, id: eventId(stored.dedup_key, 2) } })
    if (takeover.kind === 'revised') expect(takeover.event.sources.map((s) => s.source_id)).toEqual(['fake.fr', 'fake.mirror'])
  })
})

describe('re-slugged post from the owner (WH-5)', () => {
  const at = (ms: number) => new Date(ms).toISOString()
  const stored = { ...docEvent(EO, T0), alias_keys: ['wh:presidential-actions/2026/09/old-slug'] }
  const lead0 = stored.sources[0]!
  const reslugged = {
    ...docEvent(EO, T0 + MIN),
    title: 'Re-titled by the source',
    alias_keys: ['wh:presidential-actions/2026/09/new-slug'],
    sources: [{ ...lead0, url: 'https://www.whitehouse.gov/presidential-actions/2026/09/new-slug/', retrieved_at: at(T0 + MIN) }],
  }

  test('the revision leads with the current link and keeps the old link and the old alias as provenance', () => {
    const r = mergeEvent(stored, reslugged)
    expect(r.kind).toBe('revised')
    if (r.kind !== 'revised') return
    expect(r.event.sources[0]!.url).toBe('https://www.whitehouse.gov/presidential-actions/2026/09/new-slug/')
    expect(r.event.sources.map((s) => s.url)).toContain(lead0.url)
    expect(r.event.alias_keys).toEqual(['wh:presidential-actions/2026/09/new-slug', 'wh:presidential-actions/2026/09/old-slug'])
    expect(r.event.times.first_seen_at).toBe(stored.times.first_seen_at)
  })

  test('the next poll of the same re-slugged post is unchanged: the alias union never revises again', () => {
    const r1 = mergeEvent(stored, reslugged)
    if (r1.kind !== 'revised') throw new Error('expected a revision')
    const again = { ...reslugged, sources: [{ ...reslugged.sources[0]!, retrieved_at: at(T0 + 2 * MIN) }], times: { ...reslugged.times, first_seen_at: at(T0 + 2 * MIN) } }
    expect(mergeEvent(r1.event, again).kind).toBe('unchanged')
  })

  test('a new alias alone is provenance growth (merged, same revision), never a revision', () => {
    const plus = { ...docEvent(EO, T0 + MIN), alias_keys: ['eo:14434'] }
    const r = mergeEvent(docEvent(EO, T0), plus)
    expect(r.kind).toBe('merged')
    if (r.kind === 'merged') {
      expect(r.event.alias_keys).toEqual(['eo:14434'])
      expect(r.event.revision).toBe(1)
    }
  })
})
