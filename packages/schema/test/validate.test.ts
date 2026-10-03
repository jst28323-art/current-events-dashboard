// The validator must accept a real event and reject every malformed shape (ROADMAP Phase 1 exit 1: "the validator
// rejects a malformed event"). The good event is built from a real fixture record: Public Inspection document
// 2026-20439 in fixtures/fr.api/2026-10-02/pi_current.json.
import { describe, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { eventId, finalizeEvent, validateEvent, eventJsonSchema, isRealInstant, type CedEvent, type EventDraft } from '../src/index.js'
import { isRealInstant as isReal2 } from '../src/validate.js'

const draft: EventDraft = {
  dedup_key: 'fr:2026-20439#public_inspection',
  object_key: 'fr:2026-20439',
  event_type: 'fr.public_inspection',
  status: 'published',
  branch: 'executive',
  body: 'white_house',
  features: ['F10', 'F9'],
  title: 'Filed for public inspection: Lebanon; Presidential Determination on Revocation of Prior Presidential Determinations',
  official_text: 'Lebanon; Presidential Determination on Revocation of Prior Presidential Determinations (Presidential Determination No. 2026-25 of September 30, 2026)',
  times: { occurred_at: '2026-10-02T15:15:00Z', first_seen_at: '2026-10-02T18:00:28.428Z' },
  sources: [{
    source_id: 'fr.api',
    url: 'https://www.federalregister.gov/public-inspection/2026-20439/lebanon-presidential-determination-on-revocation-of-prior-presidential-determinations-presidential',
    retrieved_at: '2026-10-02T18:00:28.428Z',
    affiliation: 'official-nonpartisan',
  }],
  revision: 1,
  provenance: { parser: 'fr_api@0.1.0', confidence: 'high' },
}
const good: CedEvent = finalizeEvent(draft)

const bad = (patch: (e: Record<string, any>) => void): unknown => {
  const e = structuredClone(good) as Record<string, any>
  patch(e)
  return e
}

describe('ids', () => {
  test('eventId is "evt_" + 16 hex of standard sha256(dedup_key@revision)', () => {
    const want = createHash('sha256').update('fr:2026-20439#public_inspection@1').digest('hex').slice(0, 16)
    expect(eventId('fr:2026-20439#public_inspection', 1)).toBe(`evt_${want}`)
    expect(eventId('fr:2026-20439#public_inspection', 2)).not.toBe(eventId('fr:2026-20439#public_inspection', 1))
  })
  test('finalizeEvent adds schema_version and the derived id', () => {
    expect(good.schema_version).toBe('0.1')
    expect(good.id).toBe(eventId(draft.dedup_key, 1))
  })
})

describe('validateEvent', () => {
  test('accepts the real fixture-derived event', () => {
    expect(validateEvent(good)).toEqual({ valid: true, errors: [] })
  })

  test('accepts an event with only the Phase-1 minimum and occurred_at null', () => {
    const minimal = finalizeEvent({ ...draft, times: { occurred_at: null, first_seen_at: '2026-10-02T18:00:28Z' } })
    expect(validateEvent(minimal).valid).toBe(true)
  })

  const cases: Array<[string, unknown]> = [
    ['not an object', 'evt'],
    ['missing title', bad((e) => { delete e.title })],
    ['empty official_text', bad((e) => { e.official_text = '' })],
    ['unknown top-level field (typo)', bad((e) => { e.offical_text = 'x' })],
    ['wrong schema_version', bad((e) => { e.schema_version = '0.2' })],
    ['id not hex', bad((e) => { e.id = 'evt_ZZZZZZZZZZZZZZZZ' })],
    ['id not derived from dedup_key', bad((e) => { e.id = 'evt_0000000000000000' })],
    ['dedup_key not object_key#transition', bad((e) => { e.dedup_key = 'fr:2026-99999#public_inspection'; e.id = eventId(e.dedup_key, 1) })],
    ['unknown event_type', bad((e) => { e.event_type = 'fr.leaked' })],
    ['unknown status', bad((e) => { e.status = 'done' })],
    ['unknown body', bad((e) => { e.body = 'congress-ish' })],
    ['empty features', bad((e) => { e.features = [] })],
    ['F13 is not a feature', bad((e) => { e.features = ['F13'] })],
    ['first_seen_at missing', bad((e) => { delete e.times.first_seen_at })],
    ['time without Z (naive Eastern)', bad((e) => { e.times.occurred_at = '2026-10-02T11:15:00' })],
    ['time with an offset instead of Z', bad((e) => { e.times.occurred_at = '2026-10-02T11:15:00-04:00' })],
    ['impossible date Feb 30', bad((e) => { e.times.occurred_at = '2026-02-30T00:00:00Z' })],
    ['impossible date Apr 31', bad((e) => { e.times.first_seen_at = '2026-04-31T10:00:00Z' })],
    ['no sources', bad((e) => { e.sources = [] })],
    ['http source url', bad((e) => { e.sources[0].url = 'http://www.federalregister.gov/x' })],
    ['unknown affiliation', bad((e) => { e.sources[0].affiliation = 'official' })],
    ['revision 0', bad((e) => { e.revision = 0 })],
    ['parser without version', bad((e) => { e.provenance.parser = 'fr_api' })],
    ['tier P5', bad((e) => { e.importance = { tier: 'P5', reasons: [] } })],
  ]
  test.each(cases)('rejects: %s', (_name, ev) => {
    const r = validateEvent(ev)
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
  })
})

describe('schema file', () => {
  test('requires exactly the Phase-1 minimum of docs/EVENT_MODEL.md', () => {
    expect([...(eventJsonSchema as any).required].sort()).toEqual([
      'body', 'branch', 'dedup_key', 'event_type', 'features', 'id', 'object_key', 'official_text', 'provenance',
      'revision', 'schema_version', 'sources', 'status', 'times', 'title',
    ])
  })
  test('isRealInstant is exported once and round-trips', () => {
    expect(isRealInstant).toBe(isReal2)
    expect(isRealInstant('2026-02-28T23:59:59.999Z')).toBe(true)
    expect(isRealInstant('2026-10-02T24:00:00Z')).toBe(false)
  })
})

describe('never throws (2026-10-03 review fuzz: the library threw on an undefined member)', () => {
  test('an undefined member, a function, a symbol or a bigint is invalid, not a crash', () => {
    for (const evil of [
      bad((e) => { e.thread_key = undefined }),
      bad((e) => { e.times.scheduled_for = undefined }),
      bad((e) => { e.sources[0].license = () => 1 }),
      bad((e) => { e.revision = 1n }),
      bad((e) => { e.title = Symbol('x') }),
    ]) {
      let r: ReturnType<typeof validateEvent> | undefined
      expect(() => { r = validateEvent(evil) }).not.toThrow()
      expect(r!.valid).toBe(false)
      expect(r!.errors.length).toBeGreaterThan(0)
    }
  })
})

test('VALIDATOR_ID names the installed validation library and version (the HubDO fast-path fingerprint uses it)', async () => {
  const { readFileSync } = await import('node:fs')
  const file = new URL('../../../node_modules/@cfworker/json-schema/package.json', import.meta.url)
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name: string; version: string }
  const { VALIDATOR_ID } = await import('../src/index.js')
  expect(VALIDATOR_ID).toBe(`${pkg.name}@${pkg.version}`)
})
