// senate.pressgallery adapter (scratch/phase2/DESIGN.md §3.5, keys §1.4, times §1.3; R-9): goldens for every recorded
// Daily Press Gallery payload the design lists, hand-counted entry totals, per-entry typing pins, the session-day
// resolver, the midnight walk, and every fail-closed path on in-memory variants of the recorded responses (fixtures are
// never edited; TESTING.md rule 1). Every payload, accepted or refused, goes through expectHubPayloadRules.
//
// Goldens: test/golden/senate.pressgallery/*.json. To regenerate after a deliberate change, run with UPDATE_GOLDEN=1
// and review the diff line by line; the hand-written expectations below must still pass on their own.
import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateEvent, type CedEvent } from '@ced/schema'
import {
  DAILY_POSTS_URL, PRESS_GALLERY_PARSER, cutEntries, parseDailyPosts, resolveSessionDay, scanBlocks, senatePressgallery, typeEntry,
} from '../src/sources/senate_pressgallery.js'
import type { AdapterOutput, FetchedResponse } from '../src/types.js'
import { expectHubPayloadRules } from './payload_rules.js'
import { replay, variant } from './replay.js'

const S = 'senate.pressgallery'
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden', S)
const newest3 = (): FetchedResponse => replay(S, '2026-10-03', 'dailypress_posts_newest3_fields.json')
const ten = (): FetchedResponse => replay(S, '2026-10-02', 'dailypress_posts.json')
const est = (): FetchedResponse => replay(S, '2026-10-03', 'dailypress_posts_before_2026-01-10_EST_time_ranges.json')
const stub = (): FetchedResponse => replay(S, '2026-10-03', 'dailypress_posts_165481_scheduled_modified_before_date.json')
/** A single-post REST answer (posts/{id}) wrapped as the one-element array the list endpoint would return. */
function wrapped(name: string): FetchedResponse {
  const r = replay(S, '2026-10-03', name)
  return variant(r, { body: `[${r.body}]` })
}
const overnight = (): FetchedResponse => wrapped('dailypress_post_162959_overnight_two_day_title.json')
const NEWEST3_FETCHED = '2026-10-03T14:09:33.772Z' // dailypress_posts_newest3_fields.json.meta.json fetched_at
const LOG = 'Senate Daily Press Gallery log'

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

/** Parse, then the Hub's payload rules and the P2.1 output contract on every payload, accepted or not. */
function parse(res: FetchedResponse): AdapterOutput {
  const out = parseDailyPosts('daily_posts', res)
  expectHubPayloadRules(senatePressgallery, out, res)
  return out
}
function parseOk(res: FetchedResponse): AdapterOutput {
  const out = parse(res)
  expect(out.health.status, out.health.detail).toBe('ok')
  for (const e of out.events) expect(validateEvent(e), e.dedup_key).toEqual({ valid: true, errors: [] })
  return out
}
function expectRefused(res: FetchedResponse, status: string, detail: RegExp): AdapterOutput {
  const out = parse(res)
  expect(out.events).toEqual([])
  expect(out.health.status).toBe(status)
  expect(out.health.detail).toMatch(detail)
  return out
}
const ofPost = (out: AdapterOutput, id: number): CedEvent[] => out.events.filter((e) => e.object_key.startsWith(`pg_entry:daily:${id}:`))
function byKey(out: AdapterOutput, key: string): CedEvent {
  const e = out.events.find((x) => x.object_key === key)
  if (!e) throw new Error(`no event ${key}`)
  return e
}
function edit(body: string, from: string | RegExp, to: string): string {
  const out = body.replace(from, to)
  if (out === body) throw new Error(`variant edit did not apply: ${String(from)}`)
  return out
}
/** Edit the parsed posts array, then re-serialize (the parser reads JSON, so key order and spacing do not matter). */
function posts(res: FetchedResponse, patch: (ps: Array<Record<string, any>>) => unknown): FetchedResponse {
  const ps = JSON.parse(res.body) as Array<Record<string, any>>
  const out = patch(ps)
  return variant(res, { body: JSON.stringify(out ?? ps) })
}
/** A one-post payload built on the recorded post 167288 (all required fields as recorded) with the given overrides. */
function onePost(over: { id?: number; date_gmt: string; title: string; content: string }, fetchedAt: string): FetchedResponse {
  return posts(variant(newest3(), { fetchedAt }), (ps) => {
    const p = ps[0] as Record<string, any>
    return [{ ...p, id: over.id ?? 900001, date_gmt: over.date_gmt, title: { rendered: over.title }, content: { rendered: over.content, protected: false } }]
  })
}
const html = (...blocks: string[]) => blocks.map((b) => `<p class="wp-block-paragraph">${b}</p>`).join('\n\n')

describe('source definition', () => {
  test('one daily_posts endpoint (body-hash, _fields always sent) with the §3.5 numbers', () => {
    expect(senatePressgallery.source_id).toBe(S)
    expect(senatePressgallery.endpoints).toEqual([{ id: 'daily_posts', url: DAILY_POSTS_URL, validator: 'body-hash', cadence: { business_s: 60, off_s: 300 } }])
    expect(DAILY_POSTS_URL).toContain('&_fields=')
    expect(senatePressgallery.cadence).toEqual({ business_s: 60, off_s: 300 })
    expect(senatePressgallery.calendar).toEqual({ chamber: 'senate', recess_s: 900 })
    expect(senatePressgallery.freshness_slo_s).toBe(120)
    expect(senatePressgallery.rate_budget_per_h).toBe(70)
    expect(senatePressgallery.affiliation).toBe('official-nonpartisan')
    expect(senatePressgallery.parse).toBe(parseDailyPosts)
  })
  test('the newest-3 fixture is a recording of exactly that endpoint URL', () => {
    expect(newest3().url).toBe(DAILY_POSTS_URL)
  })
})

describe('goldens', () => {
  test('2026-10-03/dailypress_posts_newest3_fields.json (167288 pro forma + calendar, 167105, 166969)', () => {
    const out = parseOk(newest3())
    expect(out.health).toEqual({ source_id: S, endpoint: 'daily_posts', status: 'ok', detail: '3 posts, 3 floor logs, 86 entries', items_seen: 3 })
    golden('dailypress_posts_newest3_fields.json', out)
  })
  test('2026-10-02/dailypress_posts.json (unfiltered, 10 posts: 166515 wrong-day title, 166855 same-minute pairs, 166593 two separators, 166582 no clock)', () => {
    const out = parseOk(ten())
    expect(out.health.status).toBe('ok')
    expect(out.health.items_seen).toBe(10)
    expect(out.health.detail).toContain('post 166582: no timed entries')
    expect(out.health.detail).toContain('post 166515 day 2026-09-17 from the post\'s day')
    golden('dailypress_posts.json', out)
  })
  test('dailypress_post_162959_overnight_two_day_title.json (midnight roll, out-of-order typo, em-dash day break)', () => {
    golden('dailypress_post_162959_overnight_two_day_title.json', parseOk(overnight()))
  })
  test('dailypress_posts_before_2026-01-10_EST_time_ranges.json (EST, ranges, two 12:37 p.m. entries)', () => {
    golden('dailypress_posts_before_2026-01-10_EST_time_ranges.json', parseOk(est()))
  })
  test('dailypress_posts_165481_scheduled_modified_before_date.json (empty stub skipped, real log 165516 kept)', () => {
    const out = parseOk(stub())
    expect(out.health.detail).toBe('2 posts, 1 floor logs, 21 entries; post 165481 skipped: empty content (a scheduled stub)')
    expect(ofPost(out, 165481)).toEqual([])
    expect(ofPost(out, 165516)).toHaveLength(21)
    golden('dailypress_posts_165481_scheduled_modified_before_date.json', out)
  })
  test('the IMS-200 re-fetch (same body) gives the same entries: an unchanged log replays to the same dedup_keys', () => {
    const a = parseOk(newest3()).events
    const b = parseOk(replay(S, '2026-10-03', 'dailypress_posts_newest3_fields_ims_200.json')).events
    expect(b.map((e) => e.dedup_key)).toEqual(a.map((e) => e.dedup_key))
    expect(b.map((e) => e.id)).toEqual(a.map((e) => e.id))
  })
})

describe('hand-counted entries (DESIGN §3.5: a count change is a reviewed golden diff)', () => {
  // Counted by eye from the fixture HTML: one entry per <p>/<li> that starts with "h:mm a.m./p.m." (or a bare "h:mm "),
  // outside the schedule part. 167105: blocks 0-2, 10-16, 27-46, 49-65 = 3+7+20+17. 166515: block 0 + blocks 5, 12,
  // 17, 19-22, 24, 25, 28-36. 166855: block 0 + 45 clock lines in blocks 18-87. 166593: block 0 + blocks 9-18 (16 is
  // the bare "5:02") + 21-28. 162959: blocks 0-30 + blocks 33-79 except the untimed 63 and 66. 167288: block 0.
  const want: Array<[string, () => FetchedResponse, number, number]> = [
    ['167105', newest3, 167105, 47], ['167288', newest3, 167288, 1], ['166969', newest3, 166969, 38],
    ['166515', ten, 166515, 19], ['166855', ten, 166855, 46], ['166593', ten, 166593, 19], ['166582', ten, 166582, 0],
    ['162959', overnight, 162959, 76],
  ]
  test.each(want)('post %s', (_, res, id, n) => {
    expect(ofPost(parseOk(res()), id)).toHaveLength(n)
  })
  test('the unfiltered 10-post answer and the _fields 3-post answer give the same events for their 3 shared posts', () => {
    const a = parseOk(newest3()).events.map((e) => ({ ...e, times: { ...e.times, first_seen_at: '' }, sources: [] }))
    const b = parseOk(ten()).events.filter((e) => /:(167288|167105|166969):/.test(e.object_key))
      .map((e) => ({ ...e, id: '', times: { ...e.times, first_seen_at: '' }, sources: [] }))
    expect(b).toEqual(a.map((e) => ({ ...e, id: '' })))
  })
})

describe('every event: fixed fields, keys, titles', () => {
  const all = (): Array<[AdapterOutput, FetchedResponse]> => [newest3(), ten(), overnight(), est(), stub()].map((r) => [parseOk(r), r])
  test('status ended, legislative, senate, inferred, source = the post link, no source_published_at, reasons press_gallery_log', () => {
    for (const [out, res] of all()) {
      for (const e of out.events) {
        expect(e.status).toBe('ended')
        expect(e.branch).toBe('legislative')
        expect(e.body).toBe('senate')
        expect(e.revision).toBe(1)
        expect(e.provenance).toEqual({ parser: PRESS_GALLERY_PARSER, confidence: 'inferred' })
        expect(e.dedup_key).toBe(`${e.object_key}#logged`)
        expect(e.object_key).toMatch(/^pg_entry:daily:\d+:\d{4}-\d\d-\d\d(T\d\d:\d\d|U\d{1,2}:\d\d):[1-9]\d*$/)
        expect(e.times.source_published_at).toBeNull()
        expect(e.times.first_seen_at).toBe(res.fetchedAt)
        expect(e.importance?.reasons).toEqual(['press_gallery_log'])
        expect(e.sources).toHaveLength(1)
        expect(e.sources[0]?.url).toMatch(/^https:\/\/www\.dailypress\.senate\.gov\/[a-z0-9-]+\/$/)
        const r = e.result as Record<string, unknown>
        expect(Object.keys(r).sort()).toEqual(e.times.occurred_at === null ? ['clock_text', 'post_id', 'session_date', 'time_note'] : ['clock_text', 'post_id', 'session_date'])
        expect(e.object_key).toContain(`:${r.post_id}:${r.session_date}`)
        // No counts in result (free-text sources never contribute counts).
        expect(r).not.toHaveProperty('yea')
        // D-043: titles are ours, never the gallery's prose, and omit the clock.
        expect(e.title).not.toMatch(/\d:\d\d/)
        expect(e.official_text.startsWith(r.clock_text as string)).toBe(true)
        expect(e.official_text.length).toBeLessThanOrEqual(4000)
        // related floor_day only on convened / adjourned / pro forma entries, keyed by the session date.
        const floorDay = ['floor.convened', 'floor.adjourned', 'floor.pro_forma'].includes(e.event_type)
        expect(e.related).toEqual(floorDay ? [{ rel: 'about', key: `floor_day:senate:${r.session_date}` }] : undefined)
      }
    }
  })
  test('types, tiers and features come only from the §3.5 table', () => {
    const allowed = new Map([
      ['floor.pro_forma|P4|F1', `Senate held a pro forma session (${LOG})`],
      ['floor.convened|P2|F1', `Senate convened (${LOG})`],
      ['floor.convened|P3|F1', `Senate returned from recess (${LOG})`],
      ['floor.adjourned|P2|F1', `Senate adjourned (${LOG})`],
      ['floor.recess|P3|F1', `Senate recessed (${LOG})`],
      ['vote.opened|P2|F1,F5', `A Senate roll call vote began (${LOG})`],
      ['floor.action|P2|F1,F5', 'Senate Daily Press Gallery logged a floor result'],
      ['floor.speaking|P3|F1,F8', 'Senate Daily Press Gallery logged floor speeches'],
      ['floor.action|P3|F1', 'Senate Daily Press Gallery logged floor activity'],
    ])
    const seen = new Set<string>()
    for (const [out] of all()) {
      for (const e of out.events) {
        const k = `${e.event_type}|${e.importance?.tier}|${e.features.join(',')}`
        expect(allowed.get(k), k).toBe(e.title)
        seen.add(k)
      }
    }
    expect([...seen].sort()).toEqual([...allowed.keys()].sort()) // every row is exercised by a fixture
  })
})

describe('typing pins (critique T3: anchored to the subject, the timed block only)', () => {
  test('166969 "2:15 p.m. The Senate returned from recess." -> floor.convened, return, P3 (not "recessed"); Baldwin at 2:15 is k=2', () => {
    const out = parseOk(newest3())
    const e = byKey(out, 'pg_entry:daily:166969:2026-09-29T14:15:1')
    expect(e.event_type).toBe('floor.convened')
    expect(e.importance?.tier).toBe('P3')
    expect(e.title).toBe(`Senate returned from recess (${LOG})`)
    expect(e.official_text.startsWith('2:15 p.m. The Senate returned from recess.')).toBe(true)
    expect(byKey(out, 'pg_entry:daily:166969:2026-09-29T14:15:2').official_text).toBe('2:15 p.m. Senator Baldwin spoke on the Affordable Care Act.')
    expect(byKey(out, 'pg_entry:daily:166969:2026-09-29T14:15:2').event_type).toBe('floor.speaking')
  })
  test('166665 "2:15 p.m. The Senate returned from recess." -> floor.convened P3; "12:43 p.m. The Senate recessed until 2:15 p.m." -> floor.recess', () => {
    const out = parseOk(ten())
    expect(byKey(out, 'pg_entry:daily:166665:2026-09-23T14:15:1')).toMatchObject({ event_type: 'floor.convened', importance: { tier: 'P3' }, official_text: '2:15 p.m. The Senate returned from recess.' })
    expect(byKey(out, 'pg_entry:daily:166665:2026-09-23T12:43:1')).toMatchObject({ event_type: 'floor.recess', official_text: '12:43 p.m. The Senate recessed until 2:15 p.m.' })
  })
  test('166515 "10:19 a.m. Majority Leader Thune spoke on his travels … during the August recess." -> floor.speaking', () => {
    const e = byKey(parseOk(ten()), 'pg_entry:daily:166515:2026-09-17T10:19:1')
    expect(e.official_text).toBe('10:19 a.m. Majority Leader Thune spoke on his travels in South Dakota during the August recess.')
    expect(e.event_type).toBe('floor.speaking')
    expect(e.features).toEqual(['F1', 'F8'])
  })
  test('166593 "5:02 Senator Kelly spoke on AI." is its own entry: key U5:02, occurred_at null, not a continuation', () => {
    const out = parseOk(ten())
    const e = byKey(out, 'pg_entry:daily:166593:2026-09-22U5:02:1')
    expect(e.official_text).toBe('5:02 Senator Kelly spoke on AI.')
    expect(e.event_type).toBe('floor.speaking')
    expect(e.times.occurred_at).toBeNull()
    expect(e.result).toEqual({ session_date: '2026-09-22', clock_text: '5:02', post_id: 166593, time_note: 'clock printed without a.m./p.m.' })
    expect(byKey(out, 'pg_entry:daily:166593:2026-09-22T17:20:1').official_text).toBe('5:20 p.m. Senator Cantwell spoke on the Save our Sports Act.')
    // The walk skips it: 4:43 p.m. below it and 5:20 p.m. above it keep their times.
    expect(byKey(out, 'pg_entry:daily:166593:2026-09-22T16:43:1').times.occurred_at).toBe('2026-09-22T20:43:00Z')
    expect(byKey(out, 'pg_entry:daily:166593:2026-09-22T17:20:1').times.occurred_at).toBe('2026-09-22T21:20:00Z')
  })
  test('166969 "10:25 a.m. Leader Thune called up …" ends before the "The Senate will …" schedule blocks (no separator, T9)', () => {
    const e = byKey(parseOk(newest3()), 'pg_entry:daily:166969:2026-09-29T10:25:1')
    expect(e.official_text).toBe('10:25 a.m. Leader Thune called up and spoke in favor of H.R. 9340, A bill to amend the Public Utility Regulatory Policies Act of 1978 to establish a federal standard relating to the recovery of the full, incremental costs of upgrades that serve large-load customers, and for other purposes.')
    expect(e.official_text).not.toContain('The Senate will')
  })
  test('167288 pro forma -> floor.pro_forma P4 with floor_day related; its calendar part is not an entry', () => {
    const out = parseOk(newest3())
    const es = ofPost(out, 167288)
    expect(es).toHaveLength(1)
    expect(es[0]).toMatchObject({
      object_key: 'pg_entry:daily:167288:2026-10-01T10:30:1', event_type: 'floor.pro_forma', importance: { tier: 'P4' },
      official_text: '10:30 a.m. The Senate convened for a pro forma session at 10:30 a.m. Senator Lummis presided and no business was conducted.',
      related: [{ rel: 'about', key: 'floor_day:senate:2026-10-01' }],
      times: { occurred_at: '2026-10-01T14:30:00Z' },
    })
  })
  test('167105: the 11:01 p.m. wrap-up carries its untimed continuation (bills, resolutions, nominations), not the 11:00 p.m. line', () => {
    const e = byKey(parseOk(newest3()), 'pg_entry:daily:167105:2026-09-30T23:01:1')
    expect(e.official_text.startsWith('11:01 p.m. Majority Leader Thune wrapped up for the evening. Passed the following bills: S.3315,')).toBe(true)
    expect(e.official_text).toContain('Confirmed the following nominations:')
    expect(e.official_text).not.toContain('11:00 p.m.')
    expect(e.event_type).toBe('floor.action')
  })
  test('167105: no schedule-part text (after the ***** separator) reaches any entry', () => {
    for (const e of ofPost(parseOk(newest3()), 167105)) {
      expect(e.official_text).not.toContain('The Senate will convene at 10:15')
      expect(e.official_text).not.toContain('Additional votes are possible')
    }
  })
  test('166969: an <li> holding a nested <ul> is one continuation block (8:15 p.m. wrap-up)', () => {
    const e = byKey(parseOk(newest3()), 'pg_entry:daily:166969:2026-09-29T20:15:1')
    expect(e.event_type).toBe('floor.adjourned')
    expect(e.official_text).toContain('The following bills received their first reading: S. 5602 – A bill to prohibit')
  })
  test.each([
    ['The Senate convened for a pro forma session at 10:30 a.m.', 'floor.pro_forma', 'P4'],
    ['The Senate convened.', 'floor.convened', 'P2'],
    ['The Senate has convened for a new legislative day and is now in a period of morning business.', 'floor.convened', 'P2'],
    ['The Senate is now in session and in a period of morning business.', 'floor.convened', 'P2'],
    ['The Senate returned from the recess.', 'floor.convened', 'P3'],
    ['The Senate adjourned and will convene for a pro forma session only at 9:00 a.m. on Friday', 'floor.adjourned', 'P2'],
    ['The Senate stands adjourned until 10:00 a.m. on Thursday.', 'floor.adjourned', 'P2'],
    ['The Senate stands in recess until 2:15 p.m.', 'floor.recess', 'P3'],
    ['The Senate is now in recess.', 'floor.recess', 'P3'],
    ['The Senate began voting on cloture on the nomination of X.', 'vote.opened', 'P2'],
    ['The Senate began a roll call vote on passage of S.4668.', 'vote.opened', 'P2'],
    ['The Senate is now voting on the motion to proceed.', 'vote.opened', 'P2'],
    ['The Senate is voting on the motion to proceed to S.J.Res. 199', 'vote.opened', 'P2'],
    ['By a party-line vote of 53-47, the Senate began voting on cloture', 'floor.action', 'P2'],
    ['By a vote of 77-22, the Senate passed S.4668.', 'floor.action', 'P2'],
    ['The Senate did not invoke cloture on the motion to proceed to H.R. 9340 by a tally of 57-43.', 'floor.action', 'P2'],
    ['The following bills, as amended, were passed en bloc:', 'floor.action', 'P2'],
    // Widened over the design's pattern (recorded result lines): 162959 "By a vote 52-47, …", 166464 "By voice vote, …".
    ['By a vote 52-47, the motion to waive the Budget Act was not agreed to.', 'floor.action', 'P2'],
    ['By voice vote, the Senate passed H.R.7250', 'floor.action', 'P2'],
    ['Majority Leader Thune spoke on his travels in South Dakota during the August recess.', 'floor.speaking', 'P3'],
    ['Senators Lankford and Merkley debated voter ID.', 'floor.action', 'P3'],
    ['Majority Leader Thune wrapped up for the evening.', 'floor.action', 'P3'],
    // Subject-anchored: a senator's sentence that mentions the Senate convening is not a convene.
    ['Senator X said the Senate convened too late.', 'floor.action', 'P3'],
  ])('typeEntry(%j) -> %s %s', (rest, type, tier) => {
    const t = typeEntry(rest)
    expect([t.event_type, t.tier]).toEqual([type, tier])
  })
})

describe('times (DESIGN §1.3, §3.5): resolved session day + clock as Eastern; never guessed', () => {
  test('167105 "9:29 p.m. The Senate began voting on confirmation …" -> 2026-10-01T01:29:00Z (= LIS vote 256 vote_date, scout)', () => {
    const e = byKey(parseOk(newest3()), 'pg_entry:daily:167105:2026-09-30T21:29:1')
    expect(e.event_type).toBe('vote.opened')
    expect(e.times).toEqual({ occurred_at: '2026-10-01T01:29:00Z', source_published_at: null, first_seen_at: NEWEST3_FETCHED })
    expect(e.result).toEqual({ session_date: '2026-09-30', clock_text: '9:29 p.m.', post_id: 167105 })
  })
  test('EST vs EDT: January entries are UTC-5 (156898 date_gmt 05:03Z = Jan 8 00:03 EST), September entries UTC-4', () => {
    const out = parseOk(est())
    expect(byKey(out, 'pg_entry:daily:156898:2026-01-08T16:30:1').times.occurred_at).toBe('2026-01-08T21:30:00Z')
    expect(byKey(out, 'pg_entry:daily:156898:2026-01-08T10:00:1').times.occurred_at).toBe('2026-01-08T15:00:00Z')
    expect(byKey(parseOk(newest3()), 'pg_entry:daily:167105:2026-09-30T10:15:1').times.occurred_at).toBe('2026-09-30T14:15:00Z')
  })
  test('ranges use their start: "5:50 – 6:35 p.m." -> 17:50, "3:15- 5:47 p.m." -> 15:15 (156674)', () => {
    const out = parseOk(est())
    expect(byKey(out, 'pg_entry:daily:156674:2026-01-06T17:50:1')).toMatchObject({ times: { occurred_at: '2026-01-06T22:50:00Z' }, result: { clock_text: '5:50 – 6:35 p.m.' } })
    expect(byKey(out, 'pg_entry:daily:156674:2026-01-06T15:15:1')).toMatchObject({ times: { occurred_at: '2026-01-06T20:15:00Z' }, result: { clock_text: '3:15- 5:47 p.m.' } })
  })
  test('a range takes the a.m. start when p.m. would put it after the end ("11:30 – 12:15 p.m.")', () => {
    const r = onePost({ date_gmt: '2026-09-30T12:40:42', title: 'Wednesday, September 30, 2026', content: html('11:30 – 12:15 p.m. Senators A and B spoke on C.') }, NEWEST3_FETCHED)
    expect(parseOk(r).events.map((e) => [e.object_key, e.times.occurred_at])).toEqual([['pg_entry:daily:900001:2026-09-30T11:30:1', '2026-09-30T15:30:00Z']])
  })
  test('two "12:37 p.m." entries (156674) get k = 1 (lower, older) and k = 2', () => {
    const out = parseOk(est())
    expect(byKey(out, 'pg_entry:daily:156674:2026-01-06T12:37:1').official_text).toBe('12:37 p.m. By a vote of 53-47, the Senate confirmed the nomination of Joshua Simmons to be General Counsel of the CIA.')
    expect(byKey(out, 'pg_entry:daily:156674:2026-01-06T12:37:2').official_text).toBe('12:37 p.m. The Senate stands in recess until 2:15 p.m.')
  })
  test('166855 same-minute pairs: 10:02 p.m. k=1 is the lower block ("clarified"), k=2 the upper ("spoke"); 9:41 p.m. has three', () => {
    const out = parseOk(ten())
    expect(byKey(out, 'pg_entry:daily:166855:2026-09-28T22:02:1').official_text).toMatch(/^10:02 p\.m\. Senator Cantwell clarified/)
    expect(byKey(out, 'pg_entry:daily:166855:2026-09-28T22:02:2').official_text).toBe('10:02 p.m. Senator Cantwell spoke on the Protect College Sports Act of 2026.')
    expect(byKey(out, 'pg_entry:daily:166855:2026-09-28T21:41:1').official_text).toBe('9:41 p.m. Senator Cantwell spoke in support of the Protect College Sports Act.')
    expect(byKey(out, 'pg_entry:daily:166855:2026-09-28T21:41:3').official_text).toBe('9:41 p.m. The Senate began a roll call vote on passage of S.4668, Protect College Sports Act of 2026, as amended.')
  })
  test('162959 midnight roll: 11:40 p.m. is June 4, 12:08 a.m. onward is June 5; keys keep the session date', () => {
    const out = parseOk(overnight())
    expect(byKey(out, 'pg_entry:daily:162959:2026-06-04T09:30:1').times.occurred_at).toBe('2026-06-04T13:30:00Z')
    expect(byKey(out, 'pg_entry:daily:162959:2026-06-04T23:40:1').times.occurred_at).toBe('2026-06-05T03:40:00Z')
    expect(byKey(out, 'pg_entry:daily:162959:2026-06-04T00:08:1').times.occurred_at).toBe('2026-06-05T04:08:00Z')
    const adj = byKey(out, 'pg_entry:daily:162959:2026-06-04T05:15:1')
    expect(adj.event_type).toBe('floor.adjourned')
    expect(adj.times.occurred_at).toBe('2026-06-05T09:15:00Z')
    expect(adj.related).toEqual([{ rel: 'about', key: 'floor_day:senate:2026-06-04' }])
    // "The above happened on Friday, June 5th." is the 12:08 a.m. entry's continuation; the em-dash rule ends it.
    expect(byKey(out, 'pg_entry:daily:162959:2026-06-04T00:08:1').official_text).toMatch(/The above happened on Friday, June 5th\.$/)
  })
  test('162959 out-of-order typo: "10:30 p.m." between 10:57 and 11:40 -> occurred_at null, the walk goes on from 10:57', () => {
    const out = parseOk(overnight())
    const typo = byKey(out, 'pg_entry:daily:162959:2026-06-04T22:30:1')
    expect(typo.times.occurred_at).toBeNull()
    expect((typo.result as Record<string, unknown>).time_note).toBe('clock out of order (earlier than the entry logged before it)')
    expect(byKey(out, 'pg_entry:daily:162959:2026-06-04T22:57:1').times.occurred_at).toBe('2026-06-05T02:57:00Z')
    expect(out.events.filter((e) => e.times.occurred_at === null)).toHaveLength(1)
  })
  test('fall back (Nov 1 2026): 1:30 a.m. is ambiguous -> null; 2:30 a.m. EST -> 07:30Z; 11:50 p.m. EDT the night before -> 03:50Z', () => {
    const r = onePost({
      date_gmt: '2026-10-31T13:00:00', title: 'Saturday, October 31, 2026',
      content: html('2:30 a.m. The Senate adjourned.', '1:30 a.m. Senator X spoke on Y.', '11:50 p.m. Senator Z spoke on W.', '10:00 a.m. The Senate convened.'),
    }, '2026-11-02T00:00:00.000Z')
    const out = parseOk(r)
    expect(out.events.map((e) => [e.object_key, e.times.occurred_at, (e.result as Record<string, unknown>).time_note ?? null])).toEqual([
      ['pg_entry:daily:900001:2026-10-31T02:30:1', '2026-11-01T07:30:00Z', null],
      ['pg_entry:daily:900001:2026-10-31T01:30:1', null, 'ambiguous Eastern wall time (fall-back hour)'],
      ['pg_entry:daily:900001:2026-10-31T23:50:1', '2026-11-01T03:50:00Z', null],
      ['pg_entry:daily:900001:2026-10-31T10:00:1', '2026-10-31T14:00:00Z', null],
    ])
  })
  test('spring forward (Mar 8 2026): 2:30 a.m. does not exist -> null; 3:30 a.m. EDT -> 07:30Z', () => {
    const r = onePost({
      date_gmt: '2026-03-07T14:00:00', title: 'Saturday, March 7, 2026',
      content: html('3:30 a.m. The Senate adjourned.', '2:30 a.m. Senator X spoke on Y.', '11:50 p.m. Senator Z spoke on W.', '10:00 a.m. The Senate convened.'),
    }, '2026-03-09T00:00:00.000Z')
    const out = parseOk(r)
    expect(out.events.map((e) => [e.times.occurred_at, (e.result as Record<string, unknown>).time_note ?? null])).toEqual([
      ['2026-03-08T07:30:00Z', null],
      [null, 'Eastern wall time does not exist (spring-forward gap)'],
      ['2026-03-08T04:50:00Z', null],
      ['2026-03-07T15:00:00Z', null],
    ])
  })
  test('a time later than our own fetch is never published as occurred_at', () => {
    const out = parseOk(variant(newest3(), { fetchedAt: '2026-09-30T20:00:00.000Z' }))
    const late = byKey(out, 'pg_entry:daily:167105:2026-09-30T21:29:1')
    expect(late.times.occurred_at).toBeNull()
    expect((late.result as Record<string, unknown>).time_note).toBe('later than our own fetch')
    expect(byKey(out, 'pg_entry:daily:167105:2026-09-30T15:54:1').times.occurred_at).toBe('2026-09-30T19:54:00Z')
  })
})

describe('session day (DESIGN §3.5)', () => {
  test.each([
    ['Wednesday, September 30, 2026', '2026-09-30', '2026-09-30'],
    // 166515: Sept 16 2026 was a Wednesday; posted Thursday the 17th at 00:01 -> the post's day.
    ['Thursday, September 16, 2026', '2026-09-17', '2026-09-17'],
    // 162959: a two-day title reads as its first date; no year printed -> the post's year.
    ['Thursday, June 4/Friday June 5, 2026', '2026-06-04', '2026-06-04'],
    // A wrong printed year: retried with the post's year.
    ['Thursday, October 1, 2025', '2026-10-01', '2026-10-01'],
    ['Monday, October 5th, 2026', '2026-10-05', '2026-10-05'],
    ['October 1', '2026-10-01', '2026-10-01'],
    // A day posted early or late inside -14..+7.
    ['Thursday, September 17, 2026', '2026-10-01', '2026-09-17'],
    ['Thursday, October 8, 2026', '2026-10-01', '2026-10-08'],
  ])('%j posted %s -> %s', (title, postDay, day) => {
    expect(resolveSessionDay(title, postDay)).toMatchObject({ kind: 'day', date: day })
  })
  test.each([
    ['Friday, October 9, 2026', '2026-10-01'], // +8 days, weekday not the post's
    ['Thursday, September 10, 2026', '2026-10-01'], // -21 days
    ['Monday, October 1, 2026', '2026-10-01'], // Oct 1 2026 is a Thursday, and so is the post's day: no rule fits
  ])('%j posted %s -> hold', (title, postDay) => {
    expect(resolveSessionDay(title, postDay).kind).toBe('hold')
  })
  test.each(['*Postponed Standing Committee of Correspondents’ Meeting Postponed*', 'Senate Floor Log', 'Meeting moved to Monday, October 5'])('%j -> not a date', (title) => {
    expect(resolveSessionDay(title, '2026-10-01')).toEqual({ kind: 'not_a_date' })
  })
  test('a held post gives zero events and is named in the health detail; the other posts still publish (not drift)', () => {
    const r = posts(newest3(), (ps) => { (ps[0] as Record<string, any>).title.rendered = 'Friday, October 9, 2026' })
    const out = parseOk(r)
    expect(ofPost(out, 167288)).toEqual([])
    expect(ofPost(out, 167105)).toHaveLength(47)
    expect(out.health.detail).toContain('post 167288 held: title "Friday, October 9, 2026" does not resolve to a day near the post\'s date 2026-10-01')
  })
})

describe('k stability and idempotence', () => {
  test('a new timed block prepended to 167105 leaves every old dedup_key unchanged and adds exactly one', () => {
    const before = parseOk(newest3()).events.map((e) => e.dedup_key)
    const r = posts(newest3(), (ps) => { (ps[1] as Record<string, any>).content.rendered = `<p>11:30 p.m. Senator New spoke on a late topic.</p>\n${(ps[1] as Record<string, any>).content.rendered}` })
    const after = parseOk(r).events.map((e) => e.dedup_key)
    expect(after.filter((k) => !before.includes(k))).toEqual(['pg_entry:daily:167105:2026-09-30T23:30:1#logged'])
    expect(before.every((k) => after.includes(k))).toBe(true)
  })
  test('a new block with the SAME minute as the newest entry (11:24 p.m.) takes k = 2; the old 11:24 p.m. keeps k = 1', () => {
    const before = parseOk(newest3()).events.map((e) => e.dedup_key)
    const r = posts(newest3(), (ps) => { (ps[1] as Record<string, any>).content.rendered = `<p>11:24 p.m. Senator New spoke.</p>${(ps[1] as Record<string, any>).content.rendered}` })
    const out = parseOk(r)
    expect(out.events.map((e) => e.dedup_key).filter((k) => !before.includes(k))).toEqual(['pg_entry:daily:167105:2026-09-30T23:24:2#logged'])
    expect(byKey(out, 'pg_entry:daily:167105:2026-09-30T23:24:1').official_text).toBe('11:24 p.m. The Senate adjourned.')
  })
  test('parsing the same response twice gives identical output', () => {
    expect(parseOk(newest3())).toEqual(parseOk(newest3()))
  })
})

describe('NEGATIVE and empty fixtures', () => {
  test('dailypress_post_999999999_NEGATIVE_404_rest_post_invalid_id.json -> error, zero events', () => {
    expectRefused(replay(S, '2026-10-03', 'dailypress_post_999999999_NEGATIVE_404_rest_post_invalid_id.json'), 'error', /^HTTP 404$/)
  })
  test('dailypress_post_999999999_envelope_NEGATIVE_200_error_body.json (a 200 carrying a WordPress error) -> drift', () => {
    expectRefused(replay(S, '2026-10-03', 'dailypress_post_999999999_envelope_NEGATIVE_200_error_body.json'), 'drift', /JSON object \(WordPress error "rest_post_invalid_id"\), not the posts array/)
  })
  test('dailypress_posts_after_2026-10-02_EMPTY.json ([] on the production endpoint id) -> drift', () => {
    const r = replay(S, '2026-10-03', 'dailypress_posts_after_2026-10-02_EMPTY.json')
    expect(r.body).toBe('[]')
    expectRefused(r, 'drift', /newest-posts list is empty/)
  })
  test('dailypress_post_56415_announcement_not_floor_log.json as a one-element array -> skipped, health ok with a note', () => {
    const out = parseOk(wrapped('dailypress_post_56415_announcement_not_floor_log.json'))
    expect(out.events).toEqual([])
    expect(out.health).toEqual({ source_id: S, endpoint: 'daily_posts', status: 'ok', detail: '1 posts, 0 floor logs, 0 entries; post 56415 skipped: its title is not a date, so it is not a floor log', items_seen: 1 })
  })
})

describe('fail closed: any unexpected structure = drift, zero events from the payload', () => {
  test('HTTP 304 -> not_modified; 500 -> error; an unknown endpoint id -> error', () => {
    expectRefused(variant(newest3(), { status: 304, body: '' }), 'not_modified', /304/)
    expectRefused(variant(newest3(), { status: 500 }), 'error', /HTTP 500/)
    const out = parseDailyPosts('periodical_posts', newest3())
    expect(out.events).toEqual([])
    expect(out.health.status).toBe('error')
  })
  test('an HTML "File Not Found" page with 200 -> drift (by content-type, and by body when the type says JSON)', () => {
    const page = '<!DOCTYPE html><html><head><title>File Not Found</title></head><body>File Not Found</body></html>'
    expectRefused(variant(newest3(), { body: page, headers: { 'content-type': 'text/html; charset=UTF-8' } }), 'drift', /HTML page/)
    expectRefused(variant(newest3(), { body: page }), 'drift', /not JSON/)
    expectRefused(variant(newest3(), { headers: { 'content-type': 'text/plain' } }), 'drift', /content-type/)
  })
  test('a date_gmt that already carries a Z (the shape changed) -> drift', () => {
    expectRefused(variant(newest3(), { body: edit(newest3().body, '"date_gmt":"2026-09-30T12:40:42"', '"date_gmt":"2026-09-30T12:40:42Z"') }), 'drift', /post 167105: date_gmt "2026-09-30T12:40:42Z"/)
  })
  test.each<[string, (p: Record<string, any>) => void, RegExp]>([
    ['no id', (p) => { delete p.id }, /no integer id/],
    ['a string id', (p) => { p.id = '167105' }, /no integer id/],
    ['modified_gmt missing', (p) => { delete p.modified_gmt }, /modified_gmt/],
    ['status future', (p) => { p.status = 'future' }, /status "future"/],
    ['type page', (p) => { p.type = 'page' }, /type "page"/],
    ['link on another host', (p) => { p.link = 'https://www.senate.gov/wednesday-september-30-2026/' }, /not https on www\.dailypress\.senate\.gov/],
    ['link over http', (p) => { p.link = 'http://www.dailypress.senate.gov/wednesday-september-30-2026/' }, /not https/],
    ['title not rendered', (p) => { p.title = 'Wednesday, September 30, 2026' }, /no title\.rendered/],
    ['content missing', (p) => { delete p.content }, /no content\.rendered/],
    ['content password-protected', (p) => { p.content.protected = true }, /password-protected/],
  ])('post 167105 with %s -> drift', (_, patch, detail) => {
    expectRefused(posts(newest3(), (ps) => { patch(ps[1] as Record<string, any>) }), 'drift', detail)
  })
  test('a duplicate post id in one payload -> drift', () => {
    expectRefused(posts(newest3(), (ps) => [ps[0], ps[1], ps[1]]), 'drift', /duplicate post id 167105/)
  })
  test('a post that is not an object -> drift', () => {
    expectRefused(posts(newest3(), (ps) => [ps[0], 'x']), 'drift', /item 2: not an object/)
  })
  test.each([
    ['a heading', '<h2>Floor log</h2>', /unexpected <h2> at the top level/],
    ['a table', '<table><tr><td>1</td></tr></table>', /unexpected <table>/],
    ['a div inside a paragraph', '<p>10:00 a.m. <div>x</div></p>', /unexpected <div> inside <p>/],
    ['bare text between blocks', 'stray text', /text outside a paragraph/],
  ])('HTML with %s in a floor log -> drift', (_, extra, detail) => {
    expectRefused(posts(newest3(), (ps) => { const p = ps[1] as Record<string, any>; p.content.rendered = `${extra} ${p.content.rendered}` }), 'drift', detail)
  })
  test('HTML ending inside an unclosed paragraph -> drift', () => {
    expectRefused(posts(newest3(), (ps) => { (ps[1] as Record<string, any>).content.rendered += '<p>10:00 a.m. The Senate convened.' }), 'drift', /unclosed <p>/)
  })
  test('a clock line inside the schedule part makes that post ambiguous: held (zero events from it), not drift', () => {
    const r = posts(newest3(), (ps) => {
      const p = ps[0] as Record<string, any>
      p.content.rendered = edit(p.content.rendered, 'No business is expected. </p>', 'No business is expected. </p> <p>4:00 p.m. Senator X spoke.</p>')
    })
    const out = parseOk(r)
    expect(ofPost(out, 167288)).toEqual([])
    expect(out.health.detail).toContain('post 167288 held: block 3 is a clock line inside the schedule part')
  })
  test('an official_text longer than 4000 characters is cut to 4000 (schema bound) and still validates', () => {
    const r = onePost({ date_gmt: '2026-09-30T12:40:42', title: 'Wednesday, September 30, 2026', content: html('10:15 a.m. The Senate convened.', 'x'.repeat(5000)) }, NEWEST3_FETCHED)
    const e = parseOk(r).events[0] as CedEvent
    expect(e.official_text).toHaveLength(4000)
    expect(e.official_text.endsWith('…')).toBe(true)
  })
})

describe('building blocks', () => {
  test('scanBlocks: <p> and <li> in order, <br> -> space, entities decoded, comments ignored, nested list = one block', () => {
    const r = scanBlocks('<!-- wp:x --><p>a&nbsp;b<br>c &#8211; d &amp; e</p>\n<ol><li>one<ul><li>inner</li></ul></li><li>two</li></ol>')
    expect(r).toEqual({ ok: true, blocks: [{ tag: 'p', text: 'a b c – d & e' }, { tag: 'li', text: 'one inner' }, { tag: 'li', text: 'two' }] })
  })
  test('scanBlocks refuses a <ul> directly inside a <ul> item list and a <p> inside an <li>', () => {
    expect(scanBlocks('<ul><ul><li>x</li></ul></ul>').ok).toBe(false)
    expect(scanBlocks('<ul><li><p>x</p></li></ul>').ok).toBe(false)
  })
  test('cutEntries: separators are *** (3+) or an em-dash rule (162959: 58 em dashes and one hyphen); two stars are not', () => {
    const b = (text: string) => ({ tag: 'p' as const, text })
    const r = cutEntries([b('10:01 a.m. A spoke.'), b('cont'), b('———-'), b('10:00 a.m. B spoke.'), b('**'), b('more')])
    expect(r.ok && r.entries.map((e) => [e.text, e.continuation])).toEqual([['10:01 a.m. A spoke.', ['cont']], ['10:00 a.m. B spoke.', ['**', 'more']]])
  })
  test('cutEntries: a "The Senate will" / "At 5:30" / "Following" block ends the continuation; untimed blocks after it are schedule', () => {
    const b = (text: string) => ({ tag: 'p' as const, text })
    for (const stop of ['The Senate will convene at 10.', 'At 5:30 p.m. a vote.', 'Following leader remarks, a vote.']) {
      const r = cutEntries([b('10:01 a.m. A spoke.'), b('cont'), b(stop), b('after')])
      expect(r.ok && r.entries.map((e) => e.continuation)).toEqual([['cont']])
    }
  })
})
