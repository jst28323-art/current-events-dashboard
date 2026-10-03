// "Not polled live" (owner override D-058; scratch/phase2/DESIGN.md §4.1-§4.2). The P2.1 Congress adapters are built and
// tested against fixtures while Phase 1 is still being measured, and nothing on the live site may change. A push to main
// redeploys the Worker (.github/workflows/deploy.yml, no path filter, G-007), so "not live" must mean "the Worker bundle
// is byte-identical". This file enforces that from four sides:
//   1. SOURCES (what the Worker polls) is exactly [fr.api, wh.feeds];
//   2. no live endpoint uses a P2.2-only poller feature (dynamic, notYetStatus, calendar);
//   3. nothing the Worker or the page imports reaches the fixture-only modules, the members map or @ced/schema/v02
//      (literal import check + a walk of the Worker's and the page's import graph);
//   4. the bytes of every Worker-imported schema/adapter entry file equal hashes recorded from main at foundation time
//      (a hash, not a git diff, so it runs in CI's shallow checkout).
// The fixture-only definitions are pinned too (one table below), so a builder's change to an endpoint is a visible diff.
import { describe, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { SOURCES } from '../src/index.js'
import { ADAPTER_NOT_BUILT, FIXTURE_ONLY_SOURCES, fixtureOnlySourceById } from '../src/fixture_only.js'
import { REPO_ROOT } from './replay.js'

const D058 = 'D-058: P2.1 sources are fixture-only until Phase 1 closes; changing this list needs a decision row'
const PIN = 'D-058: the live Worker imports this file; a change ships to ced-api on the next push (deploy.yml, G-007) and needs a decision row'
const rel = (p: string) => relative(REPO_ROOT, p).replaceAll('\\', '/')

describe('the live source list', () => {
  test('SOURCES is exactly [fr.api, wh.feeds]', () => {
    expect(SOURCES.map((s) => s.source_id), D058).toEqual(['fr.api', 'wh.feeds'])
  })
  test('no live endpoint uses dynamic, notYetStatus or a source calendar (the Phase 1 poller implements none)', () => {
    for (const s of SOURCES) {
      expect(s.calendar, `${s.source_id}.calendar: ${D058}`).toBeUndefined()
      for (const e of s.endpoints) {
        expect(e.dynamic, `${s.source_id}/${e.id}.dynamic: ${D058}`).toBeUndefined()
        expect(e.notYetStatus, `${s.source_id}/${e.id}.notYetStatus: ${D058}`).toBeUndefined()
      }
    }
  })
  test('FIXTURE_ONLY_SOURCES: five, unique, disjoint from SOURCES, each with distinct endpoint ids and a parse function', () => {
    const ids = FIXTURE_ONLY_SOURCES.map((s) => s.source_id)
    expect(ids).toEqual(['house.clerk.votes', 'senate.lis.votes', 'house.clerk.floor', 'senate.schedule', 'senate.pressgallery'])
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(SOURCES.some((s) => s.source_id === id), `${id} is live: ${D058}`).toBe(false)
    for (const s of FIXTURE_ONLY_SOURCES) {
      const eps = s.endpoints.map((e) => e.id)
      expect(eps.length, s.source_id).toBeGreaterThan(0)
      expect(new Set(eps).size, s.source_id).toBe(eps.length)
      expect(typeof s.parse, s.source_id).toBe('function')
      expect(fixtureOnlySourceById(s.source_id)).toBe(s)
    }
  })
  test('dynamic endpoints name an endpoint of the same source, an anchored pattern and a positive maxTargets', () => {
    for (const s of FIXTURE_ONLY_SOURCES) {
      for (const e of s.endpoints) {
        if (!e.dynamic) continue
        const at = `${s.source_id}/${e.id}`
        expect(s.endpoints.some((x) => x.id === e.dynamic!.from && x.id !== e.id), at).toBe(true)
        expect(e.dynamic.urlPattern.startsWith('^') && e.dynamic.urlPattern.endsWith('$'), at).toBe(true)
        expect(() => new RegExp(e.dynamic!.urlPattern), at).not.toThrow()
        expect(Number.isInteger(e.dynamic.maxTargets) && e.dynamic.maxTargets > 0, at).toBe(true)
      }
    }
  })
  test('a stub answers drift "adapter not built yet" and nothing else', () => {
    // Holds for stubs only; a built adapter must never use this exact detail (replay_congress.test.ts keys on it).
    for (const s of FIXTURE_ONLY_SOURCES) {
      const out = s.parse(s.endpoints[0]!.id, { url: s.endpoints[0]!.url, status: 200, headers: {}, body: '', fetchedAt: '2026-10-03T00:00:00.000Z' })
      if (out.health.detail !== ADAPTER_NOT_BUILT) continue
      expect(out).toEqual({ events: [], health: { source_id: s.source_id, endpoint: s.endpoints[0]!.id, status: 'drift', detail: ADAPTER_NOT_BUILT, items_seen: 0 } })
    }
  })
})

describe('the fixture-only definitions (DESIGN §1.2, §3.1-§3.5)', () => {
  const pick = (s: (typeof FIXTURE_ONLY_SOURCES)[number]) => ({
    name: s.name, affiliation: s.affiliation, license: s.license, features: s.features, cadence: s.cadence,
    freshness_slo_s: s.freshness_slo_s, rate_budget_per_h: s.rate_budget_per_h, calendar: s.calendar, endpoints: s.endpoints,
  })
  const common = { affiliation: 'official-nonpartisan', license: 'us-gov-public-domain' }
  const houseRoll = '^https://clerk\\.house\\.gov/evs/20[0-9]{2}/roll[0-9]{3}\\.xml$'
  const houseDay = '^https://clerk\\.house\\.gov/floor/20[0-9]{6}\\.xml$'
  const want = {
    'house.clerk.votes': {
      ...common, name: 'House Clerk roll calls (clerk.house.gov)', features: ['F5', 'F6'], cadence: { business_s: 60, off_s: 300 },
      freshness_slo_s: 120, rate_budget_per_h: 180, calendar: { chamber: 'house', recess_s: 3600 },
      endpoints: [
        { id: 'index', url: 'https://clerk.house.gov/Votes/MemberVotes?CongressNum=119&Session=2nd', validator: 'body-hash', cadence: { business_s: 60, off_s: 300 } },
        { id: 'roll_next', url: 'https://clerk.house.gov/evs/2026/roll{NNN}.xml', validator: 'body-hash', cadence: { business_s: 60, off_s: 300 }, dynamic: { from: 'index', urlPattern: houseRoll, maxTargets: 1 } },
        { id: 'roll', url: 'https://clerk.house.gov/evs/2026/roll{NNN}.xml', validator: 'body-hash', cadence: { business_s: 3600, off_s: 3600 }, dynamic: { from: 'index', urlPattern: houseRoll, maxTargets: 10 } },
      ],
    },
    'senate.lis.votes': {
      ...common, name: 'Senate roll calls (senate.gov LIS)', features: ['F5', 'F6'], cadence: { business_s: 60, off_s: 300 },
      freshness_slo_s: 120, rate_budget_per_h: 110, calendar: { chamber: 'senate', recess_s: 3600 },
      endpoints: [
        { id: 'menu', url: 'https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml', validator: 'if-modified-since', cadence: { business_s: 60, off_s: 300 } },
        {
          id: 'vote', url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_{NNNNN}.xml', validator: 'if-modified-since', cadence: { business_s: 1800, off_s: 3600 },
          dynamic: { from: 'menu', urlPattern: '^https://www\\.senate\\.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_[0-9]{5}\\.xml$', maxTargets: 10 },
        },
      ],
    },
    'house.clerk.floor': {
      ...common, name: 'House Clerk floor proceedings', features: ['F2', 'F5', 'F7'], cadence: { business_s: 60, off_s: 300 },
      freshness_slo_s: 120, rate_budget_per_h: 100, calendar: { chamber: 'house', recess_s: 3600 },
      endpoints: [
        { id: 'feed', url: 'https://clerk.house.gov/Home/Feed', validator: 'body-hash', cadence: { business_s: 300, off_s: 900 } },
        { id: 'day', url: 'https://clerk.house.gov/floor/{YYYYMMDD}.xml', validator: 'if-modified-since', cadence: { business_s: 60, off_s: 300 }, dynamic: { from: 'feed', urlPattern: houseDay, maxTargets: 1 } },
        { id: 'next_day', url: 'https://clerk.house.gov/floor/{YYYYMMDD}.xml', validator: 'if-modified-since', cadence: { business_s: 300, off_s: 900 }, dynamic: { from: 'day', urlPattern: houseDay, maxTargets: 1 }, notYetStatus: 404 },
      ],
    },
    'senate.schedule': {
      ...common, name: 'Senate floor and committee schedule (senate.gov)', features: ['F7', 'F1'], cadence: { business_s: 300, off_s: 900 },
      freshness_slo_s: 600, rate_budget_per_h: 20, calendar: { chamber: 'senate', recess_s: 900 },
      endpoints: [
        { id: 'floor', url: 'https://www.senate.gov/legislative/schedule/floor_schedule.json', validator: 'if-modified-since', cadence: { business_s: 300, off_s: 900 } },
        { id: 'hearings', url: 'https://www.senate.gov/general/committee_schedules/hearings.xml', validator: 'if-modified-since', cadence: { business_s: 900, off_s: 3600 } },
      ],
    },
    'senate.pressgallery': {
      ...common, name: 'Senate Daily Press Gallery log', features: ['F1', 'F5', 'F8'], cadence: { business_s: 60, off_s: 300 },
      freshness_slo_s: 120, rate_budget_per_h: 70, calendar: { chamber: 'senate', recess_s: 900 },
      endpoints: [
        {
          id: 'daily_posts', validator: 'body-hash', cadence: { business_s: 60, off_s: 300 },
          url: 'https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=3&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,content,categories',
        },
      ],
    },
  }
  for (const [id, w] of Object.entries(want)) {
    test(id, () => expect(pick(fixtureOnlySourceById(id)!)).toEqual(w))
  }
})

// ---- imports: nothing the Worker or the page loads may reach the fixture-only code ----

const FORBIDDEN_SPECIFIER = /(^@ced\/adapters\/fixture-only$)|(^@ced\/schema\/v02$)|generated\/members|fixture_only|\/v02\//

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkFiles(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** Value imports and re-exports of a module (type-only ones are erased by the compiler and never bundled). */
function valueSpecifiers(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(?:^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g)) if (!m[2]) out.push(m[4]!)
  for (const m of text.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1]!)
  for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]!)
  return out
}
/** Every import specifier, type-only included (the literal check of DESIGN §4.2). */
function allSpecifiers(text: string): string[] {
  return [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!)
}

const WORKSPACE: Record<string, string> = {
  '@ced/adapters': 'packages/adapters/src/index.ts',
  '@ced/schema': 'packages/schema/src/index.ts',
  '@ced/schema/order': 'packages/schema/src/order.ts',
  '@ced/schema/event.schema.json': 'packages/schema/src/event.schema.json',
}

/** The repo files reachable by value imports from `entries` (workspace packages followed; npm packages not). */
function reachable(entries: string[]): Set<string> {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.(ts|tsx)$/.test(file)) continue
    for (const spec of valueSpecifiers(readFileSync(file, 'utf8'))) {
      let target: string | null = null
      if (spec.startsWith('.')) {
        const base = resolve(dirname(file), spec)
        target = [base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), base, `${base}.ts`, join(base, 'index.ts')].find((p) => existsSync(p) && statSync(p).isFile()) ?? base
      } else if (spec.startsWith('@ced/')) {
        target = WORKSPACE[spec] ? join(REPO_ROOT, WORKSPACE[spec]!) : join(REPO_ROOT, `UNKNOWN-WORKSPACE-SPECIFIER/${spec}`)
      }
      if (target) queue.push(target)
    }
  }
  return seen
}

describe('the Worker and the page never import the fixture-only modules', () => {
  test('packages/adapters/src/index.ts and registry.ts never mention them', () => {
    for (const f of ['index.ts', 'registry.ts']) {
      const text = readFileSync(join(REPO_ROOT, 'packages', 'adapters', 'src', f), 'utf8')
      expect(text, `${f}: ${D058}`).not.toMatch(/fixture[_-]only|generated\/members|schema\/v02/)
    }
  })
  const appFiles = [
    ...walkFiles(join(REPO_ROOT, 'workers', 'api', 'src')),
    ...walkFiles(join(REPO_ROOT, 'apps', 'web', 'src')),
  ]
  test('workers/api/src/** and apps/web/src/** (.ts and .tsx): no such import, type-only included', () => {
    expect(appFiles.some((f) => f.endsWith('.tsx')), 'the .tsx files are scanned (critique C8)').toBe(true)
    const bad = appFiles.flatMap((f) => allSpecifiers(readFileSync(f, 'utf8')).filter((s) => FORBIDDEN_SPECIFIER.test(s)).map((s) => `${rel(f)} imports ${s}`))
    expect(bad, D058).toEqual([])
  })
  test("the Worker's and the page's import graphs reach no P2.1 module", () => {
    const graph = [...reachable(appFiles)].map(rel)
    expect(graph).toContain('packages/adapters/src/registry.ts') // the walk does follow workspace packages
    expect(graph).toContain('packages/schema/src/validate.ts')
    const p21 = graph.filter((f) =>
      /^packages\/schema\/src\/v02\//.test(f) ||
      /^packages\/adapters\/src\/(fixture_only\.ts|generated\/|lib\/(members|stub|eastern|xmlscan|congress_ids)\.ts|sources\/(house_clerk_votes|senate_lis_votes|house_clerk_floor|senate_schedule|senate_pressgallery)\.ts)/.test(f) ||
      f.startsWith('UNKNOWN-WORKSPACE-SPECIFIER/'))
    expect(p21, D058).toEqual([])
  })
})

describe('Worker-bundle pin (critique C1/B1)', () => {
  // sha256 of the file bytes, recorded by the p2.1 foundation builder on 2026-10-03 from main 01040f2 (each equal to
  // `git show main:<file> | sha256sum`; the working copies matched: `git diff main -- <files>` was empty). The repo
  // checks these out with LF on every platform (.gitattributes `* text=auto eol=lf`), so CI hashes the same bytes.
  const PINNED: Record<string, string> = {
    'packages/schema/src/event.schema.json': '6ec6b8797403ee9c89068618a8ce18295c04fd903eb14974d91a7f10df91fd58',
    'packages/schema/src/validate.ts': 'd8e5d6de6d36e8dcbf636c071031653f78c13df4c2097392e7cd2b675d43d81a',
    'packages/schema/src/index.ts': '3ba7e4af8f375f19ec6c0b170d5385252ea5d98c27f3acdae90367609c0cbde1',
    'packages/schema/src/id.ts': '931ea0b9d258095be9524e0ee8bf1d5e4f9c32beb870bb5759c45e6d5afaf3ce',
    'packages/schema/src/order.ts': '3f4ec87c471d20fdef8f1aab9b27634730df381e66108044cb837881b01508d4',
    'packages/schema/src/api.ts': 'f8e40e538e5c1be4c243405db66e679f90512c61cd2bb4479dc17521ea03fbff',
    'packages/adapters/src/index.ts': '41e665ec7ef32e442fce89140f6cffbdd428db51e50f5a971b3ec37b40546d64',
    'packages/adapters/src/registry.ts': 'ba3e3bff228439be20e6c3159e8f74e1678197a763a3c3cc1abbfbf061cd79ef',
  }
  for (const [file, sha] of Object.entries(PINNED)) {
    test(file, () => {
      const got = createHash('sha256').update(readFileSync(join(REPO_ROOT, file))).digest('hex')
      expect(got, `${file}: ${PIN}`).toBe(sha)
    })
  }
})
