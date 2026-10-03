// The P2.1 Congress adapters end to end through a HubDO (scratch/phase2/DESIGN.md §4.4): recorded fixtures through the
// FIXTURE-ONLY adapters (`@ced/adapters/fixture-only`, never polled live: D-058) into a fresh Hub, using the
// replayTwice / expectNoDuplicates pattern of replay.test.ts. Tests may import the fixture-only modules; workers/api/src
// may not (packages/adapters/test/live_list.test.ts).
//
// Every case is ACTIVE (stage 3 integration): the foundation's skip-on-stub guards are gone, and a separate test fails
// if any of the five adapters is (or reverts to) the foundation stub, so no case can silently skip again. Vote events
// are checked with validateVoteEvent before ingest (the Hub itself still runs the unchanged v0.1 validateEvent).
// Fixtures are bundled with Vite's ?raw (workerd tests have no host disk); fixtures are never edited: variants are made
// in memory.
import { describe, expect, test } from 'vitest'
import type { CedEvent } from '@ced/schema'
import { validateVoteEvent } from '@ced/schema/v02'
import {
  ADAPTER_NOT_BUILT, houseClerkFloor, houseClerkVotes, senateLisVotes, senatePressgallery, senateSchedule,
  type AdapterOutput, type FetchedResponse, type SourceDefinition,
} from '@ced/adapters/fixture-only'
import roll314Body from '../../../fixtures/house.clerk.votes/2026-10-02/roll314.xml?raw'
import roll314Meta from '../../../fixtures/house.clerk.votes/2026-10-02/roll314.xml.meta.json'
import vote256Body from '../../../fixtures/senate.lis.votes/2026-10-02/vote_119_2_00256.xml?raw'
import vote256Meta from '../../../fixtures/senate.lis.votes/2026-10-02/vote_119_2_00256.xml.meta.json'
import day1001Body from '../../../fixtures/house.clerk.floor/2026-10-03/20261001.xml?raw'
import day1001Meta from '../../../fixtures/house.clerk.floor/2026-10-03/20261001.xml.meta.json'
import day1001RegenBody from '../../../fixtures/house.clerk.floor/2026-10-03/20261001_regenerated_IMS_200.xml?raw'
import day1001RegenMeta from '../../../fixtures/house.clerk.floor/2026-10-03/20261001_regenerated_IMS_200.xml.meta.json'
import day0103Body from '../../../fixtures/house.clerk.floor/2026-10-03/20260103.xml?raw'
import day0103Meta from '../../../fixtures/house.clerk.floor/2026-10-03/20260103.xml.meta.json'
import day20250103Body from '../../../fixtures/house.clerk.floor/2026-10-03/20250103.xml?raw'
import day20250103Meta from '../../../fixtures/house.clerk.floor/2026-10-03/20250103.xml.meta.json'
import floorSchedBody from '../../../fixtures/senate.schedule/2026-10-02/floor_schedule.json?raw'
import floorSchedMeta from '../../../fixtures/senate.schedule/2026-10-02/floor_schedule.json.meta.json'
import hear0725Body from '../../../fixtures/senate.schedule/2026-10-03/hearings_2026-07-25_wayback.xml?raw'
import hear0725Meta from '../../../fixtures/senate.schedule/2026-10-03/hearings_2026-07-25_wayback.xml.meta.json'
import hear0730Body from '../../../fixtures/senate.schedule/2026-10-03/hearings_2026-07-30_wayback.xml?raw'
import hear0730Meta from '../../../fixtures/senate.schedule/2026-10-03/hearings_2026-07-30_wayback.xml.meta.json'
import galleryBody from '../../../fixtures/senate.pressgallery/2026-10-03/dailypress_posts_newest3_fields.json?raw'
import galleryMeta from '../../../fixtures/senate.pressgallery/2026-10-03/dailypress_posts_newest3_fields.json.meta.json'
import { freshHub, page } from './fakes.js'

interface Meta {
  url: string
  status: number
  fetched_at: string
  response_headers: Record<string, string>
}

const MIN = 60_000

/** A source still on the foundation stub answers every response with exactly this drift. */
function isStub(def: SourceDefinition): boolean {
  const ep = def.endpoints[0]!
  const out = def.parse(ep.id, { url: ep.url, status: 200, headers: {}, body: '', fetchedAt: '2026-10-03T00:00:00.000Z' })
  return out.health.status === 'drift' && out.health.detail === ADAPTER_NOT_BUILT
}

/** The recorded response; `url` overrides the meta url (Wayback copies are served as the senate.gov endpoint, R-12). */
function response(meta: Meta, body: string, atMs: number, url?: string): FetchedResponse {
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(meta.response_headers ?? {})) headers[k.toLowerCase()] = String(v)
  return { url: url ?? meta.url, status: meta.status, headers, body, fetchedAt: new Date(atMs).toISOString() }
}

/** Parse; vote events must also pass the v0.2 rules (validateVoteEvent) before the Hub sees them. */
function parsed(def: SourceDefinition, endpointId: string, res: FetchedResponse): AdapterOutput {
  const out = def.parse(endpointId, res)
  for (const e of out.events) {
    if (e.event_type === 'vote.result') expect(validateVoteEvent(e).errors, e.dedup_key).toEqual([])
  }
  return out
}

type Hub = ReturnType<typeof freshHub>

function record(hub: Hub, def: SourceDefinition, endpointId: string, res: FetchedResponse, atMs: number) {
  return hub.recordPoll({
    source_id: def.source_id,
    affiliation: def.affiliation,
    endpoint_id: endpointId,
    started_ms: atMs,
    finished_ms: atMs,
    jitter: 0.5,
    outcome: { kind: 'parsed', output: parsed(def, endpointId, res), etag: null, last_modified: null, body_hash: `replay-${atMs}` },
  })
}

/** Ingest one fixture twice (a minute apart) into a fresh Hub. */
async function replayTwice(def: SourceDefinition, endpointId: string, meta: Meta, body: string, url?: string) {
  const hub = freshHub()
  const t0 = Date.parse(meta.fetched_at)
  const first = await record(hub, def, endpointId, response(meta, body, t0, url), t0)
  const snap1 = await page(hub, null, 500, t0 + 2 * MIN)
  const second = await record(hub, def, endpointId, response(meta, body, t0 + MIN, url), t0 + MIN)
  const snap2 = await page(hub, null, 500, t0 + 2 * MIN)
  return { first, second, snap1, snap2 }
}

function expectNoDuplicates(r: Awaited<ReturnType<typeof replayTwice>>) {
  // ok/empty = the Hub accepted the payload: every event valid, its own source and registered affiliation, one
  // dedup_key per payload (hub.ts checkPayload refuses the whole payload as drift otherwise).
  expect(r.first.health, r.first.detail).toMatch(/^(ok|empty)$/)
  expect(r.first.inserted).toBeGreaterThan(0)
  expect(r.snap1.events.length).toBe(Math.min(r.first.inserted, 500))
  expect(r.second).toMatchObject({ inserted: 0, revised: 0, merged: 0 })
  expect(r.snap2.cursor).toBe(r.snap1.cursor)
  expect(r.snap2.events.length).toBe(r.snap1.events.length)
}

const HEARINGS_URL = senateSchedule.endpoints.find((e) => e.id === 'hearings')!.url

describe('P2.1 goldens through the Hub: re-ingesting creates no duplicates and does not move the cursor', () => {
  const CASES: Array<{ def: SourceDefinition; endpoint: string; name: string; meta: Meta; body: string; url?: string }> = [
    { def: houseClerkVotes, endpoint: 'roll', name: '2026-10-02/roll314.xml', meta: roll314Meta as Meta, body: roll314Body },
    { def: senateLisVotes, endpoint: 'vote', name: '2026-10-02/vote_119_2_00256.xml', meta: vote256Meta as Meta, body: vote256Body },
    { def: houseClerkFloor, endpoint: 'day', name: '2026-10-03/20261001.xml', meta: day1001Meta as Meta, body: day1001Body },
    { def: senateSchedule, endpoint: 'floor', name: '2026-10-02/floor_schedule.json', meta: floorSchedMeta as Meta, body: floorSchedBody },
    { def: senateSchedule, endpoint: 'hearings', name: '2026-10-03/hearings_2026-07-30_wayback.xml', meta: hear0730Meta as Meta, body: hear0730Body, url: HEARINGS_URL },
    { def: senatePressgallery, endpoint: 'daily_posts', name: '2026-10-03/dailypress_posts_newest3_fields.json', meta: galleryMeta as Meta, body: galleryBody },
  ]
  for (const c of CASES) {
    test(`${c.def.source_id} ${c.name}`, async () => {
      expectNoDuplicates(await replayTwice(c.def, c.endpoint, c.meta, c.body, c.url))
    })
  }
})

describe('P2.1 revisions and repeats through the Hub', () => {
  test('20261001.xml then its regenerated copy (only <pubDate> differs): nothing new', async () => {
    const hub = freshHub()
    const t0 = Date.parse(day1001Meta.fetched_at)
    const t1 = Math.max(Date.parse(day1001RegenMeta.fetched_at), t0 + MIN)
    const a = await record(hub, houseClerkFloor, 'day', response(day1001Meta as Meta, day1001Body, t0), t0)
    expect(a.health, a.detail).toBe('ok')
    expect(await record(hub, houseClerkFloor, 'day', response(day1001RegenMeta as Meta, day1001RegenBody, t1), t1))
      .toMatchObject({ inserted: 0, revised: 0, merged: 0 })
  })

  test('hearings 07-25 then 07-30: 338684, 338688 and 338689 are revised (3 revisions)', async () => {
    const hub = freshHub()
    const t0 = Date.parse(hear0725Meta.fetched_at)
    const t1 = Math.max(Date.parse(hear0730Meta.fetched_at), t0 + MIN)
    const a = await record(hub, senateSchedule, 'hearings', response(hear0725Meta as Meta, hear0725Body, t0, HEARINGS_URL), t0)
    expect(a.health, a.detail).toBe('ok')
    const b = await record(hub, senateSchedule, 'hearings', response(hear0730Meta as Meta, hear0730Body, t1, HEARINGS_URL), t1)
    expect(b.health, b.detail).toBe('ok')
    expect(b.revised).toBe(3)
    const revised = (await page(hub, null, 500, t1 + MIN)).events.filter((e: CedEvent) => e.revision > 1).map((e) => e.object_key).sort()
    expect(revised).toEqual(['hearing:senate:338684', 'hearing:senate:338688', 'hearing:senate:338689'])
  })

  test('a House roll, then the same roll with a changed vote-desc: 1 revision', async () => {
    const hub = freshHub()
    const t0 = Date.parse(roll314Meta.fetched_at)
    const changed = roll314Body.replace('<vote-desc>Retire through Ownership Act</vote-desc>', '<vote-desc>Retire through Ownership Act (corrected)</vote-desc>')
    expect(changed).not.toBe(roll314Body)
    const a = await record(hub, houseClerkVotes, 'roll', response(roll314Meta as Meta, roll314Body, t0), t0)
    expect(a.health, a.detail).toBe('ok')
    expect(await record(hub, houseClerkVotes, 'roll', response(roll314Meta as Meta, changed, t0 + MIN), t0 + MIN))
      .toMatchObject({ health: 'ok', inserted: 0, revised: 1 })
  })

  test('20260103.xml (its convene date is repeated in the file): accepted, ONE scheduled_convene row', async () => {
    const hub = freshHub()
    const t0 = Date.parse(day0103Meta.fetched_at)
    const a = await record(hub, houseClerkFloor, 'day', response(day0103Meta as Meta, day0103Body, t0), t0)
    expect(a.health, a.detail).toBe('ok')
    const conv = (await page(hub, null, 500, t0 + MIN)).events.filter((e: CedEvent) => e.dedup_key.endsWith('#scheduled_convene'))
    expect(conv.map((e) => e.dedup_key)).toEqual(['floor_day:house:2026-01-06#scheduled_convene'])
  })

  test('20250103.xml (Congress 119:118 split, whole-file scan): accepted', async () => {
    const hub = freshHub()
    const t0 = Date.parse(day20250103Meta.fetched_at)
    const a = await record(hub, houseClerkFloor, 'day', response(day20250103Meta as Meta, day20250103Body, t0), t0)
    expect(a.health, a.detail).toBe('ok')
    expect(a.inserted).toBeGreaterThan(0)
  })
})

describe('the foundation stub itself', () => {
  test('ADAPTER_NOT_BUILT is the stub marker isStub keys on', () => {
    expect(ADAPTER_NOT_BUILT).toBe('adapter not built yet')
  })

  test('no P2.1 adapter is still the foundation stub (every case above is active)', () => {
    const stubs = [houseClerkVotes, senateLisVotes, houseClerkFloor, senateSchedule, senatePressgallery]
      .filter(isStub).map((d) => d.source_id)
    expect(stubs).toEqual([])
  })
})
