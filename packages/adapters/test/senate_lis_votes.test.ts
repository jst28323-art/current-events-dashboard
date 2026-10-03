// senate.lis.votes adapter (scratch/phase2/DESIGN.md §3.2, §2): goldens for every vote fixture the design lists, the
// menu's targets, the NEGATIVE fixtures, and every non-default and fail-closed case on in-memory variants of the
// recorded bytes (fixtures are never edited; TESTING.md rule 1). Every output passes expectHubPayloadRules, which runs
// validateVoteEvent on vote.result events, validateMemberVotes on records and checkVotePair on each pair; the vote
// helpers below also call those three directly.
//
// Goldens: test/golden/senate.lis.votes/*.json, compared byte-for-byte (the fr_api.test.ts pattern; one member
// position per line). Regenerate only on purpose with UPDATE_GOLDEN=1 and re-check the diff by hand against the
// fixture; the hand-written expectations next to each golden must still pass on their own.
import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CedEvent } from '@ced/schema'
import { checkVotePair, validateMemberVotes, validateVoteEvent, type MemberVotesRecord } from '@ced/schema/v02'
import {
  MENU_URL, SENATE_VOTES_PARSER, VOTE_URL_PATTERN, parseVote, passedOf, senateLisVotes, voteUrl,
} from '../src/sources/senate_lis_votes.js'
import { MEMBERS, MEMBERS_MAP, makeLookup, type MembersLookup, type ParseVoteOptions } from '../src/lib/members.js'
import type { AdapterOutput, FetchedResponse } from '../src/types.js'
import { expectHubPayloadRules } from './payload_rules.js'
import { replay, variant } from './replay.js'

const SRC = 'senate.lis.votes'
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden', SRC)
const OLD: ParseVoteOptions = { members: MEMBERS, maxUnresolved: 100 } // the old-Congress goldens only (DESIGN §2.2)

const v1002 = (name: string) => replay(SRC, '2026-10-02', name)
const v1003 = (name: string) => replay(SRC, '2026-10-03', name)
const vote256 = () => v1002('vote_119_2_00256.xml')
const menu = () => v1002('vote_menu_119_2.xml')

/** JSON with 2-space indent, except that each member position sits on one line (small, reviewable goldens). */
function serialize(value: unknown): string {
  const json = JSON.stringify(value, (k, v) => (k === 'positions' && Array.isArray(v) ? v.map((p) => `\u0000${JSON.stringify(p)}\u0000`) : v), 2)
  return `${json.replace(/"\\u0000(.*)\\u0000"/g, (_m, s: string) => JSON.parse(`"${s}"`) as string)}\n`
}

function golden(name: string, out: AdapterOutput): void {
  const text = serialize(out)
  expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(out))) // the serializer itself loses nothing
  const path = join(GOLDEN_DIR, name)
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN_DIR, { recursive: true })
    writeFileSync(path, text)
  }
  expect(existsSync(path), `missing golden ${path}: run with UPDATE_GOLDEN=1, then review it`).toBe(true)
  expect(text).toBe(readFileSync(path, 'utf8'))
}

/** A vote parse that must publish: one valid event + its record, paired, payload rules held. */
function voteOk(res: FetchedResponse, opts?: ParseVoteOptions): { out: AdapterOutput; ev: CedEvent; rec: MemberVotesRecord } {
  const out = opts ? parseVote('vote', res, opts) : parseVote('vote', res)
  expect(out.health.status, out.health.detail).toBe('ok')
  expect(out.events).toHaveLength(1)
  expect(out.records).toHaveLength(1)
  expect(out.targets).toBeUndefined()
  const ev = out.events[0]!
  const rec = out.records![0]!
  expect(validateVoteEvent(ev).errors).toEqual([])
  expect(validateMemberVotes(rec).errors).toEqual([])
  expect(checkVotePair(ev, rec).errors).toEqual([])
  expectHubPayloadRules(senateLisVotes, out, res)
  return { out, ev, rec }
}

/** A payload refused whole: zero events, records and targets, and the given status. */
function refused(endpoint: 'vote' | 'menu', res: FetchedResponse, status: string, detail: RegExp, opts?: ParseVoteOptions): AdapterOutput {
  const out = opts ? parseVote(endpoint, res, opts) : parseVote(endpoint, res)
  expect(out.events).toEqual([])
  expect(out.records).toBeUndefined()
  expect(out.targets).toBeUndefined()
  expect(out.health.status, out.health.detail).toBe(status)
  expect(out.health.detail).toMatch(detail)
  expectHubPayloadRules(senateLisVotes, out, res)
  return out
}

function edit(body: string, from: string | RegExp, to: string): string {
  const out = body.replace(from, to)
  if (out === body) throw new Error(`variant edit did not apply: ${String(from)}`)
  return out
}
const withBody = (res: FetchedResponse, f: (b: string) => string): FetchedResponse => variant(res, { body: f(res.body) })

/** A lookup that hides some LIS ids (a stale member list), else the committed map. */
function hiding(ids: readonly string[]): MembersLookup {
  const hidden = new Set(ids)
  return { lookupHouse: MEMBERS.lookupHouse, lookupSenate: (l) => (hidden.has(l) ? null : MEMBERS.lookupSenate(l)), meta: MEMBERS.meta }
}

describe('source definition', () => {
  test('endpoints, cadence, budget and SLO from DESIGN §3.2; parse uses the default options', () => {
    expect(senateLisVotes.source_id).toBe('senate.lis.votes')
    expect(senateLisVotes.endpoints.map((e) => e.id)).toEqual(['menu', 'vote'])
    expect(senateLisVotes.endpoints[0]).toEqual({ id: 'menu', url: MENU_URL, validator: 'if-modified-since', cadence: { business_s: 60, off_s: 300 } })
    expect(senateLisVotes.endpoints[1]?.dynamic).toEqual({ from: 'menu', urlPattern: VOTE_URL_PATTERN, maxTargets: 10 })
    expect(senateLisVotes.freshness_slo_s).toBe(120)
    expect(senateLisVotes.rate_budget_per_h).toBe(110)
    expect(SENATE_VOTES_PARSER).toBe('senate_lis_votes@0.1.0')
    expect(voteUrl('00256')).toBe('https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00256.xml')
    expect(senateLisVotes.parse('vote', vote256())).toEqual(parseVote('vote', vote256()))
    // the defaults are maxUnresolved 5: an old-Congress vote drifts through parse() and publishes with OLD
    const old = v1003('vote_115_2_00223.xml')
    expect(senateLisVotes.parse('vote', old).health.status).toBe('drift')
    expect(parseVote('vote', old, OLD).health.status).toBe('ok')
  })

  test('an unknown endpoint id is an error, never a parse', () => {
    const out = parseVote('roll', vote256())
    expect(out).toEqual({ events: [], health: { source_id: SRC, endpoint: 'roll', status: 'error', detail: 'unknown endpoint "roll"', items_seen: 0 } })
  })
})

describe('goldens: vote XML', () => {
  test('2026-10-02/vote_119_2_00256.xml: confirmation P0, 12 not voting, EDT', () => {
    const res = vote256()
    const { out, ev, rec } = voteOk(res)
    expect(ev.title).toBe('Senate confirmed nomination PN1129, 47-41 (roll call 256)')
    expect(ev.official_text).toBe('On the Nomination PN1129 - Nomination Confirmed (47-41)')
    expect(ev.object_key).toBe('vote:senate:119:2:256')
    expect(ev.dedup_key).toBe('vote:senate:119:2:256#result')
    expect(ev.thread_key).toBe('nomination:119:PN1129')
    expect(ev.related).toEqual([{ rel: 'about', key: 'nomination:119:PN1129' }])
    expect(ev.member_votes_ref).toBe('votes/senate/119/2/256.json')
    expect(ev.importance).toEqual({ tier: 'P0', reasons: ['confirmation'] })
    expect(ev).toMatchObject({ event_type: 'vote.result', status: 'ended', branch: 'legislative', body: 'senate', features: ['F5', 'F6'], revision: 1 })
    expect(ev.provenance).toEqual({ parser: 'senate_lis_votes@0.1.0', confidence: 'high' })
    // September 30, 2026,  09:29 PM EDT and 11:25 PM (DESIGN §1.3, opened)
    expect(ev.times).toEqual({ occurred_at: '2026-10-01T01:29:00Z', scheduled_for: null, source_published_at: '2026-10-01T03:25:00Z', first_seen_at: res.fetchedAt })
    expect(ev.result).toMatchObject({ question: 'On the Nomination', question_kind: 'nomination', result_text: 'Nomination Confirmed', required: '1/2', passed: true, yea: 47, nay: 41, present: 0, not_voting: 12, tie_breaker: null, amendment: null })
    expect(ev.result?.documents).toEqual([{ congress: 119, type: 'PN', number: '1129' }])
    expect(ev.sources).toEqual([{ source_id: SRC, url: res.url, retrieved_at: res.fetchedAt, license: 'us-gov-public-domain', affiliation: 'official-nonpartisan' }])
    expect(rec.positions).toHaveLength(100)
    expect(rec.unresolved).toBe(0)
    expect(rec.members_map).toEqual(MEMBERS.meta)
    // S441 is Darline Graham, never joined by name to S293 Lindsey Graham ("Graham (R-SC)" both; DESIGN §2.2)
    expect(rec.positions.find((p) => p.lis === 'S441')).toMatchObject({ member_key: 'bioguide:G000608', name: 'Darline Graham', source_name: 'Graham (R-SC)', party: 'R', state: 'SC', id_confidence: 'mapped', name_source: 'map' })
    expect(rec.positions[0]).toEqual({ member_key: 'bioguide:A000382', id_confidence: 'mapped', lis: 'S428', name: rec.positions[0]!.name, name_source: 'map', source_name: 'Alsobrooks (D-MD)', party: 'D', state: 'MD', role: null, position: 'nay', vote_text: 'Nay', pair: null })
    expect(out.health).toEqual({ source_id: SRC, endpoint: 'vote', status: 'ok', detail: 'roll call 256 (119-2): 100 members; all in the member list', items_seen: 1 })
    golden('vote_119_2_00256.json', out)
  })

  test('vote_119_2_00009.xml: Vice President breaks a 50-50 tie, passed true; EST; empty <absent/>', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00009.xml'))
    expect(ev.title).toBe('Senate upheld a point of order on S.J.Res. 98, 50-50, the Vice President breaking the tie (roll call 9)')
    expect(ev.result).toMatchObject({ question_kind: 'point_of_order', result_text: 'Point of Order Well Taken', passed: true, yea: 50, nay: 50, present: 0, not_voting: 0, tie_breaker: { by: 'Vice President of the United States', vote: 'Yea' } })
    expect(ev.importance).toEqual({ tier: 'P3', reasons: ['procedural'] })
    // January 14, 2026,  05:51 PM EST = -05:00
    expect(ev.times.occurred_at).toBe('2026-01-14T22:51:00Z')
    expect(ev.times.source_published_at).toBe('2026-01-14T23:44:00Z')
    expect(ev.thread_key).toBe('bill:119:sjres:98')
    expect(ev.related).toBeUndefined()
    golden('vote_119_2_00009.json', out)
  })

  test('vote_119_2_00122.xml: a 50-50 tie with no tie breaker is rejected; S293 resolves only through the departed seed', () => {
    const { out, ev, rec } = voteOk(v1003('vote_119_2_00122.xml'))
    expect(ev.title).toBe('Senate rejected a motion to take up S.J.Res. 141 on a 50-50 tie (roll call 122)')
    expect(ev.result).toMatchObject({ question_kind: 'motion', passed: false, yea: 50, nay: 50, tie_breaker: null })
    expect(rec.positions.find((p) => p.lis === 'S293')).toMatchObject({ member_key: 'bioguide:G000359', id_confidence: 'mapped', source_name: 'Graham (R-SC)' })
    expect(rec.unresolved).toBe(0)
    golden('vote_119_2_00122.json', out)
  })

  test('vote_119_2_00254.xml: 3/5 cloture fails at 57-43 (yea > nay, passed false); 12:51 PM', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00254.xml'))
    expect(ev.title).toBe('Senate did not invoke cloture on the motion to take up H.R. 9340, 57-43; three-fifths needed (roll call 254)')
    expect(ev.result).toMatchObject({ question_kind: 'cloture', required: '3/5', passed: false, yea: 57, nay: 43 })
    expect(ev.importance).toEqual({ tier: 'P1', reasons: ['cloture'] })
    expect(ev.times.occurred_at).toBe('2026-09-30T16:51:00Z') // 12 PM = hour 12
    golden('vote_119_2_00254.json', out)
  })

  test('vote_119_2_00255.xml: cloture by simple majority on a nomination', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00255.xml'))
    expect(ev.title).toBe('Senate invoked cloture on nomination PN1129, 53-47 (roll call 255)')
    expect(ev.result).toMatchObject({ required: '1/2', passed: true })
    expect(ev.thread_key).toBe('nomination:119:PN1129')
    golden('vote_119_2_00255.json', out)
  })

  test('vote_119_2_00250.xml: a bill passed (P0 final passage)', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00250.xml'))
    expect(ev.title).toBe('Senate passed S. 4668, 77-22 (roll call 250)')
    expect(ev.importance).toEqual({ tier: 'P0', reasons: ['final_passage'] })
    expect(ev.thread_key).toBe('bill:119:s:4668')
    golden('vote_119_2_00250.json', out)
  })

  test('vote_119_2_00249.xml: an amendment vote titles the amendment, "on" the underlying measure', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00249.xml'))
    expect(ev.title).toBe('Senate rejected amendment S.Amdt. 6835 (on S. 4668), 47-52 (roll call 249)')
    expect(ev.importance).toEqual({ tier: 'P2', reasons: ['amendment'] })
    expect(ev.thread_key).toBe('bill:119:s:4668')
    expect(ev.result?.amendment).toEqual({ number: 'S.Amdt. 6835', to_amendment: 'S.Amdt. 6776', to_amendment_to_amendment: null, to_document: 'S. 4668' })
    golden('vote_119_2_00249.json', out)
  })

  test('vote_119_2_00252.xml: a motion to discharge', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00252.xml'))
    expect(ev.title).toBe('Senate rejected a motion to discharge S.Res. 852, 47-51 (roll call 252)')
    expect(ev.importance).toEqual({ tier: 'P3', reasons: ['procedural'] })
    golden('vote_119_2_00252.json', out)
  })

  test('vote_119_2_00225.xml: 74 nominations en bloc (74 root-level <document> pairs), related to all 74, no thread', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00225.xml'))
    expect(ev.title).toBe('Senate confirmed 74 nominations en bloc, 51-47 (roll call 225)')
    expect(ev.thread_key).toBeUndefined()
    expect(ev.related).toHaveLength(74)
    expect(ev.related?.[0]).toEqual({ rel: 'about', key: 'nomination:119:PN730-11' }) // partition kept as printed
    expect(ev.related?.every((r) => r.rel === 'about' && /^nomination:119:PN[0-9]+(-[0-9]+)?$/.test(r.key))).toBe(true)
    expect(new Set(ev.related?.map((r) => r.key)).size).toBe(74)
    expect(ev.result?.documents).toHaveLength(74)
    expect(ev.importance).toEqual({ tier: 'P0', reasons: ['confirmation'] })
    golden('vote_119_2_00225.json', out)
  })

  test('vote_119_2_00096.xml: 12:31 AM -> 04:31Z (12 AM = hour 0); modified 6 days later; 3/5 motion on an amendment', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00096.xml'))
    expect(ev.title).toBe('Senate rejected a motion on amendment S.Amdt. 5414 (on S.Con.Res. 33), 48-50; three-fifths needed (roll call 96)')
    expect(ev.times.occurred_at).toBe('2026-04-23T04:31:00Z')
    expect(ev.times.source_published_at).toBe('2026-04-29T23:13:00Z')
    expect(ev.thread_key).toBe('bill:119:sconres:33')
    golden('vote_119_2_00096.json', out)
  })

  test('vote_119_2_00105.xml: 03:22 AM; a concurrent resolution adopted (P1)', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00105.xml'))
    expect(ev.times.occurred_at).toBe('2026-04-23T07:22:00Z')
    expect(ev.title).toBe('Senate adopted S.Con.Res. 33, 50-48 (roll call 105)')
    expect(ev.importance).toEqual({ tier: 'P1', reasons: ['resolution'] })
    golden('vote_119_2_00105.json', out)
  })

  test('vote_119_2_00084.xml: a joint resolution passed (P0)', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00084.xml'))
    expect(ev.title).toBe('Senate passed H.J.Res. 140, 50-49 (roll call 84)')
    expect(ev.result).toMatchObject({ question_kind: 'passage', passed: true })
    expect(ev.importance).toEqual({ tier: 'P0', reasons: ['final_passage'] })
    expect(ev.thread_key).toBe('bill:119:hjres:140')
    golden('vote_119_2_00084.json', out)
  })

  test('vote_119_2_00240.xml: cloture on a substitute amendment is titled on the amendment (critique T2)', () => {
    const { out, ev } = voteOk(v1003('vote_119_2_00240.xml'))
    expect(ev.title).toBe('Senate invoked cloture on amendment S.Amdt. 6776 (on S. 4668), 70-21; three-fifths needed (roll call 240)')
    expect(ev.thread_key).toBe('bill:119:s:4668')
    golden('vote_119_2_00240.json', out)
  })

  test('vote_115_2_00223.xml: "Present, Giving Live Pair" (attributes on <vote_cast>) counts as present, pair kept; 35 unresolved (37 without the departed seed)', () => {
    const res = v1003('vote_115_2_00223.xml')
    const { out, ev, rec } = voteOk(res, OLD)
    expect(ev.title).toBe('Senate confirmed nomination PN2259, 50-48 (roll call 223)')
    expect(ev.result).toMatchObject({ yea: 50, nay: 48, present: 1, not_voting: 1, passed: true })
    const murkowski = rec.positions.find((p) => p.lis === 'S288')!
    expect(murkowski).toMatchObject({ position: 'present', vote_text: 'Present, Giving Live Pair', pair: 'S375', member_key: 'bioguide:M001153' })
    expect(rec.unresolved).toBe(35) // DESIGN §2.2 counted 37 against the current roster; the seed resolves S293 and S350
    // unresolved positions keep honest lis: keys and the XML's own name (no synthetic ids)
    const u = rec.positions.filter((p) => p.id_confidence === 'unresolved')
    expect(u).toHaveLength(35)
    expect(u.every((p) => p.member_key === `lis:${p.lis}` && p.name_source === 'source')).toBe(true)
    golden('vote_115_2_00223.json', out)
    refused('vote', res, 'drift', /35 members not in the member list \(more than 5\): member list stale or wrong/)
  })

  test('vote_117_1_00059.xml: Guilty / Not Guilty counted as yeas / nays; "Not Guilty" is false (suffix trap); 20 unresolved (22 without the departed seed)', () => {
    const res = v1003('vote_117_1_00059.xml')
    const { out, ev, rec } = voteOk(res, OLD)
    expect(ev.title).toBe('Senate acquitted on H.Res. 24, 57-43; two-thirds needed (roll call 59)')
    expect(ev.result).toMatchObject({ question_kind: 'impeachment_verdict', result_text: 'Not Guilty', required: '2/3', passed: false, yea: 57, nay: 43, present: 0, not_voting: 0 })
    expect(ev.importance).toEqual({ tier: 'P1', reasons: ['impeachment_verdict'] })
    expect(rec.positions.filter((p) => p.vote_text === 'Guilty').every((p) => p.position === 'yea')).toBe(true)
    expect(rec.positions.filter((p) => p.vote_text === 'Not Guilty').every((p) => p.position === 'nay')).toBe(true)
    expect(rec.unresolved).toBe(20) // DESIGN §2.2 counted 22 against the current roster; the seed resolves S293 and S350
    golden('vote_117_1_00059.json', out)
    refused('vote', res, 'drift', /20 members not in the member list \(more than 5\)/)
  })

  test('vote_116_2_00292.xml: veto overridden (P0), two-thirds', () => {
    const res = v1003('vote_116_2_00292.xml')
    const { out, ev, rec } = voteOk(res, OLD)
    expect(ev.title).toBe('Senate overrode the veto of H.R. 6395, 81-13; two-thirds needed (roll call 292)')
    expect(ev.importance).toEqual({ tier: 'P0', reasons: ['veto_override'] })
    expect(ev.result).toMatchObject({ question_kind: 'veto_override', result_text: 'Veto Overridden', passed: true, required: '2/3' })
    expect(ev.thread_key).toBe('bill:116:hr:6395')
    expect(ev.times.occurred_at).toBe('2021-01-01T18:38:00Z')
    expect(rec.unresolved).toBe(29)
    golden('vote_116_2_00292.json', out)
    refused('vote', res, 'drift', /29 members not in the member list \(more than 5\)/)
  })

  test('members/senate_vote_119_2_00063: S293 and S419 resolve only with the departed-member seed', () => {
    const res = replay('members', '2026-10-03', 'senate_vote_119_2_00063_departed_members_S293_S419.xml')
    const { out, rec } = voteOk(res)
    expect(rec.unresolved).toBe(0)
    expect(rec.positions.find((p) => p.lis === 'S293')?.member_key).toBe('bioguide:G000359')
    expect(rec.positions.find((p) => p.lis === 'S419')?.member_key).toBe('bioguide:M001190')
    golden('senate_vote_119_2_00063.json', out)
    // The same vote against a map without the two departed senators: both unresolved, labeled, published (2 <= 5).
    const lis = { ...MEMBERS_MAP.lis }
    delete lis.S293
    delete lis.S419
    const noSeed = voteOk(res, { members: makeLookup({ ...MEMBERS_MAP, lis }), maxUnresolved: 5 })
    expect(noSeed.rec.unresolved).toBe(2)
    expect(noSeed.rec.positions.find((p) => p.lis === 'S293')).toMatchObject({ member_key: 'lis:S293', id_confidence: 'unresolved', name_source: 'source', source_name: 'Graham (R-SC)' })
    expect(noSeed.out.health.detail).toContain('2 not in the member list (LIS S293, LIS S419)')
  })

  test('members/senate_vote_119_2_00193: 99 member rows (a vacancy) is not drift', () => {
    const { out, rec } = voteOk(replay('members', '2026-10-03', 'senate_vote_119_2_00193_vacancy_99_members.xml'))
    expect(rec.positions).toHaveLength(99)
    expect(rec.counts).toEqual({ yea: 46, nay: 44, present: 0, not_voting: 9 })
    expect(out.health.detail).toContain('99 members')
    golden('senate_vote_119_2_00193.json', out)
  })
})

describe('menu', () => {
  test('2026-10-02/vote_menu_119_2.xml -> targets 00256 down to 00247 (10), zero events; parsed twice -> identical (recess)', () => {
    const res = menu()
    const out = parseVote('menu', res)
    expect(out.health).toEqual({ source_id: SRC, endpoint: 'menu', status: 'ok', detail: '256 votes listed; the newest 10 (00256 down to 00247) are vote targets', items_seen: 256 })
    expect(out.events).toEqual([])
    expect(out.records).toBeUndefined()
    expect(out.targets).toEqual(['00256', '00255', '00254', '00253', '00252', '00251', '00250', '00249', '00248', '00247'].map((n) => ({ endpoint: 'vote', url: voteUrl(n) })))
    expectHubPayloadRules(senateLisVotes, out, res)
    expect(parseVote('menu', menu())).toEqual(out)
    golden('vote_menu_119_2.json', out)
  })

  test('an en bloc vote at the top (no vote-level <result>, but <en_bloc><matter>) is a target', () => {
    const res = menu()
    const enBloc = /<vote>\s*<vote_number>00225<\/vote_number>[\s\S]*?<\/en_bloc>[\s\S]*?<\/vote>/.exec(res.body)![0]
    const top = enBloc.replace('00225', '00257')
    const out = parseVote('menu', withBody(res, (b) => edit(b, '<votes>', `<votes>\n    ${top}`)))
    expect(out.health.status, out.health.detail).toBe('ok')
    expect(out.targets?.map((t) => t.url.slice(-9, -4))).toEqual(['00257', '00256', '00255', '00254', '00253', '00252', '00251', '00250', '00249', '00248'])
  })

  test('an empty <votes> (a new session before its first vote) is empty with zero targets', () => {
    const res = withBody(menu(), (b) => b.replace(/<votes>[\s\S]*<\/votes>/, '<votes>\n  </votes>'))
    const out = parseVote('menu', res)
    expect(out).toEqual({ events: [], health: { source_id: SRC, endpoint: 'menu', status: 'empty', detail: 'the menu lists no votes yet (zero targets)', items_seen: 0 }, targets: [] })
    expectHubPayloadRules(senateLisVotes, out, res)
  })

  test('fail closed: number, result, session, order, envelope, root, content-type', () => {
    const base = menu()
    refused('menu', withBody(base, (b) => edit(b, '<vote_number>00256</vote_number>', '<vote_number>256</vote_number>')), 'drift', /vote_number "256" is not 5 digits/)
    refused('menu', withBody(base, (b) => edit(b, '<result>Confirmed</result>', '')), 'drift', /neither a vote-level <result> nor <en_bloc><matter>/)
    refused('menu', withBody(base, (b) => edit(b, '<congress>119</congress>', '<congress>120</congress>')), 'drift', /congress 120 session 2, not 119-2/)
    refused('menu', withBody(base, (b) => edit(b, '<vote_number>00255</vote_number>', '<vote_number>00257</vote_number>')), 'drift', /vote 00257 follows 00256/)
    refused('menu', withBody(base, (b) => b.slice(0, -20)), 'drift', /truncated/)
    refused('menu', withBody(base, (b) => b.replace(/vote_summary>/g, 'summary>')), 'drift', /root element <summary>/)
    refused('menu', variant(base, { headers: { 'content-type': 'application/json' } }), 'drift', /content-type "application\/json"/)
  })
})

describe('NEGATIVE fixtures', () => {
  test('vote_119_2_00257_NEGATIVE_redirect_vote_not_available.html on `vote`: error, zero events', () => {
    refused('vote', v1003('vote_119_2_00257_NEGATIVE_redirect_vote_not_available.html'), 'error', /^vote file not available/)
  })

  test('vote_menu_120_1_NEGATIVE_redirect_file_not_found.html: error "session menu not posted" on `menu`, drift on `vote`', () => {
    const res = v1003('vote_menu_120_1_NEGATIVE_redirect_file_not_found.html')
    refused('menu', res, 'error', /^session menu not posted/)
    refused('vote', res, 'drift', /an HTML page \("U\.S\. Senate: 404 Error Page"\) instead of a vote XML/)
  })

  test('vote_menu_119_2_304_not_modified.xml: not_modified', () => {
    const res = v1003('vote_menu_119_2_304_not_modified.xml')
    expect(res.status).toBe(304)
    refused('menu', res, 'not_modified', /304/)
    refused('vote', variant(res, { url: voteUrl('00256') }), 'not_modified', /304/)
  })

  test('senate.schedule floor_schedule_NEGATIVE_not_found.html fed to `vote`: drift', () => {
    refused('vote', replay('senate.schedule', '2026-10-03', 'floor_schedule_NEGATIVE_not_found.html'), 'drift', /an HTML page/)
  })

  test('the vote-unavailable page on `menu` is drift (only the 404 page means "not posted")', () => {
    refused('menu', v1003('vote_119_2_00257_NEGATIVE_redirect_vote_not_available.html'), 'drift', /Roll Call Vote Unavailable/)
  })

  test('a non-200 status is an error', () => {
    refused('vote', variant(vote256(), { status: 503 }), 'error', /^HTTP 503$/)
    refused('menu', variant(menu(), { status: 404 }), 'error', /^HTTP 404$/)
  })
})

describe('non-default cases (DESIGN §3.2 tests)', () => {
  const DATE256 = 'September 30, 2026,  09:29 PM'
  const at = (when: string) => withBody(vote256(), (b) => edit(b, `<vote_date>${DATE256}</vote_date>`, `<vote_date>${when}</vote_date>`))

  test('double-space dates: a single-space variant of 00256 is drift', () => {
    refused('vote', at('September 30, 2026, 09:29 PM'), 'drift', /<vote_date> "September 30, 2026, 09:29 PM" is not/)
    refused('vote', withBody(vote256(), (b) => edit(b, 'September 30, 2026,  11:25 PM', 'September 30, 2026, 11:25 PM')), 'drift', /<modify_date>/)
  })

  test('EST vs EDT: the same wall clock maps to different UTC on either side of each DST change', () => {
    const occ = (when: string) => voteOk(at(when)).ev.times.occurred_at
    // spring forward, Sunday March 8, 2026
    expect(occ('March 8, 2026,  01:59 AM')).toBe('2026-03-08T06:59:00Z') // EST
    expect(occ('March 8, 2026,  03:00 AM')).toBe('2026-03-08T07:00:00Z') // EDT
    // fall back, Sunday November 1, 2026
    expect(occ('November 1, 2026,  12:59 AM')).toBe('2026-11-01T04:59:00Z') // EDT
    expect(occ('November 1, 2026,  02:00 AM')).toBe('2026-11-01T07:00:00Z') // EST
    expect(occ('November 9, 2026,  03:00 PM')).toBe('2026-11-09T20:00:00Z') // the return from recess, EST
    expect(occ('December 12, 2026,  12:00 PM')).toBe('2026-12-12T17:00:00Z') // 12 PM = noon
  })

  test('November 1, 2026,  01:30 AM (the repeated hour) -> occurred_at null + result.time_note, still published', () => {
    const { out, ev } = voteOk(at('November 1, 2026,  01:30 AM'))
    expect(ev.times.occurred_at).toBeNull()
    expect(ev.times.source_published_at).toBe('2026-10-01T03:25:00Z')
    expect(ev.result?.time_note).toBe('<vote_date> "November 1, 2026,  01:30 AM" falls in the repeated fall-back hour (Eastern time), so its instant is unknown')
    expect(out.health.detail).toContain('left null')
  })

  test('March 8, 2026,  02:30 AM (does not exist) -> drift', () => {
    refused('vote', at('March 8, 2026,  02:30 AM'), 'drift', /does not exist in Eastern time/)
    refused('vote', at('February 30, 2026,  02:30 PM'), 'drift', /not a real date and time/)
    refused('vote', at('Sept 30, 2026,  09:29 PM'), 'drift', /not a real date and time/)
    refused('vote', at('September 30, 2026,  13:29 PM'), 'drift', /not a real date and time/)
  })

  test('one <member> removed -> drift (counts no longer reproduce the rows)', () => {
    const res = withBody(vote256(), (b) => edit(b, /<member>\s*<member_full>Alsobrooks[\s\S]*?<\/member>\s*/, ''))
    refused('vote', res, 'drift', /<count> 47\/41\/0\/12 \(yeas\/nays\/present\/absent\) does not match the member rows 47\/40\/0\/12/)
  })

  test('a variant of 00292 with question "On the Veto Message" (unknown, mentions a veto) -> drift', () => {
    const res = withBody(v1003('vote_116_2_00292.xml'), (b) => edit(b, '<question>On Overriding the Veto</question>', '<question>On the Veto Message</question>'))
    refused('vote', res, 'drift', /possible veto vote, question "On the Veto Message" not in the table/, OLD)
  })

  test('result "Nomination CONFIRMED" (case) -> passed true', () => {
    const { ev } = voteOk(withBody(vote256(), (b) => edit(b, '<vote_result>Nomination Confirmed</vote_result>', '<vote_result>Nomination CONFIRMED</vote_result>')))
    expect(ev.result?.passed).toBe(true)
    expect(ev.title).toBe('Senate confirmed nomination PN1129, 47-41 (roll call 256)')
  })

  test('question case and whitespace do not matter ("On  the NOMINATION")', () => {
    const { ev } = voteOk(withBody(vote256(), (b) => edit(b, '<question>On the Nomination</question>', '<question>On  the\n NOMINATION </question>')))
    expect(ev.result?.question_kind).toBe('nomination')
    expect(ev.result?.question).toBe('On the NOMINATION')
  })

  test('an unknown question without a veto -> P3, neutral title, health detail', () => {
    const res = withBody(vote256(), (b) => edit(b, '<question>On the Nomination</question>', '<question>On the Motion to Recommit</question>'))
    const { out, ev } = voteOk(res)
    expect(ev.title).toBe('Senate roll call 256: the question was agreed to, 47-41')
    expect(ev.importance).toEqual({ tier: 'P3', reasons: ['unknown_question'] })
    expect(ev.result?.question_kind).toBe('unknown')
    expect(out.health.detail).toContain('unknown question "On the Motion to Recommit": neutral title at P3')
    const no = voteOk(withBody(res, (b) => edit(b, '<vote_result>Nomination Confirmed</vote_result>', '<vote_result>Motion Rejected</vote_result>')))
    expect(no.ev.title).toBe('Senate roll call 256: the question was not agreed to, 47-41')
  })

  test('passedOf: negatives first, word-bounded suffixes, anything else null', () => {
    expect(passedOf('Not Guilty')).toBe(false)
    expect(passedOf('Guilty')).toBe(true)
    expect(passedOf('Point of Order Not Well Taken')).toBe(false)
    expect(passedOf('Point of Order Well Taken')).toBe(true)
    expect(passedOf('Veto Sustained')).toBe(false)
    expect(passedOf('Veto Overridden')).toBe(true)
    expect(passedOf('Cloture Motion Agreed to')).toBe(true)
    expect(passedOf('Bill Passed')).toBe(true)
    expect(passedOf('Nomination Withdrawn')).toBeNull()
    expect(passedOf('Bill Bypassed')).toBeNull() // "passed" only as a whole word
  })
})

describe('fail closed on the vote XML (drift, nothing published)', () => {
  const base = vote256
  test('content-type, root, envelope, URL identity', () => {
    refused('vote', variant(base(), { headers: { 'content-type': 'application/json' } }), 'drift', /content-type "application\/json" is not text\/xml/)
    refused('vote', withBody(base(), (b) => b.replace(/roll_call_vote>/g, 'rollcall>')), 'drift', /root element <rollcall>/)
    refused('vote', withBody(base(), (b) => b.slice(0, -40)), 'drift', /truncated/)
    refused('vote', variant(base(), { url: voteUrl('00255') }), 'drift', /the XML is vote 119-2-256 but the URL names 119-2-255/)
    refused('vote', variant(base(), { url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1182/vote_119_2_00256.xml' }), 'drift', /not a senate\.gov vote XML URL/)
    refused('vote', withBody(base(), (b) => edit(b, '<session>2</session>', '<session>3</session>')), 'drift', /identity .* is malformed/)
  })

  test('closed vocabularies: majority_requirement, result phrase, vote_cast, document_type', () => {
    refused('vote', withBody(base(), (b) => edit(b, '<majority_requirement>1/2</majority_requirement>', '<majority_requirement>3/4</majority_requirement>')), 'drift', /majority_requirement "3\/4"/)
    refused('vote', withBody(base(), (b) => edit(b, '<vote_result>Nomination Confirmed</vote_result>', '<vote_result>Nomination Withdrawn</vote_result>')), 'drift', /ends in no result we know/)
    refused('vote', withBody(base(), (b) => edit(b, '<vote_cast>Nay</vote_cast>', '<vote_cast>Aye</vote_cast>')), 'drift', /vote_cast "Aye" is not in the closed table/)
    refused('vote', withBody(base(), (b) => edit(b, '<document_type>PN</document_type>', '<document_type>Treaty Doc.</document_type>')), 'drift', /document_type "Treaty Doc\." is not in the closed table/)
  })

  test('member rows: duplicate or malformed LIS id, unknown attribute, unknown child, stray content', () => {
    refused('vote', withBody(base(), (b) => edit(b, '<lis_member_id>S428</lis_member_id>', '<lis_member_id>S247</lis_member_id>')), 'drift', /lis_member_id S247 listed twice/)
    refused('vote', withBody(base(), (b) => edit(b, '<lis_member_id>S428</lis_member_id>', '<lis_member_id>S42</lis_member_id>')), 'drift', /lis_member_id "S42" is not S \+ 3 digits/)
    refused('vote', withBody(base(), (b) => edit(b, '<vote_cast>Nay</vote_cast>', '<vote_cast new="1">Nay</vote_cast>')), 'drift', /<vote_cast> attribute new was never recorded/)
    refused('vote', withBody(base(), (b) => edit(b, '<state>MD</state>', '<state>MD</state><district>1</district>')), 'drift', /not the recorded child list/)
    refused('vote', withBody(base(), (b) => edit(b, '</members>', '<note>x</note></members>')), 'drift', /unexpected content at the end of <members>/)
  })

  test('the head: an unknown element, an undefined entity, a count that is not a number', () => {
    refused('vote', withBody(base(), (b) => edit(b, '<congress_year>2026</congress_year>', '<congress_year>2026</congress_year><extra>1</extra>')), 'drift', /an element or attribute we never recorded: extra/)
    refused('vote', withBody(base(), (b) => edit(b, '<vote_title>Confirmation:', '<vote_title>Confirmation&nbsp;')), 'drift', /&nbsp;/)
    refused('vote', withBody(base(), (b) => edit(b, '<yeas>47</yeas>', '<yeas>forty-seven</yeas>')), 'drift', /<count><yeas> "forty-seven" is not a count/)
    refused('vote', withBody(base(), (b) => edit(b, '<members>', '<members><members>')), 'drift', /not exactly one <members> list/)
  })

  test('tie breaker: only the Vice President, only on a tie, only both fields', () => {
    const tie = v1003('vote_119_2_00009.xml')
    refused('vote', withBody(tie, (b) => edit(b, '<by_whom>Vice President of the United States</by_whom>', '<by_whom>President pro tempore</by_whom>')), 'drift', /not the Vice President/)
    refused('vote', withBody(tie, (b) => edit(b, '<tie_breaker_vote>Yea</tie_breaker_vote>', '<tie_breaker_vote/>')), 'drift', /only one of by_whom/)
    refused('vote', withBody(base(), (b) => edit(b, '<by_whom/>\n    <tie_breaker_vote/>', '<by_whom>Vice President of the United States</by_whom><tie_breaker_vote>Yea</tie_breaker_vote>')), 'drift', /not tied/)
  })

  test('S.Amdt. votes need an amendment number and a measure; en bloc only for nominations', () => {
    const amd = v1003('vote_119_2_00249.xml')
    refused('vote', withBody(amd, (b) => edit(edit(b, '<amendment_number>S.Amdt. 6835</amendment_number>', '<amendment_number/>'), '<amendment_to_document_number>S. 4668</amendment_to_document_number>', '<amendment_to_document_number/>')), 'drift', /neither amendment_number nor amendment_to_document_number/)
    refused('vote', withBody(amd, (b) => edit(b, '<amendment_to_document_number>S. 4668</amendment_to_document_number>', '<amendment_to_document_number>PN 12</amendment_to_document_number>')), 'drift', /is not a bill in the closed table/)
    refused('vote', withBody(v1003('vote_119_2_00225.xml'), (b) => edit(b, '<question>On the Nomination</question>', '<question>On the Cloture Motion</question>')), 'drift', /an en bloc vote on the question "On the Cloture Motion"/)
  })

  test('unresolved members: 5 publish (labeled), 6 drift', () => {
    const ids = ['S428', 'S318', 'S247', 'S391', 'S441', 'S293']
    const five = voteOk(vote256(), { members: hiding(ids.slice(0, 5)), maxUnresolved: 5 })
    expect(five.rec.unresolved).toBe(5)
    expect(five.out.health.detail).toContain('5 not in the member list (LIS S428, LIS S441, LIS S318, LIS S247, LIS S391)')
    const alsobrooks = five.rec.positions.find((p) => p.lis === 'S428')!
    expect(alsobrooks).toMatchObject({ member_key: 'lis:S428', id_confidence: 'unresolved', name: 'Angela Alsobrooks', name_source: 'source' })
    const six = hiding(ids.filter((l) => l !== 'S293').concat(['S354']))
    refused('vote', vote256(), 'drift', /6 members not in the member list \(more than 5\)/, { members: six, maxUnresolved: 5 })
  })

  test('official text longer than the schema allows -> drift', () => {
    const long = 'x'.repeat(4000)
    refused('vote', withBody(vote256(), (b) => edit(b, '<vote_question_text>On the Nomination PN1129', `<vote_question_text>On the Nomination PN1129 ${long}`)), 'drift', /official text is \d+ characters/)
  })
})
