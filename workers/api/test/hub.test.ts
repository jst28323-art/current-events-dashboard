// HubDO storage rules (docs/EVENT_MODEL.md merge rule; packages/schema/src/api.ts cursor contract), run in workerd
// against a fresh SQLite-backed Durable Object per test.
import { describe, expect, test } from 'vitest'
import { eventId, validateEvent, type CedEvent } from '@ced/schema'
import { DOCS, MIN, T0, docEvent, fakeSource, freshHub, ingest, iso, page } from './fakes.js'
import { describeSources } from '../src/policy.js'

const [EO, EO2, SEC] = DOCS as [(typeof DOCS)[0], (typeof DOCS)[0], (typeof DOCS)[0]]

describe('dedupe', () => {
  test('re-ingesting the same payload creates no duplicates and does not move the cursor', async () => {
    const hub = freshHub()
    const first = await ingest(hub, 'fake.fr', DOCS.map((d) => docEvent(d, T0)), T0)
    expect(first).toMatchObject({ health: 'ok', inserted: 3, revised: 0, merged: 0 })
    const before = await page(hub, null)
    expect(before.events).toHaveLength(3)

    // The next poll sees the same items (a later fetch, so later first_seen_at and retrieved_at).
    const again = await ingest(hub, 'fake.fr', DOCS.map((d) => docEvent(d, T0 + MIN)), T0 + MIN)
    expect(again).toMatchObject({ health: 'ok', inserted: 0, revised: 0, merged: 0, unchanged: 3 })
    const after = await page(hub, null)
    expect(after.events).toHaveLength(3)
    expect(after.cursor).toBe(before.cursor)
    expect(after.events).toEqual(before.events)
    expect((await page(hub, before.cursor)).events).toEqual([])
    // Only one revision of each exists.
    for (const d of DOCS) expect(await hub.history(`fr:${d.document_number}#public_inspection`)).toHaveLength(1)
  })
})

describe('merge', () => {
  test('same dedup_key from another source: union of sources, earliest first_seen_at, same id and revision', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, T0 + MIN)], T0 + MIN)
    const c1 = (await page(hub, null)).cursor
    // A lower-ranked mirror saw it a minute EARLIER (processed later), with its own URL and its own wording.
    const mirror = docEvent(EO, T0, { source_id: 'fake.mirror', affiliation: 'third-party', url: 'https://mirror.example/fr/2026-20321' })
    const mirrored = { ...mirror, title: 'Mirror headline: AI order' }
    const r = await ingest(hub, 'fake.mirror', [mirrored], T0 + 2 * MIN, 'items', 'third-party')
    expect(r).toMatchObject({ health: 'ok', inserted: 0, revised: 0, merged: 1 })

    const [ev] = (await page(hub, null)).events as [CedEvent]
    expect(ev.sources.map((s) => s.source_id)).toEqual(['fake.fr', 'fake.mirror'])
    expect(ev.times.first_seen_at).toBe(iso(T0))
    expect(ev.revision).toBe(1)
    expect(ev.id).toBe(eventId(ev.dedup_key, 1))
    // The official owner's facts stand; the mirror adds provenance only.
    expect(ev.title).toBe(docEvent(EO, T0).title)
    expect(validateEvent(ev).valid).toBe(true)
    // A merge is a change: a client polling with the old cursor gets the merged event.
    expect((await page(hub, c1)).events.map((e) => e.id)).toEqual([ev.id])

    // Re-sending either copy again changes nothing.
    const c2 = (await page(hub, null)).cursor
    await ingest(hub, 'fake.mirror', [mirrored], T0 + 3 * MIN, 'items', 'third-party')
    await ingest(hub, 'fake.fr', [docEvent(EO, T0 + 4 * MIN)], T0 + 4 * MIN)
    expect((await page(hub, null)).cursor).toBe(c2)
  })

  test('changed content: revision 2 supersedes revision 1 with a valid id; only the latest is served', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0)
    const rev1 = (await page(hub, null)).events[0]!
    const corrected = docEvent({ ...EO, title: 'Inaugurating the Era of Superintelligence' }, T0 + MIN)
    const r = await ingest(hub, 'fake.fr', [corrected], T0 + MIN)
    expect(r).toMatchObject({ inserted: 0, revised: 1 })

    const served = (await page(hub, null)).events
    expect(served).toHaveLength(1)
    const rev2 = served[0]!
    expect(rev2.revision).toBe(2)
    expect(rev2.supersedes).toBe(rev1.id)
    expect(rev2.id).toBe(eventId(rev1.dedup_key, 2))
    expect(rev2.id).not.toBe(rev1.id)
    expect(rev2.official_text).toBe('Inaugurating the Era of Superintelligence')
    expect(rev2.times.first_seen_at).toBe(iso(T0)) // earliest kept
    expect(validateEvent(rev2)).toEqual({ valid: true, errors: [] })

    const hist = await hub.history(rev1.dedup_key)
    expect(hist.map((h) => [h.revision, h.current, h.id])).toEqual([
      [1, false, rev1.id],
      [2, true, rev2.id],
    ])
    expect(JSON.parse(hist[0]!.json)).toEqual(rev1)
  })
})

describe('owner rule: only the polled source speaks, with its registered affiliation', () => {
  const MIRROR_URL = 'https://mirror.example/fr/2026-20321'

  test("a non-owner payload that also lists the owner's entry is refused and cannot change the facts", async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0)
    const base = docEvent(EO, T0 + MIN, { source_id: 'fake.mirror', affiliation: 'third-party', url: MIRROR_URL })
    // A buggy or hostile third-party adapter appends a copy of the official owner's entry to its own event.
    const forged = { ...base, title: 'FORGED headline from a third-party mirror', sources: [...base.sources, docEvent(EO, T0).sources[0]!] }
    expect(validateEvent(forged).valid).toBe(true)
    const r = await ingest(hub, 'fake.mirror', [forged], T0 + MIN, 'items', 'third-party')
    expect(r).toMatchObject({ health: 'drift', inserted: 0, revised: 0, merged: 0 })
    expect(r.detail).toContain('cites fake.fr')
    const [ev] = (await page(hub, null)).events as [CedEvent]
    expect(ev.title).toBe(docEvent(EO, T0).title)
    expect(ev.revision).toBe(1)
    expect(ev.sources.map((s) => s.source_id)).toEqual(['fake.fr'])
  })

  test('a source cannot label itself above its registered affiliation to take over the facts', async () => {
    const hub = freshHub()
    const indep = docEvent(EO, T0, { source_id: 'fake.indep', affiliation: 'independent', url: 'https://indep.example/x' })
    await ingest(hub, 'fake.indep', [indep], T0, 'items', 'independent')
    // fake.blog is registered as unofficial but labels its own entry official-nonpartisan.
    const forged = {
      ...docEvent(EO, T0 + MIN, { source_id: 'fake.blog', affiliation: 'official-nonpartisan', url: 'https://blog.example/x' }),
      title: 'FORGED 3',
    }
    const r = await ingest(hub, 'fake.blog', [forged], T0 + MIN, 'items', 'unofficial')
    expect(r).toMatchObject({ health: 'drift', inserted: 0, revised: 0, merged: 0 })
    expect(r.detail).toContain('registered as unofficial')
    const [ev] = (await page(hub, null)).events as [CedEvent]
    expect(ev.title).toBe(indep.title)
    expect(ev.sources[0]).toMatchObject({ source_id: 'fake.indep', affiliation: 'independent' })
  })

  test('a payload that puts another source first is refused (the stored owner is always the polled source)', async () => {
    const hub = freshHub()
    const own = docEvent(EO, T0, { source_id: 'fake.blog', affiliation: 'unofficial', url: 'https://blog.example/x' })
    const forged = { ...own, sources: [docEvent(EO, T0).sources[0]!, ...own.sources] } // claims fake.fr as the primary
    const r = await ingest(hub, 'fake.blog', [forged], T0, 'items', 'unofficial')
    expect(r).toMatchObject({ health: 'drift', inserted: 0 })
    expect((await page(hub, null)).events).toEqual([])
  })

  test('a registered higher-ranked source takes over the facts; the lower one cannot flip them back', async () => {
    const hub = freshHub()
    const m = { ...docEvent(EO, T0, { source_id: 'fake.mirror', affiliation: 'third-party', url: MIRROR_URL }), title: 'mirror words' }
    expect(await ingest(hub, 'fake.mirror', [m], T0, 'items', 'third-party')).toMatchObject({ health: 'ok', inserted: 1 })
    const r2 = await ingest(hub, 'fake.fr', [docEvent(EO, T0 + MIN)], T0 + MIN)
    expect(r2).toMatchObject({ health: 'ok', revised: 1 })
    const resent = { ...m, times: { ...m.times, first_seen_at: iso(T0 + 2 * MIN) } }
    expect(await ingest(hub, 'fake.mirror', [resent], T0 + 2 * MIN, 'items', 'third-party')).toMatchObject({ unchanged: 1, revised: 0 })
    const [ev] = (await page(hub, null)).events as [CedEvent]
    expect(ev.title).toBe(docEvent(EO, T0).title)
    expect(ev.revision).toBe(2)
    expect(ev.times.first_seen_at).toBe(iso(T0))
    expect(ev.sources.map((s) => s.source_id)).toEqual(['fake.fr', 'fake.mirror'])
  })
})

describe('fail closed', () => {
  test('a payload that repeats a dedup_key is refused, so re-parsing it never churns revisions', async () => {
    const hub = freshHub()
    for (let i = 0; i < 3; i++) {
      const at = T0 + i * MIN
      const r = await ingest(hub, 'fake.fr', [docEvent(EO, at), docEvent({ ...EO, title: 'other' }, at)], at)
      expect(r, `ingest ${i}`).toMatchObject({ health: 'drift', inserted: 0, revised: 0 })
      expect(r.detail).toMatch(/events\[1\] \(fr:2026-20321#public_inspection\) repeats events\[0\]/)
    }
    expect(await hub.history(`fr:${EO.document_number}#public_inspection`)).toEqual([])
    expect((await page(hub, null)).cursor).toMatch(/\.0$/)
  })

  test('a payload with one invalid event stores nothing and marks the endpoint as drift', async () => {
    const hub = freshHub()
    const good = docEvent(EO, T0)
    const bad = docEvent({ ...EO2, filed_at: '2026-02-30T15:15:00Z' }, T0) // not a real calendar day
    const r = await ingest(hub, 'fake.fr', [good, bad], T0)
    expect(r).toMatchObject({ health: 'drift', inserted: 0 })
    expect(r.detail).toMatch(/events\[1\] \(fr:2026-20320#public_inspection\).*not a real instant/)

    const snap = await page(hub, null)
    expect(snap.events).toEqual([])
    expect(snap.cursor).toMatch(/\.0$/)
    // The validators of a refused payload are not remembered, so the same body is parsed (and refused) again.
    const plan = await hub.plan(T0)
    expect(plan.states[0]).toMatchObject({ health: 'drift', body_hash: null, last_success_ms: null, error_streak: 1 })

    const { def } = fakeSource('fake.fr', [{ id: 'pi', url: 'https://www.federalregister.gov/x.json', validator: 'body-hash' }])
    const st = await hub.status(T0, describeSources([def], T0))
    expect(st.sources[0]).toMatchObject({ health: 'drift', stale: true, error_streak: 1 })
    expect(st.sources[0]!.detail).toContain('not a real instant')
  })

  test('an event that does not cite the polled source is refused', async () => {
    const hub = freshHub()
    const r = await ingest(hub, 'fake.fr', [docEvent(EO, T0, { source_id: 'fake.other' })], T0)
    expect(r).toMatchObject({ health: 'drift', inserted: 0 })
    expect(r.detail).toContain('does not cite source fake.fr')
    expect((await page(hub, null)).events).toEqual([])
  })

  test('an event missing a required field is refused with the reason', async () => {
    const hub = freshHub()
    const { title: _t, ...untitled } = docEvent(EO, T0)
    const r = await ingest(hub, 'fake.fr', [docEvent(SEC, T0), untitled], T0)
    expect(r).toMatchObject({ health: 'drift', inserted: 0 })
    expect(r.detail).toMatch(/events\[1\].*required/)
    expect((await page(hub, null)).events).toEqual([])
  })
})

describe('validators', () => {
  test('a not_modified outcome refreshes validators only for the body this endpoint last accepted', async () => {
    const hub = freshHub()
    const rec = (atMs: number, outcome: Parameters<typeof hub.recordPoll>[0]['outcome']) =>
      hub.recordPoll({ source_id: 'fake.wh', affiliation: 'official-nonpartisan', endpoint_id: 'news', started_ms: atMs, finished_ms: atMs, jitter: 0.5, outcome })
    const out = { events: [docEvent(EO, T0, { source_id: 'fake.wh' })], health: { source_id: 'fake.wh', endpoint: 'news', status: 'ok' as const, detail: '1', items_seen: 1 } }
    await rec(T0, { kind: 'parsed', output: out, etag: '"e1"', last_modified: null, body_hash: 'sha-A' })
    const state = async () => (await hub.plan(T0)).states.find((s) => s.endpoint_id === 'news')!
    // Validators that arrive with a different body key never replace the stored ones.
    await rec(T0 + MIN, { kind: 'not_modified', detail: 'x', validators: { etag: '"evil"', last_modified: null, body_hash: 'sha-B' } })
    expect(await state()).toMatchObject({ etag: '"e1"', body_hash: 'sha-A', health: 'not_modified' })
    await rec(T0 + 2 * MIN, { kind: 'not_modified', detail: 'x', validators: { etag: '"e2"', last_modified: null, body_hash: 'sha-A' } })
    expect(await state()).toMatchObject({ etag: '"e2"', body_hash: 'sha-A' })
  })
})

describe('since cursor', () => {
  test('insert, poll, update, poll: a client polling with its last cursor never misses a change', async () => {
    const hub = freshHub()
    const c0 = (await page(hub, null)).cursor
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0)
    const p1 = await page(hub, c0)
    expect(p1.events.map((e) => e.official_text)).toEqual([EO.title])

    await ingest(hub, 'fake.fr', [docEvent(EO, T0 + MIN), docEvent(SEC, T0 + MIN)], T0 + MIN)
    const p2 = await page(hub, p1.cursor)
    expect(p2.events.map((e) => e.official_text)).toEqual([SEC.title]) // EO unchanged: not re-sent

    await ingest(hub, 'fake.fr', [docEvent({ ...EO, title: 'Corrected title' }, T0 + 2 * MIN)], T0 + 2 * MIN)
    const p3 = await page(hub, p2.cursor)
    expect(p3.events.map((e) => [e.official_text, e.revision])).toEqual([['Corrected title', 2]])

    const p4 = await page(hub, p3.cursor)
    expect(p4).toMatchObject({ events: [], cursor: p3.cursor, has_more: false })
  })

  test('paging with limit and has_more delivers every change exactly once, oldest change first', async () => {
    const hub = freshHub()
    const c0 = (await page(hub, null)).cursor
    for (const [i, d] of DOCS.entries()) await ingest(hub, 'fake.fr', [docEvent(d, T0 + i * MIN)], T0 + i * MIN)
    const seen: string[] = []
    let cursor = c0
    let p = await page(hub, cursor, 2)
    expect(p.has_more).toBe(true)
    seen.push(...p.events.map((e) => e.official_text))
    cursor = p.cursor
    // A change lands between two pages: it must still be delivered.
    await ingest(hub, 'fake.fr', [docEvent({ ...EO, title: 'Late correction' }, T0 + 9 * MIN)], T0 + 9 * MIN)
    for (;;) {
      p = await page(hub, cursor, 2)
      seen.push(...p.events.map((e) => e.official_text))
      cursor = p.cursor
      if (!p.has_more) break
    }
    expect(seen).toEqual([EO.title, EO2.title, SEC.title, 'Late correction'])
    expect((await page(hub, cursor)).events).toEqual([])
  })

  test('a cursor this hub never issued is refused', async () => {
    const hub = freshHub()
    const other = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0)
    const mine = (await page(hub, null)).cursor
    const theirs = (await page(other, null)).cursor
    const ask = async (since: string) => hub.events({ since, limit: 10, now_ms: T0 })
    expect((await ask(mine)).ok).toBe(true)
    expect((await ask(theirs)).ok).toBe(false) // another hub's epoch (e.g. a wiped store)
    const [epoch] = mine.split('.')
    expect((await ask(`${epoch}.99`)).ok).toBe(false) // ahead of anything issued
    expect((await ask('banana')).ok).toBe(false)
    expect((await ask(`${epoch}.01`)).ok).toBe(false)
    expect((await ask('')).ok).toBe(false)
  })
})

describe('status', () => {
  const { def } = fakeSource('fake.fr', [{ id: 'pi', url: 'https://www.federalregister.gov/x.json', validator: 'body-hash' }], {
    freshness_slo_s: 120,
  })

  test('never polled is stale; stale flips once freshness_slo_s passes without a success', async () => {
    const hub = freshHub()
    const st0 = await hub.status(T0, describeSources([def], T0))
    expect(st0.sources[0]).toMatchObject({
      source_id: 'fake.fr',
      health: 'never_polled',
      stale: true,
      last_success_at: null,
      error_streak: 0,
      items_24h: 0,
      median_latency_s: null,
      freshness_slo_s: 120,
      cadence_s: 60,
    })
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0)
    const at = async (ms: number) => (await hub.status(ms, describeSources([def], ms))).sources[0]!
    expect(await at(T0 + 60_000)).toMatchObject({ health: 'ok', stale: false, last_success_at: iso(T0) })
    expect((await at(T0 + 120_000)).stale).toBe(false)
    expect((await at(T0 + 120_001)).stale).toBe(true)
  })

  test('a source is only as fresh as its stalest endpoint', async () => {
    const hub = freshHub()
    const two = fakeSource('fake.fr', [
      { id: 'pi', url: 'https://www.federalregister.gov/a.json', validator: 'body-hash' },
      { id: 'docs', url: 'https://www.federalregister.gov/b.json', validator: 'body-hash' },
    ]).def
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0, 'pi')
    const s = (await hub.status(T0 + 1000, describeSources([two], T0 + 1000))).sources[0]!
    expect(s).toMatchObject({ health: 'never_polled', stale: true, last_success_at: null, last_attempt_at: iso(T0) })
    expect(s.detail).toBe('docs: not polled yet')
  })

  test('median latency over 24 h excludes the start-up backfill; items_24h counts every first sighting', async () => {
    const hub = freshHub()
    // First accepted payload = backfill (latency here is our deploy time, not detection).
    await ingest(hub, 'fake.fr', [docEvent(SEC, T0), docEvent({ ...EO2, filed_at: '2026-09-30T15:15:00Z' }, T0)], T0)
    // Two genuinely new filings, seen 30 s and 90 s after they were filed.
    const a = { ...EO, document_number: '2026-20400', filed_at: iso(T0 + 10 * MIN - 30_000) }
    const b = { ...EO, document_number: '2026-20401', filed_at: iso(T0 + 10 * MIN - 90_000) }
    await ingest(hub, 'fake.fr', [docEvent(a, T0 + 10 * MIN), docEvent(b, T0 + 10 * MIN)], T0 + 10 * MIN)
    const now = T0 + 11 * MIN
    const s = (await hub.status(now, describeSources([def], now))).sources[0]!
    expect(s.items_24h).toBe(4)
    expect(s.median_latency_s).toBe(60)
    const later = T0 + 10 * MIN + 24 * 60 * MIN + 1000
    expect((await hub.status(later, describeSources([def], later))).sources[0]!.items_24h).toBe(0)
  })

  test('a negative latency (occurred_at after first_seen_at) is not a measurement and stays out of the median', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(SEC, T0)], T0) // backfill
    // Seen 30 s after filing, and one whose filing time is 10 min AFTER we saw it (fr.api accepts filed_at up to 6 h
    // ahead of the fetch): only the first is a detection latency.
    const a = { ...EO, document_number: '2026-20400', filed_at: iso(T0 + 10 * MIN - 30_000) }
    const ahead = { ...EO, document_number: '2026-20402', filed_at: iso(T0 + 20 * MIN) }
    await ingest(hub, 'fake.fr', [docEvent(a, T0 + 10 * MIN), docEvent(ahead, T0 + 10 * MIN)], T0 + 10 * MIN)
    const now = T0 + 11 * MIN
    const s = (await hub.status(now, describeSources([def], now))).sources[0]!
    expect(s.items_24h).toBe(3)
    expect(s.median_latency_s).toBe(30)
  })
})

describe('snapshot order (orchestrator integration, 2026-10-02)', () => {
  test('an event with no occurred_at sorts by its posting time, not by when we first saw it', async () => {
    const hub = freshHub()
    const [EO, EO2] = DOCS as [typeof DOCS[number], typeof DOCS[number]]
    const filed = docEvent(EO, T0) // occurred_at = its filing time
    // A post with no event time, posted 3 days before our first sighting (a White House EO post on a backfill poll).
    const noTime = docEvent(EO2, T0)
    const posted = iso(T0 - 3 * 24 * 3600_000)
    const backfilled = { ...noTime, times: { occurred_at: null, source_published_at: posted, first_seen_at: noTime.times.first_seen_at } }
    // A claimed posting time AFTER our first sighting is ignored (it cannot be the posting time): it sorts by first seen.
    const future = { ...docEvent(DOCS[2]!, T0), times: { occurred_at: null, source_published_at: iso(T0 + 3600_000), first_seen_at: iso(T0) } }
    await ingest(hub, 'fake.fr', [filed, backfilled, future], T0)
    const order = (await page(hub, null)).events.map((e) => e.dedup_key)
    const keyMs: Record<string, number> = {
      [future.dedup_key]: T0, // first seen
      [filed.dedup_key]: Date.parse(filed.times.occurred_at!), // occurred
      [backfilled.dedup_key]: Date.parse(posted), // posted, 3 days earlier
    }
    expect(order).toEqual(Object.keys(keyMs).sort((x, y) => keyMs[y]! - keyMs[x]!))
    expect(order[order.length - 1]).toBe(backfilled.dedup_key)
  })
})

describe('status: staleness per endpoint (Endpoint.cadence, D-046)', () => {
  // fr.api's shape: Public Inspection on the source cadence (60 s, SLO 120 s), documents.json on its own 15-min cadence.
  const two = fakeSource('fake.fr', [
    { id: 'pi', url: 'https://www.federalregister.gov/a.json', validator: 'body-hash' },
    { id: 'docs', url: 'https://www.federalregister.gov/b.json', validator: 'body-hash', cadence: { business_s: 900, off_s: 3600 } },
  ]).def
  const at = async (hub: ReturnType<typeof freshHub>, ms: number) => (await hub.status(ms, describeSources([two], ms))).sources[0]!
  /** The web page's own check (apps/web labels.ts isStale): stale, or last_success_at older than freshness_slo_s. */
  const clientStale = (s: { stale: boolean; last_success_at: string | null; freshness_slo_s: number }, ms: number) =>
    s.stale || s.last_success_at == null || ms - Date.parse(s.last_success_at) > s.freshness_slo_s * 1000

  test('a slow endpoint is not stale 10 min after its last poll while the fast one keeps polling', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0, 'docs')
    for (let m = 0; m <= 10; m++) await ingest(hub, 'fake.fr', [docEvent(SEC, T0 + m * MIN)], T0 + m * MIN, 'pi')
    const s = await at(hub, T0 + 10 * MIN + 30_000)
    expect(s).toMatchObject({ stale: false, cadence_s: 60, freshness_slo_s: 1800, last_success_at: iso(T0) })
    // The page compares the stalest endpoint's success with the largest threshold: it agrees (no false "stale").
    expect(clientStale(s, T0 + 10 * MIN + 30_000)).toBe(false)
    // The slow endpoint itself goes stale after ITS threshold (2 x 900 s).
    await ingest(hub, 'fake.fr', [docEvent(SEC, T0 + 30 * MIN)], T0 + 30 * MIN, 'pi')
    expect((await at(hub, T0 + 30 * MIN)).stale).toBe(false)
    expect((await at(hub, T0 + 30 * MIN + 1)).stale).toBe(true)
  })

  test('a stopped fast endpoint is stale at 121 s (2 x its 60 s cadence) while the slow one is fine', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0, 'docs')
    await ingest(hub, 'fake.fr', [docEvent(SEC, T0)], T0, 'pi')
    expect((await at(hub, T0 + 120_000)).stale).toBe(false)
    const s = await at(hub, T0 + 121_000)
    expect(s).toMatchObject({ stale: true, health: 'ok' })
    expect(clientStale(s, T0 + 121_000)).toBe(true) // through the server's flag
    // Only the fast endpoint was overdue: once it polls again, the 121-s-old slow endpoint does not make it stale.
    await ingest(hub, 'fake.fr', [docEvent(SEC, T0 + 121_000)], T0 + 121_000, 'pi')
    expect((await at(hub, T0 + 121_000)).stale).toBe(false)
  })

  test('off hours: each endpoint is judged by its own off-hours threshold', async () => {
    const SAT = Date.parse('2026-10-03T16:00:00Z') // Sat noon ET: pi every 60 s (fake source), docs every 3600 s
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, SAT)], SAT, 'docs')
    await ingest(hub, 'fake.fr', [docEvent(SEC, SAT + 7140_000)], SAT + 7140_000, 'pi')
    const s = await at(hub, SAT + 7200_000)
    expect(s).toMatchObject({ stale: false, freshness_slo_s: 7200, cadence_s: 60 })
    expect((await at(hub, SAT + 7200_001)).stale).toBe(true)
  })
})

describe('snapshot order uses the shared rule (packages/schema order.ts)', () => {
  test('a backfilled document with only an earlier publication day sorts at that day, below a newer timed filing', async () => {
    const hub = freshHub()
    const [EO, EO2] = DOCS as [typeof DOCS[number], typeof DOCS[number]]
    const filed = docEvent(EO, T0) // occurred_at = its filing time (Oct 1)
    const base = docEvent(EO2, T0 + 5 * 24 * 3600_000) // first seen 5 days later
    const backfilled = { ...base, times: { occurred_at: null, first_seen_at: base.times.first_seen_at }, result: { publication_date: '2026-09-28' } }
    await ingest(hub, 'fake.fr', [backfilled, filed], T0 + 5 * 24 * 3600_000)
    const order = (await page(hub, null)).events.map((e) => e.dedup_key)
    expect(order).toEqual([filed.dedup_key, backfilled.dedup_key]) // by first_seen it would have been on top
  })
})
