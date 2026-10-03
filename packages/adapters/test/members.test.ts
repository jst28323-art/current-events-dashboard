// lib/members.ts (scratch/phase2/DESIGN.md §2.2, §2.3, §3.6): the generated members map is built only from good input,
// fails closed on every bad answer, is append-only within a Congress, and agrees with the Senate's own member list.
//
// This file is also the GENERATOR (no .mjs script: Node cannot import the repo's .js-suffixed TS modules):
//   UPDATE_MEMBERS=1 npx vitest run packages/adapters/test/members.test.ts
// rewrites src/generated/members.json from the committed inputs (fixtures/members/2026-10-02/legislators-current.json,
// the departed seed, and the committed map as `previous`); check the diff by hand. To re-cut the departed seed from a
// fresh legislators-historical.json (13.5 MB, kept out of the repo; one request with the CLAUDE.md User-Agent), also set
//   MEMBERS_HISTORICAL=<path to the raw file> MEMBERS_HISTORICAL_FETCHED_AT=<the response Date as ISO Z>
import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '@ced/schema'
import {
  HISTORICAL_URL, MEMBERS, MEMBERS_MAP, buildMembersMap, displayName, extractDeparted, makeLookup, serializeMembersMap,
  type DepartedSeed, type LegislatorRecord, type MembersMap,
} from '../src/lib/members.js'
import { isoZ } from '../src/lib/eastern.js'
import { REPO_ROOT, fixturePath, replay, variant } from './replay.js'
import type { FetchedResponse } from '../src/types.js'

const GEN = join(REPO_ROOT, 'packages', 'adapters', 'src', 'generated')
const MAP_PATH = join(GEN, 'members.json')
const SEED_PATH = join(GEN, 'members_departed_119.json')
const UPDATE = process.env.UPDATE_MEMBERS === '1'

const CURRENT_RES = replay('members', '2026-10-02', 'legislators-current.json')
const current = (): FetchedResponse => variant(CURRENT_RES, {})
const snapshot = (): FetchedResponse => replay('members', '2026-10-03', 'legislators-current_ghpages_8125e52b_2026-09-02T2014Z.json')
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const seed = (): DepartedSeed => readJson(SEED_PATH)
const EMPTY_SEED: DepartedSeed = { url: HISTORICAL_URL, sha256: '0'.repeat(64), fetched_at: '2026-10-03T00:00:00Z', congress: 119, congress_start: '2025-01-03', count: 0, members: [] }
const BUILT = '2026-10-03T00:00:00Z'
const build = (res: FetchedResponse, s: DepartedSeed = EMPTY_SEED, prev: MembersMap | null = null) => buildMembersMap(res, s, prev, { builtAt: BUILT })
const okMap = (r: ReturnType<typeof build>): MembersMap => {
  if (!r.ok) throw new Error(r.error)
  return r.map
}
/** The same response with its JSON body rewritten in memory (fixtures are never edited). */
const withRows = (res: FetchedResponse, edit: (rows: LegislatorRecord[]) => void): FetchedResponse => {
  const rows = JSON.parse(res.body) as LegislatorRecord[]
  edit(rows)
  return variant(res, { body: JSON.stringify(rows) })
}
const lastTerm = (r: LegislatorRecord) => r.terms[r.terms.length - 1]!

// Runs first, so a regenerated seed is what every later case reads.
describe('generator (UPDATE_MEMBERS=1 rewrites; otherwise the committed files must equal the rebuild)', () => {
  test('departed seed: 119th-Congress members whose last term ends after 2025-01-03', () => {
    if (UPDATE && process.env.MEMBERS_HISTORICAL) {
      const text = readFileSync(process.env.MEMBERS_HISTORICAL, 'utf8')
      const fetchedAt = process.env.MEMBERS_HISTORICAL_FETCHED_AT
      if (!fetchedAt) throw new Error('set MEMBERS_HISTORICAL_FETCHED_AT to the response Date (ISO Z)')
      const r = extractDeparted(JSON.parse(text), { url: HISTORICAL_URL, sha256: sha256Hex(text), fetched_at: fetchedAt }, 119, '2025-01-03')
      if (!r.ok) throw new Error(r.error)
      writeFileSync(SEED_PATH, JSON.stringify(r.seed, null, 2) + '\n')
    }
    const s = seed()
    expect(s.count).toBe(s.members.length)
    expect(s.count).toBe(16) // members scout + foundation's own count of the 2026-10-03 file
    expect(s.url).toBe(HISTORICAL_URL)
    expect(s.sha256).toMatch(/^[0-9a-f]{64}$/)
    // Re-extracting the committed seed is a fixed point: every record passes the structural checks and the filter.
    const again = extractDeparted(s.members, { url: s.url, sha256: s.sha256, fetched_at: s.fetched_at }, 119, '2025-01-03')
    expect(again.ok && again.seed).toEqual(s)
    const lis = Object.fromEntries(s.members.filter((m) => m.id.lis).map((m) => [m.id.lis, m.id.bioguide]))
    expect(lis).toEqual({ S293: 'G000359', S350: 'R000595', S419: 'M001190', S421: 'V000137' })
  })

  test('members.json equals buildMembersMap(committed inputs, seed, previous = committed map)', () => {
    const committed = existsSync(MAP_PATH) ? (readJson(MAP_PATH) as MembersMap) : null
    const builtAt = UPDATE ? isoZ(Date.now()) : committed!.source.built_at
    const r = buildMembersMap(current(), seed(), committed, { builtAt })
    if (!r.ok) throw new Error(r.error)
    const text = serializeMembersMap(r.map)
    if (UPDATE) writeFileSync(MAP_PATH, text)
    expect(text).toBe(readFileSync(MAP_PATH, 'utf8'))
    // What the adapters import is that file (on an UPDATE run the module already loaded the old one: run again).
    if (!UPDATE) expect(MEMBERS_MAP).toEqual(JSON.parse(text))
  })
})

describe('buildMembersMap on the recorded roster', () => {
  test('legislators-current.json (2026-10-02): 539 members, 100 lis entries, S441 -> G000608 "Darline Graham"', () => {
    const m = okMap(build(current()))
    expect(Object.keys(m.members)).toHaveLength(539)
    expect(Object.keys(m.lis)).toHaveLength(100)
    expect(m.lis.S441).toBe('G000608')
    expect(m.members.G000608).toEqual(['Darline Graham']) // official_full, not name.last "Graham Nordone"
    expect(m.members.W000832?.[0]).toBe('Aisha Wahab') // no official_full: first + last
    expect(m.members.A000370).toEqual(['Alma S. Adams', 12])
    expect(m.source).toMatchObject({
      url: 'https://unitedstates.github.io/congress-legislators/legislators-current.json',
      sha256: readJson(fixturePath('members', '2026-10-02', 'legislators-current.json.meta.json')).sha256, // the bytes' hash
      last_modified: 'Thu, 24 Sep 2026 10:21:30 GMT',
    })
  })

  test('with the departed seed: 555 members, 104 lis entries; the seed never overrides a current record', () => {
    const m = okMap(build(current(), seed()))
    expect(Object.keys(m.members)).toHaveLength(539 + 16)
    expect(m.lis).toMatchObject({ S293: 'G000359', S419: 'M001190' })
    expect(m.members.G000359).toEqual(['Lindsey Graham'])
    const back = { ...seed(), count: 1, members: [{ ...seed().members[0]!, id: { bioguide: 'A000370' }, name: { first: 'X', last: 'Y' }, terms: [{ type: 'rep' as const, start: '2025-01-03', end: '2025-02-01', state: 'NC', district: 1 }] }] }
    expect(okMap(build(current(), back)).members.A000370).toEqual(['Alma S. Adams', 12])
  })

  test('displayName: official_full, else nickname/first + last + suffix', () => {
    expect(displayName({ first: 'James', nickname: 'Jim', last: 'Doe', suffix: 'Jr.' })).toBe('Jim Doe Jr.')
    expect(displayName({ first: 'Aisha', last: 'Wahab' })).toBe('Aisha Wahab')
    expect(displayName({ first: 'Darline', last: 'Graham Nordone', official_full: 'Darline Graham' })).toBe('Darline Graham')
  })
})

describe('fails closed (the committed map is left as is)', () => {
  const rejects = (res: FetchedResponse, why: RegExp) => {
    const r = build(res)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(why)
  }
  test('NEGATIVE 404 HTML page', () => rejects(replay('members', '2026-10-03', 'legislators-current_NEGATIVE_404_html.html'), /HTTP 404/))
  test('the same HTML page with status 200', () => rejects(variant(replay('members', '2026-10-03', 'legislators-current_NEGATIVE_404_html.html'), { status: 200 }), /content-type "text\/html/))
  test('HTML labelled as JSON', () => rejects(variant(current(), { body: '<!DOCTYPE html><html></html>' }), /not JSON/))
  test('304 with an empty body is never an empty roster', () => rejects(replay('members', '2026-10-03', 'legislators-current_304_not_modified.json'), /HTTP 304/))
  test('200 with an empty body', () => rejects(variant(current(), { body: '' }), /empty body/))
  test('a JSON object instead of an array', () => rejects(variant(current(), { body: '{"members":[]}' }), /not a JSON array/))
  test('text/plain from a host other than raw.githubusercontent.com', () => rejects(variant(current(), { headers: { 'content-type': 'text/plain; charset=utf-8' } }), /content-type/))
  test('529 records', () => rejects(withRows(current(), (rows) => { rows.splice(0, 10) }), /529 records/))
  test('546 records', () => rejects(withRows(current(), (rows) => {
    for (let i = 0; i < 7; i += 1) rows.push({ ...rows[200]!, id: { bioguide: `Z00000${i}` } })
  }), /546 records/))
  test('94 senators', () => rejects(withRows(current(), (rows) => {
    let n = 0
    for (let i = rows.length - 1; i >= 0 && n < 6; i -= 1) if (lastTerm(rows[i]!).type === 'sen') { rows.splice(i, 1); n += 1 }
  }), /94 senators/))
  test('a senator without a lis id', () => rejects(withRows(current(), (rows) => { delete rows[0]!.id.lis }), /senator without an S### lis/))
  test('a senator with a malformed lis id', () => rejects(withRows(current(), (rows) => { rows[0]!.id.lis = 'S27' }), /senator without an S### lis/))
  test('a representative with a lis id', () => rejects(withRows(current(), (rows) => {
    rows.find((r) => lastTerm(r).type === 'rep')!.id.lis = 'S999'
  }), /representative with a lis id/))
  test('a duplicate bioguide', () => rejects(withRows(current(), (rows) => { rows[5]!.id.bioguide = rows[6]!.id.bioguide }), /duplicate bioguide/))
  test('a duplicate lis', () => rejects(withRows(current(), (rows) => {
    const sens = rows.filter((r) => lastTerm(r).type === 'sen')
    sens[1]!.id.lis = sens[0]!.id.lis
  }), /duplicate lis/))
  test('a malformed bioguide', () => rejects(withRows(current(), (rows) => { rows[3]!.id.bioguide = 'a000370' }), /bioguide/))
  test('a seed whose count does not match its members', () => {
    const r = build(current(), { ...seed(), count: 15 })
    expect(r.ok).toBe(false)
  })
})

describe('append-only within a Congress', () => {
  test('a senator dropped from the roster stays (kept_from_previous), with its lis', () => {
    const r = build(withRows(current(), (rows) => rows.splice(rows.findIndex((x) => x.id.lis === 'S441'), 1)), seed(), MEMBERS_MAP)
    const m = okMap(r)
    expect(m.members.G000608).toEqual(['Darline Graham'])
    expect(m.lis.S441).toBe('G000608')
    expect(m.kept_from_previous).toEqual(['G000608'])
  })
  test('without a previous map (or with one from another Congress) the id is gone', () => {
    const cut = withRows(current(), (rows) => rows.splice(rows.findIndex((x) => x.id.lis === 'S441'), 1))
    expect(okMap(build(cut, seed(), null)).members.G000608).toBeUndefined()
    expect(okMap(build(cut, seed(), { ...MEMBERS_MAP, congress: 118 })).members.G000608).toBeUndefined()
  })
  test('a changed display name takes the new name', () => {
    const r = build(withRows(current(), (rows) => { rows.find((x) => x.id.bioguide === 'A000370')!.name.official_full = 'Alma Shealey Adams' }), seed(), MEMBERS_MAP)
    expect(okMap(r).members.A000370).toEqual(['Alma Shealey Adams', 12])
  })
  test('a lis id that changed owner since the previous map fails closed', () => {
    const prev = { ...MEMBERS_MAP, lis: { ...MEMBERS_MAP.lis, S441: 'A000370' } }
    const r = build(current(), seed(), prev)
    expect(r.ok).toBe(false)
  })
})

describe('joins and cross-checks (bare id scans; no vote parser needed)', () => {
  const houseIds = (source: string, date: string, name: string) =>
    [...readFileSync(fixturePath(source, date, name), 'utf8').matchAll(/name-id="([A-Z]\d{6})"/g)].map((m) => m[1]!)
  const senateIds = (name: string) =>
    [...readFileSync(fixturePath('members', '2026-10-03', name), 'utf8').matchAll(/<lis_member_id>(S\d{3})<\/lis_member_id>/g)].map((m) => m[1]!)

  test('2026-09-02 snapshot (raw.githubusercontent text/plain) builds; roll300 name-ids: exactly W000832 unresolved of 433', () => {
    const m = makeLookup(okMap(build(snapshot(), seed())))
    const ids = houseIds('house.clerk.votes', '2026-10-02', 'roll300.xml')
    expect(ids).toHaveLength(433)
    expect(ids.filter((id) => m.lookupHouse(id) === null)).toEqual(['W000832'])
  })
  test('House roll 2026-090: four former members resolve only through the departed seed', () => {
    const ids = houseIds('members', '2026-10-03', 'house_roll_2026_090_departed_members_and_party_change.xml')
    const withoutSeed = ids.filter((id) => makeLookup(okMap(build(current()))).lookupHouse(id) === null)
    expect(withoutSeed).toHaveLength(4)
    expect(ids.filter((id) => MEMBERS.lookupHouse(id) === null)).toEqual([])
  })
  test('Senate vote 119-2-00063: S293 and S419 resolve only through the departed seed', () => {
    const ids = senateIds('senate_vote_119_2_00063_departed_members_S293_S419.xml')
    expect(ids.filter((id) => makeLookup(okMap(build(current()))).lookupSenate(id) === null).sort()).toEqual(['S293', 'S419'])
    expect(ids.filter((id) => MEMBERS.lookupSenate(id) === null)).toEqual([])
  })
  test('Senate vote 119-2-00193 (99 rows, a vacancy): every id resolves', () => {
    const ids = senateIds('senate_vote_119_2_00193_vacancy_99_members.xml')
    expect(ids).toHaveLength(99)
    expect(ids.filter((id) => MEMBERS.lookupSenate(id) === null)).toEqual([])
  })
  test("the Senate's own cvc_member_data.xml agrees with the map on 100 of 100 lis -> bioguide pairs", () => {
    const xml = readFileSync(fixturePath('members', '2026-10-03', 'senate_cvc_member_data.xml'), 'utf8')
    const pairs = [...xml.matchAll(/<senator lis_member_id="(S\d{3})">[\s\S]*?<bioguideId>([A-Z]\d{6})<\/bioguideId>/g)].map((m) => [m[1]!, m[2]!] as const)
    expect(pairs).toHaveLength(100)
    expect(pairs.filter(([l, bg]) => MEMBERS_MAP.lis[l] !== bg)).toEqual([])
  })
})

describe('lookups', () => {
  test('House by bioguide, Senate by lis, misses are null, meta cites the source', () => {
    expect(MEMBERS.lookupHouse('A000370')).toEqual({ bioguide: 'A000370', name: 'Alma S. Adams', district: 12 })
    expect(MEMBERS.lookupSenate('S441')).toEqual({ bioguide: 'G000608', name: 'Darline Graham', district: null })
    expect(MEMBERS.lookupSenate('S293')).toEqual({ bioguide: 'G000359', name: 'Lindsey Graham', district: null })
    expect(MEMBERS.lookupHouse('Z999999')).toBeNull()
    expect(MEMBERS.lookupSenate('S999')).toBeNull()
    expect(MEMBERS.meta).toEqual({ sha256: MEMBERS_MAP.source.sha256, source_last_modified: 'Thu, 24 Sep 2026 10:21:30 GMT', built_at: MEMBERS_MAP.source.built_at })
  })
  test('the committed map is small enough to import in a Worker (DESIGN §2.3: ~20 KB)', () => {
    expect(readFileSync(MAP_PATH).length).toBeLessThan(30_000)
  })
})
