// The shared helper must itself fail on each rule it claims (a helper that always passes would bless every golden).
// The vote event and record are SYNTHETIC (built here for the rules); the adapter tests feed real fixtures through it.
import { describe, expect, test } from 'vitest'
import { finalizeEvent, type CedEvent } from '@ced/schema'
import type { MemberVotesRecord } from '@ced/schema/v02'
import { houseClerkVotes, houseClerkFloor } from '../src/fixture_only.js'
import type { AdapterOutput, FetchedResponse } from '../src/types.js'
import { expectHubPayloadRules, hubPayloadProblems } from './payload_rules.js'

const AT = '2026-10-03T15:29:20.000Z'
const res: FetchedResponse = { url: 'https://clerk.house.gov/evs/2026/roll314.xml', status: 200, headers: {}, body: '', fetchedAt: AT }
const vote = (roll: number): CedEvent => finalizeEvent({
  dedup_key: `vote:house:119:2:${roll}#result`,
  object_key: `vote:house:119:2:${roll}`,
  event_type: 'vote.result',
  status: 'ended',
  branch: 'legislative',
  body: 'house',
  features: ['F5', 'F6'],
  title: `Synthetic roll call ${roll}`,
  official_text: 'On Passage — H R 1 — Passed',
  times: { occurred_at: '2026-09-16T23:05:00Z', first_seen_at: AT },
  sources: [{ source_id: 'house.clerk.votes', url: res.url, retrieved_at: AT, license: 'us-gov-public-domain', affiliation: 'official-nonpartisan' }],
  revision: 1,
  provenance: { parser: 'house_clerk_votes@0.1.0', confidence: 'high' },
  result: { question: 'On Passage', question_kind: 'passage', result_text: 'Passed', required: '1/2', passed: true, yea: 1, nay: 0, present: 0, not_voting: 0 },
  member_votes_ref: `votes/house/119/2/${roll}.json`,
})
const record = (roll: number): MemberVotesRecord => ({
  record_type: 'member_votes', record_version: '0.1',
  ref: `votes/house/119/2/${roll}.json`, vote_key: `vote:house:119:2:${roll}`,
  chamber: 'house', congress: 119, session: 2, roll,
  source: { source_id: 'house.clerk.votes', url: res.url, retrieved_at: AT, parser: 'house_clerk_votes@0.1.0' },
  members_map: { sha256: '0'.repeat(64), source_last_modified: null, built_at: AT },
  counts: { yea: 1, nay: 0, present: 0, not_voting: 0 },
  unresolved: 0,
  positions: [{
    member_key: 'bioguide:A000370', id_confidence: 'authority', lis: null, name: 'Alma S. Adams', name_source: 'map', source_name: 'Adams',
    party: 'D', state: 'NC', role: 'legislator', position: 'yea', vote_text: 'Yea', pair: null,
  }],
})
const good = (): AdapterOutput => ({
  events: [vote(314)],
  records: [record(314)],
  health: { source_id: 'house.clerk.votes', endpoint: 'roll', status: 'ok', detail: '', items_seen: 1 },
})
const indexOut = (urls: string[]): AdapterOutput => ({
  events: [],
  targets: urls.map((url) => ({ endpoint: 'roll', url })),
  health: { source_id: 'house.clerk.votes', endpoint: 'index', status: 'ok', detail: '', items_seen: urls.length },
})
const roll = (n: number) => `https://clerk.house.gov/evs/2026/roll${String(n).padStart(3, '0')}.xml`

describe('expectHubPayloadRules', () => {
  test('a good vote payload and a good index payload pass', () => {
    expectHubPayloadRules(houseClerkVotes, good(), res)
    expectHubPayloadRules(houseClerkVotes, indexOut([roll(314), roll(313)]))
  })
  const cases: Array<[string, (o: AdapterOutput) => void, RegExp]> = [
    ['an invalid event', (o) => { (o.events[0] as any).title = '' }, /title/],
    ['a vote event failing the v0.2 rules', (o) => { (o.events[0] as any).result.passed = 'yes' }, /result/],
    ['another source cited', (o) => { o.events[0]!.sources[0]!.source_id = 'senate.lis.votes' }, /may cite only its own source/],
    ['a different affiliation claimed', (o) => { o.events[0]!.sources[0]!.affiliation = 'third-party' }, /registered official-nonpartisan/],
    ['a different license', (o) => { o.events[0]!.sources[0]!.license = 'cc-by' }, /license/],
    ['a repeated dedup_key', (o) => { o.events.push(structuredClone(o.events[0]!)); o.records!.push(record(314)) }, /one dedup_key per payload/],
    ['drift with events', (o) => { o.health.status = 'drift' }, /zero events/],
    ['a record without its event', (o) => { o.records!.push(record(313)) }, /no vote.result event/],
    ['an event without its record', (o) => { o.records = [] }, /no member-vote record/],
    ['a record whose counts disagree', (o) => { (o.events[0] as any).result.yea = 2; (o.events[0] as any).result.nay = null }, /counts/],
    ['an invalid record', (o) => { o.records![0]!.unresolved = 1 }, /unresolved/],
    ['health for another source', (o) => { o.health.source_id = 'house.clerk.floor' }, /health.source_id/],
    ['health for an unknown endpoint', (o) => { o.health.endpoint = 'menu' }, /health.endpoint/],
  ]
  for (const [name, patch, want] of cases) {
    test(`fails on ${name}`, () => {
      const o = good()
      patch(o)
      const p = hubPayloadProblems(houseClerkVotes, o, res)
      expect(p.join('\n')).toMatch(want)
      expect(() => expectHubPayloadRules(houseClerkVotes, o, res)).toThrow()
    })
  }
  test('fails on first_seen_at / retrieved_at that are not the fetch time', () => {
    const o = good()
    expect(hubPayloadProblems(houseClerkVotes, o, { ...res, fetchedAt: '2026-10-03T15:30:00.000Z' }).join('\n')).toMatch(/fetchedAt/)
  })
  test('targets: pattern, maxTargets, repeats, wrong feeder, non-dynamic endpoint', () => {
    const p = (o: AdapterOutput, def = houseClerkVotes) => hubPayloadProblems(def, o).join('\n')
    expect(p(indexOut(['https://clerk.house.gov/evs/2026/roll314.xml?x=1']))).toMatch(/does not match/)
    expect(p(indexOut(Array.from({ length: 11 }, (_, i) => roll(314 - i))))).toMatch(/more than maxTargets 10/)
    expect(p(indexOut([roll(314), roll(314)]))).toMatch(/repeated/)
    const fromRoll = indexOut([roll(314)])
    fromRoll.health.endpoint = 'roll'
    expect(p(fromRoll)).toMatch(/fed by index, but roll was parsed/)
    expect(p({ ...indexOut([]), targets: [{ endpoint: 'index', url: roll(1) }] })).toMatch(/not a dynamic endpoint/)
    const nextDayFromFeed: AdapterOutput = {
      events: [], targets: [{ endpoint: 'next_day', url: 'https://clerk.house.gov/floor/20261005.xml' }],
      health: { source_id: 'house.clerk.floor', endpoint: 'feed', status: 'ok', detail: '', items_seen: 1 },
    }
    expect(p(nextDayFromFeed, houseClerkFloor)).toMatch(/fed by day, but feed was parsed/)
  })
})
