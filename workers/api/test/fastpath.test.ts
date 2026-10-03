// W10: the HubDO skips validateEvent for an incoming copy identical to a stored event that passed the same validator,
// apart from the two per-poll stamps (src/fastpath.ts). These tests count the REAL validateEvent calls made inside the
// HubDO (vi.mock wraps @ced/schema's export; the Durable Object runs in this test's module graph), and prove that any
// change, malformation or validator change still goes through the full validator and is refused when invalid.
import { describe, expect, test, vi } from 'vitest'
import { runInDurableObject } from 'cloudflare:test'
import { eventId, validateEvent, type CedEvent } from '@ced/schema'
import { sourceById, type FetchedResponse } from '@ced/adapters'
import piBody from '../../../fixtures/fr.api/2026-10-02/pi_current.json?raw'
import piMeta from '../../../fixtures/fr.api/2026-10-02/pi_current.json.meta.json'
import newsBody from '../../../fixtures/wh.feeds/2026-10-02/news_feed.xml?raw'
import newsMeta from '../../../fixtures/wh.feeds/2026-10-02/news_feed.xml.meta.json'
import { FAST_PATH_ON, asRevisionOne, isUtcInstant, sameAsStored, sameAsStoredCopy, sameJson, validatorFingerprint } from '../src/fastpath.js'
import { migrateEventsChecked, sortKeyMs, type HubDO } from '../src/hub.js'
import { mergeEvent } from '../src/merge.js'
import { DOCS, MIN, T0, docEvent, freshHub, ingest, iso, page } from './fakes.js'

const validations = vi.hoisted(() => ({ n: 0 }))
vi.mock('@ced/schema', async (importOriginal) => {
  const real = await importOriginal<typeof import('@ced/schema')>()
  return {
    ...real,
    validateEvent: (ev: unknown) => {
      validations.n++
      return real.validateEvent(ev)
    },
  }
})

/** validateEvent calls made while `fn` runs (in this isolate, the HubDO's included). */
async function counted<T>(fn: () => Promise<T>): Promise<{ result: T; validated: number }> {
  const before = validations.n
  const result = await fn()
  return { result, validated: validations.n - before }
}

const [EO, , SEC] = DOCS as [(typeof DOCS)[0], (typeof DOCS)[0], (typeof DOCS)[0]]
const all = (atMs: number) => DOCS.map((d) => docEvent(d, atMs))

describe('the fast path fires only for stored-equal copies', () => {
  test('a re-ingest of stored-equal events skips validateEvent and changes nothing', async () => {
    const hub = freshHub()
    const first = await counted(() => ingest(hub, 'fake.fr', all(T0), T0))
    expect(first).toMatchObject({ result: { health: 'ok', inserted: 3 }, validated: 3 })
    const c1 = (await page(hub, null)).cursor
    const again = await counted(() => ingest(hub, 'fake.fr', all(T0 + MIN), T0 + MIN))
    expect(again).toMatchObject({ result: { health: 'ok', inserted: 0, revised: 0, merged: 0, unchanged: 3 }, validated: 0 })
    expect((await page(hub, null)).cursor).toBe(c1)
  })

  test('a changed event is fully validated (and revised); its unchanged neighbours still skip', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', all(T0), T0)
    const changed = [docEvent({ ...EO, title: 'Inaugurating the Era of Superintelligence' }, T0 + MIN), ...all(T0 + MIN).slice(1)]
    const r = await counted(() => ingest(hub, 'fake.fr', changed, T0 + MIN))
    // 2 = the changed incoming event + the revision built from it (storeOne validates every merged/revised result).
    expect(r).toMatchObject({ result: { health: 'ok', revised: 1, unchanged: 2 }, validated: 2 })
  })

  // Review F1 of 861a6f4: a revised row is stored at revision 2 (new id, supersedes) while its source keeps sending
  // revision 1, so before asRevisionOne no later copy could ever match it (after the D-059 flip: 106 FR rows a parse).
  test('after a revision, the source\'s next revision-1 copy of the same facts still skips validateEvent', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', all(T0), T0)
    const renamed = (atMs: number) => [docEvent({ ...EO, title: 'Inaugurating the Era of Superintelligence' }, atMs), ...all(atMs).slice(1)]
    expect(await ingest(hub, 'fake.fr', renamed(T0 + MIN), T0 + MIN)).toMatchObject({ revised: 1 })
    const r = await counted(() => ingest(hub, 'fake.fr', renamed(T0 + 2 * MIN), T0 + 2 * MIN))
    expect(r).toMatchObject({ result: { health: 'ok', inserted: 0, revised: 0, merged: 0, unchanged: 3 }, validated: 0 })
    const row = (await page(hub, null)).events.find((e) => e.dedup_key === renamed(T0)[0]!.dedup_key)!
    expect(row).toMatchObject({ revision: 2, title: renamed(T0)[0]!.title })
    expect(row.supersedes).toMatch(/^evt_/)
  })

  test('a revision-1 copy of a revised row that differs in anything else is fully validated', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', all(T0), T0)
    const renamed = (atMs: number, extra: Record<string, unknown> = {}) =>
      [{ ...docEvent({ ...EO, title: 'Inaugurating the Era of Superintelligence' }, atMs), ...extra }, ...all(atMs).slice(1)]
    await ingest(hub, 'fake.fr', renamed(T0 + MIN), T0 + MIN)
    // An explicit "supersedes": null is valid and means the same as absent, but it is not the stored row's revision-1
    // form key for key, so it takes the full validator (and mergeEvent still calls it unchanged).
    const r = await counted(() => ingest(hub, 'fake.fr', renamed(T0 + 2 * MIN, { supersedes: null }) as CedEvent[], T0 + 2 * MIN))
    expect(r).toMatchObject({ result: { health: 'ok', unchanged: 3 }, validated: 1 })
  })

  test('asRevisionOne of a valid revised event is valid, with id eventId(dedup_key, 1) and no supersedes', () => {
    const base = docEvent(EO, T0)
    const rev2 = { ...base, id: eventId(base.dedup_key, 2), revision: 2, supersedes: base.id } as CedEvent
    expect(validateEvent(rev2).valid).toBe(true)
    const one = asRevisionOne(rev2)
    expect(one).toEqual(base)
    expect(Object.hasOwn(one, 'supersedes')).toBe(false)
    expect(validateEvent(one).valid).toBe(true)
    expect(asRevisionOne(base)).toBe(base)
    expect(sameAsStoredCopy(docEvent(EO, T0 + MIN), rev2)).toBe(true) // only the stamps differ from its revision-1 form
    expect(sameAsStored(docEvent(EO, T0 + MIN), rev2)).toBe(false)
  })

  test('an earlier sighting of a stored-equal event is merged (earliest first_seen_at), exactly as mergeEvent says', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', all(T0 + MIN), T0 + MIN)
    const r = await counted(() => ingest(hub, 'fake.fr', all(T0), T0 + 2 * MIN))
    expect(r).toMatchObject({ result: { health: 'ok', merged: 3, unchanged: 0 }, validated: 3 }) // the 3 merged results
    expect((await page(hub, null)).events.map((e) => e.times.first_seen_at)).toEqual([iso(T0), iso(T0), iso(T0)])
  })

  test('the merge shortcut agrees with mergeEvent: same apart from stamps and not earlier = unchanged', () => {
    for (const d of DOCS) {
      const stored = JSON.parse(JSON.stringify(docEvent(d, T0))) as CedEvent
      const later = docEvent(d, T0 + MIN)
      const earlier = docEvent(d, T0 - MIN)
      expect(sameAsStored(later, stored) && sameAsStored(earlier, stored)).toBe(true)
      expect(mergeEvent(stored, later).kind).toBe('unchanged')
      expect(mergeEvent(stored, docEvent(d, T0)).kind).toBe('unchanged')
      expect(mergeEvent(stored, earlier).kind).toBe('merged')
    }
  })
})

describe('fail closed: a malformed copy of a stored event is fully validated and refused', () => {
  const base = () => docEvent(EO, T0 + MIN)
  const nullTime = () => docEvent(SEC, T0 + MIN) // occurred_at null in the stored copy
  const CASES: Array<[string, () => unknown]> = [
    ['first_seen_at not a real calendar instant', () => ({ ...base(), times: { ...base().times, first_seen_at: '2026-02-30T15:17:30Z' } })],
    ['first_seen_at not in the UTC form', () => ({ ...base(), times: { ...base().times, first_seen_at: '2026-10-01 15:17:30' } })],
    ['first_seen_at a number', () => ({ ...base(), times: { ...base().times, first_seen_at: T0 + MIN } })],
    ['retrieved_at not a time', () => ({ ...base(), sources: [{ ...base().sources[0]!, retrieved_at: 'yesterday' }] })],
    ['a required member missing (occurred_at, stored as null)', () => {
      const { occurred_at: _o, ...times } = nullTime().times
      return { ...nullTime(), times }
    }],
    ['NaN where the stored copy has null', () => ({ ...nullTime(), times: { ...nullTime().times, occurred_at: NaN } })],
    ['a Date object where the stored copy has a string', () => ({ ...base(), times: { ...base().times, occurred_at: new Date(EO.filed_at!) } })],
    ['an unknown extra member', () => ({ ...base(), spin: 'the best order ever' })],
    ['revision as a string', () => ({ ...base(), revision: '1' })],
    ['a source entry missing retrieved_at', () => {
      const { retrieved_at: _r, ...s } = base().sources[0]!
      return { ...base(), sources: [s] }
    }],
    // validateEvent THROWS on an undefined member (review R4; it survives the RPC's structured clone): the HubDO
    // must still refuse that one event by name, not depend on the throw reaching recordPoll's catch.
    ['an undefined member (validateEvent throws on it)', () => ({ ...base(), times: { ...base().times, broadcast_at: undefined } })],
  ]
  for (const [name, make] of CASES) {
    test(name, async () => {
      const hub = freshHub()
      const keyOf = (make() as { dedup_key: string }).dedup_key
      const stored = keyOf === base().dedup_key ? docEvent(EO, T0) : docEvent(SEC, T0)
      await ingest(hub, 'fake.fr', [stored], T0)
      const before = (await page(hub, null)).events
      const r = await counted(() => ingest(hub, 'fake.fr', [make()], T0 + MIN))
      expect(r.validated).toBe(1)
      expect(r.result).toMatchObject({ health: 'drift', inserted: 0, revised: 0, merged: 0, unchanged: 0 })
      expect(r.result.detail).toMatch(/^invalid events, nothing stored from this payload: events\[0\]/)
      expect((await page(hub, null)).events).toEqual(before)
    })
  }

  test('a NEW event with an undefined member makes the whole payload drift, naming it; nothing is stored', async () => {
    const hub = freshHub()
    const bad = { ...docEvent(EO, T0), times: { ...docEvent(EO, T0).times, broadcast_at: undefined } }
    const r = await counted(() => ingest(hub, 'fake.fr', [docEvent(SEC, T0), bad], T0))
    expect(r).toMatchObject({ validated: 2, result: { health: 'drift', inserted: 0, revised: 0, merged: 0, unchanged: 0 } })
    expect(r.result.detail).toMatch(
      // validateEvent now reports such an event as invalid instead of throwing (packages/schema, 2026-10-03); the
      // HubDO's own catch ("could not be validated") stays as a second line of defence.
      /^invalid events, nothing stored from this payload: events\[1\] \(fr:2026-20321#public_inspection\) not validatable: /,
    )
    expect((await page(hub, null)).events).toEqual([])
  })
})

describe('the payload rules still run on fast-path copies', () => {
  test("another source's exact copy of a stored event is refused without a validateEvent call", async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', all(T0), T0)
    // A mirror adapter re-emits the official copies verbatim (citing fake.fr): equal to the stored events.
    const r = await counted(() => ingest(hub, 'fake.mirror', all(T0 + MIN), T0 + MIN, 'items', 'third-party'))
    expect(r.validated).toBe(0) // the fast path was taken ...
    expect(r.result).toMatchObject({ health: 'drift', unchanged: 0 }) // ... and the own-source rule still refused it
    expect(r.result.detail).toContain('an adapter may cite only its own source fake.mirror')
  })

  test('a copy whose source is registered with another affiliation is refused', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', all(T0), T0)
    const r = await counted(() => ingest(hub, 'fake.fr', all(T0 + MIN), T0 + MIN, 'pi', 'third-party'))
    expect(r).toMatchObject({ validated: 0, result: { health: 'drift' } })
    expect(r.result.detail).toContain('fake.fr is registered as third-party')
  })

  test('two stored-equal copies of one dedup_key in a payload are refused', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0)
    const r = await counted(() => ingest(hub, 'fake.fr', [docEvent(EO, T0 + MIN), docEvent(EO, T0 + MIN)], T0 + MIN))
    expect(r).toMatchObject({ validated: 0, result: { health: 'drift' } })
    expect(r.result.detail).toMatch(/events\[1\] .* repeats events\[0\]/)
  })
})

describe('validator fingerprint', () => {
  const sqlOf = (hub: DurableObjectStub<HubDO>) => (fn: (sql: SqlStorage) => void) =>
    runInDurableObject(hub, async (_i: HubDO, state: DurableObjectState) => fn(state.storage.sql))

  test('a stored copy checked by another validator is fully validated once, then the fast path resumes', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', all(T0), T0)
    await sqlOf(hub)((sql) => sql.exec(`UPDATE events SET checked = 'another-validator'`))
    expect((await counted(() => ingest(hub, 'fake.fr', all(T0 + MIN), T0 + MIN))).validated).toBe(3)
    expect((await counted(() => ingest(hub, 'fake.fr', all(T0 + 2 * MIN), T0 + 2 * MIN))).validated).toBe(0)
  })

  test('a stored copy that cannot be read makes the payload drift (nothing stored), not a failed call', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', all(T0), T0)
    await sqlOf(hub)((sql) => sql.exec(`UPDATE events SET json = '{' WHERE dedup_key = ?`, `fr:${SEC.document_number}#public_inspection`))
    const r = await ingest(hub, 'fake.fr', all(T0 + MIN), T0 + MIN)
    expect(r).toMatchObject({ health: 'drift', inserted: 0, revised: 0, merged: 0, unchanged: 0, error_streak: 1 })
    expect(r.detail).toMatch(/^nothing stored from this payload: /)
  })

  test('a store created before events.checked gets the column; its old rows are validated once', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', all(T0), T0)
    await sqlOf(hub)((sql) => {
      sql.exec(`ALTER TABLE events DROP COLUMN checked`) // the v1 table shape, rows kept
      migrateEventsChecked(sql)
      migrateEventsChecked(sql) // idempotent
      expect(sql.exec<{ checked: string | null }>(`SELECT checked FROM events`).toArray().map((r) => r.checked)).toEqual([null, null, null])
    })
    expect((await counted(() => ingest(hub, 'fake.fr', all(T0 + MIN), T0 + MIN))).validated).toBe(3)
    await sqlOf(hub)((sql) => {
      // The mark is the fingerprint bound to the row's change seq (review R1).
      const rows = sql.exec<{ checked: string | null; seq: number }>(`SELECT checked, seq FROM events ORDER BY seq`).toArray()
      expect(rows.map((r) => r.checked)).toEqual(rows.map((r) => `${validatorFingerprint()}:${r.seq}`))
    })
    expect((await counted(() => ingest(hub, 'fake.fr', all(T0 + 2 * MIN), T0 + 2 * MIN))).validated).toBe(0)
  })

  // Review R1: after a rollback to code from before events.checked, that code rewrites rows with HEAD 85dc810's own
  // upsert (verbatim below), which does not name `checked`, so the row keeps the mark the newer code wrote for its
  // OLD content. A mark must vouch only for the content it was written with.
  const OLD_UPSERT = `INSERT INTO events (dedup_key, id, revision, sort_ms, seq, json) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (dedup_key) DO UPDATE SET id = excluded.id, revision = excluded.revision,
           sort_ms = excluded.sort_ms, seq = excluded.seq, json = excluded.json`
  /** What the rolled-back code's storeOne does to a stored row: write `ev` under the next change seq. The live
   * instance's in-memory seq is moved too, as a restart of the Durable Object on the redeploy would read it. */
  const oldCodeWrites = (hub: DurableObjectStub<HubDO>, ev: CedEvent) =>
    runInDurableObject(hub, async (instance: HubDO, state: DurableObjectState) => {
      const sql = state.storage.sql
      const seq = Number(sql.exec<{ v: string }>(`SELECT v FROM meta WHERE k = 'seq'`).toArray()[0]!.v) + 1
      sql.exec(OLD_UPSERT, ev.dedup_key, ev.id, ev.revision, sortKeyMs(ev), seq, JSON.stringify(ev))
      sql.exec(`UPDATE meta SET v = ? WHERE k = 'seq'`, String(seq))
      ;(instance as unknown as { seq: number }).seq = seq
    })

  test('a row rewritten by code from before events.checked (a rollback) is not vouched for by the mark it kept', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0)
    // The rolled-back code merged a provenance-only change (alias_keys grew) under an older, laxer validator: the
    // running schema refuses that alias.
    await oldCodeWrites(hub, { ...docEvent(EO, T0), alias_keys: ['NOT A KEY'] })
    const copy = { ...docEvent(EO, T0 + MIN), alias_keys: ['NOT A KEY'] }
    expect(validateEvent(copy).valid).toBe(false)
    const r = await counted(() => ingest(hub, 'fake.fr', [copy], T0 + MIN))
    expect(r).toMatchObject({ validated: 1, result: { health: 'drift', inserted: 0, revised: 0, merged: 0, unchanged: 0 } })
    expect(r.result.detail).toMatch(/^invalid events, nothing stored from this payload: events\[0\] .*alias_keys/)
  })

  test('a valid row rewritten by that older code is validated once, re-marked, then the fast path resumes', async () => {
    const hub = freshHub()
    await ingest(hub, 'fake.fr', [docEvent(EO, T0)], T0)
    const alias = { alias_keys: ['fr_doc:2026-20321'] }
    await oldCodeWrites(hub, { ...docEvent(EO, T0), ...alias })
    const once = await counted(() => ingest(hub, 'fake.fr', [{ ...docEvent(EO, T0 + MIN), ...alias }], T0 + MIN))
    expect(once).toMatchObject({ validated: 1, result: { health: 'ok', unchanged: 1 } })
    const again = await counted(() => ingest(hub, 'fake.fr', [{ ...docEvent(EO, T0 + 2 * MIN), ...alias }], T0 + 2 * MIN))
    expect(again).toMatchObject({ validated: 0, result: { health: 'ok', unchanged: 1 } })
  })
})

describe('the real adapters: a re-parse of an unchanged fixture is entirely fast-path', () => {
  const CASES = [
    { source_id: 'fr.api', urlPart: 'public-inspection-documents/current', meta: piMeta, body: piBody },
    { source_id: 'wh.feeds', urlPart: '/news/feed/', meta: newsMeta, body: newsBody },
  ]
  for (const c of CASES) {
    const def = sourceById(c.source_id)
    const ep = def?.endpoints.find((e) => e.url.includes(c.urlPart))
    test.skipIf(!def || !ep)(`${c.source_id} ${c.urlPart}`, async () => {
      const meta = c.meta as { url: string; status: number; fetched_at: string; response_headers: Record<string, string> }
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(meta.response_headers)) headers[k.toLowerCase()] = String(v)
      const t0 = Date.parse(meta.fetched_at)
      const res = (ms: number): FetchedResponse => ({ url: meta.url, status: meta.status, headers, body: c.body, fetchedAt: iso(ms) })
      const hub = freshHub()
      const record = (ms: number) => {
        const output = def!.parse(ep!.id, res(ms)) // parsed outside the count: only the HubDO's calls are counted
        return counted(() =>
          hub.recordPoll({
            source_id: def!.source_id, affiliation: def!.affiliation, endpoint_id: ep!.id, started_ms: ms, finished_ms: ms, jitter: 0.5,
            outcome: { kind: 'parsed', output, etag: null, last_modified: null, body_hash: `b-${ms}` },
          }),
        )
      }
      const first = await record(t0)
      expect(first.result.health).toBe('ok')
      expect(first.result.inserted).toBeGreaterThan(0)
      expect(first.validated).toBe(first.result.inserted)
      const again = await record(t0 + MIN)
      expect(again).toMatchObject({ validated: 0, result: { health: 'ok', unchanged: first.result.inserted, inserted: 0, revised: 0 } })
    })
  }
})

describe('pure parts', () => {
  test('the fast path is live for the current schema (its stamp fields are plain utc references)', () => {
    expect(FAST_PATH_ON).toBe(true)
  })

  test('isUtcInstant is the schema utc rule plus a real calendar instant', () => {
    expect(isUtcInstant('2026-10-01T15:16:30Z')).toBe(true)
    expect(isUtcInstant('2026-10-01T15:16:30.123Z')).toBe(true)
    expect(isUtcInstant('2026-10-01T15:16:30.1234Z')).toBe(false)
    expect(isUtcInstant('2026-10-01T15:16:30+00:00')).toBe(false)
    expect(isUtcInstant('2026-02-30T15:16:30Z')).toBe(false)
    expect(isUtcInstant(T0)).toBe(false)
    expect(isUtcInstant(new Date(T0))).toBe(false)
  })

  test('sameJson: key order does not matter; anything JSON.parse cannot produce never matches', () => {
    const b = JSON.parse('{"a":1,"b":[null,"x",{"c":true}],"d":null}') as unknown
    expect(sameJson({ d: null, b: [null, 'x', { c: true }], a: 1 }, b)).toBe(true)
    expect(sameJson({ a: 1, b: [null, 'x', { c: true }] }, b)).toBe(false) // d missing
    expect(sameJson({ a: 1, b: [null, 'x', { c: true }], d: null, e: undefined }, b)).toBe(false)
    expect(sameJson({ a: 1, b: [NaN, 'x', { c: true }], d: null }, b)).toBe(false)
    expect(sameJson({ a: 1, b: [null, 'x', { c: 1 }], d: null }, b)).toBe(false)
    expect(sameJson({ a: '1', b: [null, 'x', { c: true }], d: null }, b)).toBe(false)
    expect(sameJson({ a: 1, b: { 0: null, 1: 'x', 2: { c: true }, length: 3 }, d: null }, b)).toBe(false)
    expect(sameJson(new Map(), JSON.parse('{}'))).toBe(false)
    expect(sameJson(Object.create(null) as object, JSON.parse('{}'))).toBe(true)
  })
})
