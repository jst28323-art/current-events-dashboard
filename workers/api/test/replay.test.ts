// ROADMAP Phase 1 exit (1), literally: re-ingesting a recorded FIXTURE through an adapter into the HubDO creates no
// duplicates and does not move the cursor. The real-adapter cases activate by themselves once fr.api / wh.feeds are
// in @ced/adapters SOURCES (skipped until then; each finds its endpoint by URL). A minimal stand-in adapter over the
// same Public Inspection fixture runs today, so the replay path itself is proven now. Fixtures are bundled with
// Vite's ?raw (workerd tests have no host disk); fixtures are never edited.
import { describe, expect, test } from 'vitest'
import { finalizeEvent, type CedEvent } from '@ced/schema'
import { sourceById, type AdapterOutput, type Endpoint, type FetchedResponse, type SourceDefinition } from '@ced/adapters'
import piBody from '../../../fixtures/fr.api/2026-10-02/pi_current.json?raw'
import piMeta from '../../../fixtures/fr.api/2026-10-02/pi_current.json.meta.json'
import earlyBody from '../../../fixtures/fr.api/2026-10-03/documents_newest_next_issue_early.json?raw'
import earlyMeta from '../../../fixtures/fr.api/2026-10-03/documents_newest_next_issue_early.json.meta.json'
import newsBody from '../../../fixtures/wh.feeds/2026-10-02/news_feed.xml?raw'
import newsMeta from '../../../fixtures/wh.feeds/2026-10-02/news_feed.xml.meta.json'
import { fakeSource, freshHub, page } from './fakes.js'

interface Meta {
  url: string
  status: number
  fetched_at: string
  response_headers: Record<string, string>
}

function replay(meta: Meta, body: string, fetchedAtMs: number): FetchedResponse {
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(meta.response_headers)) headers[k.toLowerCase()] = String(v)
  return { url: meta.url, status: meta.status, headers, body, fetchedAt: new Date(fetchedAtMs).toISOString() }
}

/** Parse the fixture twice (a minute apart) into one fresh hub; return what each ingest did and both snapshots. */
async function replayTwice(def: SourceDefinition, ep: Endpoint, meta: Meta, body: string) {
  const hub = freshHub()
  const t0 = Date.parse(meta.fetched_at)
  const record = (atMs: number) =>
    hub.recordPoll({
      source_id: def.source_id,
      affiliation: def.affiliation,
      endpoint_id: ep.id,
      started_ms: atMs,
      finished_ms: atMs,
      jitter: 0.5,
      outcome: {
        kind: 'parsed',
        output: def.parse(ep.id, replay(meta, body, atMs)),
        etag: null,
        last_modified: null,
        body_hash: `replay-${atMs}`,
      },
    })
  const first = await record(t0)
  const snap1 = await page(hub, null, 500)
  const second = await record(t0 + 60_000)
  const snap2 = await page(hub, null, 500)
  return { first, second, snap1, snap2 }
}

function expectNoDuplicates(r: Awaited<ReturnType<typeof replayTwice>>) {
  expect(r.first.health, r.first.detail).toMatch(/^(ok|empty)$/)
  expect(r.snap1.events.length).toBe(Math.min(r.first.inserted, 500))
  expect(r.second).toMatchObject({ inserted: 0, revised: 0, merged: 0 })
  expect(r.snap2.cursor).toBe(r.snap1.cursor)
  expect(r.snap2.events.length).toBe(r.snap1.events.length)
}

/** A deliberately minimal stand-in for the fr.api Public Inspection adapter (the real one is packages/adapters'). */
interface PiDoc {
  document_number: string
  title: string
  type: string
  agency_names: string[]
  agencies: Array<{ slug?: string }>
  html_url: string
}
const standIn = fakeSource('fr.api', [
  { id: 'pi', url: 'https://www.federalregister.gov/api/v1/public-inspection-documents/current.json', validator: 'body-hash' },
]).def
standIn.parse = (endpointId: string, res: FetchedResponse): AdapterOutput => {
  const docs = (JSON.parse(res.body) as { results: PiDoc[] }).results.slice(0, 20) // head-only, like the real one
  const events = docs.map((d) =>
    finalizeEvent({
      dedup_key: `fr:${d.document_number}#public_inspection`,
      object_key: `fr:${d.document_number}`,
      event_type: 'fr.public_inspection',
      status: 'published',
      branch: 'executive',
      body: d.agencies[0]?.slug ? `agency:${d.agencies[0].slug}` : 'federal_register',
      features: ['F10'],
      title: `${d.agency_names[0] ?? 'An agency'} filed a ${d.type.toLowerCase()} for public inspection`,
      official_text: d.title.trim(),
      times: { occurred_at: null, first_seen_at: res.fetchedAt },
      sources: [{ source_id: 'fr.api', url: d.html_url, retrieved_at: res.fetchedAt, affiliation: 'official-nonpartisan' }],
      revision: 1,
      provenance: { parser: 'standin_pi@0.0.1', confidence: 'high' },
    }),
  )
  return { events, health: { source_id: 'fr.api', endpoint: endpointId, status: 'ok', detail: 'stand-in', items_seen: docs.length } }
}

describe('recorded fixtures through an adapter into the HubDO', () => {
  test('stand-in adapter, fr.api pi_current.json: re-ingesting creates no duplicates and does not move the cursor', async () => {
    const r = await replayTwice(standIn, standIn.endpoints[0]!, piMeta as Meta, piBody)
    expect(r.first.inserted).toBe(20)
    expectNoDuplicates(r)
  })

  const CASES: Array<{ source_id: string; urlPart: string; meta: Meta; body: string }> = [
    { source_id: 'fr.api', urlPart: 'public-inspection-documents/current', meta: piMeta as Meta, body: piBody },
    { source_id: 'wh.feeds', urlPart: '/news/feed/', meta: newsMeta as Meta, body: newsBody },
  ]
  for (const c of CASES) {
    const def = sourceById(c.source_id)
    const ep = def?.endpoints.find((e) => e.url.includes(c.urlPart))
    test.skipIf(!def || !ep)(`registered ${c.source_id} adapter, ${c.urlPart}: re-ingesting creates no duplicates`, async () => {
      expectNoDuplicates(await replayTwice(def!, ep!, c.meta, c.body))
    })
  }
})

// D-055 end to end: the recorded Saturday reply (the FR listing Monday's issue early) through the REAL fr.api adapter into
// a HubDO, then the same body again after midnight Eastern (the poller parses it again: Endpoint.dayDependent).
describe('an FR document listed early becomes "published" at midnight Eastern, as a revision of the same event', () => {
  const def = sourceById('fr.api')
  const ep = def?.endpoints.find((e) => e.id === 'documents_newest')
  test.skipIf(!def || !ep)('Saturday: 106 scheduled; Monday 00:30 EDT: those 106 revised to published, first sighting kept', async () => {
    const hub = freshHub()
    const meta = earlyMeta as Meta
    const record = (atMs: number) =>
      hub.recordPoll({
        source_id: def!.source_id,
        affiliation: def!.affiliation,
        endpoint_id: ep!.id,
        started_ms: atMs,
        finished_ms: atMs,
        jitter: 0.5,
        outcome: { kind: 'parsed', output: def!.parse(ep!.id, replay(meta, earlyBody, atMs)), etag: null, last_modified: null, body_hash: `replay-${atMs}` },
      })
    const find = (events: CedEvent[]) => events.find((e) => e.object_key === 'fr:2026-20439')!
    const sat = Date.parse(meta.fetched_at)
    expect(await record(sat)).toMatchObject({ health: 'ok', inserted: 500 })
    const before = find((await page(hub, null, 500)).events)
    expect(before.status).toBe('scheduled')

    expect(await record(sat + 60_000)).toMatchObject({ inserted: 0, revised: 0, merged: 0 }) // same day: no change
    const mon = Date.parse('2026-10-05T04:30:00Z')
    expect(await record(mon)).toMatchObject({ health: 'ok', inserted: 0, revised: 106 })
    const after = find((await page(hub, null, 500, mon)).events)
    expect(after).toMatchObject({ status: 'published', revision: 2, supersedes: before.id, dedup_key: before.dedup_key })
    expect(after.title).toBe('Presidential determination published in the Federal Register on October 5, 2026 (FR Doc. 2026-20439)')
    expect(after.times.first_seen_at).toBe(before.times.first_seen_at) // still ordered by Saturday's sighting
    expect(await record(mon + 3_600_000)).toMatchObject({ inserted: 0, revised: 0, merged: 0 })
  })
})
