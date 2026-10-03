// senate.schedule adapter (docs/design/P2.1.md §3.4): goldens for every recorded floor_schedule.json and
// hearings.xml copy, field-by-field checks read by hand from the fixture bytes, every NEGATIVE / empty fixture, and
// every non-default path on in-memory variants of real recorded bytes (fixtures are never edited; TESTING.md rule 1).
//
// Wayback fixtures are byte-exact originals whose meta url is web.archive.org: they are served here as the senate.gov
// endpoint (variant url), and the adapter must build sources[0].url from its own constant either way (R-12).
//
// Goldens: test/golden/senate.schedule/*.json. To regenerate after a deliberate change, run with UPDATE_GOLDEN=1 and
// review the diff line by line; the hand-written expectations below must still pass on their own.
import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CedEvent } from '@ced/schema'
import {
  FLOOR_URL, HEARINGS_URL, SENATE_SCHEDULE_PARSER, parseOffsetMinuteTime, parseSenateSchedule, senateSchedule,
} from '../src/sources/senate_schedule.js'
import type { AdapterOutput, FetchedResponse } from '../src/types.js'
import { expectHubPayloadRules } from './payload_rules.js'
import { replay, variant } from './replay.js'

const SRC = 'senate.schedule'
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden', SRC)

// The recorded responses. Wayback copies are served as the senate.gov endpoint (R-12).
const floorOct2 = () => replay(SRC, '2026-10-02', 'floor_schedule.json')
const floorSep30 = () => variant(replay(SRC, '2026-10-03', 'floor_schedule_session_day_2026-09-30_wayback.json'), { url: FLOOR_URL })
const floorWinter = () => variant(replay(SRC, '2026-10-03', 'floor_schedule_winter_est_2026-02-04_wayback.json'), { url: FLOOR_URL })
const floorNotFound = () => replay(SRC, '2026-10-03', 'floor_schedule_NEGATIVE_not_found.html')
const hearingsEmpty = () => replay(SRC, '2026-10-02', 'hearings.xml')
const hearingsWeek = () => variant(replay(SRC, '2026-10-03', 'hearings_session_week_2026-09-14_wayback.xml'), { url: HEARINGS_URL })
const hearings0725 = () => variant(replay(SRC, '2026-10-03', 'hearings_2026-07-25_wayback.xml'), { url: HEARINGS_URL })
const hearings0730 = () => variant(replay(SRC, '2026-10-03', 'hearings_2026-07-30_wayback.xml'), { url: HEARINGS_URL })
const hearingsAkamai = () => variant(replay(SRC, '2026-10-03', 'hearings_NEGATIVE_akamai_403_wayback.html'), { url: HEARINGS_URL })
const houseDocsNotFound = () =>
  variant(replay('house.docs.floor', '2026-10-02', 'billsthisweek_20260928_NEGATIVE_file_not_found.html'), { url: HEARINGS_URL })

function golden(name: string, value: unknown): void {
  const p = join(GOLDEN_DIR, name)
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN_DIR, { recursive: true })
    writeFileSync(p, JSON.stringify(value, null, 2) + '\n')
    return
  }
  expect(existsSync(p), `missing golden ${p}: run with UPDATE_GOLDEN=1, then review it`).toBe(true)
  expect(JSON.parse(JSON.stringify(value))).toEqual(JSON.parse(readFileSync(p, 'utf8')))
}

/** Parse, then hold the output to the Hub's payload rules and the P2.1 output contract (every case runs this). */
function parse(endpoint: string, res: FetchedResponse): AdapterOutput {
  const out = parseSenateSchedule(endpoint, res)
  expectHubPayloadRules(senateSchedule, out, res)
  return out
}
function parseOk(endpoint: string, res: FetchedResponse): AdapterOutput {
  const out = parse(endpoint, res)
  expect(out.health.status, out.health.detail).toBe('ok')
  return out
}
/** A payload refused whole: no events, the given health status and detail. */
function expectRefused(endpoint: string, res: FetchedResponse, status: string, detail: RegExp): AdapterOutput {
  const out = parse(endpoint, res)
  expect(out.events).toEqual([])
  expect(out.health.status).toBe(status)
  expect(out.health.detail).toMatch(detail)
  return out
}
function edit(body: string, from: string | RegExp, to: string): string {
  const out = body.replace(from, to)
  if (out === body) throw new Error(`variant edit did not apply: ${String(from)}`)
  return out
}
const withBody = (res: FetchedResponse, f: (b: string) => string) => variant(res, { body: f(res.body) })
const byId = (out: AdapterOutput, id: number): CedEvent => {
  const e = out.events.find((x) => x.object_key === `hearing:senate:${id}`)
  if (!e) throw new Error(`no event for hearing ${id}`)
  return e
}
/** The <meeting> block holding `<identifier>{id}</identifier>` in a recorded body. */
function meetingOf(body: string, id: number): string {
  const i = body.indexOf(`<identifier>${id}</identifier>`)
  if (i < 0) throw new Error(`no meeting ${id}`)
  const s = body.lastIndexOf('<meeting>', i)
  const e = body.indexOf('</meeting>', i) + '</meeting>'.length
  return body.slice(s, e)
}
/** Replace meeting `id` in the recorded body by patch(meeting). */
const patchMeeting = (res: FetchedResponse, id: number, patch: (m: string) => string) =>
  withBody(res, (b) => {
    const m = meetingOf(b, id)
    const p = patch(m)
    if (p === m) throw new Error(`meeting ${id} patch did not apply`)
    return b.replace(m, p)
  })
/** Set one recorded JSON string field (`"name": "value"`) to `value`; throws when the field is not in the body. */
function setField(body: string, name: string, value: string): string {
  const re = new RegExp(`"${name}": "[^"]*"`)
  if (!re.test(body)) throw new Error(`no field ${name}`)
  return body.replace(re, `"${name}": "${value}"`)
}
/** Meeting 338740 (09-14 copy) moved to another date and time: the ISO fields AND the printed <date>, <time> and
 * <day_of_week> the file prints beside them (review 483d7ab F7 cross-checks them). */
function when(m: string, isoDate: string, isoTime: string): string {
  const [y, mo, d] = isoDate.split('-').map(Number) as [number, number, number]
  const [h, mi] = isoTime.split(':').map(Number) as [number, number]
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][mo - 1]
  const clock = `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  const wd = new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  let out = edit(m, '<date_iso_8601>2026-09-15</date_iso_8601>', `<date_iso_8601>${isoDate}</date_iso_8601>`)
  out = edit(out, '<time_iso_8601>09:00:00</time_iso_8601>', `<time_iso_8601>${isoTime}</time_iso_8601>`)
  out = edit(out, '<date>15-SEP-2026 09:00 AM</date>', `<date>${String(d).padStart(2, '0')}-${MON}-${y} ${clock}</date>`)
  out = edit(out, '<time>09:00 AM</time>', `<time>${clock}</time>`)
  return edit(out, '<day_of_week>Tuesday</day_of_week>', `<day_of_week>${wd}</day_of_week>`)
}
/** The floor file with its convene fields (and stream) set to a given wall time; everything else recorded bytes. */
function floorAt(y: string, mo: string, d: string, h: string, mi: string, stream = `stv${mo}${d}${y.slice(2)}`): FetchedResponse {
  return withBody(floorOct2(), (b) => {
    let out = b
    for (const [k, v] of [['conveneYear', y], ['conveneMonth', mo], ['conveneDay', d], ['conveneHour', h], ['conveneMinutes', mi]] as const) out = setField(out, k, v)
    if (!out.includes('filename=stv100526')) throw new Error('no stream filename')
    return out.replace('filename=stv100526', `filename=${stream}`)
  })
}

describe('source definition (§3.4)', () => {
  test('two if-modified-since endpoints, cadence, budget, SLO and the senate calendar', () => {
    expect(senateSchedule.source_id).toBe('senate.schedule')
    expect(senateSchedule.name).toBe('Senate floor and committee schedule (senate.gov)')
    expect(senateSchedule.affiliation).toBe('official-nonpartisan')
    expect(senateSchedule.license).toBe('us-gov-public-domain')
    expect(senateSchedule.endpoints).toEqual([
      { id: 'floor', url: 'https://www.senate.gov/legislative/schedule/floor_schedule.json', validator: 'if-modified-since', cadence: { business_s: 300, off_s: 900 } },
      { id: 'hearings', url: 'https://www.senate.gov/general/committee_schedules/hearings.xml', validator: 'if-modified-since', cadence: { business_s: 900, off_s: 3600 } },
    ])
    expect(senateSchedule.cadence).toEqual({ business_s: 300, off_s: 900 })
    expect(senateSchedule.freshness_slo_s).toBe(600)
    expect(senateSchedule.rate_budget_per_h).toBe(20)
    expect(senateSchedule.calendar).toEqual({ chamber: 'senate', recess_s: 900 })
    expect(senateSchedule.parse).toBe(parseSenateSchedule)
    expect(SENATE_SCHEDULE_PARSER).toBe('senate_schedule@0.1.0')
  })

  test('an unknown endpoint id is an error, never a parse', () => {
    const out = parseSenateSchedule('agenda', floorOct2())
    expect(out).toEqual({ events: [], health: { source_id: SRC, endpoint: 'agenda', status: 'error', detail: 'unknown endpoint "agenda"', items_seen: 0 } })
  })
})

describe('floor: floor_schedule.json goldens', () => {
  test('2026-10-02 floor_schedule.json: Mon Oct 5 16:00 EDT -> 20:00Z (golden + every field by hand)', () => {
    const res = floorOct2()
    const out = parseOk('floor', res)
    expect(out.health).toEqual({ source_id: SRC, endpoint: 'floor', status: 'ok', detail: 'next convene 2026-10-05 (2026-10-05T20:00:00Z)', items_seen: 1 })
    expect(out.events).toHaveLength(1)
    const e = out.events[0]!
    expect(e).toMatchObject({
      schema_version: '0.1',
      dedup_key: 'floor_day:senate:2026-10-05#scheduled_convene',
      object_key: 'floor_day:senate:2026-10-05',
      event_type: 'floor.convened',
      status: 'scheduled',
      branch: 'legislative',
      body: 'senate',
      features: ['F7', 'F1'],
      title: 'The Senate is next due to meet on Monday, October 5, at 4:00 p.m. Eastern',
      official_text: 'conveneYear 2026 conveneMonth 10 conveneDay 05 conveneHour 16 conveneMinutes 00',
      importance: { tier: 'P3', reasons: ['floor_schedule'] },
      // lastUpdated "2026-10-01T09:34-05:00" read with its own offset
      times: { occurred_at: null, scheduled_for: '2026-10-05T20:00:00Z', source_published_at: '2026-10-01T14:34:00Z', first_seen_at: '2026-10-02T18:00:07.316Z' },
      media: [{ kind: 'video_live', url: 'https://www.senate.gov/isvp/stv.html?type=live&comm=stv&filename=stv100526', is_live: false, provider: 'senate.gov ISVP' }],
      result: { convene_date: '2026-10-05', stream_filename: 'stv100526' },
      sources: [{ source_id: SRC, url: FLOOR_URL, retrieved_at: '2026-10-02T18:00:07.316Z', license: 'us-gov-public-domain', affiliation: 'official-nonpartisan' }],
      revision: 1,
      provenance: { parser: 'senate_schedule@0.1.0', confidence: 'high' },
    })
    // no "pro forma" anywhere: the file cannot tell (§3.4)
    expect(JSON.stringify(e)).not.toMatch(/pro forma/i)
    golden('floor_schedule_2026-10-02.json', out)
  })

  test('Wayback 2026-09-30 session day: 10:15 EDT -> 14:15Z; lastUpdated 2026-09-29T19:17-05:00 -> 2026-09-30T00:17:00Z', () => {
    const out = parseOk('floor', floorSep30())
    const e = out.events[0]!
    expect(e.dedup_key).toBe('floor_day:senate:2026-09-30#scheduled_convene')
    expect(e.title).toBe('The Senate is next due to meet on Wednesday, September 30, at 10:15 a.m. Eastern')
    expect(e.times).toMatchObject({ scheduled_for: '2026-09-30T14:15:00Z', source_published_at: '2026-09-30T00:17:00Z' })
    expect(e.result).toEqual({ convene_date: '2026-09-30', stream_filename: 'stv093026' })
    golden('floor_schedule_session_day_2026-09-30_wayback.json', out)
  })

  test('Wayback 2026-02-04 winter: 10:00 EST -> 15:00Z; lastUpdated keeps its -05:00 in winter -> 22:19Z', () => {
    const out = parseOk('floor', floorWinter())
    const e = out.events[0]!
    expect(e.object_key).toBe('floor_day:senate:2026-02-04')
    expect(e.title).toBe('The Senate is next due to meet on Wednesday, February 4, at 10:00 a.m. Eastern')
    expect(e.times).toMatchObject({ scheduled_for: '2026-02-04T15:00:00Z', source_published_at: '2026-02-03T22:19:00Z' })
    golden('floor_schedule_winter_est_2026-02-04_wayback.json', out)
  })

  test('sources[0].url is the endpoint constant even when the response url is the web.archive.org copy (R-12)', () => {
    const raw = replay(SRC, '2026-10-03', 'floor_schedule_session_day_2026-09-30_wayback.json')
    expect(raw.url).toMatch(/^https:\/\/web\.archive\.org\//)
    expect(parseOk('floor', raw).events[0]!.sources[0]!.url).toBe(FLOOR_URL)
  })

  test('a convene in the past is not an error (no clock): the 2026-02-04 copy parses the same at any fetch time', () => {
    const late = variant(floorWinter(), { fetchedAt: '2027-06-01T00:00:00.000Z' })
    const out = parseOk('floor', late)
    expect(out.events[0]!.times.scheduled_for).toBe('2026-02-04T15:00:00Z')
  })
})

describe('floor: DST, the naive Eastern convene time (§1.6, R-13)', () => {
  test('Mon Nov 2 4:30 p.m. (after the fall-back) -> 21:30Z, while Mon Oct 5 4:00 p.m. -> 20:00Z', () => {
    const nov = parseOk('floor', floorAt('2026', '11', '02', '16', '30')).events[0]!
    expect(nov.times.scheduled_for).toBe('2026-11-02T21:30:00Z')
    expect(nov.title).toBe('The Senate is next due to meet on Monday, November 2, at 4:30 p.m. Eastern')
    expect(nov.result).toEqual({ convene_date: '2026-11-02', stream_filename: 'stv110226' })
    expect(parseOk('floor', floorOct2()).events[0]!.times.scheduled_for).toBe('2026-10-05T20:00:00Z')
    // Nov 9 3:00 p.m. EST and Oct 5 4:00 p.m. EDT are the same UTC hour: the DST trap the helper exists for
    expect(parseOk('floor', floorAt('2026', '11', '09', '15', '00')).events[0]!.times.scheduled_for).toBe('2026-11-09T20:00:00Z')
  })

  test('across the spring change: Mar 9 2026 10:00 EDT -> 14:00Z, Mar 6 10:00 EST -> 15:00Z', () => {
    expect(parseOk('floor', floorAt('2026', '03', '09', '10', '00')).events[0]!.times.scheduled_for).toBe('2026-03-09T14:00:00Z')
    expect(parseOk('floor', floorAt('2026', '03', '06', '10', '00')).events[0]!.times.scheduled_for).toBe('2026-03-06T15:00:00Z')
  })

  test('ambiguous wall time (Sun Nov 1 2026 01:30, the repeated hour): scheduled_for null + result.time_note, event kept', () => {
    const out = parseOk('floor', floorAt('2026', '11', '01', '01', '30'))
    const e = out.events[0]!
    expect(e.times.scheduled_for).toBeNull()
    expect(e.result).toMatchObject({ convene_date: '2026-11-01', stream_filename: 'stv110126' })
    expect(String(e.result!.time_note)).toMatch(/fall-back hour/)
    expect(e.title).toBe('The Senate is next due to meet on Sunday, November 1, at 1:30 a.m. Eastern')
    expect(out.health.detail).toMatch(/time ambiguous/)
  })

  test('nonexistent wall time (Sun Mar 8 2026 02:30, the spring-forward gap) = drift', () => {
    expectRefused('floor', floorAt('2026', '03', '08', '02', '30'), 'drift', /02:30 Eastern is nonexistent/)
  })

  test('parseOffsetMinuteTime reads the literal offset and refuses anything else', () => {
    expect(parseOffsetMinuteTime('2026-10-01T09:34-05:00')).toBe('2026-10-01T14:34:00Z')
    expect(parseOffsetMinuteTime('2026-02-03T17:19-05:00')).toBe('2026-02-03T22:19:00Z')
    expect(parseOffsetMinuteTime('2026-07-01T09:34-04:00')).toBe('2026-07-01T13:34:00Z')
    expect(parseOffsetMinuteTime('2026-10-01T09:34+01:00')).toBe('2026-10-01T08:34:00Z')
    expect(parseOffsetMinuteTime('2026-10-01T09:34:00-05:00')).toBeNull() // seconds: not the recorded shape
    expect(parseOffsetMinuteTime('2026-10-01T09:34Z')).toBeNull()
    expect(parseOffsetMinuteTime('2026-10-01T09:34')).toBeNull() // naive: never guessed
    expect(parseOffsetMinuteTime('2026-02-30T09:34-05:00')).toBeNull()
    expect(parseOffsetMinuteTime('2026-10-01T24:00-05:00')).toBeNull()
  })
})

describe('floor: fail closed (drift, zero events)', () => {
  test('floor_schedule_NEGATIVE_not_found.html (HTTP 200 "U.S. Senate: 404 Error Page", text/html) drifts by content-type', () => {
    const res = floorNotFound()
    expect(res.status).toBe(200)
    expect(res.body).toContain('<title>U.S. Senate: 404 Error Page</title>')
    expectRefused('floor', res, 'drift', /HTML page \(text\/html; charset=utf-8\) instead of JSON/)
  })

  test('the same 404 page with no content-type, or labelled JSON, still drifts (not JSON)', () => {
    const { ['content-type']: _ct, ...rest } = floorNotFound().headers
    expectRefused('floor', { ...floorNotFound(), headers: rest }, 'drift', /not JSON/)
    expectRefused('floor', variant(floorNotFound(), { headers: { 'content-type': 'application/json' } }), 'drift', /not JSON/)
  })

  test('another content-type (text/plain) drifts', () => {
    expectRefused('floor', variant(floorOct2(), { headers: { 'content-type': 'text/plain' } }), 'drift', /unexpected content-type "text\/plain"/)
  })

  test('HTTP 304 = not_modified; HTTP 500 = error', () => {
    expectRefused('floor', variant(floorOct2(), { status: 304, body: '' }), 'not_modified', /304/)
    expectRefused('floor', variant(floorOct2(), { status: 500 }), 'error', /^HTTP 500$/)
  })

  test('stream filename for another day (stv100626 for an Oct 5 convene) = drift', () => {
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, 'filename=stv100526', 'filename=stv100626')), 'drift', /convenedSessionStream .* is not the stream for 2026-10-05 \(stv100526\)/)
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, 'https://www.senate.gov/isvp/stv.html', 'http://www.senate.gov/isvp/stv.html')), 'drift', /convenedSessionStream/)
  })

  test('floorProceedings of length 2, length 0, or not an array = drift', () => {
    const two = withBody(floorOct2(), (b) => {
      const s = b.indexOf('{ "coveneOffsetMinutes"')
      const e = b.indexOf('}', s) + 1
      return b.slice(0, e) + ',' + b.slice(s, e) + b.slice(e)
    })
    expect(JSON.parse(two.body).floorProceedings).toHaveLength(2)
    expectRefused('floor', two, 'drift', /floorProceedings holds 2 entries, not exactly 1/)
    expectRefused('floor', variant(floorOct2(), { body: '{"floorProceedings": []}' }), 'drift', /holds 0 entries/)
    expectRefused('floor', variant(floorOct2(), { body: '{"floorProceedings": {}}' }), 'drift', /no floorProceedings array/)
    expectRefused('floor', variant(floorOct2(), { body: '[]' }), 'drift', /root is not an object/)
    expectRefused('floor', variant(floorOct2(), { body: '{"floorProceedings": ["x"]}' }), 'drift', /floorProceedings\[0\] is not an object/)
  })

  test('convene fields: not a real date, out of range, not all-digit, a number, missing = drift', () => {
    expectRefused('floor', floorAt('2026', '09', '31', '10', '00'), 'drift', /2026-09-31 is not a real date/)
    expectRefused('floor', floorAt('2026', '02', '29', '10', '00'), 'drift', /not a real date/)
    expectRefused('floor', floorAt('2026', '10', '05', '24', '00'), 'drift', /24:00 is out of range/)
    expectRefused('floor', floorAt('2026', '10', '05', '16', '60'), 'drift', /out of range/)
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '"conveneHour": "16"', '"conveneHour": "4 PM"')), 'drift', /conveneHour is "4 PM", not an all-digit string/)
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '"conveneDay": "05"', '"conveneDay": 5')), 'drift', /conveneDay is 5/)
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '"conveneMinutes": "00",', '')), 'drift', /conveneMinutes is undefined/)
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '"conveneYear": "2026"', '"conveneYear": "26"')), 'drift', /not a 4-digit year/)
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '"conveneMonth": "10"', '"conveneMonth": "010"')), 'drift', /not 1-2 digits/)
  })

  test('review 483d7ab F6: the floor JSON keys are a closed set (an unseen status key is drift, never a scheduled convene)', () => {
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '"conveneYear": "2026",', '"conveneStatus": "CANCELLED", "conveneYear": "2026",')), 'drift', /floorProceedings\[0\] has a key we never recorded: conveneStatus/)
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '"outSessionImage": "/floor/graphics/640_360_out.jpg",', '')), 'drift', /floorProceedings\[0\] lacks the recorded key outSessionImage/)
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '"floorProceedings": [', '"notice": "The Senate will not convene", "floorProceedings": [')), 'drift', /the JSON root has a key we never recorded: notice/)
  })

  test('lastUpdated malformed or missing = drift', () => {
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '2026-10-01T09:34-05:00', '2026-10-01 09:34')), 'drift', /lastUpdated "2026-10-01 09:34"/)
    expectRefused('floor', withBody(floorOct2(), (b) => edit(b, '"lastUpdated": "2026-10-01T09:34-05:00"', '"lastUpdatedAt": "2026-10-01T09:34-05:00"')), 'drift', /lastUpdated undefined/)
  })

  test('truncated JSON = drift', () => {
    expectRefused('floor', withBody(floorOct2(), (b) => b.slice(0, 500)), 'drift', /not JSON/)
  })
})

describe('hearings: hearings.xml goldens', () => {
  test('2026-10-02 hearings.xml (EMPTY): the placeholder alone = health empty, zero events', () => {
    const out = parse('hearings', hearingsEmpty())
    expect(out).toEqual({
      events: [],
      health: { source_id: SRC, endpoint: 'hearings', status: 'empty', detail: 'no committee meetings scheduled (the placeholder row only)', items_seen: 1 },
    })
    golden('hearings_2026-10-02_empty.json', out)
  })

  test('Wayback 2026-09-14 session week: 17 meetings, the placeholder skipped (golden)', () => {
    const out = parseOk('hearings', hearingsWeek())
    expect(out.health).toEqual({ source_id: SRC, endpoint: 'hearings', status: 'ok', detail: '17 meetings; 1 placeholder skipped', items_seen: 18 })
    expect(out.events).toHaveLength(17)
    expect(out.events.filter((e) => e.event_type === 'markup.scheduled').map((e) => e.object_key)).toEqual(
      ['hearing:senate:338754', 'hearing:senate:338749', 'hearing:senate:338755', 'hearing:senate:338752'])
    for (const e of out.events) {
      expect(e.dedup_key).toBe(`${e.object_key}#scheduled`)
      expect(e).toMatchObject({ status: 'scheduled', branch: 'legislative', body: 'senate', features: ['F7'], importance: { tier: 'P3', reasons: ['committee_meeting'] }, revision: 1 })
      expect(e.times.occurred_at).toBeNull()
      expect(e.sources).toEqual([{ source_id: SRC, url: HEARINGS_URL, retrieved_at: '2026-10-03T14:23:10.698Z', license: 'us-gov-public-domain', affiliation: 'official-nonpartisan' }])
      expect(e.provenance).toEqual({ parser: SENATE_SCHEDULE_PARSER, confidence: 'high' })
    }
    golden('hearings_session_week_2026-09-14_wayback.json', out)
  })

  test('id 338740 field by field (Judiciary, 2026-09-15 09:00 EDT, last_update 09-08-2026 01:12:21 PM)', () => {
    const e = byId(parseOk('hearings', hearingsWeek()), 338740)
    expect(e).toMatchObject({
      object_key: 'hearing:senate:338740',
      dedup_key: 'hearing:senate:338740#scheduled',
      event_type: 'hearing.scheduled',
      title: 'Senate Judiciary Committee set an open hearing for Tuesday, September 15, at 9:00 a.m. Eastern',
      official_text: 'An oversight hearing to examine the Federal Bureau of Investigation.',
      times: { occurred_at: null, scheduled_for: '2026-09-15T13:00:00Z', source_published_at: '2026-09-08T17:12:21Z', first_seen_at: '2026-10-03T14:23:10.698Z' },
      actors: [{ role: 'committee', id: 'committee:SSJU00', name: 'Judiciary' }],
      // &amp; decoded; filename judiciary091526 = the meeting date
      media: [{ kind: 'video_live', url: 'https://www.senate.gov/isvp/?comm=judiciary&filename=judiciary091526', is_live: false, provider: 'senate.gov ISVP' }],
      result: { cmte_code: 'SSJU00', meeting_type: 'Open Hearing', room: 'SH-216', date: '2026-09-15', cable_channel: null },
    })
    expect(e.related).toBeUndefined() // <Documents/>
  })

  test('the SLIN00 pair 338743 / 338744 (closed, no video) stay two events with distinct keys', () => {
    const out = parseOk('hearings', hearingsWeek())
    const a = byId(out, 338743)
    const b = byId(out, 338744)
    expect(a.dedup_key).not.toBe(b.dedup_key)
    expect([a.title, b.title]).toEqual([
      'Senate Intelligence Committee set a closed hearing for Tuesday, September 15, at 3:00 p.m. Eastern',
      'Senate Intelligence Committee set a closed hearing for Wednesday, September 16, at 3:00 p.m. Eastern',
    ])
    expect(a.media).toBeUndefined()
    expect(b.media).toBeUndefined()
  })

  test('Documents -> related about keys: SN/HR bills, PN with partition ("0 " = none, "03" -> -3, "20" -> -20)', () => {
    const out = parseOk('hearings', hearingsWeek())
    expect(byId(out, 338742).related).toEqual([
      { rel: 'about', key: 'nomination:119:PN1179' },
      { rel: 'about', key: 'nomination:119:PN1180-3' },
      { rel: 'about', key: 'nomination:119:PN963' },
    ])
    expect(byId(out, 338755).related).toEqual([
      { rel: 'about', key: 'nomination:119:PN1079' }, // partition="0 "
      { rel: 'about', key: 'nomination:119:PN730-20' },
      { rel: 'about', key: 'nomination:119:PN937-4' },
      { rel: 'about', key: 'nomination:119:PN937-10' },
      { rel: 'about', key: 'bill:119:s:4395' },
    ])
    expect(byId(out, 338749).related).toContainEqual({ rel: 'about', key: 'bill:119:hr:7022' })
    expect(byId(out, 338753).related).toEqual([
      { rel: 'about', key: 'nomination:119:PN1255-1' },
      { rel: 'about', key: 'nomination:119:PN1255-18' },
    ])
  })

  test('matter: NBSP -> space, collapsed (338746 "including\\u00a0 S.5354")', () => {
    const raw = meetingOf(hearingsWeek().body, 338746)
    expect(raw).toContain('including  S.5354')
    const e = byId(parseOk('hearings', hearingsWeek()), 338746)
    expect(e.official_text).toBe('Hearings to examine housing needs in native communities, including S.5354, to reauthorize the Native American Housing Assistance and Self-Determination Act of 1996.')
    expect(e.official_text).not.toContain(' ')
  })

  test('Wayback 2026-07-25 (golden): 9 meetings; the 4,999-character matter of 338691 is cut to 4,000 and marked', () => {
    const out = parseOk('hearings', hearings0725())
    expect(out.health).toMatchObject({ status: 'ok', items_seen: 10 })
    expect(out.health.detail).toBe("9 meetings; 1 placeholder skipped; 2 stream link(s) withheld (placeholder or another day's date); 1 matter text(s) cut to 4000 characters")
    const e = byId(out, 338691)
    expect(e.official_text).toHaveLength(4000)
    expect(e.official_text.endsWith('…')).toBe(true)
    expect(e.result).toMatchObject({ matter_truncated_from: 4999 })
    expect(e.related).toHaveLength(44)
    golden('hearings_2026-07-25_wayback.json', out)
  })

  test('Wayback 2026-07-30 (golden): 17 meetings, no placeholder; JCSE00 and subcommittee titles; cable channels trimmed', () => {
    const out = parseOk('hearings', hearings0730())
    expect(out.health).toEqual({ source_id: SRC, endpoint: 'hearings', status: 'ok', detail: "17 meetings; 3 stream link(s) withheld (placeholder or another day's date)", items_seen: 17 })
    expect(byId(out, 338692).title).toBe('The Commission on Security and Cooperation in Europe set an open hearing for Thursday, July 30, at 2:00 p.m. Eastern')
    expect(byId(out, 338692).actors).toEqual([{ role: 'committee', id: 'committee:JCSE00', name: 'Commission on Security and Cooperation in Europe' }])
    const sub = byId(out, 338698)
    expect(sub.title).toBe('A Senate Judiciary subcommittee (SSJU22) set an open hearing for Tuesday, August 4, at 2:30 p.m. Eastern')
    expect(sub.result).toMatchObject({ cmte_code: 'SSJU22', subcommittee: 'Crime and Counterterrorism Subcommittee' })
    expect(byId(out, 338694).result).toMatchObject({ cable_channel: '16.1', meeting_type: 'Open Business Meeting' })
    expect(byId(out, 338694).event_type).toBe('markup.scheduled')
    golden('hearings_2026-07-30_wayback.json', out)
  })

  test('07-25 then 07-30: exactly 338684, 338688 and 338689 recur, with the same dedup_key and changed facts (a revision at the Hub)', () => {
    const a = parseOk('hearings', hearings0725())
    const b = parseOk('hearings', hearings0730())
    const keysA = new Set(a.events.map((e) => e.dedup_key))
    const common = b.events.filter((e) => keysA.has(e.dedup_key)).map((e) => e.object_key).sort()
    expect(common).toEqual(['hearing:senate:338684', 'hearing:senate:338688', 'hearing:senate:338689'])
    // facts = everything but provenance (sources, first_seen_at), as the Hub's merge compares them
    const facts = (e: CedEvent) => {
      const { id: _id, sources: _s, times, ...rest } = e
      const { first_seen_at: _f, ...t } = times
      return { ...rest, times: t }
    }
    for (const k of common) {
      const x = a.events.find((e) => e.object_key === k)!
      const y = b.events.find((e) => e.object_key === k)!
      expect(x.id).toBe(y.id) // same dedup_key, revision 1 from the adapter: the Hub assigns the revision
      expect(facts(x), k).not.toEqual(facts(y))
    }
    // 338689: same title and time, but last_update and the cable channel changed
    const x = byId(a, 338689)
    const y = byId(b, 338689)
    expect(x.title).toBe(y.title)
    expect([x.times.source_published_at, y.times.source_published_at]).toEqual(['2026-07-23T20:55:40Z', '2026-07-29T20:34:15Z'])
    expect([x.result!.cable_channel, y.result!.cable_channel]).toEqual([null, '13.1'])
  })

  test('sources[0].url is the endpoint constant even when the response url is the web.archive.org copy (R-12)', () => {
    const raw = replay(SRC, '2026-10-03', 'hearings_2026-07-30_wayback.xml')
    expect(raw.url).toMatch(/^https:\/\/web\.archive\.org\//)
    for (const e of parseOk('hearings', raw).events) expect(e.sources[0]!.url).toBe(HEARINGS_URL)
  })
})

describe('hearings: stream links (T7) — withheld, event kept', () => {
  test('338684 (filename help072926 for a 07-30 meeting) and 338688 (foreign073036, an impossible date): no media in both July copies', () => {
    for (const res of [hearings0725(), hearings0730()]) {
      const out = parseOk('hearings', res)
      expect(meetingOf(res.body, 338684)).toContain('filename=help072926')
      expect(meetingOf(res.body, 338688)).toContain('filename=foreign073036')
      expect(byId(out, 338684).media).toBeUndefined()
      expect(byId(out, 338688).media).toBeUndefined()
      expect(byId(out, 338684).title).toMatch(/business meeting for Thursday, July 30, at 9:45 a\.m\. Eastern$/)
    }
  })

  test('comm=xxxx placeholder (07-30 copy, id 338700): no media, event kept', () => {
    const res = hearings0730()
    expect(meetingOf(res.body, 338700)).toContain('comm=xxxx&amp;filename=xxxx080526')
    const e = byId(parseOk('hearings', res), 338700)
    expect(e.media).toBeUndefined()
    expect(e.title).toBe('Senate Judiciary Committee set an open hearing for Wednesday, August 5, at 10:15 a.m. Eastern')
  })

  test('the same 338740 link on another host, http, or an extra query part: withheld', () => {
    for (const bad of [
      'https://www.senate.gov.example.com/isvp/?comm=judiciary&amp;filename=judiciary091526',
      'http://www.senate.gov/isvp/?comm=judiciary&amp;filename=judiciary091526',
      'https://www.senate.gov/isvp/?comm=judiciary&amp;filename=judiciary091526&amp;auto_play=true',
    ]) {
      const res = patchMeeting(hearingsWeek(), 338740, (m) => edit(m, 'https://www.senate.gov/isvp/?comm=judiciary&amp;filename=judiciary091526', bad))
      const out = parseOk('hearings', res)
      expect(byId(out, 338740).media, bad).toBeUndefined()
      expect(out.events).toHaveLength(17)
    }
  })
})

describe('hearings: non-default rows', () => {
  test('type is matched case-insensitively after whitespace collapse ("OPEN  BUSINESS meeting")', () => {
    const res = patchMeeting(hearingsWeek(), 338754, (m) => edit(m, '<type>Open Business Meeting</type>', '<type>OPEN  BUSINESS\n meeting</type>'))
    const e = byId(parseOk('hearings', res), 338754)
    expect(e.event_type).toBe('markup.scheduled')
    expect(e.title).toMatch(/set a business meeting for/)
  })

  test('meeting time across the fall-back: 2026-11-02 16:30 -> 21:30Z; ambiguous 2026-11-01 01:30 -> null + time_note', () => {
    const late = patchMeeting(hearingsWeek(), 338740, (m) => when(m, '2026-11-02', '16:30:00'))
    expect(byId(parseOk('hearings', late), 338740).times.scheduled_for).toBe('2026-11-02T21:30:00Z')
    const amb = patchMeeting(hearingsWeek(), 338740, (m) => when(m, '2026-11-01', '01:30:00'))
    const out = parseOk('hearings', amb)
    const e = byId(out, 338740)
    expect(e.times.scheduled_for).toBeNull()
    expect(String(e.result!.time_note)).toMatch(/01:30:00 Eastern on 2026-11-01 falls in the repeated fall-back hour/)
    expect(out.health.detail).toMatch(/1 with an ambiguous fall-back time/)
    // the stream filename names 09-15, the meeting is now 11-01: withheld
    expect(e.media).toBeUndefined()
  })

  test('last_update in the fall-back hour: source_published_at null + time_note; 12 AM / 12 PM read right', () => {
    const amb = patchMeeting(hearingsWeek(), 338740, (m) => edit(m, '<last_update>09-08-2026 01:12:21 PM</last_update>', '<last_update>11-01-2026 01:12:21 AM</last_update>'))
    const e = byId(parseOk('hearings', amb), 338740)
    expect(e.times.source_published_at).toBeNull()
    expect(String(e.result!.time_note)).toMatch(/last_update falls in the repeated fall-back hour/)
    const noon = patchMeeting(hearingsWeek(), 338740, (m) => edit(m, '01:12:21 PM</last_update>', '12:12:21 PM</last_update>'))
    expect(byId(parseOk('hearings', noon), 338740).times.source_published_at).toBe('2026-09-08T16:12:21Z')
    const midnight = patchMeeting(hearingsWeek(), 338740, (m) => edit(m, '01:12:21 PM</last_update>', '12:12:21 AM</last_update>'))
    expect(byId(parseOk('hearings', midnight), 338740).times.source_published_at).toBe('2026-09-08T04:12:21Z')
  })

  test('an unknown document prefix only loses its related key (health says so); the event is kept', () => {
    const res = patchMeeting(hearingsWeek(), 338746, (m) => edit(m, 'document_prefix="SN"', 'document_prefix="SR"'))
    const out = parseOk('hearings', res)
    expect(byId(out, 338746).related).toBeUndefined()
    expect(out.events).toHaveLength(17)
    expect(out.health.detail).toMatch(/document prefix\(es\) with no key: SR/)
  })

  test('room and cable channel blank -> null', () => {
    const res = patchMeeting(hearingsWeek(), 338740, (m) => edit(m, '<room>SH-216</room>', '<room>  </room>'))
    expect(byId(parseOk('hearings', res), 338740).result).toMatchObject({ room: null, cable_channel: null })
  })
})

describe('hearings: fail closed (drift, zero events)', () => {
  test('hearings_NEGATIVE_akamai_403_wayback.html: HTTP 403 = error; the same body with 200 = drift', () => {
    const res = hearingsAkamai()
    expect(res.status).toBe(403)
    expectRefused('hearings', res, 'error', /^HTTP 403$/)
    expectRefused('hearings', variant(res, { status: 200 }), 'drift', /HTML page \(text\/html\) instead of XML/)
    // labelled XML, the root is still <HTML>
    expectRefused('hearings', variant(res, { status: 200, headers: { 'content-type': 'text/xml' } }), 'drift', /root element is <HTML>, not <css_meetings_scheduled>/)
  })

  test('house.docs.floor billsthisweek_20260928_NEGATIVE_file_not_found.html fed to hearings = drift', () => {
    const res = houseDocsNotFound()
    expect(res.status).toBe(200)
    expectRefused('hearings', res, 'drift', /HTML page/)
    expectRefused('hearings', variant(res, { headers: { 'content-type': 'application/xml' } }), 'drift', /root element is <HTML>/)
  })

  test('HTTP 304 = not_modified; JSON content-type = drift', () => {
    expectRefused('hearings', variant(hearingsWeek(), { status: 304, body: '' }), 'not_modified', /304/)
    expectRefused('hearings', variant(hearingsWeek(), { headers: { 'content-type': 'application/json' } }), 'drift', /unexpected content-type/)
  })

  test('truncated XML = drift', () => {
    const b = hearingsWeek().body
    expectRefused('hearings', variant(hearingsWeek(), { body: b.slice(0, b.length - 40) }), 'drift', /truncated/)
    expectRefused('hearings', variant(hearingsWeek(), { body: b.slice(0, Math.floor(b.length / 2)) }), 'drift', /truncated/)
  })

  test('another root, no <meeting> at all, or text between meetings = drift', () => {
    expectRefused('hearings', withBody(hearingsEmpty(), (b) => b.replaceAll('css_meetings_scheduled', 'css_meetings')), 'drift', /root element is <css_meetings>/)
    expectRefused('hearings', withBody(hearingsEmpty(), (b) => b.replaceAll('meeting>', 'Meeting>')), 'drift', /something other than <meeting>/)
    expectRefused('hearings', variant(hearingsEmpty(), { body: '<?xml version="1.0" encoding="UTF-8"?><css_meetings_scheduled>\n</css_meetings_scheduled>' }), 'drift', /no <meeting> elements/)
    expectRefused('hearings', withBody(hearingsEmpty(), (b) => edit(b, '</css_meetings_scheduled>', '<note>x</note></css_meetings_scheduled>')), 'drift', /something other than <meeting>/)
  })

  test('the placeholder with any other matter = drift', () => {
    expectRefused('hearings', withBody(hearingsEmpty(), (b) => edit(b, 'No committee hearings scheduled', 'Committee hearings postponed')), 'drift', /no identifier and matter "Committee hearings postponed"/)
  })

  test('an unknown meeting type drifts the WHOLE payload (R-8)', () => {
    const res = patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<type>Open Hearing</type>', '<type>Field Hearing</type>'))
    expectRefused('hearings', res, 'drift', /meeting 3 \(id 338741\): meeting type "Field Hearing" is not one we know/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<type>Open Hearing</type>', '<type/>')), 'drift', /meeting type ""/)
  })

  test('identifier: non-numeric, 5 digits, duplicated in the payload = drift', () => {
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '338741', '33874A')), 'drift', /identifier "33874A" is not 6 digits/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '338741', '38741')), 'drift', /not 6 digits/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<identifier>338741</identifier>', '<identifier>338740</identifier>')), 'drift', /duplicate identifier 338740/)
  })

  test('unparsable date / time / last_update, or a nonexistent meeting time = drift', () => {
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<date_iso_8601>2026-09-15</date_iso_8601>', '<date_iso_8601>15-SEP-2026</date_iso_8601>')), 'drift', /date_iso_8601\/time_iso_8601/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<date_iso_8601>2026-09-15</date_iso_8601>', '<date_iso_8601>2026-09-31</date_iso_8601>')), 'drift', /2026-09-31 is not a real date/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<time_iso_8601>10:00:00</time_iso_8601>', '<time_iso_8601>10:00</time_iso_8601>')), 'drift', /time_iso_8601/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<time_iso_8601>10:00:00</time_iso_8601>', '<time_iso_8601>25:00:00</time_iso_8601>')), 'drift', /is invalid/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<time_iso_8601>10:00:00</time_iso_8601>', '')), 'drift', /time_iso_8601/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(edit(m, '<date_iso_8601>2026-09-15</date_iso_8601>', '<date_iso_8601>2026-03-08</date_iso_8601>'), '<time_iso_8601>10:00:00</time_iso_8601>', '<time_iso_8601>02:30:00</time_iso_8601>')), 'drift', /2026-03-08 02:30:00 Eastern is nonexistent/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<last_update>09-10-2026 03:01:53 PM</last_update>', '<last_update>2026-09-10T15:01:53</last_update>')), 'drift', /last_update is not MM-DD-YYYY/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<last_update>09-10-2026 03:01:53 PM</last_update>', '<last_update>09-10-2026 13:01:53 PM</last_update>')), 'drift', /last_update hour 13/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<last_update>09-10-2026 03:01:53 PM</last_update>', '<last_update>03-08-2026 02:30:00 AM</last_update>')), 'drift', /last_update is nonexistent/)
  })

  test('an element we have not seen (a possible postponement marker) or a repeated element = drift', () => {
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<matter>', '<status>Postponed</status>\n    <matter>')), 'drift', /element\(s\) we have not seen: <status>/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<room>SD-215</room>', '<room>SD-215</room><room>SD-216</room>')), 'drift', /<room> appears more than once/)
    // stray text, a comment, or an element left open between children
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<room>SD-215</room>', '<room>SD-215</room> POSTPONED')), 'drift', /unexpected content "POSTPONED"/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<room>SD-215</room>', '<room>SD-215</room><!-- moved -->')), 'drift', /unexpected content "<!-- moved -->"/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<room>SD-215</room>', '<room>SD-215')), 'drift', /unexpected content "<room>SD-215/)
  })

  test('review 483d7ab F6: attributes on <meeting> or on a child (a possible cancellation marker) = drift', () => {
    expectRefused('hearings', withBody(hearingsWeek(), (b) => b.replace(/<meeting>(\s*<identifier>338741<)/, '<meeting status="Cancelled">$1')), 'drift', /meeting \d+: the open tag is <meeting status="Cancelled">, not <meeting>/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<type>Open Hearing</type>', '<type status="Postponed">Open Hearing</type>')), 'drift', /<type> carries attributes \(status="Postponed"\)/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<Documents/>', '<Documents status="x"/>')), 'drift', /<Documents> carries attributes/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<room>SD-215</room>', '<room><s>SD-215</s> SD-106</room>')), 'drift', /markup inside <room>/)
  })

  test('review 483d7ab F7 / time F5: date_iso_8601 and time_iso_8601 agree with the printed <date>, <time> and <day_of_week>', () => {
    const p = (f: (m: string) => string) => patchMeeting(hearingsWeek(), 338740, f)
    expectRefused('hearings', p((m) => edit(m, '<time_iso_8601>09:00:00</time_iso_8601>', '<time_iso_8601>21:00:00</time_iso_8601>')), 'drift', /id 338740\): time_iso_8601 21:00:00 disagrees with <time> "09:00 AM"/)
    expectRefused('hearings', p((m) => edit(m, '<time_iso_8601>09:00:00</time_iso_8601>', '<time_iso_8601>00:00:00</time_iso_8601>')), 'drift', /disagrees with <time> "09:00 AM"/)
    expectRefused('hearings', p((m) => edit(m, '<time_iso_8601>09:00:00</time_iso_8601>', '<time_iso_8601>09:00:30</time_iso_8601>')), 'drift', /disagrees with <time>/)
    expectRefused('hearings', p((m) => edit(m, '<date_iso_8601>2026-09-15</date_iso_8601>', '<date_iso_8601>2026-09-16</date_iso_8601>')), 'drift', /date_iso_8601 2026-09-16 09:00 disagrees with <date> "15-SEP-2026 09:00 AM"/)
    expectRefused('hearings', p((m) => edit(m, '<day_of_week>Tuesday</day_of_week>', '<day_of_week>Wednesday</day_of_week>')), 'drift', /<day_of_week> "Wednesday" is not the weekday of 2026-09-15 \(Tuesday\)/)
    expectRefused('hearings', p((m) => edit(m, '<time>09:00 AM</time>', '<time>9 AM</time>')), 'drift', /<time> "9 AM" is not "hh:mm AM\|PM"/)
  })

  test('review 483d7ab F11: an entity we do not decode in room, subcommittee or cable channel = drift (every published field)', () => {
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<room>SD-215</room>', '<room>SD&nbsp;215</room>')), 'drift', /entity we do not decode/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<senate_cable_channel>\n    </senate_cable_channel>', '<senate_cable_channel>Ch&nbsp;2</senate_cable_channel>')), 'drift', /entity we do not decode/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<committee>Finance</committee>', '<committee>Finance</committee><sub_cmte>Taxation&mdash;IRS</sub_cmte>')), 'drift', /entity we do not decode/)
  })

  test('bad cmte_code, empty committee, empty matter, unknown entity = drift', () => {
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<cmte_code>SSFI00</cmte_code>', '<cmte_code>Finance</cmte_code>')), 'drift', /cmte_code "Finance"/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<committee>Finance</committee>', '<committee/>')), 'drift', /no committee name/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, '<matter>Hearings to examine certain pending nominations.</matter>', '<matter> </matter>')), 'drift', /no matter text/)
    expectRefused('hearings', patchMeeting(hearingsWeek(), 338741, (m) => edit(m, 'certain pending', 'certain&nbsp;pending')), 'drift', /entity we do not decode/)
  })

  test('a malformed <AssociatedDocument> or a non-numeric document number / partition = drift', () => {
    const doc = (f: (m: string) => string) => patchMeeting(hearingsWeek(), 338742, f)
    expectRefused('hearings', doc((m) => edit(m, 'document_num="1179"', 'document_num=1179')), 'drift', /malformed <AssociatedDocument>/)
    expectRefused('hearings', doc((m) => edit(m, 'document_num="1179"', 'document_num="PN1179"')), 'drift', /document_num "PN1179"/)
    expectRefused('hearings', doc((m) => edit(m, 'partition="03"', 'partition="A"')), 'drift', /partition "A"/)
    expectRefused('hearings', doc((m) => edit(m, 'congress="119"', 'congress="CXIX"')), 'drift', /congress "CXIX"/)
    expectRefused('hearings', doc((m) => edit(m, '</Documents>', '<Note/></Documents>')), 'drift', /something other than <AssociatedDocument>/)
  })

  test('one bad row anywhere refuses the whole payload (no partial publish)', () => {
    const res = patchMeeting(hearingsWeek(), 338751, (m) => edit(m, '<type>Open Hearing</type>', '<type>Hearing</type>'))
    const out = expectRefused('hearings', res, 'drift', /meeting 18 \(id 338751\)/)
    expect(out.health.items_seen).toBe(18)
  })
})
