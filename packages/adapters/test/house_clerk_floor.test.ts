// house.clerk.floor adapter (P2.1, fixture-only under D-058; scratch/phase2/DESIGN.md §3.3): goldens for every recorded
// day file and the feed, field-by-field checks read by hand from the fixture bytes, the "nothing new" replay, the
// NEGATIVE responses, and every fail-closed rule on in-memory variants of recorded responses (fixtures are never edited;
// TESTING.md rule 1). Every output passes expectHubPayloadRules (the Hub's payload rules + the P2.1 output contract).
//
// Goldens: test/golden/house.clerk.floor/*.json. To regenerate after a deliberate change, run with UPDATE_GOLDEN=1 and
// review the diff line by line; the hand-written expectations below must still pass on their own.
import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CedEvent } from '@ced/schema'
import {
  classifyAction, fmtActionItem, HEAD_ACTIONS, HOUSE_FLOOR_PARSER, houseClerkFloor, parseHouseFloor,
} from '../src/sources/house_clerk_floor.js'
import type { AdapterOutput, FetchedResponse } from '../src/types.js'
import { expectHubPayloadRules } from './payload_rules.js'
import { replay, variant } from './replay.js'

const SRC = 'house.clerk.floor'
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden', SRC)
const day = (name: string, date = '2026-10-03'): FetchedResponse => replay(SRC, date, name)
const feed = (): FetchedResponse => replay(SRC, '2026-10-03', 'Home_Feed_rss.xml')
const fileNotFound = (): FetchedResponse => replay('house.docs.floor', '2026-10-02', 'billsthisweek_20260928_NEGATIVE_file_not_found.html')

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

/** Parse and hold every output to the Hub's payload rules and the P2.1 contract. */
function run(endpoint: string, res: FetchedResponse): AdapterOutput {
  const out = parseHouseFloor(endpoint, res)
  expectHubPayloadRules(houseClerkFloor, out, res)
  return out
}
function ok(endpoint: string, res: FetchedResponse): AdapterOutput {
  const out = run(endpoint, res)
  expect(out.health.status, out.health.detail).toBe('ok')
  return out
}
/** A payload refused whole: no events, no targets, no records, and this health. */
function refused(endpoint: string, res: FetchedResponse, status: string, detail: RegExp): AdapterOutput {
  const out = run(endpoint, res)
  expect(out.health.status, out.health.detail).toBe(status)
  expect(out.health.detail).toMatch(detail)
  expect(out.events).toEqual([])
  expect(out.targets ?? []).toEqual([])
  expect(out.records ?? []).toEqual([])
  return out
}
function edit(body: string, from: string | RegExp, to: string): string {
  const out = body.replace(from, to)
  if (out === body) throw new Error(`variant edit did not apply: ${String(from)}`)
  return out
}
const withBody = (res: FetchedResponse, f: (b: string) => string) => variant(res, { body: f(res.body) })
const byKey = (out: AdapterOutput, key: string): CedEvent => {
  const e = out.events.find((x) => x.object_key === key)
  if (!e) throw new Error(`no event ${key}`)
  return e
}
const entries = (out: AdapterOutput) => out.events.filter((e) => e.dedup_key.endsWith('#entry'))
const scheduled = (out: AdapterOutput) => out.events.filter((e) => e.dedup_key.endsWith('#scheduled_convene'))

// Our title templates (D-043: titles are ours, never the Clerk's sentence, a bill title or a vote question).
const TITLE = new RegExp('^(' + [
  'House convened for a new legislative day',
  'House returned from a recess',
  'House adjourned its session \\(sine die\\)',
  'House adjourned',
  'House went into recess',
  'House floor recorded the results? of roll calls? [0-9, and]+( on [A-Z][A-Za-z.]+ [0-9]+)?',
  'House floor action on [A-Z][A-Za-z.]+ [0-9]+',
  'House floor proceedings entry',
  'House scheduled to meet [A-Z][a-z]+, [A-Z][a-z]+ [0-9]{1,2}, at [0-9]{1,2}:[0-9]{2} [ap]\\.m\\. Eastern',
].join('|') + ')$')

describe('source definition', () => {
  test('three endpoints, cadence, budget, SLO and the dynamic / notYetStatus contract (DESIGN §3.3)', () => {
    const d = houseClerkFloor
    expect(d.source_id).toBe(SRC)
    expect(d.parse).toBe(parseHouseFloor)
    expect(d.endpoints.map((e) => [e.id, e.validator, e.cadence])).toEqual([
      ['feed', 'body-hash', { business_s: 300, off_s: 900 }],
      ['day', 'if-modified-since', { business_s: 60, off_s: 300 }],
      ['next_day', 'if-modified-since', { business_s: 300, off_s: 900 }],
    ])
    expect(d.endpoints[1]!.dynamic).toEqual({ from: 'feed', urlPattern: '^https://clerk\\.house\\.gov/floor/20[0-9]{6}\\.xml$', maxTargets: 1 })
    expect(d.endpoints[2]!.dynamic).toEqual({ from: 'day', urlPattern: '^https://clerk\\.house\\.gov/floor/20[0-9]{6}\\.xml$', maxTargets: 1 })
    // The next day's file is HTTP 404 until it exists: the P2.2 poller records that as `empty` "not posted yet" without
    // calling parse (pinned here; the parse itself answers `error`, below).
    expect(d.endpoints[2]!.notYetStatus).toBe(404)
    expect(d.endpoints[0]!.notYetStatus).toBeUndefined()
    expect(d.endpoints[1]!.notYetStatus).toBeUndefined()
    expect(d.calendar).toEqual({ chamber: 'house', recess_s: 3600 })
    expect([d.freshness_slo_s, d.rate_budget_per_h, d.cadence]).toEqual([120, 100, { business_s: 60, off_s: 300 }])
    expect(HEAD_ACTIONS).toBe(50)
    expect(HOUSE_FLOOR_PARSER).toBe('house_clerk_floor@0.1.0')
  })
})

describe('goldens: every recorded day file', () => {
  const GOLDENS: Array<[string, string, number, number]> = [
    // [date dir, file, actions in the file, events emitted]
    ['2026-10-02', '20260916.xml', 170, 51], // session day: equal for-search ties, inline <b>/<a> markup; head cut
    ['2026-10-03', '20261001.xml', 7, 8], // pro forma day; next meeting 20261005T16:30
    ['2026-10-03', '20260917.xml', 6, 7], // barest
    ['2026-10-03', '20260902.xml', 41, 42], // vote lines incl. "(2/3 required)"; edits stamped two days later
    ['2026-10-03', '20260429.xml', 123, 51], // 84 after-midnight actions; head cut at 50
    ['2026-10-03', '20260416.xml', 50, 51], // exactly 50 actions: no cut; an edit stamped 20260702
    ['2026-10-03', '20260327.xml', 31, 32], // two legislative days in one file
    ['2026-10-03', '20260103.xml', 15, 16], // session boundary, sine die, EST, the repeated finished element
    ['2026-10-03', '20260102.xml', 13, 14], // a session-1 day in a 2026 file
    ['2026-10-03', '20250103.xml', 85, 86], // Congress 119:118 split, whole-file scan
  ]
  for (const [date, name, actions, n] of GOLDENS) {
    test(`${date}/${name}`, () => {
      const res = day(name, date)
      const out = ok('day', res)
      expect(out.health.items_seen).toBe(actions)
      expect(out.events).toHaveLength(n)
      expect(scheduled(out)).toHaveLength(1)
      golden(name.replace(/\.xml$/, '.json'), out)
    })
  }

  test('fixed fields on every event of every golden', () => {
    for (const [date, name] of GOLDENS) {
      const res = day(name, date)
      const out = ok('day', res)
      const url = `https://clerk.house.gov/floor/${name.slice(0, 8)}.xml`
      for (const e of out.events) {
        expect(e.branch).toBe('legislative')
        expect(e.body).toBe('house')
        expect(e.revision).toBe(1)
        expect(e.provenance).toEqual({ parser: HOUSE_FLOOR_PARSER, confidence: 'high' })
        expect(e.sources).toEqual([{ source_id: SRC, url, retrieved_at: res.fetchedAt, license: 'us-gov-public-domain', affiliation: 'official-nonpartisan' }])
        expect(e.title, e.object_key).toMatch(TITLE)
        expect(e.title.includes(e.official_text)).toBe(false)
        expect(e.official_text.length).toBeGreaterThan(0)
        if (e.dedup_key.endsWith('#entry')) {
          expect(e.object_key).toMatch(/^floor:house:1[0-9]{2}:[0-9]+$/)
          expect(e.status).toBe('ended')
          expect(e.importance?.reasons).toEqual(['floor_entry'])
          expect(e.result).toMatchObject({ legislative_day: `${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}` })
          expect(e.times.occurred_at).not.toBeNull()
        } else {
          expect(e.object_key).toMatch(/^floor_day:house:\d{4}-\d{2}-\d{2}$/)
          expect(e).toMatchObject({ event_type: 'floor.convened', status: 'scheduled', features: ['F7'], importance: { tier: 'P3', reasons: ['floor_schedule'] } })
          expect(e.times).toMatchObject({ occurred_at: null, source_published_at: null })
        }
      }
    }
  })
})

describe('hand-checked against the fixture bytes', () => {
  test('20261001.xml: adjourn, convene, bill links, the next meeting at 4:30 p.m. EDT and the next_day target', () => {
    const out = ok('day', day('20261001.xml'))
    expect(out.health.detail).toBe('7 actions; legislative day 2026-10-01; next meeting 2026-10-05')
    const adj = byKey(out, 'floor:house:119:45150')
    expect(adj).toMatchObject({ dedup_key: 'floor:house:119:45150#entry', event_type: 'floor.adjourned', features: ['F2', 'F7'], importance: { tier: 'P2' }, title: 'House adjourned' })
    // for-search="20261001T11:33:10", update-date-time="20261001T11:54" (EDT, -04:00)
    expect(adj.times).toEqual({ occurred_at: '2026-10-01T15:33:10Z', scheduled_for: null, source_published_at: '2026-10-01T15:54:00Z', first_seen_at: '2026-10-03T14:11:10.196Z' })
    expect(adj.official_text).toBe('The Speaker announced that the House do now adjourn pursuant to clause 13 of Rule I. The next meeting is scheduled for 4:30 p.m. on October 5, 2026.')
    expect(adj.result).toEqual({ legislative_day: '2026-10-01', act_id: 'H61000' })
    const conv = byKey(out, 'floor:house:119:44997')
    expect(conv).toMatchObject({ event_type: 'floor.convened', importance: { tier: 'P2' }, title: 'House convened for a new legislative day', related: [{ rel: 'about', key: 'floor_day:house:2026-10-01' }] })
    expect(conv.times.occurred_at).toBe('2026-10-01T15:30:00Z')
    const msg = byKey(out, 'floor:house:119:45148')
    expect(msg.related).toEqual(['bill:119:s:3257', 'bill:119:s:3258', 'bill:119:s:240', 'bill:119:s:283', 'bill:119:hr:2388'].map((key) => ({ rel: 'about', key })))
    expect(msg).toMatchObject({ event_type: 'floor.action', importance: { tier: 'P3' }, title: 'House floor proceedings entry' })
    expect(msg.official_text).toMatch(/That the Senate passed S\. 3257, S\. 3258, Senate agreed/)
    const [next] = scheduled(out)
    expect(next).toMatchObject({
      dedup_key: 'floor_day:house:2026-10-05#scheduled_convene',
      title: 'House scheduled to meet Monday, October 5, at 4:30 p.m. Eastern',
      official_text: 'next legislative day convenes 20261005T16:30',
      times: { occurred_at: null, scheduled_for: '2026-10-05T20:30:00Z', source_published_at: null },
      result: { convene_date: '2026-10-05' },
    })
    expect(out.targets).toEqual([{ endpoint: 'next_day', url: 'https://clerk.house.gov/floor/20261005.xml' }])
    // "pro forma" appears nowhere: the file never says it, so no event claims it (R-6)
    expect(JSON.stringify(out)).not.toMatch(/pro.forma/i)
  })

  test('20260917.xml (barest): six entries, scheduled 10:30 a.m. Sep 21 -> 14:30Z', () => {
    const out = ok('day', day('20260917.xml'))
    expect(entries(out).map((e) => e.event_type)).toEqual(['floor.adjourned', 'floor.action', 'floor.action', 'floor.action', 'floor.action', 'floor.convened'])
    expect(scheduled(out)[0]!.times.scheduled_for).toBe('2026-09-21T14:30:00Z')
  })

  test('20260902.xml: the failed suspension vote line is floor.action P2 related to vote:house:119:2:293, never vote.result', () => {
    const out = ok('day', day('20260902.xml'))
    const v = byKey(out, 'floor:house:119:42544')
    expect(v.official_text).toBe('On motion to suspend the rules and pass Failed by the Yeas and Nays: (2/3 required): 212 - 206 (Roll no. 293).')
    expect(v).toMatchObject({
      event_type: 'floor.action', features: ['F2', 'F5'], importance: { tier: 'P2' },
      title: 'House floor recorded the result of roll call 293 on H.J.Res. 1',
      related: [{ rel: 'about', key: 'vote:house:119:2:293' }],
    })
    // late re-stamp: for-search 20260902T16:35:33, update-date-time 20260904T11:54
    expect(v.times).toMatchObject({ occurred_at: '2026-09-02T20:35:33Z', source_published_at: '2026-09-04T15:54:00Z' })
    expect(out.events.some((e) => e.event_type === 'vote.result')).toBe(false)
    expect(out.events.filter((e) => e.event_type === 'floor.recess')).toHaveLength(2)
    expect(out.events.filter((e) => e.title === 'House returned from a recess')).toHaveLength(2)
    // doubled anchors <a rel="bill"><a rel="bill">H. Res. 179</a></a>: one related key, the text once
    const dbl = byKey(out, 'floor:house:119:42557')
    expect(dbl.related).toEqual([{ rel: 'about', key: 'bill:119:hres:179' }])
    expect(dbl.title).toBe('House floor action on H.Res. 179')
    expect(dbl.official_text).toContain('first sponsor of H. Res. 179, a resolution')
  })

  test('20260429.xml: head cut at 50 of 123 with the detail; all 50 newest actions are after Eastern midnight (Apr 30)', () => {
    const out = ok('day', day('20260429.xml'))
    expect(out.health).toMatchObject({ items_seen: 123, detail: 'newest 50 of 123 actions; legislative day 2026-04-29; next meeting 2026-04-30' })
    const es = entries(out)
    expect(es).toHaveLength(50)
    // first block: for-search="20260430T02:26:41" -> 06:26:41Z on Apr 30
    expect(es[0]!.times.occurred_at).toBe('2026-04-30T06:26:41Z')
    expect(es.every((e) => e.times.occurred_at!.startsWith('2026-04-30'))).toBe(true)
    expect(es.every((e) => (e.result as { legislative_day: string }).legislative_day === '2026-04-29')).toBe(true)
    expect(scheduled(out)[0]).toMatchObject({ object_key: 'floor_day:house:2026-04-30', times: { scheduled_for: '2026-04-30T13:00:00Z' } })
  })

  test('20260416.xml: exactly 50 actions is no cut; an edit stamped months later is source_published_at only', () => {
    const out = ok('day', day('20260416.xml'))
    expect(out.health.detail).toMatch(/^50 actions; /)
    const late = byKey(out, 'floor:house:119:33221')
    expect(late.times).toMatchObject({ occurred_at: '2026-04-17T04:05:03Z', source_published_at: '2026-07-02T16:09:00Z' })
  })

  test('20260327.xml: two new-day convenes, adjourn 20:26:52 and recess 10:28:21 told apart', () => {
    const out = ok('day', day('20260327.xml'))
    const newDays = out.events.filter((e) => e.title === 'House convened for a new legislative day')
    expect(newDays.map((e) => [e.object_key, e.times.occurred_at])).toEqual([
      ['floor:house:119:32390', '2026-03-28T01:30:00Z'],
      ['floor:house:119:32353', '2026-03-27T13:00:00Z'],
    ])
    // both link the Eastern date of their own for-search (Mar 27 at 21:30 EDT is Mar 28 in UTC)
    expect(newDays.map((e) => e.related)).toEqual([[{ rel: 'about', key: 'floor_day:house:2026-03-27' }], [{ rel: 'about', key: 'floor_day:house:2026-03-27' }]])
    expect(byKey(out, 'floor:house:119:32389')).toMatchObject({ event_type: 'floor.adjourned', importance: { tier: 'P2' }, times: { occurred_at: '2026-03-28T00:26:52Z' } })
    expect(byKey(out, 'floor:house:119:32372')).toMatchObject({ event_type: 'floor.recess', importance: { tier: 'P3' }, times: { occurred_at: '2026-03-27T14:28:21Z' } })
    expect(byKey(out, 'floor:house:119:32388')).toMatchObject({ title: 'House floor recorded the result of roll call 106', related: [{ rel: 'about', key: 'vote:house:119:2:106' }] })
  })

  test('20260103.xml: sine die P1, the 20th-Amendment convene is a new day, EST, and exactly ONE scheduled convene', () => {
    const out = ok('day', day('20260103.xml'))
    expect(byKey(out, 'floor:house:119:26507')).toMatchObject({ event_type: 'floor.adjourned', importance: { tier: 'P1' }, title: 'House adjourned its session (sine die)', features: ['F2', 'F7'] })
    expect(byKey(out, 'floor:house:119:26508')).toMatchObject({ event_type: 'floor.convened', importance: { tier: 'P2' }, related: [{ rel: 'about', key: 'floor_day:house:2026-01-03' }] })
    // EST (-05:00): 11:30:00 -> 16:30:00Z
    expect(byKey(out, 'floor:house:119:26499').times.occurred_at).toBe('2026-01-03T16:30:00Z')
    expect(scheduled(out).map((e) => [e.dedup_key, e.times.scheduled_for])).toEqual([['floor_day:house:2026-01-06#scheduled_convene', '2026-01-06T23:30:00Z']])
  })

  test('20260102.xml: a session-1 day read with the 2026 file (keys carry the Congress only), EST', () => {
    const out = ok('day', day('20260102.xml'))
    expect(byKey(out, 'floor:house:119:26480').times.occurred_at).toBe('2026-01-02T21:00:00Z')
    expect(scheduled(out)[0]!.times.scheduled_for).toBe('2026-01-03T16:30:00Z')
  })

  test('20250103.xml: Congress 119:118 split on the whole file; vote links by the year rule; the past finished time skipped', () => {
    const out = ok('day', day('20250103.xml'))
    expect(out.health.detail).toBe('85 actions; whole file scanned (Congress 119:118); legislative day 2025-01-03; next meeting 2025-01-06')
    expect(entries(out)).toHaveLength(85)
    expect(byKey(out, 'floor:house:118:51338')).toMatchObject({ event_type: 'floor.adjourned', importance: { tier: 'P1' } })
    expect(byKey(out, 'floor:house:119:4')).toMatchObject({ event_type: 'floor.convened', importance: { tier: 'P2' }, times: { occurred_at: '2025-01-03T17:00:00Z' } })
    // everything before the 20th-Amendment convene (12:00:00) is the 118th, from it on the 119th
    const keys = entries(out).map((e) => e.object_key)
    expect(keys.filter((k) => k.startsWith('floor:house:118:'))).toEqual(['51338', '51337', '51336', '51335', '51334', '51333', '51332', '51331', '51330', '51304'].map((u) => `floor:house:118:${u}`))
    const votes = out.events.flatMap((e) => (e.related ?? []).map((r) => r.key)).filter((k) => k.startsWith('vote:'))
    expect(votes.sort()).toEqual([1, 2, 3, 4, 5].map((n) => `vote:house:119:1:${n}`))
    // 20250106T12:00 (EST -> 17:00Z) kept; 20250103T12:00 is earlier than the file's newest action -> skipped
    expect(scheduled(out).map((e) => [e.object_key, e.times.scheduled_for])).toEqual([['floor_day:house:2025-01-06', '2025-01-06T17:00:00Z']])
    expect(out.targets).toEqual([{ endpoint: 'next_day', url: 'https://clerk.house.gov/floor/20250106.xml' }])
  })

  test('20260916.xml: inline markup reduced to text; roll 314 line occurs at the roll call close (23:05Z)', () => {
    const out = ok('day', day('20260916.xml', '2026-10-02'))
    expect(out.health.detail).toMatch(/^newest 50 of 170 actions; /)
    expect(byKey(out, 'floor:house:119:43832')).toMatchObject({
      title: 'House floor recorded the result of roll call 314 on S. 2403', times: { occurred_at: '2026-09-16T23:05:16Z' },
      related: [{ rel: 'about', key: 'vote:house:119:2:314' }],
    })
    for (const e of out.events) expect(e.official_text).not.toMatch(/[<>]|&[a-z#0-9]+;/)
  })
})

describe('feed', () => {
  test('golden: Home_Feed_rss.xml (UTF-8 BOM) -> target day floor/20261001.xml, zero events', () => {
    const res = feed()
    expect(res.body.charCodeAt(0)).toBe(0xfeff)
    const out = ok('feed', res)
    expect(out.events).toEqual([])
    expect(out.targets).toEqual([{ endpoint: 'day', url: 'https://clerk.house.gov/floor/20261001.xml' }])
    expect(out.health).toMatchObject({ items_seen: 7, detail: '7 items; current legislative day 2026-10-01' })
    golden('Home_Feed_rss.json', out)
    // the same feed without its BOM reads the same
    expect(run('feed', variant(res, { body: res.body.slice(1) }))).toEqual(out)
  })

  test('items naming two days: the latest is the target, said in the detail', () => {
    const out = ok('feed', withBody(feed(), (b) => edit(b, 'Legislative Day of 10/01/2026', 'Legislative Day of 10/05/2026')))
    expect(out.targets).toEqual([{ endpoint: 'day', url: 'https://clerk.house.gov/floor/20261005.xml' }])
    expect(out.health.detail).toMatch(/names 2 days; the latest is polled/)
  })

  test('fail closed: bad item title, no items, HTML, truncated, File Not Found', () => {
    refused('feed', withBody(feed(), (b) => edit(b, 'Legislative Day of 10/01/2026', 'Legislative Day of 13/01/2026')), 'drift', /item 1: title/)
    refused('feed', withBody(feed(), (b) => edit(b, '<title>Legislative Day of 10/01/2026</title>', '<title>Floor of 10/01/2026</title>')), 'drift', /item 1: title/)
    refused('feed', withBody(feed(), (b) => b.replace(/<item>[\s\S]*<\/item>/, '')), 'drift', /no items/)
    refused('feed', withBody(feed(), (b) => b.slice(0, -40)), 'drift', /truncated/)
    refused('feed', variant(feed(), { headers: { 'content-type': 'text/html; charset=utf-8' } }), 'drift', /content-type/)
    refused('feed', fileNotFound(), 'drift', /content-type "text\/html/)
    refused('feed', variant(fileNotFound(), { headers: { 'content-type': 'application/rss+xml' } }), 'drift', /root element <html> is not <rss>/i)
  })
})

describe('nothing new', () => {
  test('20261001.xml and its regenerated copy (only <pubDate> differs): identical output apart from when we fetched it', () => {
    const a = day('20261001.xml')
    const b = day('20261001_regenerated_IMS_200.xml')
    expect(a.body).not.toBe(b.body)
    expect(a.fetchedAt).not.toBe(b.fetchedAt)
    const norm = (out: AdapterOutput, at: string) => JSON.parse(JSON.stringify(out).split(at).join('<fetchedAt>'))
    expect(norm(ok('day', b), b.fetchedAt)).toEqual(norm(ok('day', a), a.fetchedAt))
    // ids derive from dedup_key + revision only
    expect(ok('day', b).events.map((e) => e.id)).toEqual(ok('day', a).events.map((e) => e.id))
  })
})

describe('NEGATIVE responses', () => {
  test('20261005_NEGATIVE_404_not_yet.html: HTTP 404 -> error, nothing emitted (the poller maps it to empty via notYetStatus)', () => {
    const res = day('20261005_NEGATIVE_404_not_yet.html')
    expect(res.status).toBe(404)
    refused('next_day', res, 'error', /^HTTP 404 \(the next day file is not posted yet\)$/)
    refused('day', res, 'error', /^HTTP 404$/)
  })

  test('20260916_IMS_304.xml: HTTP 304 -> not_modified', () => {
    const res = day('20260916_IMS_304.xml')
    expect(res.status).toBe(304)
    refused('day', res, 'not_modified', /304/)
  })

  test('HTTP 200 HTML "File Not Found" (house.docs.floor fixture) -> drift, zero events, as recorded and at a day URL', () => {
    refused('day', fileNotFound(), 'drift', /content-type "text\/html; charset=utf-8" is not XML/)
    refused('next_day', variant(fileNotFound(), { url: 'https://clerk.house.gov/floor/20261005.xml' }), 'drift', /not XML/)
    // even if the HTML came labelled as XML, its root is not <legislative_activity>
    refused('day', variant(fileNotFound(), { url: 'https://clerk.house.gov/floor/20261005.xml', headers: { 'content-type': 'text/xml' } }), 'drift', /root element <html> is not <legislative_activity>/i)
  })
})

describe('non-default cases', () => {
  const d1001 = () => day('20261001.xml')

  test('20260103 variant whose second finished element says 20260106T19:00 -> drift (two times for one date)', () => {
    const res = day('20260103.xml')
    const lines = res.body.split('\n')
    expect(lines[46]).toBe('<legislative_day_finished next-legislative-day-convenes="20260106T18:30">Yes</legislative_day_finished>')
    lines[46] = lines[46]!.replace('T18:30', 'T19:00')
    refused('day', variant(res, { body: lines.join('\n') }), 'drift', /two different next-meeting times for 2026-01-06 \(18:30 and 19:00\)|\(19:00 and 18:30\)/)
  })

  test('DST: next meeting Nov 2 4:30 p.m. (after fall-back) -> 21:30Z; Oct 5 4:30 p.m. -> 20:30Z', () => {
    expect(scheduled(ok('day', d1001()))[0]!.times.scheduled_for).toBe('2026-10-05T20:30:00Z')
    const out = ok('day', withBody(d1001(), (b) => edit(b, '20261005T16:30', '20261102T16:30')))
    expect(scheduled(out)[0]).toMatchObject({ object_key: 'floor_day:house:2026-11-02', title: 'House scheduled to meet Monday, November 2, at 4:30 p.m. Eastern', times: { scheduled_for: '2026-11-02T21:30:00Z' } })
    expect(out.targets).toEqual([{ endpoint: 'next_day', url: 'https://clerk.house.gov/floor/20261102.xml' }])
  })

  test('DST: a for-search in the spring-forward gap (20260308T02:30:00) -> drift', () => {
    refused('day', withBody(d1001(), (b) => edit(b, 'for-search="20261001T11:31:54"', 'for-search="20260308T02:30:00"')), 'drift', /uid 45147 for-search "20260308T02:30:00" is a wall time that does not exist/)
  })

  test('DST: an update-date-time or next meeting in the gap -> drift', () => {
    refused('day', withBody(d1001(), (b) => edit(b, 'update-date-time="20261001T11:32"', 'update-date-time="20270314T02:30"')), 'drift', /update-date-time "20270314T02:30" is a wall time that does not exist/)
    refused('day', withBody(d1001(), (b) => edit(b, '20261005T16:30', '20270314T02:30')), 'drift', /next-legislative-day-convenes "20270314T02:30" is a wall time that does not exist/)
  })

  test('DST: ambiguous fall-back wall times -> that time null + result.time_note, the payload kept', () => {
    // for-search in the repeated hour (Nov 1 2026, 01:30)
    let out = ok('day', withBody(d1001(), (b) => edit(b, 'for-search="20261001T11:31:54"', 'for-search="20261101T01:30:00"')))
    let e = byKey(out, 'floor:house:119:45147')
    expect(e.times.occurred_at).toBeNull()
    expect((e.result as { time_note: string }).time_note).toMatch(/for-search 2026-11-01T01:30:00 falls in the repeated fall-back hour; occurred_at left null/)
    expect(out.health.detail).toMatch(/1 event\(s\) with an ambiguous fall-back wall time/)
    // update-date-time in the repeated hour
    out = ok('day', withBody(d1001(), (b) => edit(b, 'update-date-time="20261001T11:32"', 'update-date-time="20261101T01:15"')))
    e = byKey(out, 'floor:house:119:45147')
    expect(e.times).toMatchObject({ occurred_at: '2026-10-01T15:31:54Z', source_published_at: null })
    expect((e.result as { time_note: string }).time_note).toMatch(/update-date-time .* source_published_at left null/)
    // next meeting in the repeated hour
    out = ok('day', withBody(d1001(), (b) => edit(b, '20261005T16:30', '20261101T01:30')))
    expect(scheduled(out)[0]).toMatchObject({ times: { scheduled_for: null }, result: { convene_date: '2026-11-01' } })
    expect((scheduled(out)[0]!.result as { time_note: string }).time_note).toMatch(/fall-back hour; scheduled_for left null/)
  })

  test('a duplicate unique-id -> drift', () => {
    refused('day', withBody(d1001(), (b) => edit(b, 'unique-id="45148"', 'unique-id="45150"')), 'drift', /duplicate unique-id 45150/)
  })

  test('legislative_day/@date differs from the URL -> drift', () => {
    refused('day', variant(d1001(), { url: 'https://clerk.house.gov/floor/20261002.xml' }), 'drift', /legislative_day date 20261001 is not the URL's date 20261002/)
    refused('day', withBody(d1001(), (b) => edit(b, 'date="20261001"', 'date="20261031"')), 'drift', /not the URL's date/)
  })

  test('malformed attributes -> drift (for-search, update-date-time, unique-id, act-id, next meeting, an extra or unquoted attribute)', () => {
    refused('day', withBody(d1001(), (b) => edit(b, 'for-search="20261001T11:33:10"', 'for-search="20261001T11:33"')), 'drift', /for-search "20261001T11:33" is not in the recorded format/)
    refused('day', withBody(d1001(), (b) => edit(b, 'update-date-time="20261001T11:32"', 'update-date-time="20261001T11:32:00"')), 'drift', /update-date-time .* not in the recorded format/)
    refused('day', withBody(d1001(), (b) => edit(b, 'unique-id="45148"', 'unique-id="45a48"')), 'drift', /unique-id "45a48" is not digits/)
    refused('day', withBody(d1001(), (b) => edit(b, 'act-id="H24500"', 'act-id="24500"')), 'drift', /act-id "24500"/)
    refused('day', withBody(d1001(), (b) => edit(b, '20261005T16:30', '2026-10-05T16:30')), 'drift', /next-legislative-day-convenes .* not in the recorded format/)
    refused('day', withBody(d1001(), (b) => edit(b, 'unique-id="45148">', 'unique-id="45148" status="draft">')), 'drift', /attributes are \[act-id, status, unique-id, update-date-time\]/)
    refused('day', withBody(d1001(), (b) => edit(b, 'unique-id="45148"', 'unique-id=45148')), 'drift', /malformed <floor_action> tag/)
    refused('day', withBody(d1001(), (b) => edit(b, 'for-search="20261001T11:33:10"', 'for-search="20261001T11:33:10" x="1"')), 'drift', /<action_time> attributes/)
  })

  test('unexpected structure inside an action or the file -> drift', () => {
    refused('day', withBody(d1001(), (b) => edit(b, '<action_description>\nToday', '<action_note>x</action_note>\n<action_description>\nToday')), 'drift', /unexpected content in <floor_action>/)
    refused('day', withBody(d1001(), (b) => edit(b, '11:30:38 A.M. -</action_time>', '11:30:38 A.M. -</action_time>\n<action_item>H.R. 1</action_item><action_item>H.R. 2</action_item>')), 'drift', /2 <action_item>/)
    refused('day', withBody(d1001(), (b) => edit(b, 'Chaplain Margaret Grun Kibben.', 'Chaplain&nbsp;Margaret Grun Kibben.')), 'drift', /an entity outside the XML five/)
    refused('day', withBody(d1001(), (b) => b.slice(0, -30)), 'drift', /truncated/)
    refused('day', withBody(d1001(), (b) => b.replace(/legislative_activity>/g, 'house-floor-activities>')), 'drift', /root element <house-floor-activities> is not <legislative_activity>/)
    refused('day', withBody(d1001(), (b) => edit(b, /<legislative_congress[^>]*>[^<]*<\/legislative_congress>/, '')), 'drift', /exactly one <legislative_day> and one <legislative_congress>/)
    refused('day', withBody(d1001(), (b) => edit(b, 'congress="119"', 'congress="CXIX"')), 'drift', /neither N nor N:M/)
    refused('day', variant(d1001(), { headers: { 'content-type': 'application/json' } }), 'drift', /content-type "application\/json"/)
  })

  test('Congress pair rules: not consecutive -> drift; no 20th-Amendment convene to split at -> drift; a plain congress is head-only', () => {
    const y = () => day('20250103.xml')
    refused('day', withBody(y(), (b) => edit(b, 'congress="119:118"', 'congress="119:117"')), 'drift', /not two Congresses in a row/)
    refused('day', withBody(y(), (b) => edit(b, 'pursuant to the 20th amendment', 'under the Constitution')), 'drift', /0 20th-Amendment convene entries/)
    const out = ok('day', withBody(y(), (b) => edit(b, 'congress="119:118"', 'congress="119"')))
    expect(out.health.detail).toMatch(/^newest 50 of 85 actions; legislative day/)
    expect(entries(out)).toHaveLength(50)
    expect(out.events.some((e) => e.object_key === 'floor:house:119:4')).toBe(false)
  })

  test('a vote link we cannot read -> drift; an unknown bill link only loses its related key', () => {
    refused('day', withBody(day('20260902.xml'), (b) => edit(b, 'year=2026&amp;rollnumber=293', 'year=2026&amp;roll=293')), 'drift', /uid 42544: a vote link we cannot read/)
    refused('day', withBody(day('20260902.xml'), (b) => edit(b, 'rollnumber=293', 'rollnumber=0')), 'drift', /a vote link we cannot read/)
    const out = ok('day', withBody(d1001(), (b) => edit(b, 'senate-bill/3257', 'senate-amendment/3257')))
    expect(byKey(out, 'floor:house:119:45148').related!.map((r) => r.key)).toEqual(['bill:119:s:3258', 'bill:119:s:240', 'bill:119:s:283', 'bill:119:hr:2388'])
  })

  test('legislative_day_finished absent is NOT drift: entries kept, no scheduled convene, no target', () => {
    const out = ok('day', withBody(d1001(), (b) => edit(b, /<legislative_day_finished[^\n]*\n/, '')))
    expect(entries(out)).toHaveLength(7)
    expect(scheduled(out)).toEqual([])
    expect(out.targets).toBeUndefined()
    expect(out.health.detail).toMatch(/no next meeting announced/)
    // an element without the attribute is skipped the same way
    const out2 = ok('day', withBody(d1001(), (b) => edit(b, ' next-legislative-day-convenes="20261005T16:30"', '')))
    expect(scheduled(out2)).toEqual([])
  })

  test('a file with zero <floor_action> -> empty, nothing emitted', () => {
    const out = run('day', withBody(d1001(), (b) => b.replace(/<floor_actions>[\s\S]*<\/floor_actions>/, '<floor_actions>\n</floor_actions>')))
    expect(out.health).toMatchObject({ status: 'empty', items_seen: 0 })
    expect(out.events).toEqual([])
  })

  test('both act-id AND sentence must match; otherwise floor.action', () => {
    const out = ok('day', withBody(d1001(), (b) => edit(b, 'act-id="H20100"', 'act-id="H8D000"')))
    expect(byKey(out, 'floor:house:119:44997')).toMatchObject({ event_type: 'floor.action', importance: { tier: 'P3' }, title: 'House floor proceedings entry' })
    expect(byKey(out, 'floor:house:119:44997').related).toBeUndefined()
    expect(classifyAction('H20100', 'The House convened, starting a new legislative day.', false).kind).toBe('new_day')
    expect(classifyAction('H20100', 'House convened, starting a new legislative day, pursuant to the 20th amendment', false).kind).toBe('new_day')
    expect(classifyAction('H20100', 'The House convened pursuant to the 20th Amendment to the Constitution', false).kind).toBe('new_day')
    expect(classifyAction('H20100', 'The House convened, returning from a recess continuing the legislative day of March 27.', false)).toMatchObject({ event_type: 'floor.convened', tier: 'P3' })
    expect(classifyAction('H20100', 'The Chair led the House in prayer.', false)).toMatchObject({ event_type: 'floor.action', tier: 'P3' })
    expect(classifyAction('H61000', 'The Speaker announced that the House do now adjourn Sine Die.', false)).toMatchObject({ event_type: 'floor.adjourned', tier: 'P1' })
    expect(classifyAction('H61000', 'The House adjourned pursuant to a previous special order.', false)).toMatchObject({ event_type: 'floor.adjourned', tier: 'P2' })
    expect(classifyAction('H61000', 'The Speaker announced that the House do now recess for a period of less than 15 minutes.', false)).toMatchObject({ event_type: 'floor.recess', tier: 'P3' })
    expect(classifyAction('H61000', 'Something else entirely.', false)).toMatchObject({ event_type: 'floor.action', tier: 'P3' })
    expect(classifyAction('H8D000', 'The House adjourned.', false)).toMatchObject({ event_type: 'floor.action' })
    expect(classifyAction('H37100', 'On passage Passed by the Yeas and Nays: 218 - 201 (Roll no. 294).', true)).toMatchObject({ event_type: 'floor.action', tier: 'P2', features: ['F2', 'F5'] })
  })

  test('action_item outside the bill table: generic title, counted in the health detail, payload kept', () => {
    const out = ok('day', withBody(day('20260902.xml'), (b) => edit(b, '<action_item>H.R. 1114</action_item>', '<action_item>H. Amdt. 12</action_item>')))
    expect(byKey(out, 'floor:house:119:42556').title).toBe('House floor proceedings entry')
    expect(out.health.detail).toMatch(/1 action_item value\(s\) outside the bill table/)
    expect(['H.R. 1114', 'H. Res. 179', 'H.J. Res. 1', 'H. Con. Res. 1', 'S. 2403', 'S. Con. Res. 3', 'S. Res. 9', 'S.J. Res. 4'].map(fmtActionItem))
      .toEqual(['H.R. 1114', 'H.Res. 179', 'H.J.Res. 1', 'H.Con.Res. 1', 'S. 2403', 'S.Con.Res. 3', 'S.Res. 9', 'S.J.Res. 4'])
    expect(fmtActionItem('H. Amdt. 12')).toBeNull()
  })

  test('two vote links in one entry: both related, one title', () => {
    const out = ok('day', withBody(day('20260902.xml'), (b) => edit(b, '(Roll no. 293)</a>.', '(Roll no. 293)</a> <a rel="vote" href="http://clerk.house.gov/cgi-bin/vote.asp?year=2026&amp;rollnumber=295">(Roll no. 295)</a>.')))
    expect(byKey(out, 'floor:house:119:42544')).toMatchObject({
      title: 'House floor recorded the results of roll calls 293 and 295 on H.J.Res. 1',
      related: [{ rel: 'about', key: 'vote:house:119:2:293' }, { rel: 'about', key: 'vote:house:119:2:295' }],
    })
  })

  test('official_text is capped at 4000 characters', () => {
    const long = 'x'.repeat(5000)
    const out = ok('day', withBody(d1001(), (b) => edit(b, 'Chaplain Margaret Grun Kibben.', long)))
    const t = byKey(out, 'floor:house:119:45145').official_text
    expect(t).toHaveLength(4000)
    expect(t.endsWith('…')).toBe(true)
  })

  test('endpoints: next_day parses like day but names no target; a non-day URL is error; an unknown endpoint is error', () => {
    const out = ok('next_day', d1001())
    expect(out.events).toHaveLength(8)
    expect(out.targets).toBeUndefined()
    refused('day', variant(d1001(), { url: 'https://clerk.house.gov/floor/latest.xml' }), 'error', /is not a day file/)
    const unk = parseHouseFloor('votes', d1001())
    expect(unk).toEqual({ events: [], health: { source_id: SRC, endpoint: 'votes', status: 'error', detail: 'unknown endpoint "votes"', items_seen: 0 } })
  })

  test('a next meeting on the file\'s own date is an event but not a next_day target', () => {
    const out = ok('day', withBody(d1001(), (b) => edit(b, '20261005T16:30', '20261001T21:00')))
    expect(scheduled(out).map((e) => e.object_key)).toEqual(['floor_day:house:2026-10-01'])
    expect(out.targets).toBeUndefined()
  })
})
