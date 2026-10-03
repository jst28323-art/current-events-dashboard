// @ced/schema/v02 (scratch/phase2/DESIGN.md §1.7, §2.1): the JSON Schemas and the TS lists agree, a good vote event /
// member-vote record / pair passes, and every cross-field rule rejects its own mutation. The good House event and
// record are SYNTHETIC (four positions, built here for the rules, not taken from a fixture); the vote adapters' tests
// run the same validators over every recorded roll call.
import { describe, expect, test } from 'vitest'
import { finalizeEvent, validateEvent, type CedEvent } from '../src/index.js'
import {
  ID_CONFIDENCE_VALUES, MEMBER_POSITION_REQUIRED, MEMBER_VOTES_REQUIRED, POSITION_VALUES, VOTE_REQUIRED_VALUES,
  VOTE_RESULT_REQUIRED, checkVotePair, memberVotesJsonSchema, memberVotesRefOf, parseVoteKey, validateMemberVotes,
  validateVoteEvent, voteKeyOf, voteResultJsonSchema, type MemberVotesRecord, TYPE_AGREEMENT_CHECKED,
} from '../src/v02/index.js'

const sorted = (xs: readonly string[]) => [...xs].sort()

describe('the v0.2 JSON Schemas and TS lists agree', () => {
  const vr = voteResultJsonSchema as { required: string[]; properties: { required: { enum: unknown[] } } }
  const mv = memberVotesJsonSchema as {
    required: string[]
    $defs: { position: { required: string[]; properties: { position: { enum: string[] }; id_confidence: { enum: string[] } } } }
  }
  test('vote result required list', () => expect(sorted(VOTE_RESULT_REQUIRED)).toEqual(sorted(vr.required)))
  test('the `required` enum is VoteRequired plus null', () => {
    expect(vr.properties.required.enum.filter((x) => x !== null)).toEqual([...VOTE_REQUIRED_VALUES])
    expect(vr.properties.required.enum).toContain(null)
  })
  test('member-vote record required list', () => expect(sorted(MEMBER_VOTES_REQUIRED)).toEqual(sorted(mv.required)))
  test('member position required list', () => expect(sorted(MEMBER_POSITION_REQUIRED)).toEqual(sorted(mv.$defs.position.required)))
  test('position and id_confidence enums', () => {
    expect(mv.$defs.position.properties.position.enum).toEqual([...POSITION_VALUES])
    expect(mv.$defs.position.properties.id_confidence.enum).toEqual([...ID_CONFIDENCE_VALUES])
  })
  test('the compile-time key checks in types.ts hold', () => expect(TYPE_AGREEMENT_CHECKED).toBe(true))
})

const AT = '2026-10-03T15:29:20.000Z'
const goodEvent: CedEvent = finalizeEvent({
  dedup_key: 'vote:house:119:2:314#result',
  object_key: 'vote:house:119:2:314',
  event_type: 'vote.result',
  status: 'ended',
  branch: 'legislative',
  body: 'house',
  features: ['F5', 'F6'],
  title: 'Synthetic: House passed S. 2403 under suspension of the rules, 2-1; two-thirds needed (roll call 314)',
  official_text: 'On Motion to Suspend the Rules and Pass — S 2403 — Passed',
  times: { occurred_at: '2026-09-16T23:05:00Z', first_seen_at: AT },
  sources: [{ source_id: 'house.clerk.votes', url: 'https://clerk.house.gov/evs/2026/roll314.xml', retrieved_at: AT, affiliation: 'official-nonpartisan' }],
  revision: 1,
  provenance: { parser: 'house_clerk_votes@0.1.0', confidence: 'high' },
  result: {
    question: 'On Motion to Suspend the Rules and Pass', question_kind: 'suspension_passage', result_text: 'Passed',
    required: '2/3', passed: true, yea: 2, nay: 1, present: 0, not_voting: 1, vote_type: '2/3 YEA-AND-NAY',
  },
  member_votes_ref: 'votes/house/119/2/314.json',
})

const pos = (id: string, position: MemberVotesRecord['positions'][number]['position'], vote_text: string, mapped = true) => ({
  member_key: `bioguide:${id}`, id_confidence: 'authority' as const, lis: null, name: mapped ? `Member ${id}` : 'Doe',
  name_source: mapped ? ('map' as const) : ('source' as const), source_name: 'Doe', party: 'D', state: 'NC',
  role: 'legislator' as const, position, vote_text, pair: null,
})
const goodRecord: MemberVotesRecord = {
  record_type: 'member_votes',
  record_version: '0.1',
  ref: 'votes/house/119/2/314.json',
  vote_key: 'vote:house:119:2:314',
  chamber: 'house', congress: 119, session: 2, roll: 314,
  source: { source_id: 'house.clerk.votes', url: 'https://clerk.house.gov/evs/2026/roll314.xml', retrieved_at: AT, parser: 'house_clerk_votes@0.1.0' },
  members_map: { sha256: 'ae8cb9477c48715df71a7d860854229d799dc90a254d61badc1efb770f892b2c', source_last_modified: 'Thu, 24 Sep 2026 10:21:30 GMT', built_at: AT },
  counts: { yea: 2, nay: 1, present: 0, not_voting: 1 },
  unresolved: 1,
  positions: [pos('A000370', 'yea', 'Yea'), pos('B000001', 'yea', 'Yea', false), pos('C000001', 'nay', 'Nay'), pos('D000001', 'not_voting', 'Not Voting')],
}

const senPos = (lis: string, bioguide: string | null, position: 'yea' | 'nay' | 'present' | 'not_voting', vote_text: string, pair: string | null = null) => ({
  member_key: bioguide ? `bioguide:${bioguide}` : `lis:${lis}`, id_confidence: bioguide ? ('mapped' as const) : ('unresolved' as const),
  lis, name: bioguide ? `Senator ${bioguide}` : 'Lindsey Graham', name_source: bioguide ? ('map' as const) : ('source' as const),
  source_name: 'Graham (R-SC)', party: 'R', state: 'SC', role: null, position, vote_text, pair,
})
const goodSenate: MemberVotesRecord = {
  ...goodRecord,
  ref: 'votes/senate/115/2/223.json', vote_key: 'vote:senate:115:2:223', chamber: 'senate', congress: 115, session: 2, roll: 223,
  source: { ...goodRecord.source, source_id: 'senate.lis.votes', url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1152/vote_115_2_00223.xml', parser: 'senate_lis_votes@0.1.0' },
  counts: { yea: 1, nay: 0, present: 1, not_voting: 0 },
  unresolved: 1,
  positions: [senPos('S441', 'G000608', 'yea', 'Yea'), senPos('S293', null, 'present', 'Present, Giving Live Pair', 'S375')],
}

const mutate = <T>(x: T, patch: (y: any) => void): T => {
  const y = structuredClone(x)
  patch(y)
  return y
}

describe('validateVoteEvent', () => {
  test('a good vote.result passes, and so does the v0.1 validator', () => {
    expect(validateVoteEvent(goodEvent)).toEqual({ valid: true, errors: [] })
    expect(validateEvent(goodEvent).valid).toBe(true)
  })
  test('a non-vote event is only the v0.1 check', () => {
    const { id: _id, schema_version: _v, result: _r, member_votes_ref: _m, ...rest } = goodEvent
    const e = finalizeEvent({ ...rest, dedup_key: 'floor:house:119:45150#entry', object_key: 'floor:house:119:45150', event_type: 'floor.action' })
    expect(validateVoteEvent(e).valid).toBe(true)
  })
  const cases: Array<[string, (e: any) => void, RegExp]> = [
    ['session 3 in the key', (e) => { e.object_key = 'vote:house:119:3:314'; e.dedup_key = 'vote:house:119:3:314#result'; e.member_votes_ref = 'votes/house/119/3/314.json' }, /object_key/],
    ['roll padded with a zero', (e) => { e.object_key = 'vote:house:119:2:0314'; e.dedup_key = 'vote:house:119:2:0314#result' }, /object_key/],
    ['dedup suffix not #result', (e) => { e.dedup_key = 'vote:house:119:2:314#tally' }, /#result/],
    ['body is not the chamber', (e) => { e.body = 'senate' }, /chamber/],
    ['member_votes_ref missing', (e) => { delete e.member_votes_ref }, /member_votes_ref/],
    ['member_votes_ref for another roll', (e) => { e.member_votes_ref = 'votes/house/119/2/313.json' }, /member_votes_ref must be/],
    ['result missing', (e) => { delete e.result }, /needs a result/],
    ['result missing a required field', (e) => { delete e.result.not_voting }, /result/],
    ['passed as text', (e) => { e.result.passed = 'yes' }, /result/],
    ['required outside the set', (e) => { e.result.required = '3/4' }, /result/],
    ['a count above 1000', (e) => { e.result.yea = 1001 }, /result/],
    ['question_kind not a slug', (e) => { e.result.question_kind = 'Suspension' }, /result/],
  ]
  for (const [name, patch, want] of cases) {
    test(`rejects: ${name}`, () => {
      // The id is re-derived so only the rule under test can fail (the v0.1 id rule would otherwise catch key edits).
      const { id: _id, schema_version: _v, ...bad } = mutate(goodEvent, patch) as CedEvent
      const re = finalizeEvent(bad)
      const r = validateVoteEvent(re)
      expect(r.valid, name).toBe(false)
      expect(r.errors.join('\n')).toMatch(want)
    })
  }
  test('extra result fields are allowed (vote_type, by_party, …)', () => {
    expect(validateVoteEvent(mutate(goodEvent, (e) => { e.result.by_party = [] })).valid).toBe(true)
  })
})

describe('validateMemberVotes', () => {
  test('good House and Senate records pass', () => {
    expect(validateMemberVotes(goodRecord)).toEqual({ valid: true, errors: [] })
    expect(validateMemberVotes(goodSenate)).toEqual({ valid: true, errors: [] })
  })
  test('a Speaker ballot: candidates counted per name, yea/nay null', () => {
    const sp = mutate(goodRecord, (r) => {
      r.counts = { yea: null, nay: null, present: 1, not_voting: 0, candidates: [{ name: 'Jeffries', votes: 2 }, { name: 'Johnson (LA)', votes: 1 }] }
      r.positions = [pos('A000370', 'candidate', 'Jeffries'), pos('B000001', 'candidate', 'Jeffries', false), pos('C000001', 'candidate', 'Johnson (LA)'), pos('D000001', 'present', 'Present')]
    })
    expect(validateMemberVotes(sp)).toEqual({ valid: true, errors: [] })
    const wrong = mutate(sp, (r) => { r.positions[2].vote_text = 'Jeffries' })
    expect(validateMemberVotes(wrong).errors.join('\n')).toMatch(/candidate Jeffries: counts say 2, positions say 3/)
  })
  const cases: Array<[string, MemberVotesRecord, (r: any) => void, RegExp]> = [
    ['vote_key for another roll', goodRecord, (r) => { r.vote_key = 'vote:house:119:2:313' }, /vote_key/],
    ['ref for another chamber', goodRecord, (r) => { r.ref = 'votes/senate/119/2/314.json' }, /ref/],
    ['session 3', goodRecord, (r) => { r.session = 3 }, /session/],
    ['yea count off by one', goodRecord, (r) => { r.counts.yea = 3 }, /counts.yea/],
    ['a position removed', goodRecord, (r) => { r.positions.pop() }, /not_voting/],
    ['null yea with yea positions', goodRecord, (r) => { r.counts.yea = null }, /counts.yea/],
    ['duplicate member', goodRecord, (r) => { r.positions[2].member_key = r.positions[0].member_key }, /duplicates/],
    ['unresolved miscounted', goodRecord, (r) => { r.unresolved = 0 }, /unresolved/],
    ['House position with a lis id', goodRecord, (r) => { r.positions[0].lis = 'S441' }, /no lis/],
    ['House position not authority', goodRecord, (r) => { r.positions[0].id_confidence = 'mapped' }, /authority/],
    ['Senate lis key marked mapped', goodSenate, (r) => { r.positions[1].id_confidence = 'mapped' }, /lis: key/],
    ['Senate unresolved key for another lis', goodSenate, (r) => { r.positions[1].member_key = 'lis:S294' }, /lis:\{its lis id\}/],
    ['Senate position with a role', goodSenate, (r) => { r.positions[0].role = 'legislator' }, /no role/],
    ['bad member key', goodRecord, (r) => { r.positions[0].member_key = 'bioguide:a000370' }, /member_key/],
    ['unknown position', goodRecord, (r) => { r.positions[0].position = 'aye' }, /position/],
    ['extra top-level field', goodRecord, (r) => { r.chamber_name = 'House' }, /additionalProperties/],
  ]
  for (const [name, base, patch, want] of cases) {
    test(`rejects: ${name}`, () => {
      const r = validateMemberVotes(mutate(base, patch))
      expect(r.valid, name).toBe(false)
      expect(r.errors.join('\n')).toMatch(want)
    })
  }
  test('never throws on junk', () => {
    expect(validateMemberVotes(undefined).valid).toBe(false)
    expect(validateMemberVotes({ positions: [undefined] }).valid).toBe(false)
  })
})

describe('checkVotePair', () => {
  test('the good pair agrees', () => expect(checkVotePair(goodEvent, goodRecord)).toEqual({ valid: true, errors: [] }))
  const cases: Array<[string, (e: any, r: any) => void, RegExp]> = [
    ['record for another vote', (_e, r) => { r.vote_key = 'vote:house:119:2:313' }, /vote_key/],
    ['ref differs', (_e, r) => { r.ref = 'votes/house/119/2/313.json' }, /ref/],
    ['nay differs', (e) => { e.result.nay = 2 }, /counts.nay/],
    ['present differs', (_e, r) => { r.counts.present = 1 }, /counts.present/],
    ['candidates differ', (e) => { e.result.candidates = [{ name: 'Jeffries', votes: 2 }] }, /candidates/],
  ]
  for (const [name, patch, want] of cases) {
    test(`rejects: ${name}`, () => {
      const e = structuredClone(goodEvent)
      const r = structuredClone(goodRecord)
      patch(e, r)
      const out = checkVotePair(e, r)
      expect(out.valid).toBe(false)
      expect(out.errors.join('\n')).toMatch(want)
    })
  }
})

describe('vote identity helpers', () => {
  test('key and ref round-trip', () => {
    const id = parseVoteKey('vote:senate:119:2:256')!
    expect(id).toEqual({ chamber: 'senate', congress: 119, session: 2, roll: 256 })
    expect(voteKeyOf(id)).toBe('vote:senate:119:2:256')
    expect(memberVotesRefOf(id)).toBe('votes/senate/119/2/256.json')
    expect(parseVoteKey('vote:senate:119:3:256')).toBeNull()
  })
})
