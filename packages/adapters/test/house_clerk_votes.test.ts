// house.clerk.votes adapter (scratch/phase2/DESIGN.md §3.1, §2): golden output (event + member-vote record) for every
// recorded roll call, field-by-field expectations read by hand from the fixture bytes, the listing's targets, the
// negative/empty fixtures, and every fail-closed path on in-memory variants of recorded responses (fixtures are never
// edited; TESTING.md rule 1).
//
// Goldens: test/golden/house.clerk.votes/*.json (member positions one per line). They are compared byte-for-byte; to
// regenerate after a deliberate change, run with UPDATE_GOLDEN=1 and review the diff line by line; the hand-written
// expectations below must still pass on their own.
import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CedEvent } from '@ced/schema'
import { checkVotePair, validateMemberVotes, validateVoteEvent, type MemberVotesRecord, type VoteResult } from '@ced/schema/v02'
import { HOUSE_VOTES_PARSER, houseClerkVotes, INDEX_URL, parseVote, rollUrl } from '../src/sources/house_clerk_votes.js'
import { DEFAULT_VOTE_OPTIONS, MEMBERS, MEMBERS_MAP, makeLookup, type MembersMap } from '../src/lib/members.js'
import type { AdapterOutput, FetchedResponse } from '../src/types.js'
import { expectHubPayloadRules } from './payload_rules.js'
import { REPO_ROOT, replay, variant } from './replay.js'

const SRC = 'house.clerk.votes'
const D2 = '2026-10-02'
const D3 = '2026-10-03'
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden', SRC)

const roll = (date: string, name: string): FetchedResponse => replay(SRC, date, name)
const r314 = () => roll(D2, 'roll314.xml')

// ---- helpers ----

/** Pretty JSON, but each member position on one line (433 positions x 12 fields would otherwise be ~5,000 lines). */
function goldenText(out: AdapterOutput): string {
  const clone = JSON.parse(JSON.stringify(out)) as { records?: Array<{ positions: unknown }> }
  const lists: string[] = []
  for (const r of clone.records ?? []) {
    lists.push((r.positions as unknown[]).map((p) => JSON.stringify(p)).join(',\n        '))
    r.positions = `__POSITIONS_${lists.length - 1}__`
  }
  let text = JSON.stringify(clone, null, 2) + '\n'
  lists.forEach((l, i) => {
    text = text.replace(`"__POSITIONS_${i}__"`, `[\n        ${l}\n      ]`)
  })
  return text
}

function checkGolden(name: string, out: AdapterOutput): void {
  const p = join(GOLDEN_DIR, name)
  const text = goldenText(out)
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN_DIR, { recursive: true })
    writeFileSync(p, text)
  }
  expect(existsSync(p), `missing golden ${p}: run with UPDATE_GOLDEN=1, then review it`).toBe(true)
  expect(text).toBe(readFileSync(p, 'utf8'))
  expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual(JSON.parse(JSON.stringify(out))) // the one-line layout loses nothing
}

/** A roll call that must publish: one valid vote.result event + its record, passing the Hub's payload rules. */
function parseOk(res: FetchedResponse, ep: 'roll' | 'roll_next' = 'roll', opts = DEFAULT_VOTE_OPTIONS): { out: AdapterOutput; e: CedEvent; r: VoteResult; rec: MemberVotesRecord } {
  const out = parseVote(ep, res, opts)
  expect(out.health.status, out.health.detail).toBe('ok')
  expect(out.events).toHaveLength(1)
  expect(out.records).toHaveLength(1)
  expect(out.targets).toBeUndefined()
  const e = out.events[0]!
  const rec = out.records![0]!
  expect(validateVoteEvent(e).errors).toEqual([])
  expect(validateMemberVotes(rec).errors).toEqual([])
  expect(checkVotePair(e, rec).errors).toEqual([])
  expectHubPayloadRules(houseClerkVotes, out, res)
  return { out, e, r: e.result as VoteResult, rec }
}

/** A payload refused whole: no events, no records, no targets, the given health. */
function expectRefused(ep: string, res: FetchedResponse, status: string, detail: RegExp): AdapterOutput {
  const out = parseVote(ep, res)
  expect(out.health.status, out.health.detail).toBe(status)
  expect(out.health.detail).toMatch(detail)
  expect(out.events).toEqual([])
  expect(out.records ?? []).toEqual([])
  expect(out.targets ?? []).toEqual([])
  if (houseClerkVotes.endpoints.some((x) => x.id === ep)) expectHubPayloadRules(houseClerkVotes, out, res)
  return out
}

function edit(body: string, from: string | RegExp, to: string): string {
  const out = body.replace(from, to)
  if (out === body) throw new Error(`variant edit did not apply: ${String(from)}`)
  return out
}

/** Replace the first `n` occurrences of `from` (a whole-string match), for member-vote variants. */
function editFirst(body: string, from: string, to: string, n: number): string {
  let out = body
  for (let i = 0; i < n; i += 1) out = edit(out, from, to)
  return out
}

/** Recompute <totals-by-vote> and every <totals-by-party> from the member rows (to build CONSISTENT variants, e.g. a
 * tie; the adapter itself never trusts totals it did not reproduce). */
function retotal(body: string): string {
  const rows = [...body.matchAll(/party="([DRI])"[^>]*>[^<]*<\/legislator>\s*<vote>([^<]*)<\/vote>/g)]
  const tally = (party?: string) => {
    const x = { yea: 0, nay: 0, present: 0, nv: 0 }
    for (const m of rows) {
      if (party && m[1] !== party) continue
      const v = m[2]
      if (v === 'Yea' || v === 'Aye') x.yea += 1
      else if (v === 'Nay' || v === 'No') x.nay += 1
      else if (v === 'Present') x.present += 1
      else if (v === 'Not Voting') x.nv += 1
    }
    return x
  }
  const put = (block: string, x: ReturnType<typeof tally>) => block
    .replace(/<yea-total>\d+/, `<yea-total>${x.yea}`).replace(/<nay-total>\d+/, `<nay-total>${x.nay}`)
    .replace(/<present-total>\d+/, `<present-total>${x.present}`).replace(/<not-voting-total>\d+/, `<not-voting-total>${x.nv}`)
  const letter: Record<string, string> = { Republican: 'R', Democratic: 'D', Independent: 'I' }
  return body
    .replace(/<totals-by-party>\s*<party>(\w+)<\/party>[\s\S]*?<\/totals-by-party>/g, (blk, name: string) => put(blk, tally(letter[name])))
    .replace(/<totals-by-vote>[\s\S]*?<\/totals-by-vote>/, (blk) => put(blk, tally()))
}

const withBody = (res: FetchedResponse, body: string): FetchedResponse => variant(res, { body })

// ---------------------------------------------------------------------------------------------------------------
// Goldens + hand-read expectations (every golden fixture DESIGN §3.1 lists)
// ---------------------------------------------------------------------------------------------------------------

interface Want {
  source?: string
  date: string
  name: string
  key: string
  title: string
  tier: string
  reasons: string[]
  occurred_at: string | null
  kind: string
  required: string | null
  passed: boolean | null
  counts: [number | null, number | null, number, number] // yea, nay, present, not_voting
  positions: number
  thread?: string
  official?: string
}

const GOLDENS: Want[] = [
  {
    date: D2, name: 'roll314.xml', key: 'vote:house:119:2:314', tier: 'P0', reasons: ['suspension_passage'],
    title: 'House passed S. 2403 under suspension of the rules, 401-14; two-thirds needed (roll call 314)',
    occurred_at: '2026-09-16T23:05:00Z', kind: 'suspension_passage', required: '2/3', passed: true, counts: [401, 14, 0, 18],
    positions: 433, thread: 'bill:119:s:2403',
    official: 'On Motion to Suspend the Rules and Pass — S 2403 — Retire through Ownership Act — Passed',
  },
  {
    date: D2, name: 'roll310.xml', key: 'vote:house:119:2:310', tier: 'P0', reasons: ['final_passage'],
    title: 'House passed H.R. 10326, 217-207 (roll call 310)', occurred_at: '2026-09-16T22:43:00Z', kind: 'passage',
    required: '1/2', passed: true, counts: [217, 207, 0, 9], positions: 433, thread: 'bill:119:hr:10326',
  },
  {
    // RECORDED VOTE (Aye/No); an H RES "Providing for consideration ..." = a rule, P3.
    date: D2, name: 'roll300.xml', key: 'vote:house:119:2:300', tier: 'P3', reasons: ['procedural'],
    title: 'House adopted H.Res. 1530, 214-211 (roll call 300)', occurred_at: '2026-09-15T21:27:00Z', kind: 'rule',
    required: '1/2', passed: true, counts: [214, 211, 0, 8], positions: 433, thread: 'bill:119:hres:1530',
  },
  {
    // Veto override FAILED with yea > nay (248 > 177): passed comes from vote-result, never from the tally. EST (-05:00).
    date: D3, name: 'roll009.xml', key: 'vote:house:119:2:9', tier: 'P0', reasons: ['veto_override'],
    title: 'House failed to override the veto of H.R. 131, 248-177, 1 present; two-thirds needed (roll call 9)',
    occurred_at: '2026-01-08T20:23:00Z', kind: 'veto_override', required: '2/3', passed: false, counts: [248, 177, 1, 5],
    positions: 431, thread: 'bill:119:hr:131',
    official: 'Passage, Objections of the President To The Contrary Notwithstanding — H R 131 — Finish the Arkansas Valley Conduit Act — Failed',
  },
  {
    date: D3, name: 'roll2025_001.xml', key: 'vote:house:119:1:1', tier: 'P3', reasons: ['quorum'],
    title: 'House quorum call: 433 present, 2 not voting (roll call 1)', occurred_at: '2025-01-03T17:33:00Z', kind: 'quorum',
    required: null, passed: null, counts: [0, 0, 433, 2], positions: 435,
  },
  {
    date: D3, name: 'roll2025_002.xml', key: 'vote:house:119:1:2', tier: 'P0', reasons: ['speaker_election'], // D-061
    title: 'House vote for Speaker: Johnson (LA) 218, Jeffries 215, Emmer 1 (roll call 2)', occurred_at: '2025-01-03T19:33:00Z',
    kind: 'speaker_election', required: '1/2', passed: null, counts: [null, null, 0, 0], positions: 434,
    official: 'Election of the Speaker — Johnson (LA)',
  },
  {
    // 00:29 on the next calendar day (EDT).
    date: D3, name: 'roll2025_139.xml', key: 'vote:house:119:1:139', tier: 'P3', reasons: ['procedural'],
    title: 'House agreed to consider H.Res. 436, 217-211 (roll call 139)', occurred_at: '2025-05-22T04:29:00Z',
    kind: 'consideration', required: '1/2', passed: true, counts: [217, 211, 0, 4], positions: 432, thread: 'bill:119:hres:436',
  },
  {
    date: D3, name: 'roll2025_143.xml', key: 'vote:house:119:1:143', tier: 'P0', reasons: ['final_passage'],
    title: 'House passed S.J.Res. 31, 216-212 (roll call 143)', occurred_at: '2025-05-22T06:49:00Z', kind: 'passage',
    required: '1/2', passed: true, counts: [216, 212, 0, 4], positions: 432, thread: 'bill:119:sjres:31',
  },
  {
    date: D3, name: 'roll2025_145.xml', key: 'vote:house:119:1:145', tier: 'P0', reasons: ['final_passage'],
    title: 'House passed H.R. 1, 215-214, 1 present (roll call 145)', occurred_at: '2025-05-22T10:54:00Z', kind: 'passage',
    required: '1/2', passed: true, counts: [215, 214, 1, 2], positions: 432, thread: 'bill:119:hr:1',
  },
  {
    // `On Motion to Suspend the Rules and Agree` on H RES 488 (D-088): a resolution adopted under suspension, P1
    // `resolution`; titled like a suspension passage. 6 Present (R 1, D 5), 9-Jun-2025 7:01 PM EDT.
    date: D3, name: 'roll2025_158_suspend_agree.xml', key: 'vote:house:119:1:158', tier: 'P1', reasons: ['resolution'],
    title: 'House adopted H.Res. 488 under suspension of the rules, 280-113, 6 present; two-thirds needed (roll call 158)',
    occurred_at: '2025-06-09T23:01:00Z', kind: 'suspension_resolution', required: '2/3', passed: true, counts: [280, 113, 6, 33],
    positions: 432, thread: 'bill:119:hres:488',
    official: 'On Motion to Suspend the Rules and Agree — H RES 488 — Denouncing the antisemitic terrorist attack in Boulder, Colorado — Passed',
  },
  {
    date: D3, name: 'roll106.xml', key: 'vote:house:119:2:106', tier: 'P3', reasons: ['procedural'],
    title: 'House voted to adjourn, 208-197 (roll call 106)', occurred_at: '2026-03-28T00:26:00Z', kind: 'adjourn',
    required: '1/2', passed: true, counts: [208, 197, 0, 27], positions: 432,
    official: 'On Motion to Adjourn — ADJOURN — Passed',
  },
  {
    date: D3, name: 'roll107.xml', key: 'vote:house:119:2:107', tier: 'P3', reasons: ['procedural'],
    title: 'House ordered the previous question on H.Res. 1142, 209-206 (roll call 107)', occurred_at: '2026-03-28T03:19:00Z',
    kind: 'previous_question', required: '1/2', passed: true, counts: [209, 206, 0, 17], positions: 432, thread: 'bill:119:hres:1142',
  },
  {
    // Committee of the Whole (<committee>), delegates with state XX, accented names.
    date: D3, name: 'roll275.xml', key: 'vote:house:119:2:275', tier: 'P2', reasons: ['amendment'],
    title: 'House adopted amendment 20 to H.R. 8800, 232-199 (roll call 275)', occurred_at: '2026-07-22T20:19:00Z',
    kind: 'amendment', required: '1/2', passed: true, counts: [232, 199, 0, 6], positions: 437, thread: 'bill:119:hr:8800',
    official: 'On Agreeing to the Amendment — H R 8800 — Harrigan of North Carolina Part A Amendment No. 44 — Agreed to',
  },
  {
    // `1-Sep-2026`: a one-digit day.
    date: D3, name: 'roll290.xml', key: 'vote:house:119:2:290', tier: 'P3', reasons: ['procedural'],
    title: 'House rejected a motion to recommit H.R. 9436, 202-212 (roll call 290)', occurred_at: '2026-09-01T21:55:00Z',
    kind: 'recommit', required: '1/2', passed: false, counts: [202, 212, 0, 18], positions: 432, thread: 'bill:119:hr:9436',
  },
  {
    date: D3, name: 'roll298.xml', key: 'vote:house:119:2:298', tier: 'P3', reasons: ['procedural'],
    title: 'House voted to table H.Res. 1486, 232-147, 47 present (roll call 298)', occurred_at: '2026-09-15T20:46:00Z',
    kind: 'table', required: '1/2', passed: true, counts: [232, 147, 47, 7], positions: 433, thread: 'bill:119:hres:1486',
  },
  {
    date: D3, name: 'roll307.xml', key: 'vote:house:119:2:307', tier: 'P1', reasons: ['resolution'],
    title: 'House adopted H.Con.Res. 93, 220-204 (roll call 307)', occurred_at: '2026-09-16T02:32:00Z', kind: 'resolution',
    required: '1/2', passed: true, counts: [220, 204, 0, 9], positions: 433, thread: 'bill:119:hconres:93',
  },
  {
    // H J RES; curly quotes in vote-desc reach official_text verbatim.
    date: D3, name: 'roll311.xml', key: 'vote:house:119:2:311', tier: 'P0', reasons: ['final_passage'],
    title: 'House passed H.J.Res. 213, 214-208 (roll call 311)', occurred_at: '2026-09-16T22:49:00Z', kind: 'passage',
    required: '1/2', passed: true, counts: [214, 208, 0, 11], positions: 433, thread: 'bill:119:hjres:213',
  },
  {
    date: D3, name: 'roll308.xml', key: 'vote:house:119:2:308', tier: 'P0', reasons: ['concur'],
    title: 'House agreed to the Senate amendments to H.R. 5334, 262-159 (roll call 308)', occurred_at: '2026-09-16T22:28:00Z',
    kind: 'concur', required: '1/2', passed: true, counts: [262, 159, 0, 12], positions: 433, thread: 'bill:119:hr:5334',
  },
  {
    // A Speaker ballot with no majority: the result names the top candidate (212 of 434). Never "elected"; no
    // Present / Not Voting in the list.
    date: D3, name: 'roll2023_002.xml', key: 'vote:house:118:1:2', tier: 'P0', reasons: ['speaker_election'], // D-061: each ballot, even without a majority
    title: 'House vote for Speaker: Jeffries 212, McCarthy 203, Biggs 10, Jordan 6, Banks 1, Zeldin 1, Donalds 1 (roll call 2)',
    occurred_at: '2023-01-03T18:39:00Z', kind: 'speaker_election', required: '1/2', passed: null, counts: [null, null, 0, 0],
    positions: 434,
  },
  {
    // `Call By States` (2023 casing) -> quorum.
    date: D3, name: 'roll2023_001.xml', key: 'vote:house:118:1:1', tier: 'P3', reasons: ['quorum'],
    title: 'House quorum call: 434 present, 1 not voting (roll call 1)', occurred_at: '2023-01-03T17:28:00Z', kind: 'quorum',
    required: null, passed: null, counts: [0, 0, 434, 1], positions: 435,
  },
  {
    source: 'members', date: D3, name: 'house_roll_2026_090_departed_members_and_party_change.xml', key: 'vote:house:119:2:90',
    tier: 'P3', reasons: ['procedural'], title: 'House ordered the previous question on H.Res. 1115, 196-192 (roll call 90)',
    occurred_at: '2026-03-17T19:51:00Z', kind: 'previous_question', required: '1/2', passed: true, counts: [196, 192, 0, 44],
    positions: 432, thread: 'bill:119:hres:1115',
  },
]

describe('goldens: every recorded roll call (DESIGN §3.1 tests)', () => {
  for (const w of GOLDENS) {
    test(`${w.source ?? SRC} ${w.date}/${w.name}`, () => {
      const res = replay(w.source ?? SRC, w.date, w.name)
      const { out, e, r, rec } = parseOk(res)
      checkGolden(`${w.date}_${w.name.replace(/\.xml$/, '')}.json`, out)
      expect(e.object_key).toBe(w.key)
      expect(e.dedup_key).toBe(`${w.key}#result`)
      expect(e.title).toBe(w.title)
      expect(e.importance).toEqual({ tier: w.tier, reasons: w.reasons })
      expect(e.times).toEqual({ occurred_at: w.occurred_at, scheduled_for: null, source_published_at: null, first_seen_at: res.fetchedAt })
      expect([r.question_kind, r.required, r.passed]).toEqual([w.kind, w.required, w.passed])
      expect([r.yea, r.nay, r.present, r.not_voting]).toEqual(w.counts)
      expect(rec.positions).toHaveLength(w.positions)
      expect(e.thread_key).toBe(w.thread)
      expect(e.related).toEqual(w.thread ? [{ rel: 'about', key: w.thread }] : undefined)
      if (w.official) expect(e.official_text).toBe(w.official)
      // Fixed fields of every House vote event (DESIGN §1.2).
      expect(e).toMatchObject({
        event_type: 'vote.result', status: 'ended', branch: 'legislative', body: 'house', features: ['F5', 'F6'], revision: 1,
        provenance: { parser: HOUSE_VOTES_PARSER, confidence: 'high' },
        sources: [{ source_id: SRC, url: res.url, retrieved_at: res.fetchedAt, license: 'us-gov-public-domain', affiliation: 'official-nonpartisan' }],
      })
      expect(rec.members_map).toEqual(MEMBERS.meta)
      // The title never carries source prose (D-043): no question, no vote-desc.
      expect(e.title).not.toContain(r.question)
      // The SourceDefinition's parse is parseVote with the defaults.
      expect(houseClerkVotes.parse('roll', res)).toEqual(out)
    })
  }
})

describe('hand-read details', () => {
  test('roll314: member rows as printed, joined to the map by name-id (the House name-id IS the bioguide)', () => {
    const { rec, e } = parseOk(r314())
    expect(rec.positions[0]).toEqual({
      member_key: 'bioguide:A000370', id_confidence: 'authority', lis: null, name: MEMBERS.lookupHouse('A000370')!.name,
      name_source: 'map', source_name: 'Adams', party: 'D', state: 'NC', role: 'legislator', position: 'yea', vote_text: 'Yea', pair: null,
    })
    expect(rec.positions.at(-1)).toMatchObject({ member_key: 'bioguide:Z000018', source_name: 'Zinke', party: 'R', state: 'MT', position: 'yea' })
    expect(rec.positions.filter((p) => p.role === 'speaker').map((p) => p.member_key)).toEqual(['bioguide:J000299'])
    expect(rec.counts).toEqual({ yea: 401, nay: 14, present: 0, not_voting: 18 })
    expect(e.member_votes_ref).toBe('votes/house/119/2/314.json')
    expect(rec.ref).toBe('votes/house/119/2/314.json')
    expect((e.result as VoteResult).by_party).toEqual([
      { party: 'Republican', yea: 191, nay: 14, present: 0, not_voting: 13 },
      { party: 'Democratic', yea: 209, nay: 0, present: 0, not_voting: 5 },
      { party: 'Independent', yea: 1, nay: 0, present: 0, not_voting: 0 },
    ])
    expect(e.result).toMatchObject({ vote_type: '2/3 YEA-AND-NAY', legis_num: 'S 2403', committee_of_the_whole: false })
  })

  test('roll300: RECORDED VOTE words Aye/No map to yea/nay; vote_text stays verbatim', () => {
    const { rec } = parseOk(roll(D2, 'roll300.xml'))
    const words = new Map<string, Set<string>>()
    for (const p of rec.positions) words.set(p.position, (words.get(p.position) ?? new Set()).add(p.vote_text))
    expect(Object.fromEntries([...words].map(([k, v]) => [k, [...v]]))).toEqual({ yea: ['Aye'], nay: ['No'], not_voting: ['Not Voting'] })
  })

  test('roll275: Committee of the Whole, delegates (state XX), accented names, amendment number and author', () => {
    const { e, rec } = parseOk(roll(D3, 'roll275.xml'))
    expect(e.result).toMatchObject({ committee_of_the_whole: true, amendment_num: '20', amendment_author: 'Harrigan of North Carolina Part A Amendment No. 44' })
    expect(rec.positions.filter((p) => p.state === 'XX')).toHaveLength(6)
    expect(rec.positions.find((p) => p.member_key === 'bioguide:H001103')).toMatchObject({ source_name: 'Hernández', state: 'XX', party: 'D' })
  })

  test('roll311: curly quotes in vote-desc reach official_text verbatim', () => {
    const { e } = parseOk(roll(D3, 'roll311.xml'))
    expect(e.official_text).toContain('“California State Nonroad Engine Pollution Control Standards; Commercial Harbor Craft Regulations; Notice of Decision”')
    expect(e.official_text.endsWith(' — Passed')).toBe(true)
  })

  test('Present counts: roll009 1, roll2025_145 1, roll298 47 (each a member row with vote "Present")', () => {
    for (const [d, n, want] of [[D3, 'roll009.xml', 1], [D3, 'roll2025_145.xml', 1], [D3, 'roll298.xml', 47]] as const) {
      const { r, rec } = parseOk(roll(d, n))
      expect(r.present).toBe(want)
      expect(rec.positions.filter((p) => p.position === 'present' && p.vote_text === 'Present')).toHaveLength(want)
    }
  })

  test('Speaker elections: candidates are named people only; Present / Not Voting are buckets', () => {
    const a = parseOk(roll(D3, 'roll2025_002.xml'))
    expect(a.r.candidates).toEqual([{ name: 'Johnson (LA)', votes: 218 }, { name: 'Jeffries', votes: 215 }, { name: 'Emmer', votes: 1 }])
    expect(a.rec.counts).toEqual({ yea: null, nay: null, present: 0, not_voting: 0, candidates: a.r.candidates })
    expect(a.rec.positions.every((p) => p.position === 'candidate')).toBe(true)
    expect(a.e.thread_key).toBeUndefined()
    const b = parseOk(roll(D3, 'roll2023_002.xml'))
    expect(b.r.result_text).toBe('Jeffries')
    expect(b.r.candidates!.map((c) => c.name)).toEqual(['Jeffries', 'McCarthy', 'Biggs', 'Jordan', 'Banks', 'Zeldin', 'Donalds'])
    expect(b.e.title).not.toMatch(/elect/i)
    expect(b.e.title).not.toMatch(/Present|Not Voting/)
  })

  test('roll2023_001 `Call By States` and roll2025_001 `Call by States` are both quorum (case-insensitive)', () => {
    expect(parseOk(roll(D3, 'roll2023_001.xml')).r.question).toBe('Call By States')
    expect(parseOk(roll(D3, 'roll2025_001.xml')).r.question).toBe('Call by States')
  })

  test('House name misses never drift: they keep the source name and are counted in the health detail', () => {
    // 2023 (118th Congress): many members are not in the 119th map.
    const { out, rec } = parseOk(roll(D3, 'roll2023_002.xml'))
    expect(rec.unresolved).toBeGreaterThan(5)
    expect(out.health.detail).toContain(`${rec.unresolved} member ids not in the member list`)
    const miss = rec.positions.find((p) => p.name_source === 'source')!
    expect(miss).toMatchObject({ id_confidence: 'authority', name: miss.source_name })
    expect(miss.member_key).toMatch(/^bioguide:[A-Z][0-9]{6}$/)
  })

  test('roll 2026-090: four former members resolve only through the departed seed; K000401 party R as printed', () => {
    const res = replay('members', D3, 'house_roll_2026_090_departed_members_and_party_change.xml')
    const full = parseOk(res)
    expect(full.rec.unresolved).toBe(0)
    expect(full.rec.positions.find((p) => p.member_key === 'bioguide:K000401')).toMatchObject({ party: 'R', name_source: 'map' })
    const seed = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/adapters/src/generated/members_departed_119.json'), 'utf8')) as { members: Array<{ id: { bioguide: string } }> }
    const departed = new Set(seed.members.map((m) => m.id.bioguide))
    const without: MembersMap = { ...MEMBERS_MAP, members: Object.fromEntries(Object.entries(MEMBERS_MAP.members).filter(([bg]) => !departed.has(bg))) }
    const thin = parseOk(res, 'roll', { members: makeLookup(without), maxUnresolved: 5 })
    expect(thin.rec.unresolved).toBe(4) // House: never drift on a miss, whatever maxUnresolved says
    expect(thin.out.health.status).toBe('ok')
    expect(thin.rec.positions.filter((p) => p.name_source === 'source').every((p) => departed.has(p.member_key.slice('bioguide:'.length)))).toBe(true)
  })

  test('a roll call parsed on roll_next (the probe found the new roll) publishes the same event', () => {
    const a = parseOk(r314(), 'roll_next')
    expect(a.out.health.endpoint).toBe('roll_next')
    expect(a.out.events).toEqual(parseOk(r314()).out.events)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// index
// ---------------------------------------------------------------------------------------------------------------

describe('index: the listing names the targets, never events', () => {
  const ROLLS = [314, 313, 312, 311, 310, 309, 308, 307, 306, 305]
  const wantTargets = [
    { endpoint: 'roll_next', url: 'https://clerk.house.gov/evs/2026/roll315.xml' },
    ...ROLLS.map((n) => ({ endpoint: 'roll', url: `https://clerk.house.gov/evs/2026/roll${n}.xml` })),
  ]
  const idx = () => roll(D3, 'votes_index_119_2nd.html')

  test('votes_index_119_2nd.html (the fixed CongressNum URL): roll_next 315, roll 314..305, health ok', () => {
    const res = idx()
    expect(res.url).toBe(INDEX_URL)
    const out = parseVote('index', res)
    checkGolden(`${D3}_votes_index_119_2nd.json`, out)
    expect(out.events).toEqual([])
    expect(out.records).toBeUndefined()
    expect(out.targets).toEqual(wantTargets)
    expect(out.health).toMatchObject({ status: 'ok', items_seen: 10 })
    expectHubPayloadRules(houseClerkVotes, out, res)
  })

  test('votes_index_session2nd.html (the ?Session=2nd form, currentSession says 2nd there and 1st in the other): identical targets', () => {
    const res = roll(D3, 'votes_index_session2nd.html')
    const out = parseVote('index', res)
    expect(out.health.status).toBe('ok')
    expect(out.targets).toEqual(parseVote('index', idx()).targets)
    expectHubPayloadRules(houseClerkVotes, out, res)
  })

  test('NEGATIVE votes_index_roll315_NEGATIVE_no_votes_found.html: empty, zero roll targets, probe roll 001 of 2026', () => {
    const res = roll(D3, 'votes_index_roll315_NEGATIVE_no_votes_found.html')
    expect(res.body).toContain('class="role-call-vote"') // the empty listing still has a vote div: never count those
    const out = parseVote('index', res)
    expect(out.events).toEqual([])
    expect(out.health).toMatchObject({ status: 'empty', items_seen: 0 })
    expect(out.health.detail).toContain('No Votes Found')
    expect(out.targets).toEqual([{ endpoint: 'roll_next', url: 'https://clerk.house.gov/evs/2026/roll001.xml' }])
    expectHubPayloadRules(houseClerkVotes, out, res)
  })

  test('variant: the empty listing without its marker = drift', () => {
    const res = roll(D3, 'votes_index_roll315_NEGATIVE_no_votes_found.html')
    expectRefused('index', withBody(res, edit(res.body, 'No Votes Found', '')), 'drift', /no roll-number rows and no "No Votes Found"/)
  })

  test('variant: the full listing with its rows (roll labels) removed and no marker = drift', () => {
    const res = idx()
    expectRefused('index', withBody(res, res.body.replace(/aria-label="Roll number, \d+"/g, '')), 'drift', /no roll-number rows/)
  })

  test('variant: rows AND the marker = drift', () => {
    const res = idx()
    expectRefused('index', withBody(res, `${res.body}<p>No Votes Found</p>`), 'drift', /AND the "No Votes Found" marker/)
  })

  test('variant: an href roll that disagrees with its label = drift', () => {
    const res = idx()
    expectRefused('index', withBody(res, edit(res.body, 'href="/Votes/2026313?Page=2"', 'href="/Votes/2026331?Page=2"')), 'drift', /href roll 331 disagrees with its label 313/)
  })

  test('variant: an href that is not /Votes/{year}{roll} = drift', () => {
    const res = idx()
    expectRefused('index', withBody(res, edit(res.body, 'href="/Votes/2026313?Page=2"', 'href="/Votes/Detail?id=2026313"')), 'drift', /is not \/Votes\/\{year\}\{roll\}/)
  })

  test('variant: rows not newest first = drift (the probe is the top row + 1)', () => {
    const res = idx()
    let b = edit(res.body, 'href="/Votes/2026314?Page=2" aria-label="Roll number, 314"', 'href="/Votes/2026999?Page=2" aria-label="Roll number, 999"')
    b = edit(b, 'href="/Votes/2026313?Page=2" aria-label="Roll number, 313"', 'href="/Votes/2026314?Page=2" aria-label="Roll number, 314"')
    b = edit(b, 'href="/Votes/2026999?Page=2" aria-label="Roll number, 999"', 'href="/Votes/2026313?Page=2" aria-label="Roll number, 313"')
    expectRefused('index', withBody(res, b), 'drift', /row 2 \(roll 314\) is not older than row 1 \(roll 313\)/)
  })

  test('variant: a listing served for another session than the URL asked for = drift', () => {
    const res = idx()
    expectRefused('index', variant(res, { url: 'https://clerk.house.gov/Votes/MemberVotes?CongressNum=119&Session=1st' }), 'drift', /URL asked for Congress 119, session 1st/)
  })

  test('variant: pagination_info that disagrees with the rows = drift', () => {
    const res = idx()
    expectRefused('index', withBody(res, res.body.replaceAll('1 - 10 of 314 Results', '1 - 12 of 314 Results')), 'drift', /disagrees with the 10 rows/)
  })

  test('variant: a JSON content-type on the listing = drift', () => {
    expectRefused('index', variant(idx(), { headers: { 'content-type': 'application/json' } }), 'drift', /not the HTML listing/)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// NEGATIVE / empty fixtures
// ---------------------------------------------------------------------------------------------------------------

describe('the Clerk error body (HTTP 200, 65 B, root <xml>)', () => {
  test('NEGATIVE roll315_NEGATIVE_error_body.xml on roll_next: empty, "roll 315 of 2026 not posted yet"', () => {
    const res = roll(D2, 'roll315_NEGATIVE_error_body.xml')
    expect(res.status).toBe(200)
    expectRefused('roll_next', res, 'empty', /^roll 315 of 2026 not posted yet/)
  })
  test('NEGATIVE roll315_NEGATIVE_error_body.xml on roll (a listed roll): error, so the poller backs off and retries', () => {
    expectRefused('roll', roll(D2, 'roll315_NEGATIVE_error_body.xml'), 'error', /^Clerk error body for a listed roll \(roll 315 of 2026\)/)
  })
  test('NEGATIVE roll2027_001_NEGATIVE_future_year.xml (the year rollover): empty on roll_next, error on roll', () => {
    const res = roll(D3, 'roll2027_001_NEGATIVE_future_year.xml')
    expectRefused('roll_next', res, 'empty', /^roll 1 of 2027 not posted yet/)
    expectRefused('roll', res, 'error', /listed roll \(roll 1 of 2027\)/)
  })
  test('variant: an <xml> body with other words = drift (only the exact error answer is "not yet")', () => {
    const res = roll(D2, 'roll315_NEGATIVE_error_body.xml')
    expectRefused('roll_next', withBody(res, '<xml>Service unavailable</xml>'), 'drift', /not the Clerk's "Error sanitizing file"/)
  })
  test('review 483d7ab (nit): the error body must name the URL\'s own roll file, else drift', () => {
    const res = roll(D2, 'roll315_NEGATIVE_error_body.xml')
    expectRefused('roll_next', withBody(res, '<xml>Error sanitizing file "roll316.xml". Please try again.</xml>'), 'drift', /the Clerk's error body names roll316\.xml, but the URL asked for roll315\.xml/)
    expectRefused('roll', withBody(res, '<xml>Error sanitizing file "roll316.xml". Please try again.</xml>'), 'drift', /names roll316\.xml/)
  })
})

describe('other refusals', () => {
  test('NEGATIVE house.docs.floor billsthisweek_20260928_NEGATIVE_file_not_found.html (200 HTML "File Not Found") fed to roll: drift', () => {
    const res = replay('house.docs.floor', D2, 'billsthisweek_20260928_NEGATIVE_file_not_found.html')
    expect(res.status).toBe(200)
    expect(res.body).toContain('File Not Found')
    expectRefused('roll', res, 'drift', /an HTML page \(<HTML>\) instead of a roll call XML/)
    // The same page served at a roll URL (status and content-type are no help either way).
    expectRefused('roll', variant(res, { url: rollUrl(2026, 316) }), 'drift', /an HTML page/)
    expectRefused('roll_next', variant(res, { url: rollUrl(2026, 316) }), 'drift', /an HTML page/)
  })
  test('HTTP 304 = not_modified; HTTP 500 = error; an unknown endpoint = error', () => {
    expectRefused('roll', variant(r314(), { status: 304, body: '' }), 'not_modified', /304/)
    expectRefused('index', variant(r314(), { status: 500 }), 'error', /HTTP 500/)
    expectRefused('menu', r314(), 'error', /unknown endpoint "menu"/)
  })
  test('an empty body = drift', () => {
    expectRefused('roll', withBody(r314(), ''), 'drift', /not XML/)
  })
  test('a truncated roll call = drift', () => {
    const res = r314()
    expectRefused('roll', withBody(res, res.body.slice(0, 60_000)), 'drift', /does not end with <\/vote-data><\/rollcall-vote>/)
  })
  test('a JSON content-type on a roll = drift', () => {
    expectRefused('roll', variant(r314(), { headers: { 'content-type': 'application/json' } }), 'drift', /not XML/)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Non-default cases (DESIGN §3.1 "each mutation-checked") and every drift check
// ---------------------------------------------------------------------------------------------------------------

describe('non-default cases', () => {
  /** A fetch after the 2026 session ends: the variants below move the vote date past roll314's own fetch (2026-10-02). */
  const LATE = '2027-01-04T00:00:00.000Z'
  test('veto override: passed false with 248 > 177 (from vote-result, never from yea > nay)', () => {
    const { r, e } = parseOk(roll(D3, 'roll009.xml'))
    expect(r.yea! > r.nay!).toBe(true)
    expect(r.passed).toBe(false)
    expect(e.title).toMatch(/^House failed to override the veto of H\.R\. 131/)
  })

  test('naive Eastern across DST: roll009 (January, EST -05:00) vs roll314 (September, EDT -04:00)', () => {
    expect(parseOk(roll(D3, 'roll009.xml')).e.times.occurred_at).toBe('2026-01-08T20:23:00Z') // 15:23 + 5 h
    expect(parseOk(r314()).e.times.occurred_at).toBe('2026-09-16T23:05:00Z') // 19:05 + 4 h
  })

  test('variant: roll314 on 1-Nov-2026 at 1:30 AM (the repeated fall-back hour) -> occurred_at null + time_note, still published', () => {
    const res = r314()
    let b = edit(res.body, '<action-date>16-Sep-2026</action-date>', '<action-date>1-Nov-2026</action-date>')
    b = edit(b, '<action-time time-etz="19:05">7:05 PM</action-time>', '<action-time time-etz="01:30">1:30 AM</action-time>')
    const { e, r, out } = parseOk(variant(withBody(res, b), { fetchedAt: LATE }))
    expect(e.times.occurred_at).toBeNull()
    expect(r.time_note).toBe('1:30 AM Eastern on 1-Nov-2026 falls in the repeated fall-back hour, so the instant is ambiguous')
    expect(out.health.detail).toContain('ambiguous Eastern time')
  })

  test('variant: 1-Nov-2026 at 2:30 AM (after the fall-back hour) is unambiguous EST', () => {
    const res = r314()
    let b = edit(res.body, '<action-date>16-Sep-2026</action-date>', '<action-date>1-Nov-2026</action-date>')
    b = edit(b, '<action-time time-etz="19:05">7:05 PM</action-time>', '<action-time time-etz="02:30">2:30 AM</action-time>')
    expect(parseOk(variant(withBody(res, b), { fetchedAt: LATE })).e.times.occurred_at).toBe('2026-11-01T07:30:00Z')
  })

  test('variant: roll314 on 8-Mar-2026 at 2:30 AM (the spring-forward gap: that time does not exist) -> drift', () => {
    const res = r314()
    let b = edit(res.body, '<action-date>16-Sep-2026</action-date>', '<action-date>8-Mar-2026</action-date>')
    b = edit(b, '<action-time time-etz="19:05">7:05 PM</action-time>', '<action-time time-etz="02:30">2:30 AM</action-time>')
    expectRefused('roll', withBody(res, b), 'drift', /2:30 AM Eastern on 8-Mar-2026 does not exist/)
  })

  test('variant: a tie built from roll290 (202-202, result Failed) -> passed false, "House rejected ..."', () => {
    const res = roll(D3, 'roll290.xml')
    const b = retotal(editFirst(res.body, '<vote>Nay</vote>', '<vote>Not Voting</vote>', 10))
    const { r, e } = parseOk(withBody(res, b))
    expect([r.yea, r.nay, r.not_voting]).toEqual([202, 202, 28])
    expect(r.passed).toBe(false)
    expect(e.title).toBe('House rejected a motion to recommit H.R. 9436, 202-202 (roll call 290)')
  })

  test('variant: time-etz disagreeing with the AM/PM text -> drift', () => {
    const res = r314()
    expectRefused('roll', withBody(res, edit(res.body, 'time-etz="19:05">7:05 PM', 'time-etz="19:05">7:50 PM')), 'drift', /time-etz 19:05 disagrees with its text "7:50 PM"/)
    expectRefused('roll', withBody(res, edit(res.body, 'time-etz="19:05">7:05 PM', 'time-etz="19:05">7:05 AM')), 'drift', /disagrees/)
  })

  test('variant: one member vote removed -> drift (members no longer reproduce the totals)', () => {
    const res = r314()
    const b = edit(res.body, /<recorded-vote>\s*<legislator name-id="A000370"[\s\S]*?<\/recorded-vote>/, '')
    expectRefused('roll', withBody(res, b), 'drift', /400 yea member votes, but the totals say 401/)
  })

  test('variant: roll009 with the question `Override of the Veto` (unknown, mentions a veto) -> drift', () => {
    const res = roll(D3, 'roll009.xml')
    const b = edit(res.body, 'Passage, Objections of the President To The Contrary Notwithstanding', 'Override of the Veto')
    expectRefused('roll', withBody(res, b), 'drift', /possible veto vote, question not in the table: "Override of the Veto"/)
  })

  test('variant: roll107 asked `On Agreeing to the Resolution` -> the disposition rule: question_kind rule, P3', () => {
    const res = roll(D3, 'roll107.xml')
    const { r, e } = parseOk(withBody(res, edit(res.body, 'On Ordering the Previous Question', 'On Agreeing to the Resolution')))
    expect(r.question_kind).toBe('rule')
    expect(e.importance).toEqual({ tier: 'P3', reasons: ['procedural'] })
    expect(e.title).toBe('House adopted H.Res. 1142, 209-206 (roll call 107)')
    // ... while a non-rule H RES stays a P1 resolution.
    const plain = parseOk(withBody(res, edit(edit(res.body, 'On Ordering the Previous Question', 'On Agreeing to the Resolution'), 'Providing for disposition', 'Condemning')))
    expect([plain.r.question_kind, plain.e.importance!.tier]).toEqual(['resolution', 'P1'])
  })

  test('variant: an unknown question that does not mention a veto -> published at P3 with a neutral title + a health note', () => {
    // (Until D-088 this used `... and Agree`, now in the table: on S 2403 that is drift, pinned below.)
    const res = r314()
    const { r, e, out } = parseOk(withBody(res, edit(res.body, 'On Motion to Suspend the Rules and Pass</vote-question>', 'On Motion to Instruct Conferees</vote-question>')))
    expect(r.question_kind).toBe('unknown')
    expect(e.importance).toEqual({ tier: 'P3', reasons: ['unknown_question'] })
    expect(e.title).toBe('House roll call 314: the question was agreed to, 401-14')
    expect(out.health.detail).toContain('unknown vote question "On Motion to Instruct Conferees"')
  })

  test('D-088: `... Suspend the Rules and Agree[, as Amended]` on an H RES or H CON RES -> suspension_resolution, P1, any case or spacing', () => {
    const res = roll(D3, 'roll2025_158_suspend_agree.xml')
    const q = 'On Motion to Suspend the Rules and Agree</vote-question>'
    for (const asked of ['On Motion to Suspend the Rules and Agree, as Amended', 'ON MOTION TO SUSPEND  THE RULES AND AGREE', 'on motion to suspend the rules and agree,  as   amended']) {
      const { r, e } = parseOk(withBody(res, edit(res.body, q, `${asked}</vote-question>`)))
      expect([r.question, r.question_kind], asked).toEqual([asked.replace(/\s+/g, ' '), 'suspension_resolution'])
      expect(e.importance).toEqual({ tier: 'P1', reasons: ['resolution'] })
      expect(e.title).toBe('House adopted H.Res. 488 under suspension of the rules, 280-113, 6 present; two-thirds needed (roll call 158)')
    }
    const con = parseOk(withBody(res, edit(res.body, '<legis-num>H RES 488</legis-num>', '<legis-num>H CON RES 488</legis-num>')))
    expect([con.r.question_kind, con.e.importance, con.e.thread_key]).toEqual(['suspension_resolution', { tier: 'P1', reasons: ['resolution'] }, 'bill:119:hconres:488'])
    expect(con.e.title).toBe('House adopted H.Con.Res. 488 under suspension of the rules, 280-113, 6 present; two-thirds needed (roll call 158)')
  })

  test('D-088: a failed suspension of a resolution reads "failed to adopt", not "rejected" (a majority can vote yes)', () => {
    const res = roll(D3, 'roll2025_158_suspend_agree.xml')
    const { e, r } = parseOk(withBody(res, edit(res.body, '<vote-result>Passed</vote-result>', '<vote-result>Failed</vote-result>')))
    expect([r.passed, r.question_kind, e.importance!.tier]).toEqual([false, 'suspension_resolution', 'P1'])
    expect(e.title).toBe('House failed to adopt H.Res. 488 under suspension of the rules, 280-113, 6 present; two-thirds needed (roll call 158)')
  })

  test('D-088: `... Suspend the Rules and Agree` on anything but an H RES or H CON RES -> drift (zero events)', () => {
    const r = r314() // S 2403, a bill
    expectRefused('roll', withBody(r, edit(r.body, 'On Motion to Suspend the Rules and Pass</vote-question>', 'On Motion to Suspend the Rules and Agree</vote-question>')), 'drift',
      /"On Motion to Suspend the Rules and Agree" adopts a resolution, but <legis-num> is "S 2403", not an H RES or H CON RES/)
    const res = roll(D3, 'roll2025_158_suspend_agree.xml')
    for (const legis of ['H R 488', 'H J RES 488', 'S 488', 'S J RES 488', 'S RES 488', 'S CON RES 488', 'ADJOURN']) {
      expectRefused('roll', withBody(res, edit(res.body, '<legis-num>H RES 488</legis-num>', `<legis-num>${legis}</legis-num>`)), 'drift', new RegExp(`<legis-num> is "${legis}", not an H RES`))
    }
    const amended = edit(res.body, 'Rules and Agree</vote-question>', 'Rules and Agree, as Amended</vote-question>')
    expectRefused('roll', withBody(res, edit(amended, '<legis-num>H RES 488</legis-num>', '<legis-num>H R 488</legis-num>')), 'drift', /"On Motion to Suspend the Rules and Agree, as Amended" adopts a resolution, but <legis-num> is "H R 488"/)
    expectRefused('roll', withBody(res, edit(res.body, /\s*<legis-num>H RES 488<\/legis-num>/, '')), 'drift', /<legis-num> is absent, not an H RES/)
  })

  test('variant: question case and spacing do not matter (`ON  passage`)', () => {
    const res = roll(D2, 'roll310.xml')
    expect(parseOk(withBody(res, edit(res.body, '<vote-question>On Passage<', '<vote-question>ON  passage<'))).r.question_kind).toBe('passage')
  })

  test('variant: a failed suspension reads "failed to pass", not "rejected" (a majority can vote yes)', () => {
    const res = r314()
    const { e, r } = parseOk(withBody(res, edit(res.body, '<vote-result>Passed</vote-result>', '<vote-result>Failed</vote-result>')))
    expect(r.passed).toBe(false)
    expect(e.title).toBe('House failed to pass S. 2403 under suspension of the rules, 401-14; two-thirds needed (roll call 314)')
  })

  test('variant: a Speaker election whose result is not the top candidate -> drift', () => {
    const res = roll(D3, 'roll2023_002.xml')
    expectRefused('roll', withBody(res, edit(res.body, '<vote-result>Jeffries</vote-result>', '<vote-result>McCarthy</vote-result>')), 'drift', /not the single top candidate/)
  })
})

describe('drift checks (DESIGN §3.1): each = zero events, zero records', () => {
  const r = r314()
  const bad = (from: string | RegExp, to: string, detail: RegExp, res: FetchedResponse = r) =>
    expectRefused('roll', withBody(res, edit(res.body, from, to)), 'drift', detail)

  test('root not <rollcall-vote>', () => bad('<rollcall-vote>', '<rollcall>', /root element <rollcall>/))
  test('identity: the roll number disagrees with the URL', () => {
    expectRefused('roll', variant(r, { url: rollUrl(2026, 313) }), 'drift', /<rollcall-num> 314 is not the URL's roll 313/)
  })
  test('identity: the URL year does not fit the XML Congress/session (year rule)', () => {
    expectRefused('roll', variant(r, { url: rollUrl(2025, 314) }), 'drift', /URL's year 2025 is 119-1/)
    bad('<session>2nd</session>', '<session>1st</session>', /session 1, but the URL's year 2026 is 119-2/)
    bad('<session>2nd</session>', '<session>3rd</session>', /is not 1st or 2nd/)
  })
  test('a URL that is not evs/{year}/rollNNN.xml', () => {
    expectRefused('roll', variant(r, { url: 'https://clerk.house.gov/evs/2026/roll314.xml?x=1' }), 'drift', /is not https:\/\/clerk\.house\.gov\/evs/)
  })
  test('neither chamber nor committee = U.S. House of Representatives', () => {
    bad('<chamber>U.S. House of Representatives</chamber>', '<chamber>U.S. Senate</chamber>', /is "U.S. Senate"/)
    bad('<chamber>U.S. House of Representatives</chamber>', '', /exactly one of <chamber> \/ <committee>/)
    bad('<chamber>U.S. House of Representatives</chamber>', '<chamber>U.S. House of Representatives</chamber><committee>U.S. House of Representatives</committee>', /exactly one/)
  })
  test('unknown vote-type', () => bad('<vote-type>2/3 YEA-AND-NAY</vote-type>', '<vote-type>VOICE VOTE</vote-type>', /unknown <vote-type> "VOICE VOTE"/))
  test('unknown result', () => bad('<vote-result>Passed</vote-result>', '<vote-result>Adopted</vote-result>', /unknown <vote-result> "Adopted"/))
  test('a vote value outside the vote-type vocabulary', () => {
    bad(/<vote>Yea<\/vote>/, '<vote>Aye</vote>', /vote "Aye" is outside the 2\/3 YEA-AND-NAY vocabulary/)
    const q = roll(D3, 'roll2025_001.xml')
    bad(/<vote>Present<\/vote>/, '<vote>Yea</vote>', /vote "Yea" is outside the QUORUM vocabulary/, q)
    const s = roll(D3, 'roll2025_002.xml')
    bad(/<vote>Jeffries<\/vote>/, '<vote>Yea</vote>', /vote "Yea" is outside the Speaker election vocabulary/, s)
  })
  test('members not reproducing a party row (a member\'s party changed, totals kept)', () => {
    bad('name-id="A000370" sort-field="Adams" unaccented-name="Adams" party="D"', 'name-id="A000370" sort-field="Adams" unaccented-name="Adams" party="R"', /from party [DR], but its <totals-by-party> row says/)
  })
  test('a party with members but no <totals-by-party> row, and an unknown party name', () => {
    bad('name-id="A000370" sort-field="Adams" unaccented-name="Adams" party="D"', 'name-id="A000370" sort-field="Adams" unaccented-name="Adams" party="L"', /party "L" is not D, R or I/)
    bad('<party>Independent</party>', '<party>Libertarian</party>', /unknown party "Libertarian"/)
  })
  test('a duplicate or malformed name-id', () => {
    bad('name-id="A000055"', 'name-id="A000370"', /name-id A000370 appears twice/)
    bad('name-id="A000055"', 'name-id="a000055"', /malformed name-id "a000055"/)
  })
  test('a <recorded-vote> block in another shape (attribute order, extra element) = drift', () => {
    bad('name-id="A000055" sort-field="Aderholt"', 'sort-field="Aderholt" name-id="A000055"', /member 2: a <recorded-vote> block that does not match/)
    bad(/(<recorded-vote>\s*<legislator name-id="A000055"[^>]*>Aderholt<\/legislator>\s*<vote>Yea<\/vote>)/, '$1<note>x</note>', /member 2: a <recorded-vote> block that does not match/)
  })
  test("review 483d7ab F8 / time F3: the action date belongs to the URL year's session and is not later than our fetch", () => {
    const late = (date: string, etz?: string, text?: string) => {
      let body = edit(r.body, '<action-date>16-Sep-2026</action-date>', `<action-date>${date}</action-date>`)
      if (etz !== undefined) body = edit(body, '<action-time time-etz="19:05">7:05 PM</action-time>', `<action-time time-etz="${etz}">${text}</action-time>`)
      return variant(withBody(r, body), { fetchedAt: '2032-01-01T00:00:00.000Z' })
    }
    expectRefused('roll', late('16-Sep-2027'), 'drift', /<action-date> 16-Sep-2027 7:05 PM is outside the 2026 session of the URL \(2026-01-01 to 2027-01-03 noon Eastern\)/)
    expectRefused('roll', late('16-Sep-2019'), 'drift', /16-Sep-2019 7:05 PM is outside the 2026 session/)
    expectRefused('roll', late('16-Sep-2031'), 'drift', /16-Sep-2031 7:05 PM is outside the 2026 session/)
    expectRefused('roll', late('3-Jan-2027', '12:00', '12:00 PM'), 'drift', /is outside the 2026 session/) // the next Congress begins at noon
    expect(parseOk(late('3-Jan-2027', '11:59', '11:59 AM')).e.times.occurred_at).toBe('2027-01-03T16:59:00Z')
    expect(parseOk(late('1-Jan-2026', '00:05', '12:05 AM')).e.times.occurred_at).toBe('2026-01-01T05:05:00Z')
    // the fall-back hour (instant unknown) is bounded too: another year's repeated hour by the session window, this
    // year's by the fetch (read as EDT, the earlier of its two instants)
    expectRefused('roll', late('2-Nov-2025', '01:30', '1:30 AM'), 'drift', /2-Nov-2025 1:30 AM is outside the 2026 session/)
    bad(/<action-date>16-Sep-2026<\/action-date>\s*<action-time time-etz="19:05">7:05 PM<\/action-time>/, '<action-date>1-Nov-2026</action-date><action-time time-etz="01:30">1:30 AM</action-time>', /1-Nov-2026 1:30 AM is later than our own fetch/)
    // roll314 was fetched 2026-10-02T17:59Z: a vote at 7:05 PM EDT that day (23:05Z) is in the future
    bad('<action-date>16-Sep-2026</action-date>', '<action-date>2-Oct-2026</action-date>', /2-Oct-2026 7:05 PM is later than our own fetch/)
  })
  test('unknown month; a malformed date', () => {
    bad('<action-date>16-Sep-2026</action-date>', '<action-date>16-Spt-2026</action-date>', /unknown month "Spt"/)
    bad('<action-date>16-Sep-2026</action-date>', '<action-date>2026-09-16</action-date>', /is not D-Mon-YYYY/)
    bad('<action-date>16-Sep-2026</action-date>', '<action-date>31-Sep-2026</action-date>', /is not a real date/)
  })
  test('a legis-num outside the table', () => bad('<legis-num>S 2403</legis-num>', '<legis-num>H AMDT 5</legis-num>', /"H AMDT 5" is outside the bill table/))
  test('an element we did not record, or a repeated one, in <vote-metadata>', () => {
    bad('<vote-desc>', '<vote-title>x</vote-title><vote-desc>', /element we did not record: <vote-title>/)
    bad('<vote-result>Passed</vote-result>', '<vote-result>Passed</vote-result><vote-result>Failed</vote-result>', /repeats <vote-result>/)
  })
  test('<totals-by-candidate> on a question that is not a Speaker election', () => {
    bad('<totals-by-vote>', '<totals-by-candidate><candidate>X</candidate><candidate-total>1</candidate-total></totals-by-candidate><totals-by-vote>', /not a Speaker election/)
  })
  test('a quorum call with yeas', () => {
    const q = roll(D3, 'roll2025_001.xml')
    bad(/<totals-by-vote>([\s\S]*?)<yea-total>0<\/yea-total>/, '<totals-by-vote>$1<yea-total>3</yea-total>', /a quorum call with 3 yeas/, q)
  })
  test('an entity outside XML\'s five; malformed XML in the head', () => {
    bad('<vote-desc>Retire through Ownership Act</vote-desc>', '<vote-desc>Retire&nbsp;through Ownership Act</vote-desc>', /entity outside XML's five/)
    bad('<vote-desc>Retire through Ownership Act</vote-desc>', '<vote-desc>Retire <b>through</vote-desc>', /not well-formed XML/)
  })
})
